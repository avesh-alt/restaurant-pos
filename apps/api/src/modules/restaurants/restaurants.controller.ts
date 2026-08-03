import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { RestaurantsRepository } from "./restaurants.repository.js";
import { createRestaurantSchema, updateRestaurantSchema, createBranchSchema } from "./restaurants.schemas.js";

const repo = new RestaurantsRepository();

function requireParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError("Invalid request parameter.", 400, "INVALID_REQUEST_PARAMETER");
  }
  return value;
}

export async function listRestaurantsController(
  _request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurants = await repo.listAll();
    response.status(200).json({ data: restaurants });
  } catch (error) {
    next(error);
  }
}

export async function getRestaurantController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurant = await repo.findById(requireParam(request, "restaurantId"));
    if (!restaurant) throw new AppError("Restaurant not found.", 404, "NOT_FOUND");
    response.status(200).json({ data: restaurant });
  } catch (error) {
    next(error);
  }
}

export async function createRestaurantController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { body } = createRestaurantSchema.parse({ body: request.body });
    if (await repo.slugExists(body.slug)) {
      throw new AppError("Slug is already taken.", 409, "SLUG_CONFLICT");
    }
    const restaurant = await repo.create(body);
    response.status(201).json({ data: restaurant });
  } catch (error) {
    next(error);
  }
}

export async function updateRestaurantController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = requireParam(request, "restaurantId");
    const { body } = updateRestaurantSchema.parse({ body: request.body });
    if (body.slug && (await repo.slugExists(body.slug, id))) {
      throw new AppError("Slug is already taken.", 409, "SLUG_CONFLICT");
    }
    const patch: { name?: string; slug?: string; isActive?: boolean } = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.slug !== undefined) patch.slug = body.slug;
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    const restaurant = await repo.update(id, patch);
    response.status(200).json({ data: restaurant });
  } catch (error) {
    next(error);
  }
}

export async function createBranchController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { body } = createBranchSchema.parse({ body: request.body });
    const restaurantId = requireParam(request, "restaurantId");
    if (!(await repo.exists(restaurantId))) {
      throw new AppError("Restaurant not found.", 404, "NOT_FOUND");
    }
    if (await repo.codeTaken(restaurantId, body.code)) {
      throw new AppError("Branch code is already taken.", 409, "CODE_CONFLICT");
    }
    const branch = await repo.createBranch(restaurantId, body);
    response.status(201).json({ data: branch });
  } catch (error) {
    next(error);
  }
}
