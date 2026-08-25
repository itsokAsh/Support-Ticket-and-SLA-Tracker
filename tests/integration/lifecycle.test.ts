/**
 * Integration test — full ticket lifecycle through GraphQL against real Postgres.
 *
 * Prerequisites:
 *   - PostgreSQL running via `docker compose up -d`
 *   - DATABASE_URL set in .env
 *   - Prisma migrations applied (`bunx prisma migrate deploy`)
 *
 * This test exercises the full stack: GraphQL Yoga → resolvers → services → Prisma → Postgres.
 * It creates a fresh set of test users per run and cleans them up afterward.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createYoga, createSchema } from "graphql-yoga";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvers } from "../../src/graphql/resolvers/index";
import { createContext, type GraphQLContext } from "../../src/context";
import { prisma } from "../../src/db/index";

// ── Build a test Yoga instance (no HTTP server needed) ──

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(__dirname, "..", "..", "src", "graphql", "schema");

const typeDefs = readdirSync(schemaDir)
  .filter((f) => f.endsWith(".graphql"))
  .map((f) => readFileSync(join(schemaDir, f), "utf-8"))
  .join("\n");

const yoga = createYoga<GraphQLContext>({
  schema: createSchema<GraphQLContext>({
    typeDefs,
    resolvers,
  }),
  context: createContext,
});

// ── Helpers ──

const TEST_EMAIL_REPORTER = `integration-reporter-${Date.now()}@test.com`;
const TEST_EMAIL_AGENT = `integration-agent-${Date.now()}@test.com`;
const TEST_PASSWORD = "TestPassword123!";

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
/** Execute a GraphQL request against the test Yoga instance. */
async function gql(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string
): Promise<{ data: Record<string, any> | null; errors?: Array<{ message: string; extensions?: Record<string, unknown> }> }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await yoga.fetch("http://localhost:4000/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  return response.json() as any;
}

// ── State shared across tests ──

let reporterToken = "";
let agentToken = "";
let reporterId = "";
let agentId = "";
let ticketId = "";

// ── Setup & Teardown ──

beforeAll(async () => {
  // Seed the agent user directly via Prisma (since self-registration blocks AGENT)
  const { hashPassword } = await import("../../src/services/auth/password");
  const hash = await hashPassword(TEST_PASSWORD);

  const agentUser = await prisma.user.create({
    data: {
      name: "Integration Agent",
      email: TEST_EMAIL_AGENT,
      passwordHash: hash,
      role: "AGENT",
    },
  });
  agentId = agentUser.id;
});

afterAll(async () => {
  // Clean up test data in the correct order (foreign key constraints)
  await prisma.comment.deleteMany({
    where: { ticket: { reporterId: { in: [reporterId] } } },
  });
  await prisma.ticket.deleteMany({
    where: { reporterId: { in: [reporterId] } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [TEST_EMAIL_REPORTER, TEST_EMAIL_AGENT] } },
  });
  await prisma.$disconnect();
});

// ── Tests ──

describe("Integration: Full Ticket Lifecycle", () => {
  test("1. Register a reporter", async () => {
    const res = await gql(`
      mutation {
        register(
          name: "Integration Reporter"
          email: "${TEST_EMAIL_REPORTER}"
          password: "${TEST_PASSWORD}"
          role: REPORTER
        ) {
          token
          user { id name email role }
        }
      }
    `);

    expect(res.errors).toBeUndefined();
    expect(res.data?.register.user.role).toBe("REPORTER");
    reporterToken = res.data?.register.token;
    reporterId = res.data?.register.user.id;
  });

  test("2. Login as agent", async () => {
    const res = await gql(`
      mutation {
        login(email: "${TEST_EMAIL_AGENT}", password: "${TEST_PASSWORD}") {
          token
          user { id role }
        }
      }
    `);

    expect(res.errors).toBeUndefined();
    expect(res.data?.login.user.role).toBe("AGENT");
    agentToken = res.data?.login.token;
  });

  test("3. Reporter creates a ticket", async () => {
    const res = await gql(
      `
      mutation {
        createTicket(
          title: "Integration Test Ticket"
          description: "This is an integration test ticket."
          priority: HIGH
        ) {
          id title priority status
          sla { firstResponseState resolutionState firstResponseDueAt resolutionDueAt }
          reporter { id }
        }
      }
    `,
      {},
      reporterToken
    );

    expect(res.errors).toBeUndefined();
    const ticket = res.data?.createTicket;
    expect(ticket.title).toBe("Integration Test Ticket");
    expect(ticket.priority).toBe("HIGH");
    expect(ticket.status).toBe("OPEN");
    expect(ticket.sla.firstResponseState).toBe("ON_TRACK");
    expect(ticket.sla.resolutionState).toBe("ON_TRACK");
    expect(ticket.reporter.id).toBe(reporterId);
    ticketId = ticket.id;
  });

  test("4. Unauthenticated request is rejected", async () => {
    const res = await gql(`
      mutation {
        createTicket(title: "Fail", description: "No auth", priority: LOW) {
          id
        }
      }
    `);

    expect(res.errors).toBeDefined();
    expect(res.errors?.[0]?.extensions?.code).toBe("UNAUTHORIZED");
  });

  test("5. Agent assigns the ticket", async () => {
    const res = await gql(
      `
      mutation {
        assignTicket(ticketId: "${ticketId}", assigneeId: "${agentId}") {
          id assignee { id }
        }
      }
    `,
      {},
      agentToken
    );

    expect(res.errors).toBeUndefined();
    expect(res.data?.assignTicket.assignee.id).toBe(agentId);
  });

  test("6. Reporter cannot assign (not an agent)", async () => {
    const res = await gql(
      `
      mutation {
        assignTicket(ticketId: "${ticketId}", assigneeId: "${agentId}") {
          id
        }
      }
    `,
      {},
      reporterToken
    );

    expect(res.errors).toBeDefined();
    expect(res.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });

  test("7. Agent changes status to IN_PROGRESS", async () => {
    const res = await gql(
      `
      mutation {
        changeTicketStatus(ticketId: "${ticketId}", status: IN_PROGRESS) {
          id status
        }
      }
    `,
      {},
      agentToken
    );

    expect(res.errors).toBeUndefined();
    expect(res.data?.changeTicketStatus.status).toBe("IN_PROGRESS");
  });

  test("8. Invalid status transition is rejected (CLOSED → IN_PROGRESS)", async () => {
    // First move to CLOSED
    await gql(
      `mutation { changeTicketStatus(ticketId: "${ticketId}", status: RESOLVED) { id } }`,
      {},
      agentToken
    );
    await gql(
      `mutation { changeTicketStatus(ticketId: "${ticketId}", status: CLOSED) { id } }`,
      {},
      agentToken
    );

    // Now try invalid transition
    const res = await gql(
      `
      mutation {
        changeTicketStatus(ticketId: "${ticketId}", status: IN_PROGRESS) {
          id
        }
      }
    `,
      {},
      agentToken
    );

    expect(res.errors).toBeDefined();
    expect(res.errors?.[0]?.extensions?.code).toBe("INVALID_STATUS_TRANSITION");
  });

  test("9. Reopen closed ticket (CLOSED → OPEN)", async () => {
    const res = await gql(
      `
      mutation {
        changeTicketStatus(ticketId: "${ticketId}", status: OPEN) {
          id status resolvedAt
        }
      }
    `,
      {},
      agentToken
    );

    expect(res.errors).toBeUndefined();
    expect(res.data?.changeTicketStatus.status).toBe("OPEN");
    // resolvedAt should be cleared on reopen
    expect(res.data?.changeTicketStatus.resolvedAt).toBeNull();
  });

  test("10. Reporter adds a comment (does NOT trigger first response)", async () => {
    const res = await gql(
      `
      mutation {
        addComment(ticketId: "${ticketId}", content: "Reporter asking for update") {
          id firstResponseAt
          comments { content author { id } }
        }
      }
    `,
      {},
      reporterToken
    );

    expect(res.errors).toBeUndefined();
    // Reporter's own comment does NOT freeze first-response clock
    expect(res.data?.addComment.firstResponseAt).toBeNull();
    expect(res.data?.addComment.comments.length).toBeGreaterThanOrEqual(1);
  });

  test("11. Agent adds a comment (TRIGGERS first response freeze)", async () => {
    const res = await gql(
      `
      mutation {
        addComment(ticketId: "${ticketId}", content: "Agent responding to the issue") {
          id firstResponseAt
          comments { content author { id } }
        }
      }
    `,
      {},
      agentToken
    );

    expect(res.errors).toBeUndefined();
    // Agent's comment SHOULD freeze the first-response clock
    expect(res.data?.addComment.firstResponseAt).not.toBeNull();
  });

  test("12. Second agent comment does NOT overwrite firstResponseAt", async () => {
    // Capture the original firstResponseAt
    const res1 = await gql(
      `
      mutation {
        addComment(ticketId: "${ticketId}", content: "Agent follow-up") {
          id firstResponseAt
        }
      }
    `,
      {},
      agentToken
    );

    // firstResponseAt should remain the same (immutable once set)
    const res2 = await gql(
      `
      mutation {
        addComment(ticketId: "${ticketId}", content: "Another agent reply") {
          id firstResponseAt
        }
      }
    `,
      {},
      agentToken
    );

    expect(res1.data?.addComment.firstResponseAt).toBe(
      res2.data?.addComment.firstResponseAt
    );
  });

  test("13. Ticket query returns paginated results", async () => {
    const res = await gql(
      `
      query {
        tickets(first: 5) {
          edges { id title }
          pageInfo { hasNextPage endCursor }
        }
      }
    `,
      {},
      reporterToken
    );

    expect(res.errors).toBeUndefined();
    expect(res.data?.tickets.edges.length).toBeGreaterThanOrEqual(1);
    expect(res.data?.tickets.pageInfo).toBeDefined();
  });

  test("14. Single ticket query with SLA info", async () => {
    const res = await gql(
      `
      query {
        ticket(id: "${ticketId}") {
          id title status
          sla {
            firstResponseState
            resolutionState
            firstResponseRemainingMinutes
            resolutionRemainingMinutes
          }
        }
      }
    `,
      {},
      reporterToken
    );

    expect(res.errors).toBeUndefined();
    const ticket = res.data?.ticket;
    expect(ticket.id).toBe(ticketId);
    // First response was already met → state should be ON_TRACK (frozen/met)
    expect(ticket.sla.firstResponseState).toBe("ON_TRACK");
  });

  test("15. Dashboard stats return counts", async () => {
    const res = await gql(
      `
      query {
        dashboardStats {
          open inProgress resolved closed breachedActive
        }
      }
    `,
      {},
      agentToken
    );

    expect(res.errors).toBeUndefined();
    const stats = res.data?.dashboardStats;
    expect(typeof stats.open).toBe("number");
    expect(typeof stats.inProgress).toBe("number");
    expect(typeof stats.resolved).toBe("number");
    expect(typeof stats.closed).toBe("number");
  });

  test("16. Validation errors are returned properly", async () => {
    const res = await gql(
      `
      mutation {
        createTicket(title: "", description: "Valid desc", priority: HIGH) {
          id
        }
      }
    `,
      {},
      reporterToken
    );

    expect(res.errors).toBeDefined();
    expect(res.errors?.[0]?.extensions?.code).toBe("VALIDATION_ERROR");
  });
});
