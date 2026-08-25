import type { GraphQLContext } from "../../context.js";
import {
  createTicket,
  assignTicket,
  changeTicketStatus,
  resolveTicket,
} from "../../services/ticket/index.js";
import { deriveSLAInfo, BUSINESS_TIMEZONE } from "../../services/sla/index.js";
import {
  createTicketSchema,
  assignTicketSchema,
  changeStatusSchema,
  resolveTicketSchema,
} from "../../validation/ticket.js";
import { validateInput } from "../../validation/index.js";

// Type for a Ticket row from Prisma (used in field resolvers)
interface TicketRow {
  createdAt: Date;
  updatedAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  firstResponseDueAt: Date;
  firstResponseAtRiskAt: Date;
  resolutionDueAt: Date;
  resolutionAtRiskAt: Date;
}

interface CommentRow {
  createdAt: Date;
}

/**
 * Ticket resolvers — thin layer: validate, delegate to service.
 * SLAInfo is computed as a field resolver on Ticket.
 */
export const ticketResolvers = {
  Ticket: {
    createdAt: (ticket: TicketRow) => ticket.createdAt.toISOString(),
    updatedAt: (ticket: TicketRow) => ticket.updatedAt.toISOString(),
    firstResponseAt: (ticket: TicketRow) =>
      ticket.firstResponseAt?.toISOString() ?? null,
    resolvedAt: (ticket: TicketRow) =>
      ticket.resolvedAt?.toISOString() ?? null,

    /**
     * SLAInfo is a computed field — derived from stored deadlines.
     * The backend is the single source of truth for SLA state.
     */
    sla: async (ticket: TicketRow, _args: unknown, context: GraphQLContext) => {
      // Fetch holidays for remaining-minutes calculation
      const holidays = await context.prisma.holiday.findMany();
      const holidaySet = new Set<string>();
      for (const h of holidays) {
        const d = h.date;
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        holidaySet.add(`${year}-${month}-${day}`);
      }

      return deriveSLAInfo(
        {
          firstResponseDueAt: ticket.firstResponseDueAt,
          firstResponseAtRiskAt: ticket.firstResponseAtRiskAt,
          resolutionDueAt: ticket.resolutionDueAt,
          resolutionAtRiskAt: ticket.resolutionAtRiskAt,
          firstResponseAt: ticket.firstResponseAt,
          resolvedAt: ticket.resolvedAt,
          now: new Date(),
        },
        { timezone: BUSINESS_TIMEZONE, holidays: holidaySet }
      );
    },
  },

  Comment: {
    createdAt: (comment: CommentRow) => comment.createdAt.toISOString(),
  },

  Mutation: {
    createTicket: async (
      _parent: unknown,
      args: { title: string; description: string; priority: string },
      context: GraphQLContext
    ) => {
      const input = validateInput(createTicketSchema, args);
      return createTicket(context.prisma, context.currentUser, input);
    },

    assignTicket: async (
      _parent: unknown,
      args: { ticketId: string; assigneeId: string },
      context: GraphQLContext
    ) => {
      const input = validateInput(assignTicketSchema, args);
      return assignTicket(context.prisma, context.currentUser, input);
    },

    changeTicketStatus: async (
      _parent: unknown,
      args: { ticketId: string; status: string },
      context: GraphQLContext
    ) => {
      const input = validateInput(changeStatusSchema, args);
      return changeTicketStatus(context.prisma, context.currentUser, input);
    },

    resolveTicket: async (
      _parent: unknown,
      args: { ticketId: string },
      context: GraphQLContext
    ) => {
      const input = validateInput(resolveTicketSchema, args);
      return resolveTicket(context.prisma, context.currentUser, input.ticketId);
    },
  },
};
