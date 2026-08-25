import type { PrismaClient } from "@prisma/client";
import type { CurrentUser } from "../auth/permissions.js";
import { requireUser, requireOwnerOrAgent } from "../auth/permissions.js";
import { notFoundError } from "../../errors.js";
import type { AddCommentInput } from "../../validation/comment.js";

/**
 * Add a comment to a ticket.
 *
 * Enforces the first-response SLA rule:
 * If this is the FIRST comment by someone OTHER than the original reporter,
 * the `firstResponseAt` clock is frozen permanently.
 */
export async function addComment(
  prisma: PrismaClient,
  user: CurrentUser | null,
  input: AddCommentInput
) {
  const currentUser = requireUser(user);

  // Ensure ticket exists and user has access to it
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
    select: {
      id: true,
      reporterId: true,
      firstResponseAt: true,
    },
  });

  if (!ticket) {
    throw notFoundError("Ticket", input.ticketId);
  }

  requireOwnerOrAgent(currentUser, ticket.reporterId);

  const now = new Date();

  // Determine if this comment triggers the first-response SLA freeze
  // Rule: It must be the *first* time (firstResponseAt is null) AND the author must NOT be the reporter
  const isFirstResponse =
    ticket.firstResponseAt === null && currentUser.userId !== ticket.reporterId;

  // We use a transaction to create the comment and update the ticket atomically
  return prisma.$transaction(async (tx) => {
    // 1. Create the comment
    await tx.comment.create({
      data: {
        content: input.content,
        ticketId: input.ticketId,
        authorId: currentUser.userId,
      },
    });

    // 2. Update the ticket (freeze firstResponseAt if applicable, and touch updatedAt)
    const updateData: { updatedAt: Date; firstResponseAt?: Date } = {
      updatedAt: now,
    };
    if (isFirstResponse) {
      updateData.firstResponseAt = now;
    }

    return tx.ticket.update({
      where: { id: input.ticketId },
      data: updateData,
      include: {
        reporter: true,
        assignee: true,
        comments: {
          include: { author: true },
          orderBy: { createdAt: 'asc' }
        },
      },
    });
  });
}
