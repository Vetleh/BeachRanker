export const loginRateLimit = {
  windowMs: 15 * 60 * 1000,
  lockMs: 15 * 60 * 1000,
  maxAttempts: 5
} as const;
