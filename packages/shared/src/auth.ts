export type UserRole =
  | "SUPER_ADMIN"
  | "RESTAURANT_ADMIN"
  | "MANAGER"
  | "CASHIER"
  | "WAITER"
  | "KITCHEN";

export interface TenantUserIdentity {
  id: string;
  restaurantId: string | undefined;
  branchId: string | undefined;
  email: string;
  role: UserRole;
}
