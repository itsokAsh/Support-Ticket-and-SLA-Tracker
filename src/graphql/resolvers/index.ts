import { healthResolvers } from "./health.js";
import { authResolvers } from "./auth.js";
import { mergeResolvers } from "@graphql-tools/merge";
import type { IResolvers } from "@graphql-tools/utils";

/**
 * Merge all resolver maps into a single root resolver.
 * Uses @graphql-tools/merge for proper deep merging of resolver maps.
 * Each phase will add its own resolvers here.
 */
export const resolvers: IResolvers = mergeResolvers([
  healthResolvers,
  authResolvers,
]);
