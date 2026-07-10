import { createId } from "./crypto";
import type { D1Database } from "./env";
import { ApiError } from "./http";

const lockId = "global";
const lockTtlMs = 10 * 60 * 1000;
const maxWaitMs = 30 * 1000;
const retryDelayMs = 100;

type LockRow = {
  owner: string;
  expiresAt: number;
};

export async function withRatingWriteLock<T>(db: D1Database, operation: () => Promise<T>) {
  const owner = createId();
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const now = Date.now();
    const current = await db
      .prepare("SELECT owner, expiresAt FROM rating_recalc_lock WHERE id = ?")
      .bind(lockId)
      .first<LockRow>();

    if (current && current.expiresAt > now) {
      await delay(retryDelayMs);
      continue;
    }

    if (current) {
      await db.prepare("DELETE FROM rating_recalc_lock WHERE id = ? AND expiresAt <= ?").bind(lockId, now).run();
    }

    try {
      await db
        .prepare("INSERT INTO rating_recalc_lock (id, owner, acquiredAt, expiresAt) VALUES (?, ?, ?, ?)")
        .bind(lockId, owner, now, now + lockTtlMs)
        .run();
    } catch {
      await delay(retryDelayMs);
      continue;
    }

    const claimed = await db
      .prepare("SELECT owner, expiresAt FROM rating_recalc_lock WHERE id = ?")
      .bind(lockId)
      .first<LockRow>();
    if (claimed?.owner !== owner) {
      await delay(retryDelayMs);
      continue;
    }

    try {
      return await operation();
    } finally {
      await db.prepare("DELETE FROM rating_recalc_lock WHERE id = ? AND owner = ?").bind(lockId, owner).run();
    }
  }

  throw new ApiError(503, "Rating updates are busy. Please try again.");
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
