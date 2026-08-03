import { Router, type Router as ExpressRouter } from "express";

import { validateRequest } from "../../shared/middleware/validate-request.middleware.js";
import { createTableSchema, updateTableSchema } from "./tables.schemas.js";
import {
  createTableController,
  deleteTableController,
  listTablesController,
  updateTableController,
} from "./tables.controller.js";

export const tablesRouter: ExpressRouter = Router();

tablesRouter.get("/tables", listTablesController);
tablesRouter.post("/tables", validateRequest(createTableSchema), createTableController);
tablesRouter.patch("/tables/:tableId", validateRequest(updateTableSchema), updateTableController);
tablesRouter.delete("/tables/:tableId", deleteTableController);
