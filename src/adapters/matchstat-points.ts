import type { MatchSnapshot } from '../engine/model.ts';
function fail(path: string): never { throw new Error(`Unexpected point-history schema at ${path}.`); }
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim())) return fail(path);
  return value.trim();
}
function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return fail(path);
  return value;
}
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) return fail(path); return value; }
export function adaptMatchstatPoints(payload: unknown, matchKey: string): MatchSnapshot {
  if (!matchKey.trim()) throw new Error('A stable match key is required.');
  const root = object(payload, 'response');
  if (root.success !== true) return fail('success');
  const meta = object(root.meta, 'meta');
  const players: [string, string] = [
    text(object(meta.player1, 'meta.player1').name, 'meta.player1.name'),
    text(object(meta.player2, 'meta.player2').name, 'meta.player2.name'),
  ];
  const result = object(root.result, 'result');
  text(result.score, 'result.score', true);
  const games: MatchSnapshot['games'] = [];
  for (const [si, value] of array(result.sets, 'result.sets').entries()) {
    const set = object(value, `sets[${si}]`);
    const setNumber = integer(set.setNumber, 'setNumber');
    text(set.setScore, 'setScore', true);
    for (const value of array(set.games, 'games')) {
      const game = object(value, 'game');
      if (typeof game.server !== 'number' || ![0, 1, 2].includes(game.server)) return fail('game.server');
      if (typeof game.tiebreak !== 'boolean') return fail('game.tiebreak');
      games.push({ set: setNumber, game: integer(game.gameNumber, 'game.gameNumber'), server: game.server, tiebreak: game.tiebreak,
        finalScore: text(game.finalScore, 'game.finalScore', true), content: text(game.fifteens_content, 'game.fifteens_content', true) });
    }
  }
  return { matchKey, players, games };
}
