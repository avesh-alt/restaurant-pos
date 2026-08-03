import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { AppError } from "../../shared/errors/app-error.js";
import { UsersRepository } from "./users.repository.js";
import { createUserSchema, updateUserSchema } from "./users.schemas.js";

const repo = new UsersRepository();

export async function listUsersController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restaurantId =
      typeof request.query.restaurantId === "string" ? request.query.restaurantId : undefined;
    const users = await repo.listAll(restaurantId);
    response.status(200).json({ data: users });
  } catch (error) {
    next(error);
  }
}

export async function createUserController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { body } = createUserSchema.parse({ body: request.body });
    const existing = await repo.findByEmail(body.email);
    if (existing) throw new AppError("Email is already in use.", 409, "EMAIL_CONFLICT");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await repo.create({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      passwordHash,
      role: body.role,
      restaurantId: body.restaurantId ?? null,
      branchId: body.branchId ?? null,
    });
    response.status(201).json({ data: user });
  } catch (error) {
    next(error);
  }
}

export async function updateUserController(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = request.params.userId;
    if (typeof userId !== "string" || userId.length === 0) {
      throw new AppError("Invalid user ID.", 400, "INVALID_REQUEST_PARAMETER");
    }
    const { body } = updateUserSchema.parse({ body: request.body });
    if (body.email !== undefined) {
      const existing = await repo.findByEmail(body.email);
      if (existing && existing.id !== userId) {
        throw new AppError("Email is already in use.", 409, "EMAIL_CONFLICT");
      }
    }
    type UserPatch = Parameters<typeof repo.update>[1];
    const patch: UserPatch = {};
    if (body.firstName !== undefined) patch.firstName = body.firstName;
    if (body.lastName !== undefined) patch.lastName = body.lastName;
    if (body.email !== undefined) patch.email = body.email;
    if (body.role !== undefined) patch.role = body.role;
    if (body.restaurantId !== undefined) patch.restaurantId = body.restaurantId;
    if (body.branchId !== undefined) patch.branchId = body.branchId;
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    const user = await repo.update(userId, patch);
    response.status(200).json({ data: user });
  } catch (error) {
    next(error);
  }
}
