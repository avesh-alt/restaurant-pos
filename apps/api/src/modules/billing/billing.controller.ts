import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";

import { AppError } from "../../shared/errors/app-error.js";
import { BillingRepository } from "./billing.repository.js";
import { createInvoiceSchema, createPaymentSchema } from "./billing.schemas.js";
import { OrdersRepository } from "../orders/orders.repository.js";

const billingRepository = new BillingRepository();
const ordersRepository = new OrdersRepository();

function requireRestaurantId(request: Request): string {
  const restaurantId = request.tenantContext?.restaurantId;

  if (!restaurantId) {
    throw new AppError("Missing tenant context.", 400, "TENANT_CONTEXT_REQUIRED");
  }

  return restaurantId;
}

function requireParam(request: Request, key: "invoiceId"): string {
  const value = request.params[key];

  if (Array.isArray(value) || typeof value !== "string" || value.length === 0) {
    throw new AppError("Invalid request parameter.", 400, "INVALID_REQUEST_PARAMETER");
  }

  return value;
}

export async function listInvoicesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const orderId = typeof request.query.orderId === "string" ? request.query.orderId : undefined;
    const invoices = await billingRepository.listInvoices(restaurantId, orderId ?? null);

    response.status(200).json({ data: invoices });
  } catch (error) {
    next(error);
  }
}

export async function getInvoiceController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const invoiceId = requireParam(request, "invoiceId");
    const invoice = await billingRepository.findInvoiceById(invoiceId, restaurantId);

    if (!invoice) {
      throw new AppError("Invoice not found.", 404, "INVOICE_NOT_FOUND");
    }

    response.status(200).json({ data: invoice });
  } catch (error) {
    next(error);
  }
}

export async function createInvoiceController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const branchId = request.tenantContext?.branchId ?? null;
    const body = createInvoiceSchema.parse(request.body);
    const order = await ordersRepository.findOrderById(body.orderId, restaurantId);

    if (!order) {
      throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
    }

    const invoice = await billingRepository.createInvoiceFromOrder(order, restaurantId, branchId, body.notes, body.discountAmount);

    response.status(201).json({ data: invoice });
  } catch (error) {
    next(error);
  }
}

export async function recordPaymentController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const branchId = request.tenantContext?.branchId ?? null;
    const invoiceId = requireParam(request, "invoiceId");
    const body = createPaymentSchema.parse(request.body);
    const invoice = await billingRepository.recordPayment(invoiceId, restaurantId, {
      branchId,
      amount: new Prisma.Decimal(body.amount),
      method: body.method,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
    });

    response.status(201).json({ data: invoice });
  } catch (error) {
    next(error);
  }
}
