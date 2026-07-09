export type Role = "ADMIN" | "PLAYER";
export type TeamSide = "A" | "B";

export type User = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  active: number;
};

export type AuthUser = Pick<User, "id" | "email" | "displayName" | "role"> & {
  active: boolean;
};

export type Player = {
  id: string;
  name: string;
  active: number;
  initialRating: number;
  userId?: string | null;
};

export type MatchSet = {
  id?: string;
  setNumber?: number;
  teamAPoints: number;
  teamBPoints: number;
};

export type MatchInput = {
  playedAt: string;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  sets: MatchSet[];
  isTiebreak?: boolean;
};

export type MatchRow = {
  id: string;
  playedAt: string;
  winningTeam: TeamSide;
  isTiebreak: number;
  enteredByUserId: string;
  teamAPlayer1Id: string;
  teamAPlayer2Id: string;
  teamBPlayer1Id: string;
  teamBPlayer2Id: string;
  teamAPlayer1Name: string;
  teamAPlayer2Name: string;
  teamBPlayer1Name: string;
  teamBPlayer2Name: string;
  enteredByDisplayName: string;
};

export type RatingSnapshot = {
  matchId: string;
  playerId: string;
  preRating: number;
  postRating: number;
  delta: number;
};
