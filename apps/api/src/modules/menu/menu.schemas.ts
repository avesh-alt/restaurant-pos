import { z } from "zod";

export const createMenuCategorySchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional(),
  sortOrder: z.coerce.number().int().nonnegative().default(0),
  isActive: z.boolean().optional().default(true),
});

export const updateMenuCategorySchema = z.object({
  name: z.string().min(2).optional(),
  slug: z.string().min(2).optional().nullable(),
  sortOrder: z.coerce.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export const createMenuItemSchema = z.object({
  menuCategoryId: z.string().uuid(),
  name: z.string().min(2),
  sku: z.string().min(1).optional().nullable(),
  description: z.string().min(1).optional().nullable(),
  type: z.enum(["FOOD", "BEVERAGE", "ADDON"]),
  price: z.coerce.number().positive(),
  taxRate: z.coerce.number().min(0).default(0),
  isActive: z.boolean().optional().default(true),
});

export const updateMenuItemSchema = z.object({
  menuCategoryId: z.string().uuid().optional(),
  name: z.string().min(2).optional(),
  sku: z.string().min(1).optional().nullable(),
  description: z.string().min(1).optional().nullable(),
  type: z.enum(["FOOD", "BEVERAGE", "ADDON"]).optional(),
  price: z.coerce.number().positive().optional(),
  taxRate: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional(),
});
