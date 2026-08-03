import * as SecureStore from "expo-secure-store";

import type { TenantUserIdentity } from "@restaurant-pos/shared";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface StoredSession {
  user: TenantUserIdentity;
  tokens: AuthTokens;
  activeBranchId: string | null;
}

const storageKey = "restaurant-pos.mobile.session";

export async function loadStoredSession(): Promise<StoredSession | null> {
  const rawSession = await SecureStore.getItemAsync(storageKey);

  if (!rawSession) {
    return null;
  }

  const parsed = JSON.parse(rawSession) as Partial<StoredSession>;

  if (!parsed.user || !parsed.tokens) {
    return null;
  }

  return {
    user: parsed.user,
    tokens: parsed.tokens,
    activeBranchId: parsed.activeBranchId ?? parsed.user.branchId ?? null,
  };
}

export async function saveStoredSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(storageKey, JSON.stringify(session));
}

export async function clearStoredSession(): Promise<void> {
  await SecureStore.deleteItemAsync(storageKey);
}
