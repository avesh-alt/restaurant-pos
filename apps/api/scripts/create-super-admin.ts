import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";
import { config } from "dotenv";

config();
process.env.DATABASE_URL ??= "postgresql://postgres:root@localhost:5432/restaurant_pos?schema=public";

const prisma = new PrismaClient();

const email = "superadmin@pos.local";
const password = "SuperAdmin@123";

const hash = await bcrypt.hash(password, 12);

const user = await prisma.user.upsert({
  where: { email },
  update: {
    passwordHash: hash,
    role: UserRole.SUPER_ADMIN,
    firstName: "Super",
    lastName: "Admin",
    isActive: true,
    restaurantId: null,
    branchId: null,
  },
  create: {
    email,
    passwordHash: hash,
    role: UserRole.SUPER_ADMIN,
    firstName: "Super",
    lastName: "Admin",
  },
});

console.log("✓ Super admin ready");
console.log("  Email   :", user.email);
console.log("  Password: SuperAdmin@123");
console.log("  Role    :", user.role);

await prisma.$disconnect();
