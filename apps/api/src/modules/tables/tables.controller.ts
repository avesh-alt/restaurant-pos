import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { emitDashboardChange } from "../../shared/realtime/realtime.js";
import { createTableSchema, updateTableSchema } from "./tables.schemas.js";
import { TablesRepository } from "./tables.repository.js";

const tablesRepository = new TablesRepository();

function requireRestaurantId(request: Request): string {
  const restaurantId = request.tenantContext?.restaurantId;

  if (!restaurantId) {
    throw new AppError("Missing tenant context.", 400, "TENANT_CONTEXT_REQUIRED");
  }

  return restaurantId;
}

function requireTableId(request: Request): string {
  const value = request.params.tableId;

  if (Array.isArray(value) || typeof value !== "string" || value.length === 0) {
    throw new AppError("Invalid request parameter.", 400, "INVALID_REQUEST_PARAMETER");
  }

  return value;
}

export async function listTablesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const tables = await tablesRepository.listTables(restaurantId, request.tenantContext?.branchId);

    response.status(200).json({ data: tables });
  } catch (error) {
    next(error);
  }
}

export async function createTableController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const branchId = request.tenantContext?.branchId ?? null;
    const body = createTableSchema.parse(request.body);
    const table = await tablesRepository.createTable({
      restaurantId,
      branchId: body.branchId ?? branchId,
      name: body.name,
      code: body.code,
      capacity: body.capacity,
      status: body.status,
      qrCodeValue: body.qrCodeValue ?? null,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
    });

    emitDashboardChange({
      restaurantId,
      branchId: table.branchId,
      tableId: table.id,
      reason: "table_updated",
    });

    response.status(201).json({ data: table });
  } catch (error) {
    next(error);
  }
}

export async function updateTableController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const tableId = requireTableId(request);
    const body = updateTableSchema.parse(request.body);
    const existing = await tablesRepository.findTableById(tableId, restaurantId);

    if (!existing) {
      throw new AppError("Table not found.", 404, "TABLE_NOT_FOUND");
    }

    const table = await tablesRepository.updateTable(tableId, restaurantId, {
      ...(body.name ? { name: body.name } : {}),
      ...(body.code ? { code: body.code } : {}),
      ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
      ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.qrCodeValue !== undefined ? { qrCodeValue: body.qrCodeValue } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    });

    emitDashboardChange({
      restaurantId,
      branchId: table.branchId,
      tableId: table.id,
      reason: "table_updated",
    });

    response.status(200).json({ data: table });
  } catch (error) {
    next(error);
  }
}

export async function deleteTableController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const tableId = requireTableId(request);
    const existing = await tablesRepository.findTableById(tableId, restaurantId);

    if (!existing) {
      throw new AppError("Table not found.", 404, "TABLE_NOT_FOUND");
    }

    await tablesRepository.deleteTable(tableId, restaurantId);
    emitDashboardChange({
      restaurantId,
      branchId: existing.branchId,
      tableId: existing.id,
      reason: "table_updated",
    });
    response.status(204).send();
  } catch (error) {
    next(error);
  }
}
