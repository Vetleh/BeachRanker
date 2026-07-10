import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Match, Player, PlayerInsights, Ranking, User } from "./types";

export function useAppData(onError: (message: string) => void) {
  const [user, setUser] = useState<User | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesHasMore, setMatchesHasMore] = useState(false);
  const [loadingMoreMatches, setLoadingMoreMatches] = useState(false);
  const [profileMatches, setProfileMatches] = useState<Match[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileInsights, setProfileInsights] = useState<PlayerInsights | null>(null);
  const [profileInsightsLoading, setProfileInsightsLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadingMoreRef = useRef(false);

  const refreshData = useCallback(async (signal?: AbortSignal) => {
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
  }, []);

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
  }, [matches.length]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .me({ signal: controller.signal })
      .then(async ({ user: nextUser }) => {
        if (controller.signal.aborted) {
          return;
        }
        setUser(nextUser);
        await refreshData(controller.signal);
      })
      .catch((err: Error) => {
        if (controller.signal.aborted || isAbortError(err)) {
          return;
        }

        if (err.message === "Authentication required" || err.message === "Invalid token") {
          setUser(null);
          return;
        }

        // A data request can fail after authentication succeeds. Keep the
        // session intact so a transient API/database error does not log out
        // the user.
        onError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [onError, refreshData]);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setPlayers([]);
    setRankings([]);
    setMatches([]);
    setMatchesHasMore(false);
    setLoadingMoreMatches(false);
    setProfileMatches([]);
    setProfileInsights(null);
  }, []);

  const loadProfileMatches = useCallback(
    (playerId: string, fallbackMessage: string) => {
      const controller = new AbortController();
      setProfileMatches([]);
      setProfileLoading(true);

      api
        .matches(playerId, undefined, { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) {
            setProfileMatches(result.matches);
          }
        })
        .catch((err: Error) => {
          if (!controller.signal.aborted && !isAbortError(err)) {
            onError(err instanceof Error ? err.message : fallbackMessage);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setProfileLoading(false);
          }
        });

      return () => {
        controller.abort();
      };
    },
    [onError],
  );

  const loadProfileInsights = useCallback(
    (playerId: string, fallbackMessage: string) => {
      const controller = new AbortController();
      setProfileInsights(null);
      setProfileInsightsLoading(true);

      api
        .playerInsights(playerId, { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) {
            setProfileInsights(result.insights);
          }
        })
        .catch((err: Error) => {
          if (!controller.signal.aborted && !isAbortError(err)) {
            onError(err instanceof Error ? err.message : fallbackMessage);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setProfileInsightsLoading(false);
          }
        });

      return () => controller.abort();
    },
    [onError],
  );

  return {
    loading,
    user,
    setUser,
    players,
    rankings,
    matches,
    matchesHasMore,
    loadingMoreMatches,
    loadMoreMatches,
    profileMatches,
    profileLoading,
    profileInsights,
    profileInsightsLoading,
    refreshData,
    logout,
    loadProfileMatches,
    loadProfileInsights,
  };
}

function mergeMatches(current: Match[], next: Match[]) {
  const existing = new Set(current.map((match) => match.id));
  return [...current, ...next.filter((match) => !existing.has(match.id))];
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
