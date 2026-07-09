export type Role = "ADMIN" | "PLAYER";
export type TeamSide = "A" | "B";
export type PlayerGender = "MEN" | "WOMEN";

export type User = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
};

export type Player = {
  id: string;
  name: string;
  active: boolean;
  initialRating: number;
  gender: PlayerGender;
};

export type Ranking = Player & {
  rank: number;
  rating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  recentDelta: number;
};

export type MatchSet = {
  id?: string;
  setNumber?: number;
  teamAPoints: number;
  teamBPoints: number;
};

export type MatchPlayer = {
  id: string;
  name: string;
  delta: number;
};

export type Match = {
  id: string;
  playedAt: string;
  winningTeam: TeamSide;
  isTiebreak: boolean;
  rated: boolean;
  teamA: MatchPlayer[];
  teamB: MatchPlayer[];
  sets: MatchSet[];
  enteredBy: {
    id: string;
    displayName: string;
  };
};
