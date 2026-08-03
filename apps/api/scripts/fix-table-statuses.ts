import { OrderStatus, PrismaClient, TableStatus } from "@prisma/client";
import { config } from "dotenv";

config();
process.env.DATABASE_URL ??= "postgresql://postgres:root@localhost:5432/restaurant_pos?schema=public";

const prisma = new PrismaClient();

const ACTIVE_STATUSES = [
  OrderStatus.DRAFT,
  OrderStatus.PLACED,
  OrderStatus.IN_PREPARATION,
  OrderStatus.READY,
  OrderStatus.SERVED,
];

const tables = await prisma.restaurantTable.findMany({
  select: { id: true, restaurantId: true, name: true, status: true },
});

console.log(`Scanning ${tables.length} tables…\n`);

let fixed = 0;
for (const table of tables) {
  // Skip manually-managed statuses
  if (table.status === TableStatus.RESERVED || table.status === TableStatus.OUT_OF_SERVICE) {
    continue;
  }

  const activeCount = await prisma.order.count({
    where: {
      tableId: table.id,
      restaurantId: table.restaurantId,
      status: { in: ACTIVE_STATUSES },
    },
  });

  const correct = activeCount > 0 ? TableStatus.OCCUPIED : TableStatus.AVAILABLE;

  if (table.status !== correct) {
    await prisma.restaurantTable.update({
      where: { id: table.id },
      data: { status: correct },
    });
    console.log(`  ✓ "${table.name}"  ${table.status} → ${correct}`);
    fixed++;
  }
}

if (fixed === 0) {
  console.log("  All tables already have correct status.");
} else {
  console.log(`\n✓ Fixed ${fixed} table${fixed !== 1 ? "s" : ""}.`);
}

await prisma.$disconnect();
