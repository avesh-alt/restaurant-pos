import type { Branch } from "@prisma/client";

import { prisma } from "../../shared/database/index.js";

export class BranchesRepository {
  public async listBranches(restaurantId: string): Promise<Branch[]> {
    return prisma.branch.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      orderBy: [
        {
          name: "asc",
        },
        {
          code: "asc",
        },
      ],
    });
  }
}
