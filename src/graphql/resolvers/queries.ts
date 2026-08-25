import type { GraphQLContext } from "../../context.js";
import { getTickets, getTicketById, getDashboardStats } from "../../services/ticket/queryService.js";
import { getTicketsSchema, getTicketByIdSchema, type GetTicketsInput } from "../../validation/queries.js";
import { validateInput } from "../../validation/index.js";

export const queryResolvers = {
  Query: {
    tickets: async (_parent: unknown, args: Record<string, unknown>, context: GraphQLContext) => {
      // Validate pagination and filters
      const input = validateInput(getTicketsSchema, args) as GetTicketsInput;
      return getTickets(context.prisma, context.currentUser, input);
    },
    
    ticket: async (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      const input = validateInput(getTicketByIdSchema, { ticketId: args.id });
      return getTicketById(context.prisma, context.currentUser, input.ticketId);
    },

    dashboardStats: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      return getDashboardStats(context.prisma, context.currentUser);
    },
  }
};
