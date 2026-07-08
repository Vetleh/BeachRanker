const NORMAL_K = 32;
const TIEBREAK_K = 24;
export const STARTING_RATING = 1500;

type EloPlayerState = {
  id: string;
  rating: number;
};

export function calculateElo(match: {
  teamA: EloPlayerState[];
  teamB: EloPlayerState[];
  winningTeam: "A" | "B";
  isTiebreak: boolean;
}) {
  const teamARating = averageRating(match.teamA);
  const teamBRating = averageRating(match.teamB);
  const expectedA = expectedScore(teamARating, teamBRating);
  const expectedB = expectedScore(teamBRating, teamARating);
  const scoreA = match.winningTeam === "A" ? 1 : 0;
  const scoreB = match.winningTeam === "B" ? 1 : 0;
  const k = match.isTiebreak ? TIEBREAK_K : NORMAL_K;
  const deltaA = Math.round(k * (scoreA - expectedA));
  const deltaB = Math.round(k * (scoreB - expectedB));

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

function averageRating(players: EloPlayerState[]) {
  return players.reduce((sum, player) => sum + player.rating, 0) / players.length;
}

function expectedScore(teamRating: number, opponentRating: number) {
  return 1 / (1 + 10 ** ((opponentRating - teamRating) / 400));
}
