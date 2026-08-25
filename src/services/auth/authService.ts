import type { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "./password.js";
import { signToken } from "./jwt.js";
import type { RegisterInput, LoginInput } from "../../validation/auth.js";
import {
  validationError,
  unauthorizedError,
  forbiddenError,
  duplicateEmailError,
} from "../../errors.js";

export interface AuthPayload {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

/**
 * Register a new user.
 *
 * Security decision: self-service register creates REPORTER only.
 * Passing role: AGENT is rejected with FORBIDDEN — agents are
 * provisioned through the seed script. In production this would
 * be an admin/invite flow.
 */
export async function register(
  prisma: PrismaClient,
  input: RegisterInput
): Promise<AuthPayload> {
  // Reject self-service agent registration
  if (input.role === "AGENT") {
    throw forbiddenError(
      "Agent accounts cannot be created through self-registration. Contact an administrator."
    );
  }

  // Check for duplicate email
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw duplicateEmailError();
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    },
  });

  const token = await signToken(user.id, user.role);

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Log in an existing user.
 */
export async function login(
  prisma: PrismaClient,
  input: LoginInput
): Promise<AuthPayload> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    // Use a generic message to avoid leaking whether the email exists
    throw unauthorizedError("Invalid email or password.");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw unauthorizedError("Invalid email or password.");
  }

  const token = await signToken(user.id, user.role);

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}
