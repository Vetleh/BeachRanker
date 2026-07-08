import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Match, Player, Ranking, User } from "./types";

export function useAppData(onError: (message: string) => void) {
  const [user, setUser] = useState<User | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [profileMatches, setProfileMatches] = useState<Match[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshData = useCallback(async () => {
    const [playersResult, rankingsResult, matchesResult] = await Promise.all([
      api.players(),
      api.rankings(),
      api.matches()
    ]);

    setPlayers(playersResult.players);
    setRankings(rankingsResult.rankings);
    setMatches(matchesResult.matches);
  }, []);

  useEffect(() => {
    api
      .me()
      .then(({ user }) => {
        setUser(user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    refreshData().catch((err: Error) => onError(err.message));
  }, [onError, refreshData, user]);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setPlayers([]);
    setRankings([]);
    setMatches([]);
    setProfileMatches([]);
  }, []);

  const loadProfileMatches = useCallback(
    (playerId: string, fallbackMessage: string) => {
      let isCurrent = true;
      setProfileMatches([]);
      setProfileLoading(true);

      api
        .matches(playerId)
        .then((result) => {
          if (isCurrent) {
            setProfileMatches(result.matches);
          }
        })
        .catch((err: Error) => {
          if (isCurrent) {
            onError(err instanceof Error ? err.message : fallbackMessage);
          }
        })
        .finally(() => {
          if (isCurrent) {
            setProfileLoading(false);
          }
        });

      return () => {
        isCurrent = false;
      };
    },
    [onError]
  );

  return {
    loading,
    user,
    setUser,
    players,
    rankings,
    matches,
    profileMatches,
    profileLoading,
    refreshData,
    logout,
    loadProfileMatches
  };
}
