import { z } from "zod";

export const createTableSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  capacity: z.coerce.number().int().positive(),
  branchId: z.string().uuid().optional().nullable(),
  status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "OUT_OF_SERVICE"]).optional().default("AVAILABLE"),
  qrCodeValue: z.string().min(1).optional().nullable(),
  sortOrder: z.coerce.number().int().nonnegative().default(0),
  isActive: z.boolean().optional().default(true),
});

export const updateTableSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  capacity: z.coerce.number().int().positive().optional(),
  branchId: z.string().uuid().optional().nullable(),
  status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "OUT_OF_SERVICE"]).optional(),
  qrCodeValue: z.string().min(1).optional().nullable(),
  sortOrder: z.coerce.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});
