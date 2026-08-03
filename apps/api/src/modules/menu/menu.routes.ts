import { Router, type Router as ExpressRouter } from "express";

import { validateRequest } from "../../shared/middleware/validate-request.middleware.js";
import {
  createMenuCategorySchema,
  createMenuItemSchema,
  updateMenuCategorySchema,
  updateMenuItemSchema,
} from "./menu.schemas.js";
import {
  deleteCategoryController,
  deleteItemController,
  createCategoryController,
  createItemController,
  listCategoriesController,
  listItemsController,
  updateCategoryController,
  updateItemController,
} from "./menu.controller.js";

export const menuRouter: ExpressRouter = Router();

menuRouter.get("/menu-categories", listCategoriesController);
menuRouter.post("/menu-categories", validateRequest(createMenuCategorySchema), createCategoryController);
menuRouter.patch("/menu-categories/:categoryId", validateRequest(updateMenuCategorySchema), updateCategoryController);
menuRouter.delete("/menu-categories/:categoryId", deleteCategoryController);
menuRouter.get("/menu-items", listItemsController);
menuRouter.post("/menu-items", validateRequest(createMenuItemSchema), createItemController);
menuRouter.patch("/menu-items/:itemId", validateRequest(updateMenuItemSchema), updateItemController);
menuRouter.delete("/menu-items/:itemId", deleteItemController);
