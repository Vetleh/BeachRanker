import bcrypt from "bcryptjs";
import type { Env } from "./env";
import { ApiError } from "./http";
import type { AuthUser, User } from "./types";
import { base64UrlDecode, base64UrlEncode, hmacSha256 } from "./crypto";

const cookieName = "beachranker_session";
const tokenMaxAgeSeconds = 60 * 60 * 24 * 30;

type TokenPayload = {
  sub: string;
  exp: number;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionCookie(env: Env, userId: string) {
  const token = await createSessionToken(env, userId);
  return `${cookieName}=${token}; Max-Age=${tokenMaxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export async function createSessionToken(env: Env, userId: string) {
  const payload: TokenPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + tokenMaxAgeSeconds,
  };
  return signToken(env.JWT_SECRET, payload);
}

export function clearSessionCookie() {
  return `${cookieName}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export async function getAuthUser(request: Request, env: Env): Promise<AuthUser | null> {
  const token = getToken(request);
  if (!token) {
    return null;
  }

  const payload = await verifyToken(env.JWT_SECRET, token).catch(() => null);
  if (!payload) {
    return null;
  }

  const user = await env.DB.prepare("SELECT id, email, displayName, passwordHash, role, active FROM users WHERE id = ?")
    .bind(payload.sub)
    .first<User>();

  if (!user || user.active !== 1) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    active: true,
  };
}

export function requireAuth(user: AuthUser | null): AuthUser {
  if (!user) {
    throw new ApiError(401, "Authentication required");
  }
  return user;
}

export function requireAdmin(user: AuthUser | null): AuthUser {
  const authedUser = requireAuth(user);
  if (authedUser.role !== "ADMIN") {
    throw new ApiError(403, "You do not have permission to perform this action");
  }
  return authedUser;
}

async function signToken(secret: string, payload: TokenPayload) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(await hmacSha256(secret, `${header}.${body}`));
  return `${header}.${body}.${signature}`;
}

async function verifyToken(secret: string, token: string): Promise<TokenPayload> {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) {
    throw new ApiError(401, "Invalid token");
  }

  const expected = await hmacSha256(secret, `${header}.${body}`);
  if (!timingSafeEqual(expected, base64UrlDecode(signature))) {
    throw new ApiError(401, "Invalid token");
  }

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as TokenPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new ApiError(401, "Expired token");
  }

  return payload;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
}

function getToken(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const cookieToken = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (cookieToken) {
    return cookieToken;
  }

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return null;
}
