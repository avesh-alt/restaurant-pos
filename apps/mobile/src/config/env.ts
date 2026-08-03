import Constants from "expo-constants";

function getExpoHostApiBaseUrl(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.hostUri ?? null;

  if (!hostUri) {
    return null;
  }

  const hostname = hostUri.split(":")[0];

  if (!hostname) {
    return null;
  }

  return `http://${hostname}:4000`;
}

const rawApiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  getExpoHostApiBaseUrl() ??
  "http://127.0.0.1:4000";

export const apiBaseUrl = rawApiBaseUrl.replace(/\/$/, "");
