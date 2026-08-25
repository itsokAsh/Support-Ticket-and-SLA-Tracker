import { GraphQLError } from "graphql";

/**
 * Machine-readable error codes returned in GraphQL error extensions.
 * The frontend can key off these codes for i18n or conditional UI logic.
 */
export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  TICKET_NOT_FOUND: "TICKET_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
  INVALID_PRIORITY: "INVALID_PRIORITY",
  INVALID_COMMENT: "INVALID_COMMENT",
  RATE_LIMITED: "RATE_LIMITED",
  DUPLICATE_EMAIL: "DUPLICATE_EMAIL",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Create a typed GraphQL error with a machine-readable code.
 * These are returned as proper GraphQL errors (not unhandled 500s).
 */
export function appError(
  message: string,
  code: ErrorCodeValue,
  statusCode: number = 400
): GraphQLError {
  return new GraphQLError(message, {
    extensions: {
      code,
      http: { status: statusCode },
    },
  });
}

// ── Convenience helpers ──

export function validationError(message: string): GraphQLError {
  return appError(message, ErrorCode.VALIDATION_ERROR);
}

export function notFoundError(entity: string, id: string): GraphQLError {
  return appError(
    `${entity} with id "${id}" not found.`,
    entity === "Ticket" ? ErrorCode.TICKET_NOT_FOUND : ErrorCode.USER_NOT_FOUND,
    404
  );
}

export function unauthorizedError(
  message = "You must be logged in to perform this action."
): GraphQLError {
  return appError(message, ErrorCode.UNAUTHORIZED, 401);
}

export function forbiddenError(
  message = "You do not have permission to perform this action."
): GraphQLError {
  return appError(message, ErrorCode.FORBIDDEN, 403);
}

export function invalidTransitionError(
  from: string,
  to: string
): GraphQLError {
  return appError(
    `Ticket cannot transition from ${from} to ${to}.`,
    ErrorCode.INVALID_STATUS_TRANSITION
  );
}

export function rateLimitedError(): GraphQLError {
  return appError(
    "Too many requests. Please try again later.",
    ErrorCode.RATE_LIMITED,
    429
  );
}

export function duplicateEmailError(): GraphQLError {
  return appError(
    "A user with this email already exists.",
    ErrorCode.DUPLICATE_EMAIL
  );
}
