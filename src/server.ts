import { createServer } from "node:http";
import { createYoga, createSchema } from "graphql-yoga";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvers } from "./graphql/resolvers/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the schema-first SDL file(s)
const typeDefs = readFileSync(
  resolve(__dirname, "graphql", "schema", "schema.graphql"),
  "utf-8"
);

const yoga = createYoga({
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
  graphqlEndpoint: "/graphql",
  landingPage: true,
});

const port = parseInt(process.env["PORT"] ?? "4000", 10);

const server = createServer(yoga);

server.listen(port, () => {
  console.log(`🚀 GraphQL Yoga server running at http://localhost:${port}/graphql`);
});
