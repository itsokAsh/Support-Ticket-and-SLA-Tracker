FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY prisma ./prisma
COPY src ./src
COPY tests ./tests
COPY .eslintrc.cjs tsconfig.json ./

# Generate Prisma client for Debian
RUN bunx prisma generate

EXPOSE 4000

# Apply migrations on boot, then start the server
CMD ["sh", "-c", "bunx prisma migrate deploy && bun run src/server.ts"]
