import type { NextFunction, Request, Response } from "express";
import { OrderStatus, Prisma, TableStatus } from "@prisma/client";

import { AppError } from "../../shared/errors/app-error.js";
import { prisma } from "../../shared/database/index.js";
import { emitDashboardChange } from "../../shared/realtime/realtime.js";
import { BillingRepository } from "../billing/billing.repository.js";
import { appendOrderItemsSchema, createOrderSchema, updateOrderSchema } from "./orders.schemas.js";
import { OrdersRepository } from "./orders.repository.js";

const ACTIVE_ORDER_STATUSES = [
  OrderStatus.DRAFT,
  OrderStatus.PLACED,
  OrderStatus.IN_PREPARATION,
  OrderStatus.READY,
  OrderStatus.SERVED,
];

async function syncTableOccupancy(tableId: string | null | undefined, restaurantId: string): Promise<void> {
  if (!tableId) return;
  const activeCount = await prisma.order.count({
    where: { tableId, restaurantId, status: { in: ACTIVE_ORDER_STATUSES } },
  });
  await prisma.restaurantTable.updateMany({
    where: { id: tableId, restaurantId },
    data: { status: activeCount > 0 ? TableStatus.OCCUPIED : TableStatus.AVAILABLE },
  });
}

const ordersRepository = new OrdersRepository();
const billingRepository = new BillingRepository();

function requireRestaurantId(request: Request): string {
  const restaurantId = request.tenantContext?.restaurantId;

  if (!restaurantId) {
    throw new AppError("Missing tenant context.", 400, "TENANT_CONTEXT_REQUIRED");
  }

  return restaurantId;
}

function requireOrderId(request: Request): string {
  const value = request.params.orderId;

  if (Array.isArray(value) || typeof value !== "string" || value.length === 0) {
    throw new AppError("Invalid request parameter.", 400, "INVALID_REQUEST_PARAMETER");
  }

  return value;
}

export async function listOrdersController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const orders = await ordersRepository.listOrders(restaurantId, request.tenantContext?.branchId);

    response.status(200).json({ data: orders });
  } catch (error) {
    next(error);
  }
}

export async function createOrderController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const branchId = request.tenantContext?.branchId ?? null;
    const body = createOrderSchema.parse(request.body);

    const itemIds = body.items.map((item) => item.menuItemId);
    const uniqueItemIds = [...new Set(itemIds)];
    const menuItems = await ordersRepository.findMenuItemsByIds(restaurantId, uniqueItemIds);

    if (menuItems.length !== uniqueItemIds.length) {
      throw new AppError("One or more menu items were not found.", 400, "MENU_ITEM_NOT_FOUND");
    }

    const pricedItems = body.items.map((item) => {
      const menuItem = menuItems.find((current) => current.id === item.menuItemId);

      if (!menuItem) {
        throw new AppError("One or more menu items were not found.", 400, "MENU_ITEM_NOT_FOUND");
      }

      const unitPrice = new Prisma.Decimal(menuItem.price);
      const lineSubtotal = unitPrice.mul(item.quantity);
      const taxAmount = lineSubtotal.mul(menuItem.taxRate).div(100);

      return {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice,
        taxAmount,
        lineTotal: lineSubtotal.add(taxAmount),
        notes: item.notes ?? null,
      };
    });

    const subtotalAmount = pricedItems.reduce(
      (sum, item) => sum.add(item.unitPrice.mul(item.quantity)),
      new Prisma.Decimal(0),
    );
    const taxAmount = pricedItems.reduce((sum, item) => sum.add(item.taxAmount), new Prisma.Decimal(0));
    const discountAmount = new Prisma.Decimal(0);
    const totalAmount = subtotalAmount.add(taxAmount).sub(discountAmount);

    const created = await ordersRepository.createOrder({
      restaurantId,
      branchId: body.branchId ?? branchId,
      tableId: body.tableId ?? null,
      orderNumber: body.orderNumber,
      status: body.status,
      notes: body.notes ?? null,
      items: pricedItems,
      subtotalAmount,
      taxAmount,
      discountAmount,
      totalAmount,
    });

    await syncTableOccupancy(created.tableId, restaurantId);

    emitDashboardChange({
      restaurantId,
      branchId: created.branchId,
      orderId: created.id,
      reason: "order_created",
    });

    response.status(201).json({
      data: created,
      meta: { itemCount: body.items.length, quantityTotal: body.items.reduce((sum, item) => sum + item.quantity, 0) },
    });
  } catch (error) {
    next(error);
  }
}

export async function appendOrderItemsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const branchId = request.tenantContext?.branchId ?? null;
    const orderId = requireOrderId(request);
    const body = appendOrderItemsSchema.parse(request.body);
    const existing = await ordersRepository.findOrderById(orderId, restaurantId);

    if (!existing) {
      throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
    }

    if (!["DRAFT", "PLACED", "IN_PREPARATION", "READY", "SERVED"].includes(existing.status)) {
      throw new AppError("This order can no longer be edited.", 400, "ORDER_NOT_EDITABLE");
    }

    const itemIds = body.items.map((item) => item.menuItemId);
    const uniqueItemIds = [...new Set(itemIds)];
    const menuItems = await ordersRepository.findMenuItemsByIds(restaurantId, uniqueItemIds);

    if (menuItems.length !== uniqueItemIds.length) {
      throw new AppError("One or more menu items were not found.", 400, "MENU_ITEM_NOT_FOUND");
    }

    const pricedItems = body.items.map((item) => {
      const menuItem = menuItems.find((current) => current.id === item.menuItemId);

      if (!menuItem) {
        throw new AppError("One or more menu items were not found.", 400, "MENU_ITEM_NOT_FOUND");
      }

      const unitPrice = new Prisma.Decimal(menuItem.price);
      const lineSubtotal = unitPrice.mul(item.quantity);
      const taxAmount = lineSubtotal.mul(menuItem.taxRate).div(100);

      return {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice,
        taxAmount,
        lineTotal: lineSubtotal.add(taxAmount),
        notes: item.notes ?? null,
      };
    });

    const updated = await ordersRepository.appendOrderItems({
      restaurantId,
      orderId,
      items: pricedItems,
    });
    const invoice = await billingRepository.syncInvoiceFromOrder(updated, restaurantId, branchId);

    emitDashboardChange({
      restaurantId,
      branchId: updated.branchId ?? branchId,
      orderId: updated.id,
      reason: "order_items_appended",
    });

    response.status(200).json({
      data: updated,
      meta: {
        itemCount: updated.items.length,
        invoiceId: invoice?.id ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getOrderController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const orderId = requireOrderId(request);
    const order = await ordersRepository.findOrderById(orderId, restaurantId);

    if (!order) {
      throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
    }

    response.status(200).json({ data: order });
  } catch (error) {
    next(error);
  }
}

export async function updateOrderController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const orderId = requireOrderId(request);
    const body = updateOrderSchema.parse(request.body);
    const existing = await ordersRepository.findOrderById(orderId, restaurantId);

    if (!existing) {
      throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
    }

    const updated = await ordersRepository.updateOrder(orderId, restaurantId, {
      ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
      ...(body.tableId !== undefined ? { tableId: body.tableId } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    });

    // If the table assignment changed, release the old table too
    if (body.tableId !== undefined && existing.tableId && existing.tableId !== body.tableId) {
      await syncTableOccupancy(existing.tableId, restaurantId);
    }
    await syncTableOccupancy(updated.tableId, restaurantId);

    emitDashboardChange({
      restaurantId,
      branchId: updated.branchId ?? null,
      orderId: updated.id,
      reason: "order_updated",
    });

    response.status(200).json({ data: updated });
  } catch (error) {
    next(error);
  }
}
