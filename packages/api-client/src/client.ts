import type { CreateUserPayload, Match, MatchPayload, Player, PlayerGender, Ranking, User } from "./types.js";

export type ApiClientOptions = {
  baseUrl?: string;
  credentials?: RequestCredentials;
  authMode?: "cookie" | "bearer";
  getToken?: () => string | null | Promise<string | null>;
  setToken?: (token: string | null) => void | Promise<void>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type LoginResponse = {
  user: User;
  token?: string;
};

export function createBeachRankerApi(options: ApiClientOptions = {}) {
  const fetcher = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10000;

  async function request<T>(path: string, requestOptions: RequestInit = {}): Promise<T> {
    const controller = requestOptions.signal ? null : new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const operation = async () => {
      const token = await options.getToken?.();
      const headers = new Headers(requestOptions.headers);
      headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetcher(`${options.baseUrl ?? ""}${path}`, {
        ...requestOptions,
        credentials: options.credentials,
        headers,
        signal: requestOptions.signal ?? controller?.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Request failed");
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    };

    try {
      if (timeoutMs <= 0) {
        return await operation();
      }

      return await Promise.race([
        operation(),
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => {
            controller?.abort();
            reject(new Error("Request timed out"));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  return {
    login: async (email: string, password: string) => {
      const payload = await request<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, authMode: options.authMode ?? "cookie" }),
      });
      if (payload.token) {
        await options.setToken?.(payload.token);
      }
      return payload;
    },
    logout: async () => {
      try {
        await request<void>("/api/auth/logout", { method: "POST" });
      } finally {
        await options.setToken?.(null);
      }
    },
    me: () => request<{ user: User }>("/api/auth/me"),
    players: () => request<{ players: Player[] }>("/api/players"),
    createPlayer: (name: string, initialRating: number, gender: PlayerGender) =>
      request<{ player: Player }>("/api/players", {
        method: "POST",
        body: JSON.stringify({ name, initialRating, gender }),
      }),
    createUser: (payload: CreateUserPayload) =>
      request<{ user: User }>("/api/users", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    resetPassword: (userId: string, password: string) =>
      request<{ user: User }>(`/api/users/${encodeURIComponent(userId)}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      }),
    rankings: () => request<{ rankings: Ranking[] }>("/api/rankings"),
    matches: (playerId?: string) => {
      const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
      return request<{ matches: Match[] }>(`/api/matches${query}`);
    },
    createMatch: (payload: MatchPayload) =>
      request<{ match: Match }>("/api/matches", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    updateMatch: (id: string, payload: MatchPayload) =>
      request<{ match: Match }>(`/api/matches/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    deleteMatch: (id: string) => request<void>(`/api/matches/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}
