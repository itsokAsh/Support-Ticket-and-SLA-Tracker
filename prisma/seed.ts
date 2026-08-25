import { PrismaClient } from "@prisma/client";
import { password } from "bun";
import { computeSLADeadlines } from "../src/services/sla/slaDeadlines";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. Users — one agent and one reporter, both with password "password123".
  const hashedPassword = await password.hash("password123");

  const agent = await prisma.user.upsert({
    where: { email: "agent@example.com" },
    update: {},
    create: {
      name: "Super Agent",
      email: "agent@example.com",
      passwordHash: hashedPassword,
      role: "AGENT",
    },
  });

  const reporter = await prisma.user.upsert({
    where: { email: "reporter@example.com" },
    update: {},
    create: {
      name: "Helpful Reporter",
      email: "reporter@example.com",
      passwordHash: hashedPassword,
      role: "REPORTER",
    },
  });

  // 2. Holidays — a few real Indian public holidays. Stored at UTC midnight so
  // the "YYYY-MM-DD" key matches how the SLA engine reads them back.
  const holidayDates = [
    { date: new Date("2026-01-26T00:00:00Z"), name: "Republic Day" },
    { date: new Date("2026-10-02T00:00:00Z"), name: "Gandhi Jayanti" },
    { date: new Date("2026-12-25T00:00:00Z"), name: "Christmas" },
  ];

  for (const h of holidayDates) {
    await prisma.holiday.upsert({
      where: { date: h.date },
      update: {},
      create: { date: h.date, name: h.name },
    });
  }

  const holidays = await prisma.holiday.findMany();
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));

  // Start each run from a clean slate so the dashboard is predictable.
  await prisma.comment.deleteMany();
  await prisma.ticket.deleteMany();

  const now = new Date();

  // 3. One ticket per SLA state so the dashboard shows all of them.

  // BREACHED — an URGENT ticket created 3 days ago and never responded to.
  // Its 4-business-hour resolution deadline is long past, so it is breached.
  const breachedCreatedAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const breachedSla = computeSLADeadlines("URGENT", breachedCreatedAt, holidaySet);
  await prisma.ticket.create({
    data: {
      title: "Critical Production Outage",
      description: "Everything is down! Help!",
      priority: "URGENT",
      status: "OPEN",
      reporterId: reporter.id,
      createdAt: breachedCreatedAt,
      ...breachedSla,
    },
  });

  // AT_RISK — a HIGH ticket past its 75% resolution mark but not yet overdue.
  // We anchor the resolution timestamps directly to `now` instead of backdating
  // the creation time, because business-hours backdating can't reliably land in
  // this narrow window (weekends and holidays accrue zero business time). The
  // first-response clock is already met (an agent replied), so only the
  // resolution clock is at risk.
  const atRiskCreatedAt = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  await prisma.ticket.create({
    data: {
      title: "API is experiencing high latency",
      description: "Latency is over 2s on the main endpoints.",
      priority: "HIGH",
      status: "IN_PROGRESS",
      reporterId: reporter.id,
      assigneeId: agent.id,
      createdAt: atRiskCreatedAt,
      // First-response clock: frozen and met (replied before it was due).
      firstResponseAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      firstResponseDueAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      firstResponseAtRiskAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      // Resolution clock: past the at-risk mark, not yet due, still unresolved.
      resolvedAt: null,
      resolutionAtRiskAt: new Date(now.getTime() - 30 * 60 * 1000),
      resolutionDueAt: new Date(now.getTime() + 90 * 60 * 1000),
    },
  });

  // ON_TRACK — a MEDIUM ticket created just now, plenty of budget left.
  const onTrackSla = computeSLADeadlines("MEDIUM", now, holidaySet);
  await prisma.ticket.create({
    data: {
      title: "Need help resetting password",
      description: "Can't access my account.",
      priority: "MEDIUM",
      status: "OPEN",
      reporterId: reporter.id,
      createdAt: now,
      ...onTrackSla,
    },
  });

  // RESOLVED (met) — a LOW ticket resolved well within its deadline. Because the
  // resolution clock is frozen once resolvedAt is set, this stays ON_TRACK.
  const resolvedCreatedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const resolvedSla = computeSLADeadlines("LOW", resolvedCreatedAt, holidaySet);
  const resolvedTicket = await prisma.ticket.create({
    data: {
      title: "Update documentation typo",
      description: "Found a typo on page 5.",
      priority: "LOW",
      status: "RESOLVED",
      reporterId: reporter.id,
      assigneeId: agent.id,
      createdAt: resolvedCreatedAt,
      firstResponseAt: new Date(resolvedCreatedAt.getTime() + 10 * 60 * 1000),
      resolvedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      ...resolvedSla,
    },
  });

  await prisma.comment.create({
    data: {
      content: "Thanks! I've fixed this.",
      ticketId: resolvedTicket.id,
      authorId: agent.id,
      createdAt: new Date(resolvedCreatedAt.getTime() + 10 * 60 * 1000),
    },
  });

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
