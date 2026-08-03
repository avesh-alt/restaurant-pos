import { z } from "zod";

export const createRestaurantSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, or hyphens"),
  }),
});

export const updateRestaurantSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, or hyphens")
      .optional(),
    isActive: z.boolean().optional(),
  }),
});

export const createBranchSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    code: z.string().min(1).max(20),
  }),
});
