import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_NAME ?? "Beach Admin";

if (!password) {
  throw new Error("ADMIN_PASSWORD must be set before generating the admin seed SQL");
}

const id = randomUUID();
const now = new Date().toISOString();
const passwordHash = await bcrypt.hash(password, 12);

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

console.log(`INSERT INTO users (id, email, displayName, passwordHash, role, active, createdAt, updatedAt)
VALUES (${quote(id)}, ${quote(email)}, ${quote(displayName)}, ${quote(passwordHash)}, 'ADMIN', 1, ${quote(now)}, ${quote(now)})
ON CONFLICT(email) DO UPDATE SET
  displayName = excluded.displayName,
  passwordHash = excluded.passwordHash,
  role = 'ADMIN',
  active = 1,
  updatedAt = excluded.updatedAt;`);
