import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailUrls, inspectPoints, inspectStatistics, inspectTimeline, validateLiveMatch } from '../src/validation.ts';
import { parseLiveEvents } from '../src/live-events.ts';
function discovery() { return { success: true, results: [{ id: '100', matchKey: '1-2-3-4', matchId: '9-8-7-6', participant1: 'Test A', participant2: 'Test B', league: 'Synthetic Paris', tourType: 'atp', status: 'InPlay', updatedAt: 1 }] }; }
function event() { return parseLiveEvents(discovery())[0]; }
function points() { return { success: true, meta: { player1: { name: 'Test A' }, player2: { name: 'Test B' } }, result: { score: '1-0', sets: [{ setNumber: 1, setScore: '', games: [{ gameNumber: 1, server: 1, tiebreak: false, finalScore: '1-0', fifteens_content: '15:0,30:0,40:0' }] }] } }; }
function statistics() { return { success: true, player1: { name: 'Test B' }, player2: { name: 'Test A' }, statistics: { ALL: { service: { aces: { player1: { value: 2 }, player2: { value: 1 } } } } } }; }
const timeline = { success: true, results: [{ id: '1', text: 'Synthetic game result' }] };
test('uses matchKey over deprecated matchId and event ID only for event routes', () => {
  const urls = detailUrls(event());
  assert.match(urls.points, /\/pbp\/1\/2\/3\/4$/);
  assert.match(urls.statistics, /\/get\/statistics\/100$/);
  assert.match(urls.timeline, /\/timeline\/100$/);
});
test('all-in-one validation makes exactly four requests and prints each result', async () => {
  const payloads = [discovery(), points(), statistics(), timeline]; const paths: string[] = []; const logs: string[] = [];
  const result = await validateLiveMatch('dummy', { tour: 'atp', tournament: 'PARIS' }, async url => { paths.push(String(url)); return new Response(JSON.stringify(payloads.shift())); }, s => logs.push(s));
  assert.deepEqual(result, { calls: 4, failures: 0, selected: true });
  assert.equal(paths.length, 4); assert.match(logs.join('\n'), /Games supplied: 1/); assert.match(logs.join('\n'), /Validated metrics: 1/); assert.match(logs.join('\n'), /Timeline entries supplied: 1/);
});
test('no matching match stops after one request without fallback', async () => {
  const result = await validateLiveMatch('dummy', { tournament: 'Not here' }, async () => new Response(JSON.stringify(discovery())));
  assert.deepEqual(result, { calls: 1, failures: 0, selected: false });
});
test('quota/access failures stop without fetching other detail endpoints', async () => {
  for (const status of [401, 403, 429]) {
    let count = 0;
    const result = await validateLiveMatch('dummy', {}, async () => ++count === 1 ? new Response(JSON.stringify(discovery())) : new Response('{}', { status }));
    assert.equal(count, 2); assert.equal(result.failures, 1);
  }
});
test('schema failure remains failed while independent detail checks continue', async () => {
  const payloads = [discovery(), { success: true }, statistics(), timeline];
  const result = await validateLiveMatch('dummy', {}, async () => new Response(JSON.stringify(payloads.shift())));
  assert.equal(result.failures, 1); assert.equal(result.calls, 4);
});
test('missing key causes no requests', async () => {
  let count = 0;
  await assert.rejects(validateLiveMatch(undefined, {}, async () => { count++; return new Response('{}'); }), /Set TENNIS_API_KEY/);
  assert.equal(count, 0);
});
test('point inspection validates required fields without treating records as complete points', () => {
  assert.match(inspectPoints(points(), event()), /nonempty comma-separated score entries: 3/);
  const value = points(); value.result.sets[0].games[0].server = 3;
  assert.throws(() => inspectPoints(value, event()), /server/);
  value.result.sets[0].games[0].server = 0; value.meta.player1.name = 'Someone else';
  assert.match(inspectPoints(value, event()), /WARNING: player names differ/);
});
test('reversed stats sides preserve identity and metric values', () => {
  const output = inspectStatistics(statistics(), event());
  assert.match(output, /names match discovery/); assert.match(output, /Response order: Test B \/ Test A/); assert.match(output, /aces: 2 \/ 1/);
});
test('empty history/statistics/timeline remain explicit and malformed metrics fail', () => {
  const p = points(); p.result.sets = [];
  assert.match(inspectPoints(p, event()), /Games supplied: 0/);
  const s = statistics(); s.statistics = {} as typeof s.statistics;
  assert.match(inspectStatistics(s, event()), /Validated metrics: 0/);
  assert.match(inspectTimeline({ success: true, results: [] }), /entries supplied: 0/);
  assert.throws(() => inspectStatistics({ ...statistics(), statistics: { ALL: { service: { aces: { player1: { value: 'bad' } } } } } }, event()), /value/);
});

test('unexpected statistics nesting emits safe diagnostics without an extra request', async () => {
  const payloads = [discovery(), points(), { success: true, results: [{ message: 'PRIVATE-VALUE', player1: null }] }, timeline];
  const logs: string[] = [];
  const result = await validateLiveMatch('dummy', {}, async () => new Response(JSON.stringify(payloads.shift())), s => logs.push(s));
  assert.equal(result.calls, 4); assert.equal(result.failures, 1);
  const output = logs.join('\n');
  assert.match(output, /STATISTICS: FAILED/);
  assert.match(output, /response.results\[0\].player1: null/);
  assert.doesNotMatch(output, /PRIVATE-VALUE/);
  assert.match(output, /TIMELINE CROSS-CHECK/);
});
