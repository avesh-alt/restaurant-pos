import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { emitDashboardChange } from "../../shared/realtime/realtime.js";
import { toSlug } from "../../shared/utils/slugs.js";
import {
  createMenuCategorySchema,
  createMenuItemSchema,
  updateMenuCategorySchema,
  updateMenuItemSchema,
} from "./menu.schemas.js";
import { MenuRepository } from "./menu.repository.js";

const menuRepository = new MenuRepository();

function requireRestaurantId(request: Request): string {
  const restaurantId = request.tenantContext?.restaurantId;

  if (!restaurantId) {
    throw new AppError("Missing tenant context.", 400, "TENANT_CONTEXT_REQUIRED");
  }

  return restaurantId;
}

function requireParam(request: Request, key: "categoryId" | "itemId"): string {
  const value = request.params[key];

  if (Array.isArray(value)) {
    throw new AppError("Invalid request parameter.", 400, "INVALID_REQUEST_PARAMETER");
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new AppError("Invalid request parameter.", 400, "INVALID_REQUEST_PARAMETER");
  }

  return value;
}

export async function listCategoriesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const categories = await menuRepository.listCategories(restaurantId);

    response.status(200).json({ data: categories });
  } catch (error) {
    next(error);
  }
}

export async function createCategoryController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const body = createMenuCategorySchema.parse(request.body);
    const category = await menuRepository.createCategory({
      restaurantId,
      name: body.name,
      slug: body.slug ? toSlug(body.slug) : toSlug(body.name),
      sortOrder: body.sortOrder,
      isActive: body.isActive,
    });

    emitDashboardChange({
      restaurantId,
      reason: "menu_updated",
    });

    response.status(201).json({ data: category });
  } catch (error) {
    next(error);
  }
}

export async function updateCategoryController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const categoryId = requireParam(request, "categoryId");
    const body = updateMenuCategorySchema.parse(request.body);
    const existing = await menuRepository.findCategoryById(categoryId, restaurantId);

    if (!existing) {
      throw new AppError("Menu category not found.", 404, "MENU_CATEGORY_NOT_FOUND");
    }

    const category = await menuRepository.updateCategory(categoryId, restaurantId, {
      ...(body.name ? { name: body.name } : {}),
      ...(body.slug !== undefined
        ? { slug: body.slug ? toSlug(body.slug) : toSlug(body.name ?? existing.name) }
        : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    });

    emitDashboardChange({
      restaurantId,
      reason: "menu_updated",
    });

    response.status(200).json({ data: category });
  } catch (error) {
    next(error);
  }
}

export async function deleteCategoryController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const categoryId = requireParam(request, "categoryId");
    const existing = await menuRepository.findCategoryById(categoryId, restaurantId);

    if (!existing) {
      throw new AppError("Menu category not found.", 404, "MENU_CATEGORY_NOT_FOUND");
    }

    await menuRepository.deleteCategory(categoryId, restaurantId);
    emitDashboardChange({
      restaurantId,
      reason: "menu_updated",
    });
    response.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function listItemsController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const items = await menuRepository.listItems(restaurantId);

    response.status(200).json({ data: items });
  } catch (error) {
    next(error);
  }
}

export async function createItemController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const body = createMenuItemSchema.parse(request.body);
    const item = await menuRepository.createItem({
      restaurantId,
      menuCategoryId: body.menuCategoryId,
      name: body.name,
      sku: body.sku ?? null,
      description: body.description ?? null,
      type: body.type,
      price: body.price,
      taxRate: body.taxRate,
      isActive: body.isActive,
    });

    emitDashboardChange({
      restaurantId,
      reason: "menu_updated",
    });

    response.status(201).json({ data: item });
  } catch (error) {
    next(error);
  }
}

export async function updateItemController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const itemId = requireParam(request, "itemId");
    const body = updateMenuItemSchema.parse(request.body);
    const existing = await menuRepository.findItemById(itemId, restaurantId);

    if (!existing) {
      throw new AppError("Menu item not found.", 404, "MENU_ITEM_NOT_FOUND");
    }

    const item = await menuRepository.updateItem(itemId, restaurantId, {
      ...(body.menuCategoryId ? { menuCategoryId: body.menuCategoryId } : {}),
      ...(body.name ? { name: body.name } : {}),
      ...(body.sku !== undefined ? { sku: body.sku } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.type ? { type: body.type } : {}),
      ...(body.price !== undefined ? { price: body.price } : {}),
      ...(body.taxRate !== undefined ? { taxRate: body.taxRate } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    });

    emitDashboardChange({
      restaurantId,
      reason: "menu_updated",
    });

    response.status(200).json({ data: item });
  } catch (error) {
    next(error);
  }
}

export async function deleteItemController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const itemId = requireParam(request, "itemId");
    const existing = await menuRepository.findItemById(itemId, restaurantId);

    if (!existing) {
      throw new AppError("Menu item not found.", 404, "MENU_ITEM_NOT_FOUND");
    }

    await menuRepository.deleteItem(itemId, restaurantId);
    emitDashboardChange({
      restaurantId,
      reason: "menu_updated",
    });
    response.status(204).send();
  } catch (error) {
    next(error);
  }
}
