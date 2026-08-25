import { z } from "zod";
import { validationError } from "../errors.js";

/**
 * Validate input against a Zod schema.
 * Throws a VALIDATION_ERROR GraphQL error with field-level messages on failure.
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => issue.message)
      .join(" ");
    throw validationError(messages);
  }
  return result.data;
}
