import { Prisma } from "@prisma/client";
import type { Order, OrderItem } from "@prisma/client";

import { prisma } from "../../shared/database/index.js";

export type OrderDetail = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        menuItem: {
          select: {
            id: true;
            name: true;
            type: true;
          };
        };
      };
    };
  };
}>;

export interface CreateOrderInput {
  restaurantId: string;
  branchId?: string | null;
  tableId?: string | null;
  orderNumber: string;
  status: Order["status"];
  notes?: string | null;
  items: Array<{
    menuItemId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    notes?: string | null;
  }>;
  subtotalAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

export interface AppendOrderItemsInput {
  restaurantId: string;
  orderId: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    notes?: string | null;
  }>;
}

export class OrdersRepository {
  public async findOrderById(
    id: string,
    restaurantId: string,
  ): Promise<OrderDetail | null> {
    return prisma.order.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        items: {
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });
  }

  public async findMenuItemsByIds(
    restaurantId: string,
    menuItemIds: string[],
  ): Promise<Array<{ id: string; price: Prisma.Decimal; taxRate: Prisma.Decimal }>> {
    return prisma.menuItem.findMany({
      where: {
        restaurantId,
        id: {
          in: menuItemIds,
        },
      },
      select: {
        id: true,
        price: true,
        taxRate: true,
      },
    });
  }

  public async listOrders(restaurantId: string, branchId?: string | null): Promise<Order[]> {
    return prisma.order.findMany({
      where: {
        restaurantId,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: [
        {
          createdAt: "desc",
        },
      ],
    });
  }

  public async createOrder(input: CreateOrderInput): Promise<Order & { items: OrderItem[] }> {
    return prisma.order.create({
      data: {
        restaurantId: input.restaurantId,
        branchId: input.branchId ?? null,
        tableId: input.tableId ?? null,
        orderNumber: input.orderNumber,
        status: input.status,
        notes: input.notes ?? null,
        subtotalAmount: input.subtotalAmount,
        taxAmount: input.taxAmount,
        discountAmount: input.discountAmount,
        totalAmount: input.totalAmount,
        items: {
          create: input.items,
        },
      },
      include: {
        items: true,
      },
    });
  }

  public async updateOrder(
    id: string,
    restaurantId: string,
    data: Prisma.OrderUncheckedUpdateInput,
  ): Promise<OrderDetail> {
    const existing = await this.findOrderById(id, restaurantId);

    if (!existing) {
      throw new Error("Order not found.");
    }

    return prisma.order.update({
      where: {
        id,
      },
      data,
      include: {
        items: {
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });
  }

  public async appendOrderItems(input: AppendOrderItemsInput): Promise<OrderDetail> {
    const existing = await this.findOrderById(input.orderId, input.restaurantId);

    if (!existing) {
      throw new Error("Order not found.");
    }

    const subtotalAmount = existing.items.reduce(
      (sum, item) => sum.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity)),
      new Prisma.Decimal(0),
    );
    const taxAmount = existing.items.reduce(
      (sum, item) => sum.add(new Prisma.Decimal(item.taxAmount)),
      new Prisma.Decimal(0),
    );
    const discountAmount = new Prisma.Decimal(existing.discountAmount);

    const appendedSubtotal = input.items.reduce(
      (sum, item) => sum.add(item.unitPrice.mul(item.quantity)),
      new Prisma.Decimal(0),
    );
    const appendedTax = input.items.reduce(
      (sum, item) => sum.add(item.taxAmount),
      new Prisma.Decimal(0),
    );
    const totalAmount = subtotalAmount.add(appendedSubtotal).add(taxAmount).add(appendedTax).sub(discountAmount);

    return prisma.$transaction(async (tx) => {
      await tx.orderItem.createMany({
        data: input.items.map((item) => ({
          orderId: input.orderId,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxAmount: item.taxAmount,
          lineTotal: item.lineTotal,
          notes: item.notes ?? null,
        })),
      });

      return tx.order.update({
        where: {
          id: input.orderId,
        },
        data: {
          subtotalAmount: subtotalAmount.add(appendedSubtotal),
          taxAmount: taxAmount.add(appendedTax),
          discountAmount,
          totalAmount,
        },
        include: {
          items: {
            include: {
              menuItem: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
        },
      });
    });
  }
}
