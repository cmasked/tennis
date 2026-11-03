/**
 * Conservative per-game analysis for incomplete histories. It can establish a game outcome
 * from adjacent game scores without pretending that all intermediate points were observed.
 */
// Ordinary advantage-game rules only. Tiebreak formats remain explicit unknowns.
export type Side = 1 | 2;
type Score = [string, string];
export interface GameRecord {
  set: number;
  game: number;
  server: number;
  tiebreak: boolean;
  finalScore: string;
  content: string;
}
export interface GameAnalysis {
  set: number;
  game: number;
  server: number;
  winner: Side | null;
  outcome: "hold" | "break" | "unknown";
  verifiedTransitions: number;
  breakPointsSaved: number;
  terminal: "reconstructed" | "unknown";
  warnings: string[];
}
const regular = ["0", "15", "30", "40"];
function next(score: Score, winner: Side): Score | "won" {
  const a = winner - 1,
    b = 1 - a;
  const result: Score = [...score];
  if (score[a] === "A") return "won";
  if (score[b] === "A") return ["40", "40"];
  if (score[a] === "40") {
    if (score[b] !== "40") return "won";
    result[a] = "A";
    return result;
  }
  result[a] = regular[regular.indexOf(score[a]) + 1];
  return result;
}
function equal(a: Score | "won", b: Score) {
  return a !== "won" && a[0] === b[0] && a[1] === b[1];
}
function parseScore(value: string): { score: Score; bp: boolean } | null {
  const match = /^(0|15|30|40|A):(0|15|30|40|A)(\s+BP)?$/.exec(value.trim());
  if (!match) return null;
  const score: Score = [match[1], match[2]];
  if (
    (score[0] === "A" && score[1] !== "40") ||
    (score[1] === "A" && score[0] !== "40")
  )
    return null;
  return { score, bp: !!match[3] };
}
export function analyzeGames(games: GameRecord[]): GameAnalysis[] {
  let set = 0,
    previous: [number, number] | null = [0, 0],
    lastGame = 0;
  return games.map((record) => {
    if (record.set !== set) {
      set = record.set;
      previous = [0, 0];
      lastGame = 0;
    }
    const warnings: string[] = [];
    const contiguous = record.game === lastGame + 1;
    if (!contiguous)
      warnings.push(
        "Missing, duplicate or out-of-order game number; winner attribution withheld.",
      );
    const final = /^(\d+)-(\d+)$/.exec(record.finalScore);
    const after: [number, number] | null = final
      ? [Number(final[1]), Number(final[2])]
      : null;
    let winner: Side | null = null;
    if (contiguous && previous && after) {
      const delta = [after[0] - previous[0], after[1] - previous[1]];
      if (delta[0] === 1 && delta[1] === 0) winner = 1;
      else if (delta[0] === 0 && delta[1] === 1) winner = 2;
      else if (delta[0] !== 0 || delta[1] !== 0)
        warnings.push("Set game-score jump/correction; cannot assign winner.");
    }
    // A missing score must not make a later game appear adjacent to an older score.
    previous = after;
    lastGame = record.game;
    const report: GameAnalysis = {
      set: record.set,
      game: record.game,
      server: record.server,
      winner,
      outcome:
        winner && !record.tiebreak && record.server
          ? winner === record.server
            ? "hold"
            : "break"
          : "unknown",
      verifiedTransitions: 0,
      breakPointsSaved: 0,
      terminal: "unknown",
      warnings,
    };
    if (record.tiebreak) {
      warnings.push(
        "Tiebreak point reconstruction deferred until format and examples are verified.",
      );
      return report;
    }
    let current: Score = ["0", "0"];
    let valid = true;
    const receiver: Side | null =
      record.server === 1 ? 2 : record.server === 2 ? 1 : null;
    const entries = record.content
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const [entryIndex, entry] of entries.entries()) {
      const parsed = parseScore(entry);
      if (!parsed) {
        warnings.push("Unsupported point notation; remaining points withheld.");
        valid = false;
        break;
      }
      // Some feeds explicitly include the initial 0:0; do not count it as a point.
      if (
        entryIndex === 0 &&
        current[0] === "0" &&
        current[1] === "0" &&
        parsed.score[0] === "0" &&
        parsed.score[1] === "0"
      )
        continue;
      const candidates = ([1, 2] as Side[]).filter((side) =>
        equal(next(current, side), parsed.score),
      );
      if (candidates.length !== 1) {
        warnings.push(
          "Score gap, duplicate or correction; remaining point attribution withheld.",
        );
        valid = false;
        break;
      }
      const pointWinner = candidates[0];
      if (
        receiver &&
        next(current, receiver) === "won" &&
        pointWinner === record.server
      )
        report.breakPointsSaved++;
      report.verifiedTransitions++;
      current = parsed.score;
      const computedBP = receiver !== null && next(current, receiver) === "won";
      if (parsed.bp && !computedBP && receiver !== null)
        warnings.push("Provider BP marker conflicts with calculated pressure.");
    }
    if (valid && entries.length && winner) {
      if (next(current, winner) === "won") report.terminal = "reconstructed";
      else
        warnings.push(
          "Completed-game winner cannot win in one point from last recorded score; terminal point withheld.",
        );
    }
    if (!entries.length) warnings.push("No point sequence supplied.");
    return report;
  });
}
export function formatGameAnalysis(games: GameAnalysis[]): string {
  const lines = ["SCORING ANALYSIS (ordinary advantage games only)"];
  for (const game of games) {
    lines.push(
      `Set ${game.set} game ${game.game}: ${game.outcome}; ${game.verifiedTransitions} verified recorded transitions; ${game.breakPointsSaved} break points saved in verified prefix; terminal=${game.terminal}.`,
    );
    for (const warning of game.warnings) lines.push(`  WARNING: ${warning}`);
  }
  lines.push(
    "Reconstructed terminal points use the game-score result plus a legal one-point finish; they were not directly supplied by the point feed. Unknown data is not filled in.",
  );
  return lines.join("\n");
}
export function crossCheckTimeline(
  games: GameAnalysis[],
  texts: string[],
  players: [string, string],
): string {
  if (
    games.length &&
    (games[0].set !== 1 ||
      games.some(
        (game, i) =>
          game.warnings.some((w) => /game number|game-score jump/.test(w)) ||
          (i > 0 &&
            game.set !== games[i - 1].set &&
            game.set !== games[i - 1].set + 1),
      ))
  ) {
    return "TIMELINE CROSS-CHECK: withheld because game history has gaps or ordering inconsistencies.";
  }
  const completed = games.filter((g) => g.winner !== null);
  const rows = texts
    .map((text) => /^Game (\d+) - (.+) - (holds|breaks) to (.+)$/.exec(text))
    .filter((row) => row !== null);
  let agree = 0,
    mismatch = 0,
    unsupported = texts.length - rows.length;
  for (const row of rows) {
    const game = completed[Number(row[1]) - 1];
    if (!game || game.outcome === "unknown") {
      unsupported++;
      continue;
    }
    if (
      players[game.winner! - 1].trim().toLowerCase() ===
        row[2].trim().toLowerCase() &&
      (game.outcome === "hold" ? "holds" : "breaks") === row[3]
    )
      agree++;
    else mismatch++;
  }
  return `TIMELINE CROSS-CHECK: ${agree} agree; ${mismatch} disagree; ${unsupported} unmatched/unsupported. Matching uses game order and player names; incomplete histories may invalidate alignment. Provider text is not treated as scoring authority.`;
}
