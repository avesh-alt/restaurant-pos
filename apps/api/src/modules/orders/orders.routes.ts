import { Router, type Router as ExpressRouter } from "express";

import { validateRequest } from "../../shared/middleware/validate-request.middleware.js";
import { appendOrderItemsSchema, createOrderSchema, updateOrderSchema } from "./orders.schemas.js";
import {
  appendOrderItemsController,
  createOrderController,
  getOrderController,
  listOrdersController,
  updateOrderController,
} from "./orders.controller.js";

export const ordersRouter: ExpressRouter = Router();

ordersRouter.get("/orders", listOrdersController);
ordersRouter.post("/orders", validateRequest(createOrderSchema), createOrderController);
ordersRouter.post("/orders/:orderId/items", validateRequest(appendOrderItemsSchema), appendOrderItemsController);
ordersRouter.get("/orders/:orderId", getOrderController);
ordersRouter.patch("/orders/:orderId", validateRequest(updateOrderSchema), updateOrderController);
