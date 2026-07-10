import {
  listMatches,
  listPlayers,
  listSetsForMatches,
  listSnapshots,
  snapshotsForMatches,
  replaceAllSnapshots,
} from "./db";
import type { D1Database } from "./env";
import { calculateElo, STARTING_RATING } from "./elo";
import type { MatchRow, MatchSet, PlayerGender, RatingSnapshot } from "./types";

export async function recalculateRatings(db: D1Database) {
  const [matches, players] = await Promise.all([listMatches(db), listPlayers(db)]);
  const ratings = new Map(players.map((player) => [player.id, player.initialRating]));
  const snapshots: RatingSnapshot[] = [];

  for (const match of [...matches].reverse()) {
    if (!isRatedMatch(match)) {
      continue;
    }

    const teamA = [match.teamAPlayer1Id, match.teamAPlayer2Id].map((id) => ({
      id,
      rating: ratings.get(id) ?? STARTING_RATING,
    }));
    const teamB = [match.teamBPlayer1Id, match.teamBPlayer2Id].map((id) => ({
      id,
      rating: ratings.get(id) ?? STARTING_RATING,
    }));
    const results = calculateElo({
      teamA,
      teamB,
      winningTeam: match.winningTeam,
      isTiebreak: match.isTiebreak === 1,
    });
    snapshots.push(...results.map((result) => ({ matchId: match.id, ...result })));
    results.forEach((result) => ratings.set(result.playerId, result.postRating));
  }

  await replaceAllSnapshots(db, snapshots);
}

export async function getRankings(db: D1Database) {
  const [players, snapshots, matches] = await Promise.all([listPlayers(db), listSnapshots(db), listMatches(db)]);
  const ratings = new Map(players.map((player) => [player.id, player.initialRating]));
  const ratedMatchIds = new Set(matches.filter(isRatedMatch).map((match) => match.id));
  const ratedSnapshots = snapshots.filter((snapshot) => ratedMatchIds.has(snapshot.matchId));
  ratedSnapshots.forEach((snapshot) => ratings.set(snapshot.playerId, snapshot.postRating));

  const stats = new Map(
    players.map((player) => [
      player.id,
      {
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        recentDelta: 0,
      },
    ]),
  );

  for (const match of matches) {
    if (!isRatedMatch(match)) {
      continue;
    }

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

  ratedSnapshots.forEach((snapshot) => {
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
      gender: player.gender,
      rating: ratings.get(player.id) ?? STARTING_RATING,
      ...(stats.get(player.id) ?? { matchesPlayed: 0, wins: 0, losses: 0, recentDelta: 0 }),
    }))
    .sort(
      (left, right) =>
        left.gender.localeCompare(right.gender) || right.rating - left.rating || left.name.localeCompare(right.name),
    )
    .map((player, index, sortedPlayers) => ({
      rank:
        sortedPlayers
          .filter((candidate) => candidate.gender === player.gender)
          .findIndex((candidate) => candidate.id === player.id) + 1,
      ...player,
    }));
}

export async function formatMatch(db: D1Database, match: MatchRow) {
  const [formatted] = await formatMatches(db, [match]);
  return formatted;
}

async function formatMatches(db: D1Database, matches: MatchRow[]) {
  const matchIds = matches.map((match) => match.id);
  const [sets, snapshots] = await Promise.all([listSetsForMatches(db, matchIds), snapshotsForMatches(db, matchIds)]);
  const setsByMatch = new Map<string, MatchSetRow[]>();
  const snapshotsByMatch = new Map<string, RatingSnapshot[]>();
  sets.forEach((set) => {
    const matchSets = setsByMatch.get(set.matchId) ?? [];
    matchSets.push(set);
    setsByMatch.set(set.matchId, matchSets);
  });
  snapshots.forEach((snapshot) => {
    const matchSnapshots = snapshotsByMatch.get(snapshot.matchId) ?? [];
    matchSnapshots.push(snapshot);
    snapshotsByMatch.set(snapshot.matchId, matchSnapshots);
  });

  return matches.map((match) => formatMatchData(match, setsByMatch.get(match.id) ?? [], snapshotsByMatch.get(match.id) ?? []));
}

function formatMatchData(match: MatchRow, sets: MatchSetRow[], snapshots: RatingSnapshot[]) {
  const rated = isRatedMatch(match);
  const ratingSnapshots = rated ? snapshots : [];
  return {
    id: match.id,
    playedAt: match.playedAt,
    winningTeam: match.winningTeam,
    isTiebreak: match.isTiebreak === 1,
    isRanked: match.isRanked !== 0,
    rated,
    teamA: [
      { id: match.teamAPlayer1Id, name: match.teamAPlayer1Name, deltaFor: ratingSnapshots },
      { id: match.teamAPlayer2Id, name: match.teamAPlayer2Name, deltaFor: ratingSnapshots },
    ].map(formatMatchPlayer),
    teamB: [
      { id: match.teamBPlayer1Id, name: match.teamBPlayer1Name, deltaFor: ratingSnapshots },
      { id: match.teamBPlayer2Id, name: match.teamBPlayer2Name, deltaFor: ratingSnapshots },
    ].map(formatMatchPlayer),
    sets: sets.map(({ matchId: _matchId, ...set }) => set),
    enteredBy: {
      id: match.enteredByUserId,
      displayName: match.enteredByDisplayName,
    },
  };
}

export async function getMatches(db: D1Database) {
  const matches = await listMatches(db);
  return formatMatches(db, matches);
}

export async function getMatchesForPlayer(db: D1Database, playerId: string) {
  const matches = await listMatches(db, playerId);
  return formatMatches(db, matches);
}

function formatMatchPlayer(player: { id: string; name: string; deltaFor: RatingSnapshot[] }) {
  return {
    id: player.id,
    name: player.name,
    delta: player.deltaFor.find((snapshot) => snapshot.playerId === player.id)?.delta ?? 0,
  };
}

function isRatedMatch(match: MatchRow) {
  if (match.isRanked === 0) {
    return false;
  }
  const genders: PlayerGender[] = [
    match.teamAPlayer1Gender ?? "MEN",
    match.teamAPlayer2Gender ?? "MEN",
    match.teamBPlayer1Gender ?? "MEN",
    match.teamBPlayer2Gender ?? "MEN",
  ];
  return genders.every((gender) => gender === genders[0]);
}

type MatchSetRow = Required<Pick<MatchSet, "id" | "setNumber" | "teamAPoints" | "teamBPoints">> & {
  matchId: string;
};
