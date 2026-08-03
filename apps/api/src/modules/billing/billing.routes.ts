import { Router, type Router as ExpressRouter } from "express";

import { validateRequest } from "../../shared/middleware/validate-request.middleware.js";
import { createInvoiceSchema, createPaymentSchema } from "./billing.schemas.js";
import {
  createInvoiceController,
  getInvoiceController,
  listInvoicesController,
  recordPaymentController,
} from "./billing.controller.js";

export const billingRouter: ExpressRouter = Router();

billingRouter.get("/invoices", listInvoicesController);
billingRouter.post("/invoices", validateRequest(createInvoiceSchema), createInvoiceController);
billingRouter.get("/invoices/:invoiceId", getInvoiceController);
billingRouter.post("/invoices/:invoiceId/payments", validateRequest(createPaymentSchema), recordPaymentController);
