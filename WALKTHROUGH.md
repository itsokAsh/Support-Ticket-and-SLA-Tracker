# Support Ticket & SLA Tracker: PR Walkthrough

This document serves as the formal walkthrough for the Support Ticket & SLA Tracker PR, detailing the architecture, schema designs, SLA engine mechanics, and the strategic tradeoffs made during development.

---

## 1. Overall Architecture

The application is a full-stack monorepo structured for strict separation of concerns, utilizing a flat, heavily typed architecture:

**Backend Stack:** Bun + GraphQL Yoga + Prisma ORM (PostgreSQL)
**Frontend Stack:** React + Vite + TypeScript (with a typed `fetch` GraphQL wrapper)

The backend data flow is strictly unidirectional:
`GraphQL Resolver → Zod Validation → Service (Business Logic) → Prisma → DB`

- **Resolvers** are deliberately thin. They handle authentication context and pass data down.
- **Services** are the core engines (e.g., `ticketService.ts`, `slaDeadlines.ts`). They are pure, testable functions holding all business logic, transition rules, and SLA mathematics.
- **Docker Orchestration**: The entire application (Postgres, API, Web Proxy) is containerized via Docker Compose. The `full` profile boots an Nginx proxy serving the Vite build and routing `/graphql` requests to the internal API container.

## 2. GraphQL Schema

The API is exposed via a strongly-typed GraphQL schema using SDL.
- **Queries:** `tickets` (cursor-based pagination, SLA filtering), `ticket` (single fetch), `dashboardStats` (live SLA health counts), and `me` (contextual user).
- **Mutations:** `register`, `login`, `createTicket`, `changeTicketStatus`, `assignTicket`, and `addComment`.
- **RBAC:** Built-in role enforcement ensures `REPORTER`s can only query their own tickets and cannot reassign tickets, while `AGENT`s have global read/write access and status control.

## 3. Database Schema

The PostgreSQL database is managed via Prisma. The schema is highly normalized and relies heavily on database-level constraints for data integrity:
- **`User`**: Distinguishes between `AGENT` and `REPORTER` roles.
- **`Ticket`**: The core entity. Crucially, **all four SLA deadlines are baked directly into the table as columns** (`firstResponseDueAt`, `firstResponseAtRiskAt`, `resolutionDueAt`, `resolutionAtRiskAt`). This denormalization allows the database to filter and sort by SLA state entirely via SQL, without pulling rows into Node memory.
- **`Comment`**: Tracks conversation history and triggers the "First Response" freeze event on the ticket.
- **`Holiday`**: A dedicated table for tracking localized off-days (e.g., Indian public holidays) via a simple `YYYY-MM-DD` string representation.

## 4. SLA Calculation Approach

SLA computation happens **only once, at ticket creation**.
Rather than computing SLA state on-the-fly during read operations, the backend computes the absolute deadline timestamps and the 75% "At Risk" timestamps instantly when `createTicket` is called. 

When querying for tickets (e.g., "Show me all AT_RISK tickets"), the query simply compares the current time (`now()`) against the stored timestamps. If a ticket is closed, its SLA clock is permanently frozen by setting `resolvedAt` or `firstResponseAt`, locking in whether it met or breached the SLA.

## 5. Business-Hours & Timezone Handling

The SLA engine (`addBusinessMinutes`) is a custom, zero-dependency pure function.
- **Business Hours:** Strictly `09:00 - 18:00`.
- **Timezone Handling:** It anchors all calculations using `toLocaleString` into `Asia/Kolkata` (or any environment-configured `BUSINESS_TIMEZONE`). By forcing the date math into the local boundary, it guarantees that 18:00 in India rolls over to 09:00 the next day, regardless of the UTC server time it runs on.
- **Weekends & Holidays:** The engine skips Saturdays and Sundays. It also fetches the exact `YYYY-MM-DD` strings from the `Holiday` table and skips any day that matches, ensuring completely dynamic calendar support.

## 6. Status Transition Design

Ticket statuses follow a strict finite state machine enforced by `changeTicketStatus`:
`OPEN → IN_PROGRESS → RESOLVED → CLOSED`

- **Reopening:** A `CLOSED` ticket can only transition back to `OPEN`. It cannot skip back to `IN_PROGRESS`.
- **Clock Freezing:** Transitioning to `RESOLVED` or `CLOSED` permanently freezes the SLA resolution clock. If a ticket is subsequently reopened, the clock resumes exactly from where it left off, preventing users from gaming the system by rapidly opening/closing tickets.

## 7. Testing Strategy

The application is covered by a rigid **86-test suite** running on Bun's ultra-fast test runner:
- **Unit Tests:** The entire SLA math engine, timezone rollovers, holiday skipping, and state transition logic are tested purely in-memory.
- **Integration Tests:** The `lifecycle.test.ts` suite boots a real, live PostgreSQL database and runs a 16-step simulated workflow. It tests the API exactly as the frontend would: registering users, creating tickets, mutating states, commenting to freeze SLA clocks, and verifying paginated dashboard counts.

## 8. Important Tradeoffs

- **Pre-computed SLAs vs On-the-fly Math:** 
  We chose to calculate SLA deadlines strictly at creation time. 
  *Tradeoff:* If the SLA policy (e.g., URGENT shifts from 4 hours to 2 hours) changes, old tickets will retain their original deadlines. 
  *Benefit:* Querying for "Breached" tickets takes milliseconds via a simple indexed DB scan (`resolutionDueAt < now`), whereas on-the-fly math would require pulling the entire ticket table into memory to calculate states.
  
- **Custom SLA Engine vs Heavy Libraries (e.g., `date-fns-tz` or `moment`):**
  *Tradeoff:* We had to write and test the rollover math manually.
  *Benefit:* Zero dependency bloat, synchronous execution, and perfectly tailored logic that cleanly skips business holidays without complex configuration objects.

- **Missing `WAITING_ON_CUSTOMER` State:**
  *Tradeoff:* The current system does not pause the SLA clock while waiting for a reporter to reply. We accepted this constraint to keep the assignment scope focused on the core resolution math, though the "reopen" architecture natively supports adding this in the future.
