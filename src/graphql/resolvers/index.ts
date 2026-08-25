import { healthResolvers } from "./health.js";
import { authResolvers } from "./auth.js";
import type { Resolvers } from "../types.js";

/**
 * Merge all resolver maps into a single root resolver.
 * Each phase will add its own resolvers here.
 */
function mergeResolvers(...resolverMaps: Resolvers[]): Resolvers {
  const merged: Resolvers = {};

  for (const map of resolverMaps) {
    for (const [typeName, fields] of Object.entries(map)) {
      const key = typeName as keyof Resolvers;
      merged[key] = {
        ...(merged[key] as Record<string, unknown> | undefined),
        ...(fields as Record<string, unknown>),
      } as Resolvers[typeof key];
    }
  }

  return merged;
}

export const resolvers: Resolvers = mergeResolvers(
  healthResolvers,
  authResolvers
);
