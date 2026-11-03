import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptMatchstatStatistics } from '../src/adapters/matchstat-statistics.ts';
import { reconstructHistory } from '../src/engine/history.ts';
import { summarizeHistory } from '../src/engine/summary.ts';
import { adaptMatchstatPoints } from '../src/adapters/matchstat-points.ts';
import { syntheticProviderMatch } from '../src/replay/provider.ts';
import { STANDARD_BEST_OF_THREE } from '../src/engine/point-engine.ts';
function data() {
  return { player1: { name: 'Synthetic Two' }, player2: { name: 'Synthetic One' }, statistics: {
    ALL: { service: { aces: { player1: { value: 3 }, player2: { value: 0 } }, firstServeAccuracy: { player1: { value: 30, total: 50, percentage: 60 }, player2: { value: 0, total: 0, percentage: 0 } } } },
    '1ST': { points: { pointsTotal: { player1: { value: 20 }, player2: { value: 18 } } } },
  } };
}
test('observed result wrapper and documented top-level stats map to identical domain values', () => {
  const nested = adaptMatchstatStatistics({ success: true, result: data() });
  const top = adaptMatchstatStatistics({ success: true, ...data() });
  assert.equal(nested.envelope, 'result'); assert.equal(top.envelope, 'top-level');
  assert.deepEqual(nested.metrics, top.metrics); assert.deepEqual(nested.players, ['Synthetic Two', 'Synthetic One']);
  assert.equal(nested.metrics.length, 3); assert.deepEqual(nested.periods, ['ALL', '1ST']);
  assert.equal(nested.metrics[0].values[1].value, 0);
});
test('ratios, percentages and player order are preserved without inferring point endings', () => {
  const stats = adaptMatchstatStatistics({ success: true, result: data() });
  assert.deepEqual(stats.metrics[1].values[0], { value: 30, total: 50, percentage: 60 });
  assert.equal(stats.players[0], 'Synthetic Two'); assert.equal('pointWinner' in stats, false);
});
test('empty periods produce no metrics rather than fabricated zero values', () => {
  const value = data(); value.statistics = {} as typeof value.statistics;
  assert.equal(adaptMatchstatStatistics({ success: true, result: value }).metrics.length, 0);
});
test('malformed and ambiguous wrappers remain errors rather than recursive schema guessing', () => {
  for (const payload of [null, [], { success: false, result: data() }, { success: true, result: null }, { success: true, ...data(), result: data() }, { success: true, result: { result: data() } }]) assert.throws(() => adaptMatchstatStatistics(payload));
});
test('invalid metric types, impossible ratios, missing sides and unsafe labels fail safely', () => {
  for (const cell of [{ value: 'private' }, { value: -1 }, { value: NaN }, { value: 2, total: 1 }, { value: 1, percentage: 101 }, null]) {
    const value = data(); (value.statistics.ALL.service.aces as Record<string, unknown>).player1 = cell;
    assert.throws(() => adaptMatchstatStatistics({ success: true, result: value }), error => error instanceof Error && !error.message.includes('private'));
  }
  const value = data(); delete (value.statistics.ALL.service.aces as Record<string, unknown>).player2;
  assert.throws(() => adaptMatchstatStatistics({ success: true, result: value }));
});
test('match summary flags InPlay/completed inconsistency without claiming freshness', () => {
  const snapshot = adaptMatchstatPoints(syntheticProviderMatch(), 'synthetic');
  const report = reconstructHistory(snapshot, STANDARD_BEST_OF_THREE);
  const output = summarizeHistory(snapshot, report, 'InPlay');
  assert.match(output, /Alex Example wins the match, 2 sets to 0/);
  assert.match(output, /6-0, 6-0/); assert.match(output, /discovery says InPlay/);
  assert.match(output, /not a guarantee of provider freshness/);
  assert.doesNotMatch(summarizeHistory(snapshot, report, 'Ended'), /discovery says InPlay/);
});
test('partial-history summary withholds the final match result', () => {
  const payload = syntheticProviderMatch(); payload.result.sets[0].games[0].fifteens_content = '15:0,40:0';
  const snapshot = adaptMatchstatPoints(payload, 'synthetic');
  const output = summarizeHistory(snapshot, reconstructHistory(snapshot, STANDARD_BEST_OF_THREE), 'InPlay');
  assert.match(output, /Partial verified prefix only/); assert.doesNotMatch(output, /wins the match/);
});
