import { createBeachRankerApi, type CreateUserPayload, type MatchPayload } from "@beach-ranker/api-client";
import type { Player, PlayerGender, Role, User } from "./types";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "";

const client = createBeachRankerApi({ baseUrl: apiBaseUrl, credentials: "include" });

export type { MatchPayload };

export const api: {
  login: (email: string, password: string) => Promise<{ user: User }>;
  logout: () => Promise<void>;
  me: () => Promise<{ user: User }>;
  players: () => Promise<{ players: Player[] }>;
  createPlayer: (name: string, initialRating: number, gender: PlayerGender) => Promise<{ player: Player }>;
  createUser: (payload: CreateUserPayload & { role: Role }) => Promise<{ user: User }>;
  rankings: typeof client.rankings;
  matches: typeof client.matches;
  createMatch: typeof client.createMatch;
  updateMatch: typeof client.updateMatch;
  deleteMatch: typeof client.deleteMatch;
} = client;
