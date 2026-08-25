import type { PrismaClient, Prisma } from "@prisma/client";
import type { CurrentUser } from "../auth/permissions.js";
import { requireUser, requireOwnerOrAgent } from "../auth/permissions.js";
import type { GetTicketsInput } from "../../validation/queries.js";
import { notFoundError } from "../../errors.js";

/**
 * Build a Prisma WHERE clause for a given SLA state.
 *
 * We classify tickets by their RESOLUTION clock, using the timestamps we stored
 * at creation. This keeps the query to plain timestamp comparisons (no
 * column-to-column comparisons, which Prisma can't express) and matches exactly
 * how the dashboard counts tickets.
 *
 * The three cases are mutually exclusive and together cover every ticket:
 *   - BREACHED: not yet resolved and past the resolution deadline
 *   - AT_RISK:  not yet resolved, past the 75% mark, but not yet past the deadline
 *   - ON_TRACK: already resolved, or not yet past the 75% mark
 *
 * Documented simplification: a ticket resolved AFTER its deadline counts as
 * ON_TRACK here, because once it is resolved the clock is frozen and resolvedAt
 * is set. The per-ticket SLAInfo still reports that ticket as BREACHED.
 * Distinguishing "resolved late" in a filter would require comparing resolvedAt
 * to resolutionDueAt column-to-column, which Prisma can't do without raw SQL —
 * not worth the added complexity for this feature.
 */
function buildSlaStateFilter(
  slaState: "ON_TRACK" | "AT_RISK" | "BREACHED",
  now: Date
): Prisma.TicketWhereInput {
  switch (slaState) {
    case "BREACHED":
      return { resolvedAt: null, resolutionDueAt: { lte: now } };

    case "AT_RISK":
      return {
        resolvedAt: null,
        resolutionAtRiskAt: { lt: now },
        resolutionDueAt: { gt: now },
      };

    case "ON_TRACK":
      return {
        OR: [
          { resolvedAt: { not: null } },
          { resolutionAtRiskAt: { gte: now } },
        ],
      };
  }
}

export async function getTickets(
  prisma: PrismaClient,
  user: CurrentUser | null,
  input: GetTicketsInput
) {
  const currentUser = requireUser(user);
  
  const where: Prisma.TicketWhereInput = {};
  
  // Role-based filtering: Reporters only see their own tickets
  if (currentUser.role === "REPORTER") {
    where.reporterId = currentUser.userId;
  }

  if (input.status) where.status = input.status;
  if (input.priority) where.priority = input.priority;
  if (input.assigneeId) where.assigneeId = input.assigneeId;

  if (input.slaState) {
    const now = new Date();
    const slaFilter = buildSlaStateFilter(input.slaState, now);
    where.AND = [slaFilter];
  }

  // Cursor-based pagination arguments
  const first = input.first ?? 20;
  const take = first + 1; // Fetch one extra to determine hasNextPage
  const cursorOpts: Prisma.TicketFindManyArgs = {
    take,
    where,
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" }
    ],
    include: {
      reporter: true,
      assignee: true,
    }
  };

  if (input.after) {
    cursorOpts.cursor = { id: input.after };
    cursorOpts.skip = 1; // Skip the cursor itself
  }

  const tickets = await prisma.ticket.findMany(cursorOpts);
  
  const hasNextPage = tickets.length > first;
  const edges = hasNextPage ? tickets.slice(0, -1) : tickets;
  const endCursor = edges.length > 0 ? edges[edges.length - 1]?.id ?? null : null;

  return {
    edges,
    pageInfo: {
      hasNextPage,
      endCursor,
    },
  };
}

export async function getTicketById(
  prisma: PrismaClient,
  user: CurrentUser | null,
  ticketId: string
) {
  const currentUser = requireUser(user);

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      reporter: true,
      assignee: true,
      comments: {
        include: { author: true },
        orderBy: { createdAt: 'asc' }
      },
    },
  });

  if (!ticket) {
    throw notFoundError("Ticket", ticketId);
  }

  // Enforce access control
  requireOwnerOrAgent(currentUser, ticket.reporterId);

  return ticket;
}

export async function getDashboardStats(prisma: PrismaClient, user: CurrentUser | null) {
  const currentUser = requireUser(user);

  // Reporters see counts for their own tickets; agents see every ticket.
  const baseWhere: Prisma.TicketWhereInput =
    currentUser.role === "REPORTER" ? { reporterId: currentUser.userId } : {};

  const now = new Date();

  // The at-risk and breached counts use the same resolution-clock definition as
  // buildSlaStateFilter, so the dashboard and the ticket list always agree.
  const [open, inProgress, resolved, closed, atRiskActive, breachedActive] =
    await Promise.all([
      prisma.ticket.count({ where: { ...baseWhere, status: "OPEN" } }),
      prisma.ticket.count({ where: { ...baseWhere, status: "IN_PROGRESS" } }),
      prisma.ticket.count({ where: { ...baseWhere, status: "RESOLVED" } }),
      prisma.ticket.count({ where: { ...baseWhere, status: "CLOSED" } }),
      prisma.ticket.count({
        where: {
          ...baseWhere,
          resolvedAt: null,
          resolutionAtRiskAt: { lt: now },
          resolutionDueAt: { gt: now },
        },
      }),
      prisma.ticket.count({
        where: {
          ...baseWhere,
          resolvedAt: null,
          resolutionDueAt: { lte: now },
        },
      }),
    ]);

  return {
    open,
    inProgress,
    resolved,
    closed,
    atRiskActive,
    breachedActive,
  };
}
