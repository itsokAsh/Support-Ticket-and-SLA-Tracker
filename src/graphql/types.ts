import type { IResolvers } from "@graphql-tools/utils";
import type { GraphQLContext } from "../context.js";

/**
 * Re-export the proper IResolvers type, bound to our GraphQL context.
 * This ensures compatibility with createSchema() while providing
 * type safety for our context in resolvers.
 */
export type Resolvers = IResolvers<unknown, GraphQLContext>;
