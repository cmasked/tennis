import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLiveEvents, formatLiveInspection } from '../src/live-inspector.ts';

test('live discovery queries the live-events route exactly once without following events', async () => {
  let calls = 0;
  // Synthetic envelope only: this is not a claim about the provider schema.
  const data = { syntheticEvents: [{ id: 'live-id-not-fixture-id', link: '/do-not-follow' }] };
  const result = await fetchLiveEvents('test-only-key', async (url, options) => {
    calls++;
    assert.equal(url, 'https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/extend/api/events/live');
    assert.equal(options?.redirect, 'error');
    assert.equal((options?.headers as Record<string, string>)['X-RapidAPI-Key'], 'test-only-key');
    return new Response(JSON.stringify(data));
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, data);
  const output = formatLiveInspection(result, 'test-only-key', 'list');
  assert.match(output, /Live-events request succeeded/);
  assert.match(output, /event schema is not yet verified/);
  assert.match(output, /live-id-not-fixture-id/);
  assert.match(output, /Do not pass an arbitrary event ID/);
  assert.doesNotMatch(output, /ATP live lookup succeeded/);
});
test('discovery with missing credentials makes no requests', async () => {
  let calls = 0;
  await assert.rejects(fetchLiveEvents(undefined, async () => { calls++; return new Response('{}'); }), /Set TENNIS_API_KEY/);
  assert.equal(calls, 0);
});
test('empty live response is shown without inventing active matches', async () => {
  const data = await fetchLiveEvents('test-only-key', async () => new Response('[]'));
  const output = formatLiveInspection(data, 'test-only-key', 'list');
  assert.match(output, /\[\]/);
  assert.doesNotMatch(output, /currently playing/);
});
test('discovery rate limit is reported without retrying', async () => {
  let calls = 0;
  await assert.rejects(fetchLiveEvents('test-only-key', async () => { calls++; return new Response('private', { status: 429 }); }), /HTTP 429/);
  assert.equal(calls, 1);
});
test('list output uses credential redaction too', () => {
  const output = formatLiveInspection({ apiKey: 'private', name: 'test-only-key' }, 'test-only-key', 'list');
  assert.doesNotMatch(output, /private|test-only-key/);
  assert.match(output, /REDACTED/);
});
