import { analyzeGames, type Side } from '../scoring.ts';
import type { MatchSnapshot } from './model.ts';
export interface MatchMoment {
  id: string;
  kind: 'hold' | 'break' | 'break-points-saved' | 'uncertainty';
  set: number;
  game: number;
  player: Side | null;
  confidence: 'verified' | 'unknown';
  basis: 'game-score-and-server' | 'valid-point-prefix' | 'incomplete-or-unsupported-data';
  text: string;
}
export function buildMoments(snapshot: MatchSnapshot): MatchMoment[] {
  const moments: MatchMoment[] = [];
  const safe = (text: string) => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
  const analyses = analyzeGames(snapshot.games);
  const seen = new Set<string>();
  analyses.forEach((game, index) => {
    const record = snapshot.games[index];
    const position = `${snapshot.matchKey}/set/${game.set}/game/${game.game}`;
    if (seen.has(position)) return; // Ambiguous duplicate records are handled below, not emitted twice.
    seen.add(position);
    const duplicate = snapshot.games.filter(g => g.set === game.set && g.game === game.game).length > 1;
    const add = (kind: MatchMoment['kind'], player: Side | null, confidence: MatchMoment['confidence'], basis: MatchMoment['basis'], text: string) => {
      moments.push({ id: `${position}/${kind}`, kind, set: game.set, game: game.game, player, confidence, basis, text });
    };
    if (duplicate) {
      add('uncertainty', null, 'unknown', 'incomplete-or-unsupported-data', 'Duplicate game records conflict with a unique history; moments for this game are withheld.');
      return;
    }
    if (game.breakPointsSaved > 0 && (game.server === 1 || game.server === 2)) {
      add('break-points-saved', game.server, 'verified', 'valid-point-prefix', `${safe(snapshot.players[game.server - 1])} saves at least ${game.breakPointsSaved} break point${game.breakPointsSaved === 1 ? '' : 's'} in the verified sequence.`);
    }
    if (game.winner && game.outcome !== 'unknown') {
      const final = record.finalScore;
      add(game.outcome, game.winner, 'verified', 'game-score-and-server', `${safe(snapshot.players[game.winner - 1])} ${game.outcome === 'hold' ? 'holds serve' : 'breaks serve'}; set ${game.set} score ${final} (${safe(snapshot.players[0])} first).`);
    }
    const reasons = [...game.warnings];
    if (game.outcome === 'unknown') reasons.push('Game outcome or serving context is not established.');
    if (game.winner && game.terminal === 'unknown') reasons.push('Terminal point is not established; no complete point total claimed.');
    if (reasons.length) add('uncertainty', null, 'unknown', 'incomplete-or-unsupported-data', reasons.join(' '));
  });
  return moments;
}
export interface MomentChanges { added: MatchMoment[]; updated: MatchMoment[]; removed: MatchMoment[] }
// Recompute from authoritative snapshots; corrections can retract old moments.
// Caller owns durable state/notifications. This is not a production delivery queue.
export function reconcileMoments(previous: MatchMoment[], current: MatchMoment[]): MomentChanges {
  const before = new Map(previous.map(moment => [moment.id, moment]));
  const after = new Map(current.map(moment => [moment.id, moment]));
  return {
    added: current.filter(moment => !before.has(moment.id)),
    updated: current.filter(moment => before.has(moment.id) && JSON.stringify(before.get(moment.id)) !== JSON.stringify(moment)),
    removed: previous.filter(moment => !after.has(moment.id)),
  };
}
