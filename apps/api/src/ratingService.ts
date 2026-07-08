import type { Match, MatchSet, Player, RatingSnapshot } from "@prisma/client";
import { prisma } from "./db.js";
import { calculateEloUpdate, STARTING_RATING } from "./elo.js";

type MatchWithSets = Match & {
  sets: MatchSet[];
  snapshots: RatingSnapshot[];
  teamAPlayer1: Player;
  teamAPlayer2: Player;
  teamBPlayer1: Player;
  teamBPlayer2: Player;
  enteredBy: {
    id: string;
    displayName: string;
  };
};

export async function recalculateRatings() {
  const players = await prisma.player.findMany();
  const ratings = new Map(players.map((player) => [player.id, STARTING_RATING]));

  const matches = await prisma.match.findMany({
    orderBy: [{ playedAt: "asc" }, { createdAt: "asc" }],
    include: { sets: true }
  });

  await prisma.ratingSnapshot.deleteMany();

  for (const match of matches) {
    const teamA = [match.teamAPlayer1Id, match.teamAPlayer2Id].map((id) => ({
      id,
      rating: ratings.get(id) ?? STARTING_RATING
    }));
    const teamB = [match.teamBPlayer1Id, match.teamBPlayer2Id].map((id) => ({
      id,
      rating: ratings.get(id) ?? STARTING_RATING
    }));

    const results = calculateEloUpdate({
      teamA,
      teamB,
      winningTeam: match.winningTeam,
      isTiebreak: match.isTiebreak
    });

    await prisma.ratingSnapshot.createMany({
      data: results.map((result) => ({
        matchId: match.id,
        playerId: result.playerId,
        preRating: result.preRating,
        postRating: result.postRating,
        delta: result.delta
      }))
    });

    results.forEach((result) => {
      ratings.set(result.playerId, result.postRating);
    });
  }

  return ratings;
}

export async function getRankings() {
  const [players, snapshots, matches] = await Promise.all([
    prisma.player.findMany({ orderBy: { name: "asc" } }),
    prisma.ratingSnapshot.findMany({
      orderBy: [{ match: { playedAt: "asc" } }, { match: { createdAt: "asc" } }]
    }),
    prisma.match.findMany()
  ]);

  const ratings = new Map(players.map((player) => [player.id, STARTING_RATING]));
  snapshots.forEach((snapshot) => {
    ratings.set(snapshot.playerId, snapshot.postRating);
  });

  const stats = new Map(
    players.map((player) => [
      player.id,
      { matchesPlayed: 0, wins: 0, losses: 0, recentDelta: 0 }
    ])
  );

  for (const match of matches) {
    const teamAIds = [match.teamAPlayer1Id, match.teamAPlayer2Id];
    const teamBIds = [match.teamBPlayer1Id, match.teamBPlayer2Id];
    const winnerIds = match.winningTeam === "A" ? teamAIds : teamBIds;
    const loserIds = match.winningTeam === "A" ? teamBIds : teamAIds;

    [...teamAIds, ...teamBIds].forEach((id) => {
      const playerStats = stats.get(id);
      if (playerStats) {
        playerStats.matchesPlayed += 1;
      }
    });
    winnerIds.forEach((id) => {
      const playerStats = stats.get(id);
      if (playerStats) {
        playerStats.wins += 1;
      }
    });
    loserIds.forEach((id) => {
      const playerStats = stats.get(id);
      if (playerStats) {
        playerStats.losses += 1;
      }
    });
  }

  snapshots.forEach((snapshot) => {
    const playerStats = stats.get(snapshot.playerId);
    if (playerStats) {
      playerStats.recentDelta = snapshot.delta;
    }
  });

  return players
    .map((player) => {
      const playerStats = stats.get(player.id) ?? {
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        recentDelta: 0
      };

      return {
        id: player.id,
        name: player.name,
        active: player.active,
        rating: ratings.get(player.id) ?? STARTING_RATING,
        ...playerStats
      };
    })
    .sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name))
    .map((player, index) => ({ rank: index + 1, ...player }));
}

export async function getMatches() {
  const matches = await prisma.match.findMany({
    orderBy: [{ playedAt: "desc" }, { createdAt: "desc" }],
    include: {
      sets: { orderBy: { setNumber: "asc" } },
      snapshots: true,
      teamAPlayer1: true,
      teamAPlayer2: true,
      teamBPlayer1: true,
      teamBPlayer2: true,
      enteredBy: { select: { id: true, displayName: true } }
    }
  });

  return matches.map(formatMatch);
}

export function formatMatch(match: MatchWithSets) {
  return {
    id: match.id,
    playedAt: match.playedAt,
    winningTeam: match.winningTeam,
    isTiebreak: match.isTiebreak,
    enteredBy: match.enteredBy,
    teamA: [match.teamAPlayer1, match.teamAPlayer2].map((player) => ({
      id: player.id,
      name: player.name,
      delta: match.snapshots.find((snapshot) => snapshot.playerId === player.id)?.delta ?? 0
    })),
    teamB: [match.teamBPlayer1, match.teamBPlayer2].map((player) => ({
      id: player.id,
      name: player.name,
      delta: match.snapshots.find((snapshot) => snapshot.playerId === player.id)?.delta ?? 0
    })),
    sets: match.sets.map((set) => ({
      id: set.id,
      setNumber: set.setNumber,
      teamAPoints: set.teamAPoints,
      teamBPoints: set.teamBPoints
    }))
  };
}
