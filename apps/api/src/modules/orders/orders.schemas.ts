import { z } from "zod";

export const createOrderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  notes: z.string().min(1).optional().nullable(),
});

export const createOrderSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  tableId: z.string().uuid().optional().nullable(),
  orderNumber: z.string().min(1),
  status: z.enum(["DRAFT", "PLACED", "IN_PREPARATION", "READY", "SERVED", "COMPLETED", "CANCELED"]).optional().default("DRAFT"),
  notes: z.string().min(1).optional().nullable(),
  items: z.array(createOrderItemSchema).min(1),
});

export const appendOrderItemsSchema = z.object({
  items: z.array(createOrderItemSchema).min(1),
});

export const updateOrderSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  tableId: z.string().uuid().optional().nullable(),
  status: z.enum(["DRAFT", "PLACED", "IN_PREPARATION", "READY", "SERVED", "COMPLETED", "CANCELED"]).optional(),
  notes: z.string().min(1).optional().nullable(),
});
