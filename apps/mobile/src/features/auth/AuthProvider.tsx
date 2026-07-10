import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { createBeachRankerApi, type User } from "@beach-ranker/api-client";

const tokenKey = "beachranker_session";

export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? "";

export type AuthState = {
  user: User | null;
  loading: boolean;
  startupError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  api: ReturnType<typeof createBeachRankerApi>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const api = useMemo(
    () =>
      createBeachRankerApi({
        baseUrl: apiBaseUrl,
        authMode: "bearer",
        getToken: () => SecureStore.getItemAsync(tokenKey),
        setToken: async (token) => {
          if (token) {
            await SecureStore.setItemAsync(tokenKey, token);
          } else {
            await SecureStore.deleteItemAsync(tokenKey);
          }
        },
      }),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    api
      .me({ signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setUser(result.user);
        }
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setUser(null);
          setStartupError(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [api]);

  return {
    user,
    loading,
    startupError,
    api,
    login: async (email, password) => {
      const result = await api.login(email, password);
      setStartupError(null);
      setUser(result.user);
    },
    logout: async () => {
      try {
        await api.logout();
      } finally {
        setUser(null);
      }
    },
  };
}

export function useAuthContext() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("Auth context is not available");
  }
  return value;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
