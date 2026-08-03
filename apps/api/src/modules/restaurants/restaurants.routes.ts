import { Router, type Router as ExpressRouter } from "express";
import {
  listRestaurantsController,
  getRestaurantController,
  createRestaurantController,
  updateRestaurantController,
  createBranchController,
} from "./restaurants.controller.js";

export const restaurantsAdminRouter: ExpressRouter = Router();

restaurantsAdminRouter.get("/restaurants", listRestaurantsController);
restaurantsAdminRouter.post("/restaurants", createRestaurantController);
restaurantsAdminRouter.get("/restaurants/:restaurantId", getRestaurantController);
restaurantsAdminRouter.patch("/restaurants/:restaurantId", updateRestaurantController);
restaurantsAdminRouter.post("/restaurants/:restaurantId/branches", createBranchController);
