export const INITIAL_RATING_OPTIONS = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000] as const;

export const PLAYER_GENDERS = ["MEN", "WOMEN"] as const;

export type PlayerGender = (typeof PLAYER_GENDERS)[number];
