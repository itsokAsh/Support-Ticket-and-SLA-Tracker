import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@prisma/client";

/**
 * JWT token payload — contains just enough to identify the user and their role.
 */
export interface TokenPayload extends JWTPayload {
  userId: string;
  role: Role;
}

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required.");
}

const secret = new TextEncoder().encode(JWT_SECRET);
const ISSUER = "sla-tracker";
const EXPIRY = "24h";

/**
 * Sign a JWT token with the user's id and role.
 */
export async function signToken(userId: string, role: Role): Promise<string> {
  return new SignJWT({ userId, role } satisfies TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(EXPIRY)
    .sign(secret);
}

/**
 * Verify and decode a JWT token. Returns null if invalid/expired.
 */
export async function verifyToken(
  token: string
): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
    });
    // Validate the payload has the expected shape
    if (
      typeof payload.userId === "string" &&
      (payload.role === "REPORTER" || payload.role === "AGENT")
    ) {
      return payload as TokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}
