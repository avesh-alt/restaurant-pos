import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config();
process.env.DATABASE_URL ??= "postgresql://postgres:root@localhost:5432/restaurant_pos?schema=public";

const prisma = new PrismaClient();

const counts = await prisma.order.groupBy({ by: ["status"], _count: { id: true } });
console.log("\nOrders by status:");
for (const r of counts) {
  console.log(`  ${r.status.padEnd(16)} ${r._count.id}`);
}

const active = await prisma.order.findMany({
  where: { status: { in: ["DRAFT", "PLACED", "IN_PREPARATION", "READY", "SERVED"] } },
  select: {
    orderNumber: true,
    status: true,
    branchId: true,
    table: { select: { name: true, branchId: true } },
    createdAt: true,
  },
  orderBy: { createdAt: "desc" },
});

console.log(`\nActive orders (${active.length} total):`);
for (const o of active) {
  const table = o.table ? `table="${o.table.name}"` : "no table";
  console.log(`  #${o.orderNumber}  ${o.status.padEnd(16)}  ${table}  branch=${o.branchId?.slice(-8) ?? "null"}`);
}

await prisma.$disconnect();
