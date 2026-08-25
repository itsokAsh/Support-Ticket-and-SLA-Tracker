# Support Ticket & SLA Tracker

A full-stack support ticket management system built as an interview assignment. Reporters raise tickets, agents triage and resolve them, and the system tracks each ticket against a Service Level Agreement (SLA) that is measured in **business hours only** — Monday to Friday, 09:00–18:00 in a configurable timezone, skipping weekends and public holidays.

The core of the project is a from-scratch SLA engine that computes first-response and resolution deadlines at ticket creation, and classifies every ticket as **On Track**, **At Risk**, or **Breached**.

## Tech Stack

- **Backend**: [Bun](https://bun.sh) + [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) + [Prisma ORM](https://www.prisma.io) (PostgreSQL)
- **Frontend**: [React](https://react.dev) + [Vite](https://vitejs.dev) + TypeScript, talking to the API through a small typed `fetch` wrapper for GraphQL (no client library)
- **Auth**: JWT ([jose](https://github.com/panva/jose)) with argon2id password hashing (Bun's built-in `Bun.password`)
- **Validation**: [Zod](https://zod.dev)
- **CI/CD**: GitHub Actions
- **Deployment**: Docker + Docker Compose

## Architecture Overview

The backend follows a deliberately flat, layered structure so responsibilities stay easy to follow:

```
GraphQL Resolver  →  Service (business logic)  →  Prisma  →  PostgreSQL
```

- **Resolvers** (`src/graphql/resolvers`) are thin. They read the authenticated user from the request context, validate input with Zod, and delegate to a service. They contain no business rules.
- **Services** (`src/services`) hold the real logic: the SLA engine, ticket lifecycle, status-transition rules, first-response tracking, permissions, and queries. These are plain functions that take a `PrismaClient` and typed inputs, which keeps them straightforward to read and to test.
- **Prisma** is the only thing that talks to PostgreSQL. There is no extra repository or data-access abstraction on top of it.

The GraphQL schema is **schema-first**: the SDL lives in `src/graphql/schema/*.graphql` and is loaded at runtime, so the contract is readable in one place and the resolvers implement it.

## Database Schema Overview

Four models (see `prisma/schema.prisma`):

- **User** — `id`, `name`, `email` (unique), `passwordHash`, `role` (`REPORTER` | `AGENT`, defaults to `REPORTER`), `createdAt`. A user has many `reported` tickets, many `assigned` tickets, and many comments.
- **Ticket** — `id`, `title`, `description`, `priority` (`LOW` | `MEDIUM` | `HIGH` | `URGENT`), `status` (`OPEN` | `IN_PROGRESS` | `RESOLVED` | `CLOSED`, defaults to `OPEN`), a required `reporter` and an optional `assignee`. It also stores the four **SLA deadline timestamps** (`firstResponseDueAt`, `firstResponseAtRiskAt`, `resolutionDueAt`, `resolutionAtRiskAt`) plus two **clock-freezing event timestamps** (`firstResponseAt`, `resolvedAt`).
- **Comment** — `id`, `content`, a `ticket`, an `author`, and `createdAt`.
- **Holiday** — `id`, `date` (unique), `name`. Dates listed here are treated as non-working days by the SLA engine.

Indexes exist on the columns the dashboard and ticket list filter and sort by (`status`, `priority`, `assigneeId`, `resolutionDueAt`, and `(createdAt, id)` for cursor pagination).

**Design note — timestamps are computed once, at creation.** Rather than recomputing SLA windows on every read, the four deadline timestamps are calculated when a ticket is created and stored on the row. This makes dashboard and list queries simple and fast: "at risk" and "breached" become plain timestamp comparisons the database can index and filter, instead of per-row business-hours math.

## SLA Calculation Approach

The SLA engine (`src/services/sla`) is built from scratch using standard JavaScript `Date` and `Intl.DateTimeFormat`, with no date libraries like `date-fns` or `moment`.

**Business hours.** Work time only accrues Monday–Friday, 09:00–18:00 (540 minutes per day) in `BUSINESS_TIMEZONE` (default `Asia/Kolkata`). When adding business minutes to a timestamp, the engine walks forward through working time: if a moment falls before 09:00 it snaps to 09:00; once it crosses 18:00 it jumps to 09:00 the next working day; weekends and any date in the `Holiday` table are skipped entirely.

**Policies.** Each priority has a first-response target and a resolution target, expressed in business hours:

| Priority | First response | Resolution |
| -------- | -------------- | ---------- |
| URGENT   | 1h             | 4h         |
| HIGH     | 4h             | 24h        |
| MEDIUM   | 8h             | 48h        |
| LOW      | 24h            | 72h        |

**At-risk threshold.** A clock becomes **AT_RISK** once **more than 75%** of its budget has elapsed. Boundary behavior is defined explicitly: exactly 75% consumed is still `ON_TRACK`, and reaching the deadline (100%) is `BREACHED`.

**Freezing the clocks.** The first-response clock freezes when `firstResponseAt` is set (the first comment by a non-reporter). The resolution clock freezes when `resolvedAt` is set (moving to `RESOLVED` or `CLOSED`) and resumes if the ticket is reopened.

**Consistency between the list and the dashboard.** The ticket-list SLA filter and the dashboard counts both classify by the **resolution clock** using the stored `resolutionAtRiskAt` / `resolutionDueAt` timestamps, so the two views always agree. One deliberate simplification: a ticket *resolved after* its deadline counts as On Track in these aggregate queries, because once `resolvedAt` is set the clock is frozen. The per-ticket SLA badge still reports that ticket as Breached. Detecting "resolved late" in a query would require comparing two columns to each other, which Prisma can't express without raw SQL — not worth the complexity here.

## Status Transition Rules

Ticket status changes are validated server-side against an explicit state machine (`src/services/ticket/statusTransitions.ts`). Invalid transitions are rejected with `INVALID_STATUS_TRANSITION`.

| From        | Allowed to                      |
| ----------- | ------------------------------- |
| OPEN        | IN_PROGRESS, RESOLVED, CLOSED   |
| IN_PROGRESS | RESOLVED, OPEN, CLOSED          |
| RESOLVED    | CLOSED, IN_PROGRESS *(reopen)*  |
| CLOSED      | OPEN *(reopen)*                 |

Side effects tied to a transition:

- Entering **RESOLVED** or **CLOSED** sets `resolvedAt = now`, freezing the resolution clock.
- **Reopening** (`RESOLVED → IN_PROGRESS` or `CLOSED → OPEN`) clears `resolvedAt`, so the resolution clock resumes.
- `CLOSED → IN_PROGRESS` is intentionally **not** allowed — a closed ticket must be reopened to `OPEN` first.

## Authentication & Authorization

- **Passwords** are hashed with **argon2id** via Bun's built-in `Bun.password`; plaintext passwords are never stored.
- **Login** issues a signed **JWT** (via `jose`) containing the user id and role. Send it on subsequent requests in the HTTP header `Authorization: Bearer <token>`. The server verifies the token in `src/context.ts` and attaches the current user to the GraphQL context. Failed logins return a generic "Invalid email or password." message so the API doesn't reveal whether an email exists.
- **Self-registration creates REPORTER accounts only.** Attempting to register with `role: AGENT` is rejected with `FORBIDDEN`; agent accounts are provisioned through the seed script (in production this would be an admin/invite flow).
- **Roles:**
  - **REPORTER** — can create tickets, comment on and view only their own tickets.
  - **AGENT** — can view all tickets, assign tickets, and change ticket status.
- **Rate limiting.** The `register` and `login` mutations are rate-limited to **10 attempts per 15 minutes per IP** (in-memory) to slow brute-force attempts, returning `RATE_LIMITED` when exceeded.

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed. All variables are read from the environment; no secrets are committed.

| Variable            | Purpose                                              | Example                                                                 |
| ------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `PORT`              | Port the API binds to                                | `4000`                                                                  |
| `DATABASE_URL`      | PostgreSQL connection string                         | `postgresql://sla_user:sla_password@localhost:5434/sla_tracker?schema=public` |
| `JWT_SECRET`        | Secret key used to sign/verify JWTs                  | `super_secret_development_key`                                          |
| `BUSINESS_TIMEZONE` | Timezone for all business-hours math                 | `Asia/Kolkata`                                                          |

## Getting Started (Local Dev)

**Prerequisites:** [Bun](https://bun.sh), plus Docker + Docker Compose (for PostgreSQL).

1. **Install dependencies** (backend and frontend are separate packages):
   ```bash
   bun install
   cd web && bun install && cd ..
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Update JWT_SECRET and confirm DATABASE_URL matches your local setup
   ```

3. **Start PostgreSQL, run migrations, and seed:**
   ```bash
   docker compose up -d   # start the Postgres container
   bun run gendb          # migrate + generate Prisma client + seed
   ```

4. **Run the backend API** (port `4000`):
   ```bash
   bun run dev
   ```
   GraphQL endpoint: `http://localhost:4000/graphql`

5. **Run the frontend** in a **separate terminal** (Vite dev server, port `5173`):
   ```bash
   cd web
   bun run dev
   ```
   Web UI: `http://localhost:5173`

> The backend (`bun run dev`) and frontend (`cd web && bun run dev`) are two separate processes and must run in parallel. The target quick-start flow is close to:
> ```bash
> docker compose up -d && bun install && bun run gendb && bun run dev
> ```
> with the frontend started separately as shown above.

### Database Migrations

- `bun run gendb` runs `prisma migrate deploy` (applies committed migrations), regenerates the Prisma client, and seeds — this is what you normally run for local setup.
- To create a new migration during development after editing `prisma/schema.prisma`:
  ```bash
  bun run migrate    # prisma migrate dev
  ```

### Seeding

`bun run gendb` also runs the seed script (`prisma/seed.ts`), or run it on its own with:
```bash
bun run seed
```
It creates a few sample holidays and one ticket per SLA state (on-track, at-risk, breached, resolved), plus two users:

| Role     | Email                 | Password      |
| -------- | --------------------- | ------------- |
| AGENT    | `agent@example.com`   | `password123` |
| REPORTER | `reporter@example.com`| `password123` |

## Running Tests

```bash
bun test
```

The suite has two layers:

- **Unit tests** (`tests/unit`) — the SLA/business-hours engine (normal weekdays, before/after hours, weekends, Friday evenings, holidays, multi-day spans, first-response vs resolution, and the AT_RISK/BREACHED/completed transitions), the status-transition state machine, and the Zod input validation.
- **Integration test** (`tests/integration/lifecycle.test.ts`) — runs against a **real PostgreSQL** database (no mocking) and exercises the full candidate flow: register → login → create ticket → add reporter comment → add agent comment → verify `firstResponseAt` is recorded → verify persisted SLA information, plus authorization, assignment, status transitions, pagination, and validation errors.

The integration test expects the database from `docker compose up -d` to be running and migrated (`bun run gendb`).

## Example GraphQL Queries & Mutations

**Register** (REPORTER only) and **log in** to get a token:
```graphql
mutation Register {
  register(name: "Ada Lovelace", email: "ada@example.com", password: "password123", role: REPORTER) {
    token
    user { id name role }
  }
}

mutation Login {
  login(email: "agent@example.com", password: "password123") {
    token
    user { id role }
  }
}
```

Send the returned token on authenticated requests:
```
Authorization: Bearer <token>
```

**Create a ticket** (as a reporter):
```graphql
mutation CreateTicket {
  createTicket(title: "Login page 500s", description: "Users cannot sign in.", priority: HIGH) {
    id
    status
    sla {
      firstResponseState
      resolutionState
      resolutionDueAt
      resolutionRemainingMinutes
    }
  }
}
```

**Add a comment** (an agent's first comment records `firstResponseAt`):
```graphql
mutation AddComment {
  addComment(ticketId: "TICKET_ID", content: "Looking into this now.") {
    id
    firstResponseAt
  }
}
```

**Assign** and **change status** (agent only):
```graphql
mutation Assign {
  assignTicket(ticketId: "TICKET_ID", assigneeId: "AGENT_USER_ID") { id assignee { name } }
}

mutation Progress {
  changeTicketStatus(ticketId: "TICKET_ID", status: IN_PROGRESS) { id status }
}
```

**List tickets** with cursor pagination and filters (e.g. only at-risk tickets):
```graphql
query Tickets {
  tickets(first: 10, slaState: AT_RISK, priority: HIGH) {
    edges {
      id
      title
      status
      sla { resolutionState resolutionRemainingMinutes }
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

**Fetch a single ticket** with full SLA info:
```graphql
query Ticket {
  ticket(id: "TICKET_ID") {
    title
    status
    sla {
      firstResponseState
      resolutionState
      firstResponseRemainingMinutes
      resolutionRemainingMinutes
    }
    comments { content author { name } createdAt }
  }
}
```

**Dashboard counts:**
```graphql
query Dashboard {
  dashboardStats {
    open
    inProgress
    resolved
    closed
    atRiskActive
    breachedActive
  }
}
```

## Full-App Dockerization (Production-like)

To run both the backend API and frontend Nginx server natively inside Docker (with internal network routing):
```bash
docker compose --profile full up --build
```
The application will be available at `http://localhost:5173`

## How I'd Extend This

If this were a production application rather than an interview assignment, I would add:
1. **WAITING_ON_CUSTOMER SLA Pause:** Currently, the resolution SLA ticks down continuously. I'd add a "Waiting on Customer" status that temporarily freezes the resolution clock.
2. **Per-Team Business Calendars:** Moving the global `BUSINESS_TIMEZONE` into the database, allowing global support teams to operate on "follow-the-sun" models.
3. **Audit Trails:** A `TicketHistory` table to record precisely who changed what field and when.
4. **Notifications / Escalations:** Automated Slack or Email pinging when a ticket enters the "At Risk" threshold.
5. **Recompute-on-Holiday-Change:** A background worker (using a queue like BullMQ) that automatically recalculates existing SLA timestamps if an Administrator inserts a brand new holiday mid-year.
