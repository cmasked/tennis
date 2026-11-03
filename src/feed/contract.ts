import type { ScoringFormat, Pressure } from "../engine/point-engine.ts";
import type { MatchMoment } from "../engine/moments.ts";
import type { GameAnalysis } from "../scoring.ts";

// This is the public frontend contract. It contains our types, never RapidAPI
// headers or raw provider objects. A schema version changes only for API changes.
export interface FeedSnapshot {
  schemaVersion: 1;
  matchId: string;
  cursor: string;
  sequence: number;
  epoch: string;
  source: {
    kind: "synthetic" | "provider";
    observedAt: string; // When our backend received this authoritative snapshot.
    providerUpdatedAt: string | null; // Unknown is different from "now".
    revision: number; // Caller-supplied ordering, not a claimed provider revision.
  };
  players: [string, string];
  format: ScoringFormat;
  status: "in-progress" | "completed" | "unknown";
  current: null | {
    setsWon: [number, number];
    games: [number, number];
    pointScore: string;
    server: 1 | 2 | null;
    tiebreak: boolean;
    winner: 1 | 2 | null;
    completedSets: {
      games: [number, number];
      tiebreak: [number, number] | null;
      winner: 1 | 2;
    }[];
    pressure: [Pressure, Pressure];
  };
  progression: GameAnalysis[];
  moments: MatchMoment[];
  historyMoments: {
    id: string;
    kind: string;
    player: 1 | 2;
    set: number;
    game: number;
    point: number;
    evidence: string;
  }[];
  uncertainty: string[];
}
export interface FeedUpdate {
  type: "update";
  snapshot: FeedSnapshot; // Full replacement; clients never need to patch a score.
  changes: {
    added: MatchMoment[];
    updated: MatchMoment[];
    removed: MatchMoment[];
  };
  retractedHistoryIds: string[];
}
export interface FeedReset {
  type: "reset";
  reason: "initial" | "cursor-expired-or-invalid";
  snapshot: FeedSnapshot;
}
export type FeedEvent = FeedUpdate | FeedReset;

// Freshness is evaluated at render time, not frozen into a stored snapshot.
// A heartbeat proves transport connectivity, not that the provider is fresh.
export function freshness(
  snapshot: FeedSnapshot,
  now = Date.now(),
): "replay" | "unknown" | "stale" | "recent" | "clock-skew" {
  if (snapshot.source.kind === "synthetic") return "replay";
  const stamp = snapshot.source.providerUpdatedAt;
  if (stamp === null) return "unknown";
  const age = now - Date.parse(stamp);
  if (!Number.isFinite(age)) return "unknown";
  if (age < -60_000) return "clock-skew";
  return age > 120_000 ? "stale" : "recent"; // Configurable policy later, not a latency guarantee.
}
