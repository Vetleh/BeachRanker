export const STARTING_RATING = 1500;
export const NORMAL_K = 32;
export const TIEBREAK_K = 24;

export type TeamSide = "A" | "B";

export type EloPlayerState = {
  id: string;
  rating: number;
};

export type EloMatchInput = {
  teamA: EloPlayerState[];
  teamB: EloPlayerState[];
  winningTeam: TeamSide;
  isTiebreak: boolean;
};

export type EloPlayerResult = {
  playerId: string;
  preRating: number;
  postRating: number;
  delta: number;
};

function averageRating(players: EloPlayerState[]) {
  return players.reduce((sum, player) => sum + player.rating, 0) / players.length;
}

function expectedScore(teamRating: number, opponentRating: number) {
  return 1 / (1 + 10 ** ((opponentRating - teamRating) / 400));
}

export function calculateEloUpdate(match: EloMatchInput): EloPlayerResult[] {
  const teamARating = averageRating(match.teamA);
  const teamBRating = averageRating(match.teamB);
  const expectedA = expectedScore(teamARating, teamBRating);
  const expectedB = expectedScore(teamBRating, teamARating);
  const actualA = match.winningTeam === "A" ? 1 : 0;
  const actualB = match.winningTeam === "B" ? 1 : 0;
  const k = match.isTiebreak ? TIEBREAK_K : NORMAL_K;
  const deltaA = Math.round(k * (actualA - expectedA));
  const deltaB = Math.round(k * (actualB - expectedB));

  return [
    ...match.teamA.map((player) => ({
      playerId: player.id,
      preRating: player.rating,
      postRating: player.rating + deltaA,
      delta: deltaA
    })),
    ...match.teamB.map((player) => ({
      playerId: player.id,
      preRating: player.rating,
      postRating: player.rating + deltaB,
      delta: deltaB
    }))
  ];
}
