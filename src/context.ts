import type { PrismaClient } from "@prisma/client";
import type { YogaInitialContext } from "graphql-yoga";
import { verifyToken } from "./services/auth/jwt.js";
import type { CurrentUser } from "./services/auth/permissions.js";
import { prisma } from "./db/index.js";

/**
 * GraphQL context available to every resolver.
 */
export interface GraphQLContext {
  prisma: PrismaClient;
  currentUser: CurrentUser | null;
  request: Request;
}

/**
 * Build the GraphQL context from the incoming request.
 * Reads the Authorization header, verifies the JWT, and attaches
 * the current user (or null if unauthenticated).
 */
export async function createContext(
  initialContext: YogaInitialContext
): Promise<GraphQLContext> {
  const request = initialContext.request;
  let currentUser: CurrentUser | null = null;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (payload) {
      currentUser = {
        userId: payload.userId,
        role: payload.role,
      };
    }
  }

  return {
    prisma,
    currentUser,
    request,
  };
}
