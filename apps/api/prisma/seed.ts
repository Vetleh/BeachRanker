import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/auth.js";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "change-me";
  const displayName = process.env.ADMIN_NAME ?? "Beach Admin";

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      displayName,
      passwordHash: await hashPassword(password),
      role: Role.ADMIN
    }
  });

  console.log(`Seeded admin user: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
