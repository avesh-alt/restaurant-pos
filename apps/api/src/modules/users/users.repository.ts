import { type UserRole } from "@prisma/client";
import { prisma } from "../../shared/database/index.js";

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  restaurantId: true,
  branchId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  restaurant: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
} as const;

export class UsersRepository {
  async listAll(restaurantId?: string) {
    return prisma.user.findMany({
      where: restaurantId ? { restaurantId } : {},
      select: USER_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async create(data: {
    firstName: string;
    lastName: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    restaurantId?: string | null;
    branchId?: string | null;
  }) {
    return prisma.user.create({ data, select: USER_SELECT });
  }

  async update(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      role?: UserRole;
      restaurantId?: string | null;
      branchId?: string | null;
      isActive?: boolean;
    },
  ) {
    return prisma.user.update({ where: { id }, data, select: USER_SELECT });
  }
}
