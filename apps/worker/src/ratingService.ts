import { listMatches, listPlayers, listSets, listSnapshots, replaceAllSnapshots, snapshotsForMatch } from "./db";
import type { D1Database } from "./env";
import { calculateElo, STARTING_RATING } from "./elo";
import type { MatchRow, RatingSnapshot } from "./types";

export async function recalculateRatings(db: D1Database) {
  const [matches, players] = await Promise.all([listMatches(db), listPlayers(db)]);
  const ratings = new Map(players.map((player) => [player.id, STARTING_RATING]));
  const snapshots: RatingSnapshot[] = [];

  for (const match of [...matches].reverse()) {
    const teamA = [match.teamAPlayer1Id, match.teamAPlayer2Id].map((id) => ({
      id,
      rating: ratings.get(id) ?? STARTING_RATING
    }));
    const teamB = [match.teamBPlayer1Id, match.teamBPlayer2Id].map((id) => ({
      id,
      rating: ratings.get(id) ?? STARTING_RATING
    }));
    const results = calculateElo({
      teamA,
      teamB,
      winningTeam: match.winningTeam,
      isTiebreak: match.isTiebreak === 1
    });
    snapshots.push(...results.map((result) => ({ matchId: match.id, ...result })));
    results.forEach((result) => ratings.set(result.playerId, result.postRating));
  }

  await replaceAllSnapshots(db, snapshots);
}

export async function getRankings(db: D1Database) {
  const [players, snapshots, matches] = await Promise.all([listPlayers(db), listSnapshots(db), listMatches(db)]);
  const ratings = new Map(players.map((player) => [player.id, STARTING_RATING]));
  snapshots.forEach((snapshot) => ratings.set(snapshot.playerId, snapshot.postRating));

  const stats = new Map(
    players.map((player) => [
      player.id,
      {
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        recentDelta: 0
      }
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
    .map((player) => ({
      id: player.id,
      name: player.name,
      active: player.active,
      rating: ratings.get(player.id) ?? STARTING_RATING,
      ...(stats.get(player.id) ?? { matchesPlayed: 0, wins: 0, losses: 0, recentDelta: 0 })
    }))
    .sort((left, right) => right.rating - left.rating || left.name.localeCompare(right.name))
    .map((player, index) => ({ rank: index + 1, ...player }));
}

export async function formatMatch(db: D1Database, match: MatchRow) {
  const [sets, snapshots] = await Promise.all([listSets(db, match.id), snapshotsForMatch(db, match.id)]);
  return {
    id: match.id,
    playedAt: match.playedAt,
    winningTeam: match.winningTeam,
    isTiebreak: match.isTiebreak === 1,
    teamA: [
      { id: match.teamAPlayer1Id, name: match.teamAPlayer1Name, deltaFor: snapshots },
      { id: match.teamAPlayer2Id, name: match.teamAPlayer2Name, deltaFor: snapshots }
    ].map(formatMatchPlayer),
    teamB: [
      { id: match.teamBPlayer1Id, name: match.teamBPlayer1Name, deltaFor: snapshots },
      { id: match.teamBPlayer2Id, name: match.teamBPlayer2Name, deltaFor: snapshots }
    ].map(formatMatchPlayer),
    sets,
    enteredBy: {
      id: match.enteredByUserId,
      displayName: match.enteredByDisplayName
    }
  };
}

export async function getMatches(db: D1Database) {
  const matches = await listMatches(db);
  return Promise.all(matches.map((match) => formatMatch(db, match)));
}

export async function getMatchesForPlayer(db: D1Database, playerId: string) {
  const matches = await listMatches(db, playerId);
  return Promise.all(matches.map((match) => formatMatch(db, match)));
}

function formatMatchPlayer(player: { id: string; name: string; deltaFor: RatingSnapshot[] }) {
  return {
    id: player.id,
    name: player.name,
    delta: player.deltaFor.find((snapshot) => snapshot.playerId === player.id)?.delta ?? 0
  };
}
