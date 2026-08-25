# Support Ticket & SLA Tracker

A robust, full-stack Support Ticket management system built as an interview assignment. The application calculates accurate Service Level Agreement (SLA) deadlines based strictly on configured business hours (e.g., 9:00 AM - 6:00 PM), skipping weekends and customizable public holidays.

## Tech Stack
- **Backend**: [Bun](https://bun.sh) + [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) + [Prisma ORM](https://www.prisma.io) (PostgreSQL)
- **Frontend**: [React](https://react.dev) + [Vite](https://vitejs.dev) + TypeScript, talking to the API through a small typed `fetch` wrapper for GraphQL (no client library)
- **CI/CD**: GitHub Actions
- **Deployment**: Docker + Docker Compose

## Architecture & Design Decisions

### SLA Calculation Engine
The SLA engine is built completely from scratch using standard JavaScript `Date` and `Intl.DateTimeFormat` APIs, without heavy dependencies like `date-fns` or `moment`. 

It operates by shifting time iteratively, ensuring that whenever a calculation crosses 6:00 PM (the end of the business day), it explicitly jumps to 9:00 AM the following valid business day, checking against a set of `Set<string>` mapped public holidays. 

### Database Schema
All SLA-related timestamps are computed *at the moment of ticket creation* or mutation and stored natively on the `Ticket` table. This dramatically simplifies complex dashboard queries, allowing the database to do the heavy lifting of sorting, filtering, and identifying "At Risk" or "Breached" tickets without re-computing SLA windows on the fly for thousands of rows.

The ticket-list SLA filter and the dashboard counts both classify tickets by the **resolution clock** (using the stored `resolutionAtRiskAt` / `resolutionDueAt` timestamps), so the two views always agree. One deliberate simplification: a ticket that was *resolved after* its deadline counts as On Track in these queries, because once `resolvedAt` is set the clock is frozen. The per-ticket SLA badge still reports that ticket as Breached. Detecting "resolved late" in a query would require comparing two columns to each other, which Prisma can't express without raw SQL — not worth the complexity here.

### Roles and Authentication
The system uses JWT-based authentication.
- **REPORTER**: Can only view and edit their own tickets.
- **AGENT**: Can view all tickets, assign themselves to tickets, and modify the status of any ticket.

## Quick Start (Local Dev)

1. **Install dependencies:**
   ```bash
   bun install
   cd web && bun install && cd ..
   ```

2. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Update JWT_SECRET and confirm DATABASE_URL matches your local setup
   ```

3. **Start the Database & Seed it:**
   ```bash
   # Starts the Postgres container locally
   docker compose up -d
   # Migrates schema and runs the seed script (creates agent@example.com / reporter@example.com)
   bun run gendb
   ```

4. **Run the Application:**
   ```bash
   bun run dev
   ```
   - API: `http://localhost:4000/graphql`
   - Web UI: `http://localhost:5173`

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
