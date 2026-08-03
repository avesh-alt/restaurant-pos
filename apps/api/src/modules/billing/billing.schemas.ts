import { z } from "zod";

export const createInvoiceSchema = z.object({
  orderId: z.string().uuid(),
  notes: z.string().min(1).optional().nullable(),
  discountAmount: z.coerce.number().min(0).optional(),
});

export const createPaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(["CASH", "CARD", "UPI", "OTHER"]),
  reference: z.string().min(1).optional().nullable(),
  notes: z.string().min(1).optional().nullable(),
});
