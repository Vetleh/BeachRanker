import type { Match, MatchSet, Player, PlayerGender, Ranking, Role, User } from "./types";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export type MatchPayload = {
  playedAt: string;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  sets: MatchSet[];
  isTiebreak: boolean;
};

export const api = {
  login: (email: string, password: string) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: User }>("/api/auth/me"),
  players: () => request<{ players: Player[] }>("/api/players"),
  createPlayer: (name: string, initialRating: number, gender: PlayerGender) =>
    request<{ player: Player }>("/api/players", {
      method: "POST",
      body: JSON.stringify({ name, initialRating, gender })
    }),
  createUser: (payload: {
    email: string;
    displayName: string;
    password: string;
    role: Role;
    playerId?: string;
  }) =>
    request<{ user: User }>("/api/users", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  rankings: () => request<{ rankings: Ranking[] }>("/api/rankings"),
  matches: (playerId?: string) => {
    const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
    return request<{ matches: Match[] }>(`/api/matches${query}`);
  },
  createMatch: (payload: MatchPayload) =>
    request<{ match: Match }>("/api/matches", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateMatch: (id: string, payload: MatchPayload) =>
    request<{ match: Match }>(`/api/matches/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteMatch: (id: string) => request<void>(`/api/matches/${id}`, { method: "DELETE" })
};
