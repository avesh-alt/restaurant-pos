import { tenantHeaders, type TenantUserIdentity } from "@restaurant-pos/shared";

import type { StoredSession } from "./storage";

export interface ApiErrorShape {
  message: string;
  code?: string | undefined;
  status: number;
}

export interface AuthResponse {
  user: TenantUserIdentity;
  tokens: StoredSession["tokens"];
}

export interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  restaurantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  id: string;
  menuCategoryId: string;
  name: string;
  sku: string | null;
  description: string | null;
  type: "FOOD" | "BEVERAGE" | "ADDON";
  price: string;
  taxRate: string;
  isActive: boolean;
  restaurantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantTable {
  id: string;
  name: string;
  code: string;
  capacity: number;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "OUT_OF_SERVICE";
  branchId: string | null;
  restaurantId: string;
  qrCodeValue: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: "DRAFT" | "PLACED" | "IN_PREPARATION" | "READY" | "SERVED" | "COMPLETED" | "CANCELED";
  tableId: string | null;
  branchId: string | null;
  notes: string | null;
  subtotalAmount: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  restaurantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetailItem {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: string;
  taxAmount: string;
  lineTotal: string;
  notes: string | null;
  menuItem: {
    id: string;
    name: string;
    type: "FOOD" | "BEVERAGE" | "ADDON";
  };
}

export interface OrderDetail extends OrderSummary {
  notes: string | null;
  subtotalAmount: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  items: OrderDetailItem[];
}

export interface DashboardData {
  branches: Branch[];
  menuCategories: MenuCategory[];
  menuItems: MenuItem[];
  tables: RestaurantTable[];
  orders: OrderSummary[];
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  restaurantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderInput {
  branchId?: string | null;
  tableId?: string | null;
  orderNumber: string;
  status?: "DRAFT" | "PLACED" | "IN_PREPARATION" | "READY" | "SERVED" | "COMPLETED" | "CANCELED";
  notes?: string | null;
  items: Array<{
    menuItemId: string;
    quantity: number;
    notes?: string | null;
  }>;
}

export interface AppendOrderItemsInput {
  items: Array<{
    menuItemId: string;
    quantity: number;
    notes?: string | null;
  }>;
}

interface RequestOptions extends RequestInit {
  skipAuthRetry?: boolean;
}

export class ApiClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly sessionStore: {
      getSession: () => StoredSession | null;
      onSessionChange: (session: StoredSession | null) => Promise<void>;
    },
  ) {}

  public async login(input: { email: string; password: string }): Promise<StoredSession> {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(input),
    });

    return this.parseAuthResponse(response);
  }

  public async refresh(refreshToken: string): Promise<StoredSession> {
    const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ refreshToken }),
    });

    return this.parseAuthResponse(response);
  }

  public async getDashboardData(): Promise<DashboardData> {
    const [branches, menuCategories, menuItems, tables, orders] = await Promise.all([
      this.getList<Branch>("/api/v1/branches"),
      this.getList<MenuCategory>("/api/v1/menu-categories"),
      this.getList<MenuItem>("/api/v1/menu-items"),
      this.getList<RestaurantTable>("/api/v1/tables"),
      this.getList<OrderSummary>("/api/v1/orders"),
    ]);

    return {
      branches,
      menuCategories,
      menuItems,
      tables,
      orders,
    };
  }

  public async createOrder(input: CreateOrderInput): Promise<unknown> {
    return this.request("/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({
        branchId: input.branchId ?? null,
        tableId: input.tableId ?? null,
        orderNumber: input.orderNumber,
        status: input.status ?? "DRAFT",
        notes: input.notes ?? null,
        items: input.items,
      }),
    });
  }

  public async appendOrderItems(orderId: string, input: AppendOrderItemsInput): Promise<unknown> {
    return this.request(`/api/v1/orders/${orderId}/items`, {
      method: "POST",
      body: JSON.stringify({
        items: input.items,
      }),
    });
  }

  public async updateOrder(
    orderId: string,
    input: Partial<Pick<CreateOrderInput, "branchId" | "tableId" | "notes">> & {
      status?: OrderSummary["status"];
    },
  ): Promise<unknown> {
    return this.request(`/api/v1/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({
        branchId: input.branchId ?? undefined,
        tableId: input.tableId ?? undefined,
        status: input.status,
        notes: input.notes,
      }),
    });
  }

  public async getOrder(orderId: string): Promise<OrderDetail> {
    const response = await this.request<{ data: OrderDetail }>(`/api/v1/orders/${orderId}`);
    return response.data;
  }

  private async getList<T>(path: string): Promise<T[]> {
    const response = await this.request<{ data: T[] }>(path);
    return response.data;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const session = this.sessionStore.getSession();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: this.buildHeaders(session, options.headers),
    });

    if (response.status === 401 && !options.skipAuthRetry && session?.tokens.refreshToken) {
      const refreshed = await this.refresh(session.tokens.refreshToken);
      await this.sessionStore.onSessionChange(refreshed);

      return this.request<T>(path, { ...options, skipAuthRetry: true });
    }

    if (!response.ok) {
      throw await this.buildApiError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = (await response.json()) as T;

    return payload;
  }

  private buildHeaders(session?: StoredSession | null, extraHeaders?: HeadersInit): Headers {
    const headers = new Headers(extraHeaders);

    headers.set("content-type", "application/json");
    headers.set("accept", "application/json");

    if (session) {
      headers.set("authorization", `Bearer ${session.tokens.accessToken}`);

      if (session.user.restaurantId) {
        headers.set(tenantHeaders.restaurantId, session.user.restaurantId);
      }

      if (session.activeBranchId) {
        headers.set(tenantHeaders.branchId, session.activeBranchId);
      }
    }

    return headers;
  }

  private async parseAuthResponse(response: Response): Promise<StoredSession> {
    if (!response.ok) {
      throw await this.buildApiError(response);
    }

    const payload = (await response.json()) as AuthResponse;
    const session: StoredSession = {
      user: payload.user,
      tokens: payload.tokens,
      activeBranchId: payload.user.branchId ?? null,
    };

    await this.sessionStore.onSessionChange(session);
    return session;
  }

  private async buildApiError(response: Response): Promise<ApiErrorShape> {
    const fallbackMessage = `Request failed with status ${response.status}.`;

    try {
      const payload = (await response.json()) as { message?: string; code?: string };

      const error: ApiErrorShape = {
        message: payload.message ?? fallbackMessage,
        status: response.status,
      };

      if (payload.code) {
        error.code = payload.code;
      }

      return error;
    } catch {
      return {
        message: fallbackMessage,
        status: response.status,
      };
    }
  }
}
