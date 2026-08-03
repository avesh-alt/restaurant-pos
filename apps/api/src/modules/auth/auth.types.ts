import type { TenantUserIdentity } from "@restaurant-pos/shared";

export interface AuthenticatedUser extends TenantUserIdentity {}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
