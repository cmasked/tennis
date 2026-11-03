/**
 * Pure tennis rules for complete, ordered point winners. All formats are explicit.
 * State is copied on every transition so lookahead and replay cannot mutate their inputs.
 */
// Canonical point-winner engine. Provider-specific score strings must be adapted
// separately; this module never guesses a format from a tournament name.
export type Player = 1 | 2;
export interface TiebreakRule {
  atGames: number;
  target: number;
}
export interface ScoringFormat {
  bestOf: 3 | 5;
  gameMode: "advantage" | "no-ad";
  regularTiebreak: TiebreakRule | null;
  decidingTiebreak: TiebreakRule | null;
}
export const STANDARD_BEST_OF_THREE: ScoringFormat = {
  bestOf: 3,
  gameMode: "advantage",
  regularTiebreak: { atGames: 6, target: 7 },
  decidingTiebreak: { atGames: 6, target: 7 },
};
export const SLAM_MENS_SINGLES: ScoringFormat = {
  bestOf: 5,
  gameMode: "advantage",
  regularTiebreak: { atGames: 6, target: 7 },
  decidingTiebreak: { atGames: 6, target: 10 },
};
export interface PointState {
  format: ScoringFormat;
  setsWon: [number, number];
  games: [number, number];
  points: [number, number];
  server: Player;
  tiebreakFirstServer: Player | null;
  completedSets: {
    games: [number, number];
    tiebreak: [number, number] | null;
    winner: Player;
  }[];
  winner: Player | null;
}
export interface Pressure {
  breakPoint: boolean;
  setPoint: boolean;
  matchPoint: boolean;
}
export interface PointMoment {
  kind:
    | "point-won"
    | "game-won"
    | "set-won"
    | "match-won"
    | "break-point-created"
    | "set-point-created"
    | "match-point-created"
    | "break-point-saved"
    | "set-point-saved"
    | "match-point-saved";
  player: Player;
}
const other = (player: Player): Player => (player === 1 ? 2 : 1);
export function createPointMatch(
  format: ScoringFormat,
  firstServer: Player,
): PointState {
  if (
    ![3, 5].includes(format.bestOf) ||
    !["advantage", "no-ad"].includes(format.gameMode) ||
    ![1, 2].includes(firstServer)
  )
    throw new Error("Unsupported scoring format or first server.");
  for (const rule of [format.regularTiebreak, format.decidingTiebreak]) {
    if (
      rule !== null &&
      (!Number.isSafeInteger(rule.atGames) ||
        rule.atGames < 6 ||
        !Number.isSafeInteger(rule.target) ||
        rule.target < 2)
    )
      throw new Error("Invalid tiebreak rule.");
  }
  return {
    format: structuredClone(format),
    setsWon: [0, 0],
    games: [0, 0],
    points: [0, 0],
    server: firstServer,
    tiebreakFirstServer: null,
    completedSets: [],
    winner: null,
  };
}
// Advance only the score. Pressure detection calls this without recursively
// generating pressure events, which prevents an infinite lookahead loop.
function advance(state: PointState, winner: Player) {
  const next = structuredClone(state);
  const i = winner - 1,
    j = other(winner) - 1;
  next.points[i]++;
  const tie = next.tiebreakFirstServer !== null;
  const deciding = next.completedSets.length === next.format.bestOf - 1;
  const rule = deciding
    ? next.format.decidingTiebreak
    : next.format.regularTiebreak;
  const wonGame = tie
    ? !!rule &&
      next.points[i] >= rule.target &&
      next.points[i] - next.points[j] >= 2
    : next.points[i] >= 4 &&
      (next.format.gameMode === "no-ad" ||
        next.points[i] - next.points[j] >= 2);
  let wonSet = false,
    wonMatch = false;
  if (wonGame) {
    next.games[i]++;
    wonSet = tie || (next.games[i] >= 6 && next.games[i] - next.games[j] >= 2);
    const tieScore: [number, number] | null = tie ? [...next.points] : null;
    next.server = tie ? other(next.tiebreakFirstServer!) : other(next.server);
    next.tiebreakFirstServer = null;
    next.points = [0, 0];
    if (wonSet) {
      next.completedSets.push({
        games: [...next.games],
        tiebreak: tieScore,
        winner,
      });
      next.setsWon[i]++;
      next.games = [0, 0];
      wonMatch = next.setsWon[i] === Math.ceil(next.format.bestOf / 2);
      if (wonMatch) next.winner = winner;
    } else if (
      rule &&
      next.games[0] === rule.atGames &&
      next.games[1] === rule.atGames
    ) {
      next.tiebreakFirstServer = next.server;
    }
  } else if (tie) {
    const played = next.points[0] + next.points[1];
    next.server =
      Math.floor((played - 1) / 2) % 2 === 0
        ? other(next.tiebreakFirstServer!)
        : next.tiebreakFirstServer!;
  }
  return { state: next, wonGame, wonSet, wonMatch };
}
// A player has set/match point exactly when winning the next legal point would
// complete that set/match. Break point additionally requires returning serve.
export function pressureFor(state: PointState, player: Player): Pressure {
  if (player !== 1 && player !== 2)
    throw new Error("Pressure player must be 1 or 2.");
  if (state.winner)
    return { breakPoint: false, setPoint: false, matchPoint: false };
  const outcome = advance(state, player);
  return {
    breakPoint:
      state.tiebreakFirstServer === null &&
      state.server !== player &&
      outcome.wonGame,
    setPoint: outcome.wonSet,
    matchPoint: outcome.wonMatch,
  };
}
// Compare pressure before/after the point: losing a pressure opportunity means
// the opponent saved it. Score transitions themselves come from advance().
export function awardPoint(
  state: PointState,
  winner: Player,
): { state: PointState; moments: PointMoment[] } {
  if (winner !== 1 && winner !== 2)
    throw new Error("Point winner must be player 1 or 2.");
  if (state.winner)
    throw new Error("Match is complete; no further points accepted.");
  const before = [pressureFor(state, 1), pressureFor(state, 2)];
  const outcome = advance(state, winner);
  const moments: PointMoment[] = [{ kind: "point-won", player: winner }];
  if (outcome.wonGame) moments.push({ kind: "game-won", player: winner });
  if (outcome.wonSet) moments.push({ kind: "set-won", player: winner });
  if (outcome.wonMatch) moments.push({ kind: "match-won", player: winner });
  const opponent = other(winner);
  for (const [field, label] of [
    ["breakPoint", "break-point"],
    ["setPoint", "set-point"],
    ["matchPoint", "match-point"],
  ] as const) {
    if (before[opponent - 1][field])
      moments.push({ kind: `${label}-saved`, player: winner });
    for (const player of [1, 2] as Player[]) {
      if (
        !before[player - 1][field] &&
        pressureFor(outcome.state, player)[field]
      )
        moments.push({ kind: `${label}-created`, player });
    }
  }
  return { state: outcome.state, moments };
}
export function pointLabel(state: PointState): string {
  if (state.winner) return `Match complete: player ${state.winner}`;
  if (state.tiebreakFirstServer !== null)
    return `Tiebreak ${state.points.join("-")}`;
  const [a, b] = state.points;
  if (a >= 3 && b >= 3)
    return a === b ? "Deuce" : `Advantage player ${a > b ? 1 : 2}`;
  const labels = ["0", "15", "30", "40"];
  return `${labels[Math.min(a, 3)]}-${labels[Math.min(b, 3)]}`;
}
