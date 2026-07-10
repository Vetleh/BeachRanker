import { loginRateLimit } from "@beach-ranker/domain/policy";
import type { D1Database } from "./env";
import { ApiError } from "./http";

type LoginAttempt = {
  count: number;
  resetAt: number;
  lockedUntil: number;
};

export function loginAttemptKey(request: Request, email: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("cf-connecting-ip") ?? forwardedFor ?? "unknown";
  return `${ip}:${email.toLowerCase()}`;
}

export async function assertLoginAllowed(db: D1Database, key: string) {
  const now = Date.now();
  await db.prepare("DELETE FROM login_attempts WHERE resetAt <= ? AND lockedUntil <= ?").bind(now, now).run();
  const attempt = await getAttempt(db, key);
  if (!attempt) {
    return;
  }

  if (attempt.lockedUntil > now) {
    throw new ApiError(429, "Too many login attempts. Try again later.");
  }
}

export async function recordFailedLogin(db: D1Database, key: string) {
  const now = Date.now();
  const current = await getAttempt(db, key);
  const next =
    !current || current.resetAt <= now
      ? { count: 1, resetAt: now + loginRateLimit.windowMs, lockedUntil: 0 }
      : { ...current, count: current.count + 1 };

  if (next.count >= loginRateLimit.maxAttempts) {
    next.lockedUntil = now + loginRateLimit.lockMs;
  }

  if (!current || current.resetAt <= now) {
    await db
      .prepare("INSERT INTO login_attempts (key, count, resetAt, lockedUntil) VALUES (?, ?, ?, ?)")
      .bind(key, next.count, next.resetAt, next.lockedUntil)
      .run();
    return;
  }

  await db
    .prepare("UPDATE login_attempts SET count = ?, resetAt = ?, lockedUntil = ? WHERE key = ?")
    .bind(next.count, next.resetAt, next.lockedUntil, key)
    .run();
}

export async function clearLoginAttempts(db: D1Database, key: string) {
  await db.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
}

async function getAttempt(db: D1Database, key: string) {
  return db
    .prepare("SELECT count, resetAt, lockedUntil FROM login_attempts WHERE key = ?")
    .bind(key)
    .first<LoginAttempt>();
}
