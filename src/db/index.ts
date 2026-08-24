import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Reuses a single PrismaClient instance across the application
 * to avoid exhausting database connections during development
 * (where module reloads would otherwise create new clients).
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}
