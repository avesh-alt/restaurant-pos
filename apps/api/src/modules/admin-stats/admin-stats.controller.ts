import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../shared/database/index.js";

export async function adminStatsController(
  _request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const [restaurants, users, orders, activeOrders] = await Promise.all([
      prisma.restaurant.count(),
      prisma.user.count(),
      prisma.order.count(),
      prisma.order.count({
        where: { status: { in: ["PLACED", "IN_PREPARATION", "READY"] } },
      }),
    ]);

    response.status(200).json({ data: { restaurants, users, orders, activeOrders } });
  } catch (error) {
    next(error);
  }
}
