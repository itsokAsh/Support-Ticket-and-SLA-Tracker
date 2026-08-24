# Support Ticket & SLA Tracker

A lightweight helpdesk system where **reporters** raise support tickets and **agents** (human support staff) pick them up, reply, reassign, change status, and resolve them. Every ticket carries a priority-based SLA (Service Level Agreement) measured in **business hours only** — nights, weekends, and configured public holidays never count against an SLA.

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Bun |
| Language | TypeScript (strict mode, `no-explicit-any`) |
| API | GraphQL Yoga (schema-first) |
| Database | PostgreSQL via Docker Compose |
| ORM | Prisma |
| Frontend | React + TypeScript (Vite) |
| Auth | JWT (jose) + Argon2id (Bun.password) |
| Validation | Zod |

## Architecture Overview

```
GraphQL Resolver  →  Service (business logic)  →  Prisma  →  PostgreSQL
```

Resolvers only authenticate, validate input, call a service, and format the result or error. All business rules — ticket lifecycle, permissions, first-response tracking, and the SLA engine — live in services. The SLA/business-hours calculation is isolated in its own module.

## Quick Start

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
bun install

# 3. Run migrations, generate Prisma client, and seed data
bun run gendb

# 4. Start the backend
bun run dev

# 5. Start the frontend (in a separate terminal)
cd web && bun install && bun run dev
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://sla_user:sla_password@localhost:5432/sla_tracker` |
| `JWT_SECRET` | Secret for signing JWT tokens | — |
| `BUSINESS_TIMEZONE` | IANA timezone for business hours | `Asia/Kolkata` |
| `PORT` | Server port | `4000` |

## Database Schema

*TODO: Document after Phase 1*

## SLA Calculation Approach

*TODO: Document after Phase 3*

## Status Transition Rules

*TODO: Document after Phase 4*

## Authentication

*TODO: Document after Phase 2*

## Running Tests

```bash
bun test
```

## Seed Data

*TODO: Document after Phase 11*

## Example GraphQL Queries

*TODO: Document after Phase 6*

## How I'd Extend This

- SLA pause while `WAITING_ON_CUSTOMER`
- Escalation rules and notifications (email/Slack)
- Per-team business-hour calendars
- Multiple timezones with full DST handling
- Recompute stored deadlines when the holiday calendar changes
- Recurring holidays
- Audit trail for status/assignee changes
- Agent performance metrics
- More sophisticated, per-customer SLA policies
