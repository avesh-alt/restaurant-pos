import { z } from "zod";

const ROLES = ["SUPER_ADMIN", "RESTAURANT_ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN"] as const;

export const createUserSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(ROLES),
    restaurantId: z.string().uuid().nullable().optional(),
    branchId: z.string().uuid().nullable().optional(),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(80).optional(),
    lastName: z.string().min(1).max(80).optional(),
    email: z.string().email().optional(),
    role: z.enum(ROLES).optional(),
    restaurantId: z.string().uuid().nullable().optional(),
    branchId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});
