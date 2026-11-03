/**
 * Synthetic provider-shaped examples for end-to-end adapter and scoring checks.
 * These fixtures do not represent retained or fabricated production match data.
 */
import { adaptMatchstatStatistics } from "../adapters/matchstat-statistics.ts";
import { summarizeHistory } from "../engine/summary.ts";
import { adaptMatchstatPoints } from "../adapters/matchstat-points.ts";
import { reconstructHistory, formatHistory } from "../engine/history.ts";
import { STANDARD_BEST_OF_THREE } from "../engine/point-engine.ts";

// Synthetic provider-shaped data. Terminal score records intentionally omitted.
export function syntheticProviderMatch() {
  return {
    success: true,
    meta: {
      player1: { name: "Alex Example" },
      player2: { name: "Jordan Example" },
    },
    result: {
      score: "6-0,6-0",
      sets: [1, 2].map((setNumber) => ({
        setNumber,
        setScore: "6-0",
        games: [1, 2, 3, 4, 5, 6].map((gameNumber) => ({
          gameNumber,
          server: gameNumber % 2 ? 1 : 2,
          tiebreak: false,
          finalScore: `${gameNumber}-0`,
          fifteens_content: "15:0,30:0,40:0",
        })),
      })),
    },
  };
}
export function syntheticProviderTiebreak() {
  const games = Array.from({ length: 12 }, (_, i) => ({
    gameNumber: i + 1,
    server: i % 2 ? 2 : 1,
    tiebreak: false,
    finalScore: `${Math.ceil((i + 1) / 2)}-${Math.floor((i + 1) / 2)}`,
    fifteens_content: i % 2 ? "0:15,0:30,0:40" : "15:0,30:0,40:0",
  }));
  games.push({
    gameNumber: 13,
    server: 1,
    tiebreak: true,
    finalScore: "7-6",
    fifteens_content: "*1:0,2:0,3:0,*4:0,*5:0,6:0",
  });
  return {
    success: true,
    meta: {
      player1: { name: "Alex Example" },
      player2: { name: "Jordan Example" },
    },
    result: { score: "7-6", sets: [{ setNumber: 1, setScore: "7-6", games }] },
  };
}
export function replayProviderBridge(): string {
  const payload = syntheticProviderMatch();
  const snapshot = adaptMatchstatPoints(payload, "synthetic-provider-full");
  const gap = structuredClone(payload);
  gap.result.sets[0].games[0].fifteens_content = "15:0,40:0";
  const gapSnapshot = adaptMatchstatPoints(gap, "synthetic-provider-gap");
  const tie = adaptMatchstatPoints(
    syntheticProviderTiebreak(),
    "synthetic-provider-tie",
  );
  const stats = adaptMatchstatStatistics({
    success: true,
    result: {
      player1: { name: "Jordan Example" },
      player2: { name: "Alex Example" },
      statistics: {
        ALL: {
          service: { aces: { player1: { value: 2 }, player2: { value: 3 } } },
        },
      },
    },
  });
  return [
    "\nPROVIDER-TO-ENGINE REPLAY — synthetic payloads, explicit standard best-of-three.",
    "13. Complete ordinary-game history passes through adapter and format-aware scoring.",
    formatHistory(
      reconstructHistory(snapshot, STANDARD_BEST_OF_THREE),
      snapshot.players,
    ),
    "\n14. Missing point stops full-history reconstruction instead of inventing a match result.",
    formatHistory(
      reconstructHistory(gapSnapshot, STANDARD_BEST_OF_THREE),
      gapSnapshot.players,
    ),
    "\n15. Documented numeric tiebreak notation and player-1 serving markers, tested synthetically.",
    formatHistory(reconstructHistory(tie, STANDARD_BEST_OF_THREE), tie.players),
    "Real-provider tiebreak examples and feed completeness remain unverified. Other star placements are rejected, not guessed.",
    "\n16. Concise match summary and conflicting live-status warning.",
    summarizeHistory(
      snapshot,
      reconstructHistory(snapshot, STANDARD_BEST_OF_THREE),
      "InPlay",
    ),
    "\n17. Synthetic statistics in the observed result wrapper (reversed player order).",
    `Envelope: ${stats.envelope}; ${stats.players[0]} / ${stats.players[1]}; aces ${stats.metrics[0].values[0].value} / ${stats.metrics[0].values[1].value}. No individual point endings inferred.`,
  ].join("\n");
}
