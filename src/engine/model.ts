import type { GameRecord } from '../scoring.ts';

// Our domain input. No HTTP, RapidAPI response keys or credentials here.
export interface MatchSnapshot {
  matchKey: string;
  players: [string, string];
  games: GameRecord[];
}
