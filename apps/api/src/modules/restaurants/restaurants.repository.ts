import { prisma } from "../../shared/database/index.js";

export class RestaurantsRepository {
  async listAll() {
    return prisma.restaurant.findMany({
      include: {
        _count: { select: { branches: true, users: true, orders: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string) {
    return prisma.restaurant.findUnique({
      where: { id },
      include: {
        branches: { orderBy: { createdAt: "asc" } },
        _count: { select: { users: true, orders: true } },
      },
    });
  }

  async create(data: { name: string; slug: string }) {
    return prisma.restaurant.create({ data });
  }

  async update(id: string, data: { name?: string; slug?: string; isActive?: boolean }) {
    return prisma.restaurant.update({ where: { id }, data });
  }

  async createBranch(restaurantId: string, data: { name: string; code: string }) {
    return prisma.branch.create({ data: { restaurantId, ...data } });
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const found = await prisma.restaurant.findFirst({
      where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    });
    return !!found;
  }

  async exists(id: string): Promise<boolean> {
    const found = await prisma.restaurant.findUnique({ where: { id }, select: { id: true } });
    return !!found;
  }

  async codeTaken(restaurantId: string, code: string): Promise<boolean> {
    const found = await prisma.branch.findFirst({ where: { restaurantId, code } });
    return !!found;
  }
}
