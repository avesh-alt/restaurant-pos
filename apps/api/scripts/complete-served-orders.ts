/**
 * One-time cleanup: mark all SERVED orders as COMPLETED and release their tables.
 * Run only during testing — in production, always bill via the web POS cashier flow.
 *
 *   cd apps/api && npx tsx scripts/complete-served-orders.ts
 */
import { OrderStatus, PrismaClient, TableStatus } from "@prisma/client";
import { config } from "dotenv";

config();
process.env.DATABASE_URL ??= "postgresql://postgres:root@localhost:5432/restaurant_pos?schema=public";

const prisma = new PrismaClient();

const served = await prisma.order.findMany({
  where: { status: OrderStatus.SERVED },
  select: { id: true, orderNumber: true, tableId: true, restaurantId: true },
});

if (served.length === 0) {
  console.log("No SERVED orders found.");
} else {
  console.log(`Completing ${served.length} SERVED order(s)…\n`);

  for (const order of served) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.COMPLETED },
    });

    if (order.tableId) {
      // Check if any OTHER active orders remain for this table
      const remaining = await prisma.order.count({
        where: {
          tableId: order.tableId,
          restaurantId: order.restaurantId,
          status: { in: [OrderStatus.DRAFT, OrderStatus.PLACED, OrderStatus.IN_PREPARATION, OrderStatus.READY, OrderStatus.SERVED] },
        },
      });
      await prisma.restaurantTable.updateMany({
        where: { id: order.tableId, restaurantId: order.restaurantId },
        data: { status: remaining > 0 ? TableStatus.OCCUPIED : TableStatus.AVAILABLE },
      });
    }

    console.log(`  ✓ #${order.orderNumber}  SERVED → COMPLETED  (table released)`);
  }

  console.log("\nDone. All tables are now AVAILABLE.");
}

await prisma.$disconnect();
