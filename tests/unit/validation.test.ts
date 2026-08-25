import { describe, test, expect } from "bun:test";
import { createTicketSchema, changeStatusSchema } from "../../src/validation/ticket";

/**
 * Input validation unit tests.
 *
 * The Zod schemas are the first line of defence before any business logic runs,
 * so we test them in isolation. We use safeParse and assert on `success` to keep
 * the tests free of try/catch noise.
 */

describe("createTicketSchema", () => {
  test("accepts a valid ticket and trims surrounding whitespace", () => {
    const result = createTicketSchema.safeParse({
      title: "  Login is broken  ",
      description: "  I cannot log in to my account.  ",
      priority: "HIGH",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Login is broken");
      expect(result.data.description).toBe("I cannot log in to my account.");
      expect(result.data.priority).toBe("HIGH");
    }
  });

  test("rejects an empty title", () => {
    const result = createTicketSchema.safeParse({
      title: "",
      description: "Something is wrong.",
      priority: "LOW",
    });
    expect(result.success).toBe(false);
  });

  test("rejects a whitespace-only title (trimmed to empty)", () => {
    const result = createTicketSchema.safeParse({
      title: "     ",
      description: "Something is wrong.",
      priority: "LOW",
    });
    expect(result.success).toBe(false);
  });

  test("rejects a title longer than 255 characters", () => {
    const result = createTicketSchema.safeParse({
      title: "a".repeat(256),
      description: "Something is wrong.",
      priority: "LOW",
    });
    expect(result.success).toBe(false);
  });

  test("rejects an empty description", () => {
    const result = createTicketSchema.safeParse({
      title: "Valid title",
      description: "",
      priority: "MEDIUM",
    });
    expect(result.success).toBe(false);
  });

  test("rejects an unknown priority value", () => {
    const result = createTicketSchema.safeParse({
      title: "Valid title",
      description: "Valid description.",
      priority: "SUPER_URGENT",
    });
    expect(result.success).toBe(false);
  });

  test("rejects a missing priority", () => {
    const result = createTicketSchema.safeParse({
      title: "Valid title",
      description: "Valid description.",
    });
    expect(result.success).toBe(false);
  });
});

describe("changeStatusSchema", () => {
  test("accepts a valid status change", () => {
    const result = changeStatusSchema.safeParse({
      ticketId: "ticket-123",
      status: "IN_PROGRESS",
    });
    expect(result.success).toBe(true);
  });

  test("rejects an unknown status", () => {
    const result = changeStatusSchema.safeParse({
      ticketId: "ticket-123",
      status: "ARCHIVED",
    });
    expect(result.success).toBe(false);
  });

  test("rejects a missing ticketId", () => {
    const result = changeStatusSchema.safeParse({
      status: "OPEN",
    });
    expect(result.success).toBe(false);
  });
});
