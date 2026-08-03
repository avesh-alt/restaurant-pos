export const tenantHeaders = {
  restaurantId: "x-restaurant-id",
  branchId: "x-branch-id",
} as const;

export type TenantHeaders = typeof tenantHeaders;

export interface TenantContext {
  restaurantId: string;
  branchId?: string;
}

export function normalizeTenantId(value: string | undefined | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function createTenantContext(input: {
  restaurantId: string | null;
  branchId?: string | null;
}): TenantContext | null {
  if (!input.restaurantId) {
    return null;
  }

  const context: TenantContext = {
    restaurantId: input.restaurantId,
  };

  if (input.branchId) {
    context.branchId = input.branchId;
  }

  return context;
}
