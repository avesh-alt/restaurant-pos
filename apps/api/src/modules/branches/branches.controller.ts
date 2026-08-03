import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error.js";
import { BranchesRepository } from "./branches.repository.js";

const branchesRepository = new BranchesRepository();

function requireRestaurantId(request: Request): string {
  const restaurantId = request.tenantContext?.restaurantId;

  if (!restaurantId) {
    throw new AppError("Missing tenant context.", 400, "TENANT_CONTEXT_REQUIRED");
  }

  return restaurantId;
}

export async function listBranchesController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId = requireRestaurantId(request);
    const branches = await branchesRepository.listBranches(restaurantId);

    response.status(200).json({ data: branches });
  } catch (error) {
    next(error);
  }
}
