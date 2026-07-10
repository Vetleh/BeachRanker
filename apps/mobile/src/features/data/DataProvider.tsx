import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert } from "react-native";
import type { Match, Player, Ranking } from "@beach-ranker/api-client";
import { useAuthContext } from "../auth/AuthProvider";
import { useLocaleContext } from "../locale/LocaleProvider";
import { mergeMatches } from "./matches";

export type DataState = {
  players: Player[];
  rankings: Ranking[];
  matches: Match[];
  matchesHasMore: boolean;
  loading: boolean;
  loadingMoreMatches: boolean;
  refresh: () => Promise<void>;
  loadMoreMatches: () => Promise<void>;
};

export const DataContext = createContext<DataState | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { api } = useAuthContext();
  const { t } = useLocaleContext();
  const [players, setPlayers] = useState<Player[]>([]);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesHasMore, setMatchesHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMoreMatches, setLoadingMoreMatches] = useState(false);
  const loadingMoreRef = useRef(false);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const [playersResult, rankingsResult, matchesResult] = await Promise.all([
          api.players({ signal }),
          api.rankings({ signal }),
          api.matches(undefined, { limit: 200, offset: 0 }, { signal }),
        ]);

        if (signal?.aborted) {
          return;
        }

        setPlayers(playersResult.players);
        setRankings(rankingsResult.rankings);
        setMatches(matchesResult.matches);
        setMatchesHasMore(matchesResult.hasMore);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [api],
  );

  const loadMoreMatches = useCallback(async () => {
    if (loadingMoreRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMoreMatches(true);
    try {
      const result = await api.matches(undefined, { limit: 200, offset: matches.length });
      setMatches((current) => mergeMatches(current, result.matches));
      setMatchesHasMore(result.hasMore);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMoreMatches(false);
    }
  }, [api, matches.length]);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch((error: Error) => {
      if (!controller.signal.aborted && !isAbortError(error)) {
        setLoading(false);
        Alert.alert(t("requestFailed"), error.message);
      }
    });

    return () => controller.abort();
  }, [refresh, t]);

  return (
    <DataContext.Provider
      value={{ players, rankings, matches, matchesHasMore, loading, loadingMoreMatches, refresh, loadMoreMatches }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useDataContext() {
  const value = useContext(DataContext);
  if (!value) {
    throw new Error("Data context is not available");
  }
  return value;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
