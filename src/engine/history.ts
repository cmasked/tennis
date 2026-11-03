import { awardPoint, createPointMatch, pressureFor, type Player, type PointState, type ScoringFormat, type PointMoment } from './point-engine.ts';
import type { MatchSnapshot } from './model.ts';
export interface HistoryMoment extends PointMoment {
  id: string;
  set: number;
  game: number;
  point: number;
  evidence: 'recorded-score-transition' | 'reconstructed-terminal';
}
export interface HistoryResult {
  state: PointState | null;
  moments: HistoryMoment[];
  issues: string[];
  observedPoints: number;
  reconstructedPoints: number;
  stopped: boolean;
}
function ordinaryScore(state: PointState): string {
  const [a, b] = state.points;
  if (a >= 3 && b >= 3) return a === b ? '40:40' : a > b ? 'A:40' : '40:A';
  const labels = ['0', '15', '30', '40'];
  return `${labels[Math.min(a, 3)]}:${labels[Math.min(b, 3)]}`;
}
function observation(token: string, tiebreak: boolean): { score: string; bp: boolean; server: Player | null } | null {
  const match = /^(\*?)(\d+|A):(\d+|A)(\s+BP)?$/.exec(token);
  if (!match) return null;
  if (!tiebreak && (match[1] || !['0', '15', '30', '40', 'A'].includes(match[2]) || !['0', '15', '30', '40', 'A'].includes(match[3]))) return null;
  if (tiebreak && (match[2] === 'A' || match[3] === 'A')) return null;
  // Only the explicitly documented * prefix (player 1 served) is interpreted.
  // Other star placements are withheld until their grammar is confirmed.
  return { score: `${match[2]}:${match[3]}`, bp: !!match[4], server: match[1] ? 1 : null };
}
function scoreAfter(step: ReturnType<typeof awardPoint>, tiebreak: boolean): string | null {
  if (step.moments.some(m => m.kind === 'game-won')) {
    const set = step.state.completedSets.at(-1);
    return tiebreak && set?.tiebreak ? set.tiebreak.join(':') : null;
  }
  return tiebreak ? step.state.points.join(':') : ordinaryScore(step.state);
}
function gamesAfter(step: ReturnType<typeof awardPoint>): string {
  return step.moments.some(m => m.kind === 'set-won') ? step.state.completedSets.at(-1)!.games.join('-') : step.state.games.join('-');
}
export function reconstructHistory(snapshot: MatchSnapshot, format: ScoringFormat): HistoryResult {
  const report: HistoryResult = { state: null, moments: [], issues: [], observedPoints: 0, reconstructedPoints: 0, stopped: false };
  const first = snapshot.games[0];
  if (!first) { report.issues.push('No games supplied; no scoring history reconstructed.'); return report; }
  if (first.set !== 1 || first.game !== 1 || ![1, 2].includes(first.server)) {
    report.issues.push('History must begin at set 1 game 1 with a known first server.'); report.stopped = true; return report;
  }
  let state = createPointMatch(format, first.server as Player);
  report.state = state;
  for (const [index, game] of snapshot.games.entries()) {
    const stop = (reason: string) => { report.issues.push(`Set ${game.set} game ${game.game}: ${reason}`); report.stopped = true; };
    if (state.winner) { stop('Data follows a completed match; no later points accepted.'); break; }
    if (game.set !== state.completedSets.length + 1 || game.game !== state.games[0] + state.games[1] + 1) { stop('Missing, duplicate or out-of-order game; later history withheld.'); break; }
    if (game.tiebreak !== (state.tiebreakFirstServer !== null)) { stop('Tiebreak flag conflicts with explicit format.'); break; }
    if (game.server !== 0 && game.server !== (state.tiebreakFirstServer ?? state.server)) { stop('Game server conflicts with legal service order.'); break; }
    const tokens = game.content.split(',').map(s => s.trim()).filter(Boolean);
    const append = (step: ReturnType<typeof awardPoint>, point: number, evidence: HistoryMoment['evidence']) => {
      step.moments.forEach(moment => report.moments.push({ ...moment, id: `${snapshot.matchKey}/${game.set}/${game.game}/${point}/${moment.kind}/${moment.player}`, set: game.set, game: game.game, point, evidence }));
      if (evidence === 'recorded-score-transition') report.observedPoints++; else report.reconstructedPoints++;
      state = step.state; report.state = state;
    };
    let point = 0, finished = false;
    for (const [tokenIndex, token] of tokens.entries()) {
      const parsed = observation(token, game.tiebreak);
      if (!parsed) { stop('Unsupported point notation; later point attribution withheld.'); break; }
      if (tokenIndex === 0 && parsed.score === '0:0') continue;
      if (finished) { stop('Extra score records after game completion.'); break; }
      if (parsed.server !== null && parsed.server !== state.server) { stop('Tiebreak server marker conflicts with legal service order.'); break; }
      const candidates = ([1, 2] as Player[]).map(side => awardPoint(state, side)).filter(step => scoreAfter(step, game.tiebreak) === parsed.score);
      if (candidates.length !== 1) { stop('Point gap, duplicate or correction; later point attribution withheld.'); break; }
      const step = candidates[0];
      const won = step.moments.some(m => m.kind === 'game-won');
      if (won && game.finalScore !== gamesAfter(step)) { stop('Point-implied game result conflicts with reported finalScore.'); break; }
      append(step, ++point, 'recorded-score-transition');
      finished = won;
      if (parsed.bp && !pressureFor(state, state.server === 1 ? 2 : 1).breakPoint) report.issues.push(`Set ${game.set} game ${game.game}: BP marker disagrees with computed pressure.`);
    }
    if (report.stopped) break;
    if (!finished && game.finalScore && game.finalScore !== state.games.join('-')) {
      // The game score supplies a winner only when exactly one legal next point
      // finishes this game and yields exactly that reported score.
      const candidates = ([1, 2] as Player[]).map(side => awardPoint(state, side)).filter(step => step.moments.some(m => m.kind === 'game-won') && gamesAfter(step) === game.finalScore);
      if (candidates.length !== 1 || !tokens.length) { stop('Cannot reconstruct a single legal terminal point from finalScore.'); break; }
      append(candidates[0], ++point, 'reconstructed-terminal'); finished = true;
    }
    if (!finished && index !== snapshot.games.length - 1) { stop('An incomplete game precedes later games; remaining history withheld.'); break; }
  }
  return report;
}
export function formatHistory(report: HistoryResult, players: [string, string]): string {
  const lines = [`FORMAT-AWARE HISTORY: ${report.observedPoints} recorded transitions; ${report.reconstructedPoints} reconstructed terminal points.`, `Processing ${report.stopped ? 'stopped at an inconsistency' : 'reached the end of supplied records'}. This is not proof of complete live coverage.`];
  const important = report.moments.filter(m => m.kind !== 'point-won' && m.kind !== 'game-won');
  const verbs: Record<string, string> = { 'set-won': 'wins the set', 'match-won': 'wins the match', 'break-point-created': 'has break point', 'set-point-created': 'has set point', 'match-point-created': 'has match point', 'break-point-saved': 'saves break point', 'set-point-saved': 'saves set point', 'match-point-saved': 'saves match point' };
  important.slice(-24).forEach(m => lines.push(`Set ${m.set} game ${m.game}: ${players[m.player - 1]} ${verbs[m.kind]} [${m.evidence}].`));
  if (important.length > 24) lines.push(`Showing last 24 of ${important.length} pressure/set/match moments.`);
  report.issues.forEach(issue => lines.push(`WARNING: ${issue}`));
  if (report.state) lines.push(`Reconstructed prefix sets: ${report.state.setsWon.join('-')}; current games: ${report.state.games.join('-')}; match winner: ${report.state.winner ?? 'not established'}.`);
  return lines.join('\n');
}
