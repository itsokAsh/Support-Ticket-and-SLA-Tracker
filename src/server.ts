import { createServer } from "node:http";
import { createYoga, createSchema } from "graphql-yoga";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvers } from "./graphql/resolvers/index.js";
import { createContext, type GraphQLContext } from "./context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(__dirname, "graphql", "schema");

// Read all .graphql SDL files from the schema directory
const typeDefs = readdirSync(schemaDir)
  .filter((f) => f.endsWith(".graphql"))
  .map((f) => readFileSync(join(schemaDir, f), "utf-8"))
  .join("\n");

const yoga = createYoga<GraphQLContext>({
  schema: createSchema<GraphQLContext>({
    typeDefs,
    resolvers,
  }),
  context: createContext,
  graphqlEndpoint: "/graphql",
  landingPage: true,
});

const port = parseInt(process.env["PORT"] ?? "4000", 10);

const server = createServer(yoga);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `🚀 GraphQL Yoga server running at http://localhost:${port}/graphql`
  );
});
