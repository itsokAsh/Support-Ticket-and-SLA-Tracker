import type { GraphQLContext } from "../../context.js";
import { register, login, checkRateLimit, getRateLimitKey, requireUser } from "../../services/auth/index.js";
import { registerSchema, loginSchema } from "../../validation/auth.js";
import { validateInput } from "../../validation/index.js";

/**
 * Auth resolvers — thin layer: validate, rate-limit, delegate to service.
 */
export const authResolvers = {
  Query: {
    users: async (
      _parent: unknown,
      args: { role?: string },
      context: GraphQLContext
    ) => {
      requireUser(context.currentUser);
      const where = args.role ? { role: args.role as "REPORTER" | "AGENT" } : {};
      return context.prisma.user.findMany({
        where,
        orderBy: { name: "asc" },
      });
    },

    me: async (
      _parent: unknown,
      _args: unknown,
      context: GraphQLContext
    ) => {
      if (!context.currentUser) return null;
      return context.prisma.user.findUnique({
        where: { id: context.currentUser.userId },
      });
    },
  },

  User: {
    createdAt: (user: { createdAt: Date }) => user.createdAt.toISOString(),
  },

  Mutation: {
    register: async (
      _parent: unknown,
      args: { name: string; email: string; password: string; role: string },
      context: GraphQLContext
    ) => {
      checkRateLimit(getRateLimitKey(context.request));
      const input = validateInput(registerSchema, args);
      return register(context.prisma, input);
    },

    login: async (
      _parent: unknown,
      args: { email: string; password: string },
      context: GraphQLContext
    ) => {
      checkRateLimit(getRateLimitKey(context.request));
      const input = validateInput(loginSchema, args);
      return login(context.prisma, input);
    },
  },
};
