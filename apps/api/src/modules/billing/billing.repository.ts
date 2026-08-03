import { Prisma } from "@prisma/client";
import type { Invoice, Order, OrderItem, Payment } from "@prisma/client";

import { prisma } from "../../shared/database/index.js";

export type InvoiceDetail = Prisma.InvoiceGetPayload<{
  include: {
    order: {
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
    };
    payments: true;
  };
}>;

export class BillingRepository {
  public async listInvoices(restaurantId: string, orderId?: string | null): Promise<Invoice[]> {
    return prisma.invoice.findMany({
      where: {
        restaurantId,
        ...(orderId ? { orderId } : {}),
      },
      orderBy: [
        {
          issuedAt: "desc",
        },
      ],
    });
  }

  public async findInvoiceById(id: string, restaurantId: string): Promise<InvoiceDetail | null> {
    return prisma.invoice.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        order: {
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
        },
        payments: true,
      },
    });
  }

  public async findInvoiceByOrderId(orderId: string, restaurantId: string): Promise<InvoiceDetail | null> {
    return prisma.invoice.findFirst({
      where: {
        orderId,
        restaurantId,
      },
      include: {
        order: {
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
        },
        payments: true,
      },
    });
  }

  public async createInvoiceFromOrder(
    order: Order & { items: OrderItem[] },
    restaurantId: string,
    branchId?: string | null,
    notes?: string | null,
    discountAmount?: number,
  ): Promise<InvoiceDetail> {
    const existing = await this.findInvoiceByOrderId(order.id, restaurantId);

    if (existing) {
      return existing;
    }

    const discount = discountAmount !== undefined
      ? new Prisma.Decimal(discountAmount)
      : new Prisma.Decimal(order.discountAmount);
    const subtotal = new Prisma.Decimal(order.subtotalAmount);
    const tax = new Prisma.Decimal(order.taxAmount);
    const total = subtotal.plus(tax).minus(discount).lessThan(0)
      ? new Prisma.Decimal(0)
      : subtotal.plus(tax).minus(discount);

    return prisma.invoice.create({
      data: {
        restaurantId,
        branchId: branchId ?? order.branchId ?? null,
        orderId: order.id,
        invoiceNumber: `INV-${order.orderNumber}`,
        status: "OPEN",
        subtotalAmount: subtotal,
        taxAmount: tax,
        discountAmount: discount,
        totalAmount: total,
        paidAmount: 0,
        notes: notes ?? order.notes ?? null,
      },
      include: {
        order: {
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
        },
        payments: true,
      },
    });
  }

  public async syncInvoiceFromOrder(
    order: Order & { items: OrderItem[] },
    restaurantId: string,
    branchId?: string | null,
  ): Promise<InvoiceDetail | null> {
    const invoice = await this.findInvoiceByOrderId(order.id, restaurantId);

    if (!invoice || invoice.status === "VOID") {
      return invoice;
    }

    const paidAmount = new Prisma.Decimal(invoice.paidAmount);
    const totalAmount = new Prisma.Decimal(order.totalAmount);
    const status = paidAmount.greaterThanOrEqualTo(totalAmount) ? "PAID" : "OPEN";

    return prisma.invoice.update({
      where: {
        id: invoice.id,
      },
      data: {
        branchId: branchId ?? order.branchId ?? invoice.branchId ?? null,
        subtotalAmount: order.subtotalAmount,
        taxAmount: order.taxAmount,
        discountAmount: order.discountAmount,
        totalAmount,
        status,
      },
      include: {
        order: {
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
        },
        payments: true,
      },
    });
  }

  public async recordPayment(
    invoiceId: string,
    restaurantId: string,
    input: {
      branchId?: string | null;
      amount: Prisma.Decimal;
      method: Payment["method"];
      reference?: string | null;
      notes?: string | null;
    },
  ): Promise<InvoiceDetail> {
    const invoice = await this.findInvoiceById(invoiceId, restaurantId);

    if (!invoice) {
      throw new Error("Invoice not found.");
    }

    const payment = await prisma.payment.create({
      data: {
        restaurantId,
        branchId: input.branchId ?? invoice.branchId ?? null,
        invoiceId,
        amount: input.amount,
        method: input.method,
        status: "SUCCESS",
        reference: input.reference ?? null,
        notes: input.notes ?? null,
      },
    });

    const paidAmount = new Prisma.Decimal(invoice.paidAmount).add(payment.amount);
    const status = paidAmount.greaterThanOrEqualTo(invoice.totalAmount) ? "PAID" : "OPEN";

    return prisma.invoice.update({
      where: {
        id: invoiceId,
      },
      data: {
        paidAmount,
        status,
      },
      include: {
        order: {
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
        },
        payments: true,
      },
    });
  }
}
