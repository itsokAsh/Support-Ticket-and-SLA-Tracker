import type { Role } from "@prisma/client";
import { unauthorizedError, forbiddenError } from "../../errors.js";

/**
 * Minimal user info attached to the GraphQL context after JWT verification.
 */
export interface CurrentUser {
  userId: string;
  role: Role;
}

/**
 * Ensure a user is authenticated. Throws UNAUTHORIZED if not.
 */
export function requireUser(user: CurrentUser | null): CurrentUser {
  if (!user) {
    throw unauthorizedError();
  }
  return user;
}

/**
 * Ensure the current user is an AGENT. Throws FORBIDDEN if not.
 */
export function requireAgent(user: CurrentUser | null): CurrentUser {
  const u = requireUser(user);
  if (u.role !== "AGENT") {
    throw forbiddenError("Only agents can perform this action.");
  }
  return u;
}

/**
 * Ensure the current user owns the resource or is an agent.
 * Used for reporters who should only access their own tickets.
 */
export function requireOwnerOrAgent(
  user: CurrentUser | null,
  ownerId: string
): CurrentUser {
  const u = requireUser(user);
  if (u.role !== "AGENT" && u.userId !== ownerId) {
    throw forbiddenError("You do not have access to this resource.");
  }
  return u;
}
