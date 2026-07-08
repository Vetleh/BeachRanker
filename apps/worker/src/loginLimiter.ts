import { ApiError } from "./http";

type LoginAttempt = {
  count: number;
  resetAt: number;
  lockedUntil: number;
};

const loginAttempts = new Map<string, LoginAttempt>();
const loginWindowMs = 15 * 60 * 1000;
const loginLockMs = 15 * 60 * 1000;
const maxLoginAttempts = 5;

export function loginAttemptKey(request: Request, email: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("cf-connecting-ip") ?? forwardedFor ?? "unknown";
  return `${ip}:${email.toLowerCase()}`;
}

export function assertLoginAllowed(key: string) {
  const attempt = loginAttempts.get(key);
  if (!attempt) {
    return;
  }

  const now = Date.now();
  if (attempt.lockedUntil > now) {
    throw new ApiError(429, "Too many login attempts. Try again later.");
  }

  if (attempt.resetAt <= now) {
    loginAttempts.delete(key);
  }
}

export function recordFailedLogin(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  const next =
    !current || current.resetAt <= now
      ? { count: 1, resetAt: now + loginWindowMs, lockedUntil: 0 }
      : { ...current, count: current.count + 1 };

  if (next.count >= maxLoginAttempts) {
    next.lockedUntil = now + loginLockMs;
  }

  loginAttempts.set(key, next);
}

export function clearLoginAttempts(key: string) {
  loginAttempts.delete(key);
}
