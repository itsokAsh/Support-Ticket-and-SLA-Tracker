import type { Resolvers } from "../types.js";

export const healthResolvers: Resolvers = {
  Query: {
    health: () => true,
  },
};
