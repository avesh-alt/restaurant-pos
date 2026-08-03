import type { MenuCategory, MenuItem, Prisma } from "@prisma/client";

import { prisma } from "../../shared/database/index.js";

export class MenuRepository {
  public async findCategoryById(id: string, restaurantId: string): Promise<MenuCategory | null> {
    return prisma.menuCategory.findFirst({
      where: {
        id,
        restaurantId,
      },
    });
  }

  public async listCategories(restaurantId: string): Promise<MenuCategory[]> {
    return prisma.menuCategory.findMany({
      where: {
        restaurantId,
      },
      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          name: "asc",
        },
      ],
    });
  }

  public async createCategory(
    data: Prisma.MenuCategoryUncheckedCreateInput,
  ): Promise<MenuCategory> {
    return prisma.menuCategory.create({
      data,
    });
  }

  public async updateCategory(
    id: string,
    restaurantId: string,
    data: Prisma.MenuCategoryUncheckedUpdateInput,
  ): Promise<MenuCategory> {
    const category = await this.findCategoryById(id, restaurantId);

    if (!category) {
      throw new Error("Menu category not found.");
    }

    return prisma.menuCategory.update({
      where: {
        id,
      },
      data,
    });
  }

  public async deleteCategory(id: string, restaurantId: string): Promise<MenuCategory> {
    const category = await this.findCategoryById(id, restaurantId);

    if (!category) {
      throw new Error("Menu category not found.");
    }

    return prisma.menuCategory.delete({
      where: {
        id,
      },
    });
  }

  public async listItems(restaurantId: string): Promise<MenuItem[]> {
    return prisma.menuItem.findMany({
      where: {
        restaurantId,
      },
      orderBy: [
        {
          name: "asc",
        },
      ],
    });
  }

  public async createItem(data: Prisma.MenuItemUncheckedCreateInput): Promise<MenuItem> {
    return prisma.menuItem.create({
      data,
    });
  }

  public async findItemById(id: string, restaurantId: string): Promise<MenuItem | null> {
    return prisma.menuItem.findFirst({
      where: {
        id,
        restaurantId,
      },
    });
  }

  public async updateItem(
    id: string,
    restaurantId: string,
    data: Prisma.MenuItemUncheckedUpdateInput,
  ): Promise<MenuItem> {
    const item = await this.findItemById(id, restaurantId);

    if (!item) {
      throw new Error("Menu item not found.");
    }

    return prisma.menuItem.update({
      where: {
        id,
      },
      data,
    });
  }

  public async deleteItem(id: string, restaurantId: string): Promise<MenuItem> {
    const item = await this.findItemById(id, restaurantId);

    if (!item) {
      throw new Error("Menu item not found.");
    }

    return prisma.menuItem.delete({
      where: {
        id,
      },
    });
  }
}
