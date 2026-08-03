import type { Prisma, RestaurantTable } from "@prisma/client";

import { prisma } from "../../shared/database/index.js";

export class TablesRepository {
  public async findTableById(id: string, restaurantId: string): Promise<RestaurantTable | null> {
    return prisma.restaurantTable.findFirst({
      where: {
        id,
        restaurantId,
      },
    });
  }

  public async listTables(restaurantId: string, branchId?: string | null): Promise<RestaurantTable[]> {
    return prisma.restaurantTable.findMany({
      where: {
        restaurantId,
        ...(branchId ? { branchId } : {}),
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

  public async createTable(data: Prisma.RestaurantTableUncheckedCreateInput): Promise<RestaurantTable> {
    return prisma.restaurantTable.create({
      data,
    });
  }

  public async updateTable(
    id: string,
    restaurantId: string,
    data: Prisma.RestaurantTableUncheckedUpdateInput,
  ): Promise<RestaurantTable> {
    const table = await this.findTableById(id, restaurantId);

    if (!table) {
      throw new Error("Table not found.");
    }

    return prisma.restaurantTable.update({
      where: {
        id,
      },
      data,
    });
  }

  public async deleteTable(id: string, restaurantId: string): Promise<RestaurantTable> {
    const table = await this.findTableById(id, restaurantId);

    if (!table) {
      throw new Error("Table not found.");
    }

    return prisma.restaurantTable.delete({
      where: {
        id,
      },
    });
  }
}
