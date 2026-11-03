/**
 * Provider-independent snapshot input shared by scoring, replay and future ingestion.
 */
import type { GameRecord } from "../scoring.ts";

// Our domain input. No HTTP, RapidAPI response keys or credentials here.
export interface MatchSnapshot {
  matchKey: string;
  players: [string, string];
  games: GameRecord[];
}
