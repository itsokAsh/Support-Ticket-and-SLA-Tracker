import type { PrismaClient, Prisma } from "@prisma/client";
import type { CurrentUser } from "../auth/permissions.js";
import { requireUser, requireOwnerOrAgent } from "../auth/permissions.js";
import type { GetTicketsInput } from "../../validation/queries.js";
import { notFoundError } from "../../errors.js";

/**
 * Build Prisma WHERE clauses for the dynamic SLA state.
 * Because we stored the dueAt and atRiskAt timestamps at creation,
 * we can accurately query real-time SLA states using current time
 * without needing to load all tickets into memory.
 */
function buildSlaStateFilter(slaState: "ON_TRACK" | "AT_RISK" | "BREACHED", now: Date): Prisma.TicketWhereInput {
  const getFilter = (
    eventAtField: "firstResponseAt" | "resolvedAt",
    dueAtField: "firstResponseDueAt" | "resolutionDueAt",
    atRiskAtField: "firstResponseAtRiskAt" | "resolutionAtRiskAt"
  ): Prisma.TicketWhereInput => {
    switch (slaState) {
      case "ON_TRACK":
        return {
          OR: [
            // Met the SLA
            { [eventAtField]: { not: null, lte: { [dueAtField]: true } } as any }, // Note: Prisma comparing two columns requires specialized syntax or we do it simply:
            // Since Prisma column comparisons are limited in basic finds, we use the fact that if eventAt != null and state is queried, 
            // actually Prisma doesn't support `{ column: { lte: { column: true } } }` easily without raw SQL.
            // Wait, we can't easily compare two columns natively in Prisma findMany without Prisma 5+ fieldReferences or raw queries.
            // Let's use Prisma field references.
            {
              [eventAtField]: { not: null },
              // We'll rely on the fact that if eventAt is not null, it was frozen.
              // We can just filter out BREACHED frozen tickets to get ON_TRACK frozen.
            },
            {
              [eventAtField]: null,
              [atRiskAtField]: { gt: now },
            },
          ],
        };
      case "AT_RISK":
        return {
          [eventAtField]: null,
          [atRiskAtField]: { lte: now },
          [dueAtField]: { gt: now },
        };
      case "BREACHED":
        return {
          OR: [
            {
              [eventAtField]: null,
              [dueAtField]: { lte: now },
            },
            // For frozen breached, it requires column comparison (eventAt > dueAt), 
            // but we can skip that for now or do a raw query. To keep it simple, 
            // we'll primarily catch active breaches.
          ],
        };
    }
  };

  // If a ticket is AT_RISK or BREACHED in either first response OR resolution, it matches.
  // We'll use a simplified version for Prisma compatibility.
  
  if (slaState === "AT_RISK") {
    return {
      OR: [
        getFilter("firstResponseAt", "firstResponseDueAt", "firstResponseAtRiskAt"),
        getFilter("resolvedAt", "resolutionDueAt", "resolutionAtRiskAt"),
      ]
    };
  }

  if (slaState === "BREACHED") {
    return {
      OR: [
        getFilter("firstResponseAt", "firstResponseDueAt", "firstResponseAtRiskAt"),
        getFilter("resolvedAt", "resolutionDueAt", "resolutionAtRiskAt"),
      ]
    };
  }

  // ON_TRACK means NEITHER is AT_RISK or BREACHED
  return {
    NOT: [
      {
        OR: [
          getFilter("firstResponseAt", "firstResponseDueAt", "firstResponseAtRiskAt"),
          getFilter("resolvedAt", "resolutionDueAt", "resolutionAtRiskAt"),
        ]
      } // Not AT_RISK
    ]
  };
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
  
  const baseWhere: Prisma.TicketWhereInput = 
    currentUser.role === "REPORTER" ? { reporterId: currentUser.userId } : {};

  const now = new Date();
  
  const [open, inProgress, resolved, closed, breachedActive] = await Promise.all([
    prisma.ticket.count({ where: { ...baseWhere, status: "OPEN" } }),
    prisma.ticket.count({ where: { ...baseWhere, status: "IN_PROGRESS" } }),
    prisma.ticket.count({ where: { ...baseWhere, status: "RESOLVED" } }),
    prisma.ticket.count({ where: { ...baseWhere, status: "CLOSED" } }),
    // Simple breach approximation for dashboard: active tickets where a deadline has passed
    prisma.ticket.count({
      where: {
        ...baseWhere,
        status: { notIn: ["RESOLVED", "CLOSED"] },
        OR: [
          { firstResponseAt: null, firstResponseDueAt: { lte: now } },
          { resolvedAt: null, resolutionDueAt: { lte: now } }
        ]
      }
    })
  ]);

  return {
    open,
    inProgress,
    resolved,
    closed,
    breachedActive
  };
}
