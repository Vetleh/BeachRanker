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
      api.matches(),
    ]);

    setPlayers(playersResult.players);
    setRankings(rankingsResult.rankings);
    setMatches(matchesResult.matches);
  }, []);

  useEffect(() => {
    let current = true;
    api
      .me()
      .then(async ({ user: nextUser }) => {
        if (!current) {
          return;
        }
        setUser(nextUser);
        await refreshData();
      })
      .catch((err: Error) => {
        if (current) {
          // A data request can fail after authentication succeeds. Keep the
          // session intact so a transient API/database error does not log out
          // the user.
          if (err.message === "Authentication required" || err.message === "Invalid token") {
            setUser(null);
          }
          onError(err.message);
        }
      })
      .finally(() => {
        if (current) {
          setLoading(false);
        }
      });

    return () => {
      current = false;
    };
  }, [onError, refreshData]);

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
    [onError],
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
    loadProfileMatches,
  };
}
