/**
 * Ticket service — all ticket business logic lives here, not in resolvers.
 *
 * Responsibilities:
 *   - Create tickets with SLA deadline computation
 *   - Assign tickets (agent-only, target must be an AGENT)
 *   - Change status with transition enforcement
 *   - Resolve tickets (convenience for changeStatus → RESOLVED)
 *   - Freeze/unfreeze resolution clock on status changes
 */

import type { PrismaClient, TicketStatus } from "@prisma/client";
import type { CurrentUser } from "../auth/permissions.js";
import { requireUser, requireAgent } from "../auth/permissions.js";
import {
  notFoundError,
  forbiddenError,
  invalidTransitionError,
} from "../../errors.js";
import {
  isValidTransition,
  shouldFreezeResolutionClock,
  isReopenTransition,
} from "./statusTransitions.js";
import { computeSLADeadlines } from "../sla/index.js";
import type {
  CreateTicketInput,
  AssignTicketInput,
  ChangeStatusInput,
} from "../../validation/ticket.js";

/**
 * Fetch all holidays as a Set of "YYYY-MM-DD" strings for the SLA engine.
 */
async function getHolidaySet(prisma: PrismaClient): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany();
  const set = new Set<string>();
  for (const h of holidays) {
    // Holiday.date is stored as a DateTime; extract the date portion
    const d = h.date;
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    set.add(`${year}-${month}-${day}`);
  }
  return set;
}

// ── Public API ──

/**
 * Create a new ticket. Any authenticated user can create.
 * Computes and stores SLA deadline timestamps.
 */
export async function createTicket(
  prisma: PrismaClient,
  user: CurrentUser | null,
  input: CreateTicketInput
) {
  const currentUser = requireUser(user);
  const now = new Date();
  const holidays = await getHolidaySet(prisma);
  const deadlines = computeSLADeadlines(input.priority, now, holidays);

  return prisma.ticket.create({
    data: {
      title: input.title,
      description: input.description,
      priority: input.priority,
      reporterId: currentUser.userId,
      ...deadlines,
    },
    include: {
      reporter: true,
      assignee: true,
      comments: true,
    },
  });
}

/**
 * Assign a ticket to an agent. Only agents can assign.
 * The target assignee must exist and be an AGENT.
 */
export async function assignTicket(
  prisma: PrismaClient,
  user: CurrentUser | null,
  input: AssignTicketInput
) {
  requireAgent(user);

  // Verify ticket exists
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
  });
  if (!ticket) {
    throw notFoundError("Ticket", input.ticketId);
  }

  // Verify assignee exists and is an AGENT
  const assignee = await prisma.user.findUnique({
    where: { id: input.assigneeId },
  });
  if (!assignee) {
    throw notFoundError("User", input.assigneeId);
  }
  if (assignee.role !== "AGENT") {
    throw forbiddenError("Tickets can only be assigned to agents.");
  }

  return prisma.ticket.update({
    where: { id: input.ticketId },
    data: { assigneeId: input.assigneeId },
    include: {
      reporter: true,
      assignee: true,
      comments: true,
    },
  });
}

/**
 * Change ticket status with transition enforcement.
 * Only agents can change status.
 *
 * Side effects:
 *   - RESOLVED/CLOSED: sets resolvedAt (freezes resolution clock)
 *   - Reopen (RESOLVED→IN_PROGRESS, CLOSED→OPEN): clears resolvedAt
 */
export async function changeTicketStatus(
  prisma: PrismaClient,
  user: CurrentUser | null,
  input: ChangeStatusInput
) {
  requireAgent(user);

  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
  });
  if (!ticket) {
    throw notFoundError("Ticket", input.ticketId);
  }

  const from = ticket.status;
  const to = input.status;

  if (!isValidTransition(from, to)) {
    throw invalidTransitionError(from, to);
  }

  // Determine resolvedAt update
  const now = new Date();
  let resolvedAt: Date | null | undefined = undefined; // undefined = no change

  if (shouldFreezeResolutionClock(to)) {
    resolvedAt = now;
  } else if (isReopenTransition(from, to)) {
    resolvedAt = null; // clear → clock resumes
  }

  const updateData: { status: TicketStatus; resolvedAt?: Date | null } = {
    status: to,
  };
  if (resolvedAt !== undefined) {
    updateData.resolvedAt = resolvedAt;
  }

  return prisma.ticket.update({
    where: { id: input.ticketId },
    data: updateData,
    include: {
      reporter: true,
      assignee: true,
      comments: true,
    },
  });
}

/**
 * Resolve a ticket — convenience wrapper over changeTicketStatus(RESOLVED).
 */
export async function resolveTicket(
  prisma: PrismaClient,
  user: CurrentUser | null,
  ticketId: string
) {
  return changeTicketStatus(prisma, user, {
    ticketId,
    status: "RESOLVED",
  });
}
