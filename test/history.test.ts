import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptMatchstatPoints } from '../src/adapters/matchstat-points.ts';
import { reconstructHistory } from '../src/engine/history.ts';
import { STANDARD_BEST_OF_THREE } from '../src/engine/point-engine.ts';
import { syntheticProviderMatch, syntheticProviderTiebreak } from '../src/replay/provider.ts';
import { validationOptions } from '../src/validation-options.ts';
const adapt = (payload: unknown) => adaptMatchstatPoints(payload, 'synthetic');
test('complete provider-shaped history reconstructs two sets and a match with explicit evidence', () => {
  const report = reconstructHistory(adapt(syntheticProviderMatch()), STANDARD_BEST_OF_THREE);
  assert.equal(report.stopped, false); assert.deepEqual(report.issues, []);
  assert.equal(report.observedPoints, 36); assert.equal(report.reconstructedPoints, 12);
  assert.deepEqual(report.state!.setsWon, [2, 0]); assert.equal(report.state!.winner, 1);
  assert.equal(report.moments.filter(m => m.kind === 'set-won').length, 2);
  assert.equal(report.moments.find(m => m.kind === 'match-won')!.evidence, 'reconstructed-terminal');
  assert.equal(report.moments.filter(m => m.kind === 'match-point-created').length, 1);
});
test('point gaps, duplicates and corrections stop the canonical prefix without claiming later sets', () => {
  for (const sequence of ['15:0,40:0', '15:0,15:0', '15:0,0:0', '15:0,???']) {
    const data = syntheticProviderMatch(); data.result.sets[0].games[0].fifteens_content = sequence;
    const report = reconstructHistory(adapt(data), STANDARD_BEST_OF_THREE);
    assert.equal(report.stopped, true); assert.equal(report.observedPoints, 1);
    assert.equal(report.reconstructedPoints, 0); assert.equal(report.state!.winner, null);
    assert.equal(report.moments.some(m => m.kind === 'set-won'), false);
  }
});
test('missing initial games, duplicate games and wrong servers withhold later reconstruction', () => {
  const data = syntheticProviderMatch(); data.result.sets[0].games.shift();
  assert.equal(reconstructHistory(adapt(data), STANDARD_BEST_OF_THREE).state, null);
  const duplicate = syntheticProviderMatch(); duplicate.result.sets[0].games.splice(1, 0, duplicate.result.sets[0].games[0]);
  assert.equal(reconstructHistory(adapt(duplicate), STANDARD_BEST_OF_THREE).stopped, true);
  const server = syntheticProviderMatch(); server.result.sets[0].games[1].server = 1;
  assert.match(reconstructHistory(adapt(server), STANDARD_BEST_OF_THREE).issues.join(' '), /service order/);
});
test('partial ongoing game is valid as a prefix but cannot be followed by later games', () => {
  const data = syntheticProviderMatch(); data.result.sets = [data.result.sets[0]];
  data.result.sets[0].games = [{ gameNumber: 1, server: 1, tiebreak: false, finalScore: '0-0', fifteens_content: '15:0' }];
  const report = reconstructHistory(adapt(data), STANDARD_BEST_OF_THREE);
  assert.equal(report.stopped, false); assert.equal(report.state!.winner, null); assert.equal(report.observedPoints, 1);
  data.result.sets[0].games.push({ gameNumber: 2, server: 2, tiebreak: false, finalScore: '1-1', fifteens_content: '' });
  assert.equal(reconstructHistory(adapt(data), STANDARD_BEST_OF_THREE).stopped, true);
});
test('numeric tiebreak history respects service markers and reconstructs only one legal terminal point', () => {
  const report = reconstructHistory(adapt(syntheticProviderTiebreak()), STANDARD_BEST_OF_THREE);
  assert.equal(report.stopped, false); assert.deepEqual(report.issues, []);
  assert.deepEqual(report.state!.completedSets[0].tiebreak, [7, 0]);
  assert.equal(report.state!.server, 2);
  const bad = syntheticProviderTiebreak(); bad.result.sets[0].games[12].fifteens_content = '*1:0,*2:0';
  assert.match(reconstructHistory(adapt(bad), STANDARD_BEST_OF_THREE).issues.join(' '), /server marker/);
});
test('explicit terminal tiebreak record is observed instead of reconstructed twice', () => {
  const data = syntheticProviderTiebreak(); data.result.sets[0].games[12].fifteens_content += ',7:0';
  const report = reconstructHistory(adapt(data), STANDARD_BEST_OF_THREE);
  assert.equal(report.stopped, false); assert.equal(report.reconstructedPoints, 12);
  assert.equal(report.moments.find(m => m.kind === 'set-won')!.evidence, 'recorded-score-transition');
});
test('unsupported notation, format conflicts and incompatible final scores remain failures', () => {
  for (const edit of [
    (data: ReturnType<typeof syntheticProviderTiebreak>) => { data.result.sets[0].games[12].fifteens_content = '1:*0'; },
    (data: ReturnType<typeof syntheticProviderTiebreak>) => { data.result.sets[0].games[12].tiebreak = false; },
    (data: ReturnType<typeof syntheticProviderTiebreak>) => { data.result.sets[0].games[12].finalScore = '6-7'; },
  ]) { const data = syntheticProviderTiebreak(); edit(data); assert.equal(reconstructHistory(adapt(data), STANDARD_BEST_OF_THREE).stopped, true); }
});
test('unchanged snapshots produce stable moment identities and corrected prefixes remove old conclusions', () => {
  const data = syntheticProviderMatch();
  const before = reconstructHistory(adapt(data), STANDARD_BEST_OF_THREE);
  const same = reconstructHistory(adapt(data), STANDARD_BEST_OF_THREE);
  assert.deepEqual(before.moments, same.moments);
  data.result.sets[0].games[0].fifteens_content = '15:0,40:0';
  const after = reconstructHistory(adapt(data), STANDARD_BEST_OF_THREE);
  const remaining = new Set(after.moments.map(m => m.id));
  assert.ok(before.moments.filter(m => !remaining.has(m.id)).some(m => m.kind === 'match-won'));
});
test('format CLI is explicit and invalid names are rejected before requests', () => {
  assert.equal(validationOptions(['--tour', 'atp', '--format', 'standard-bo3']).format!.bestOf, 3);
  assert.equal(validationOptions(['--format', 'slam-men']).format!.bestOf, 5);
  assert.equal(validationOptions([]).format, undefined);
  assert.throws(() => validationOptions(['--format', 'guess']), /--format must/);
});
