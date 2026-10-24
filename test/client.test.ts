import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_HOST, FIXTURES_URL, fetchFixtures, parsePayload, summarize } from '../src/client.ts';

test('missing key makes no network request', async () => {
  let calls = 0;
  await assert.rejects(fetchFixtures(' ', async () => { calls++; throw new Error(); }), /Set TENNIS_API_KEY/);
  assert.equal(calls, 0);
});
test('sends credentials only in headers to the fixed provider endpoint', async () => {
  const result = await fetchFixtures('test-only-key', async (url, options) => {
    assert.equal(url, FIXTURES_URL);
    assert.equal(options?.redirect, 'error');
    assert.deepEqual(options?.headers, { 'X-RapidAPI-Key': 'test-only-key', 'X-RapidAPI-Host': API_HOST, Accept: 'application/json' });
    return new Response('[]');
  });
  assert.deepEqual(result, []);
  assert.match(summarize(result), /empty result/);
});
for (const status of [401, 403, 429, 500]) {
  test(`HTTP ${status} reports safe errors without retrying or exposing body`, async () => {
    let calls = 0;
    await assert.rejects(fetchFixtures('test-only-key', async () => {
      calls++; return new Response('sensitive-body', { status });
    }), error => error instanceof Error && error.message.includes(`HTTP ${status}`) && !error.message.includes('sensitive-body'));
    assert.equal(calls, 1);
  });
}
test('network errors do not expose underlying request details', async () => {
  await assert.rejects(fetchFixtures('test-only-key', async () => { throw new Error('test-only-key'); }), /Request failed or timed out/);
});
test('rejects malformed payloads and explicit provider error envelopes', () => {
  for (const body of ['<html>', 'null', '42', '{"error":"private"}', '{"success":false}']) {
    assert.throws(() => parsePayload(body));
  }
  assert.deepEqual(parsePayload('{"data":[]}'), { data: [] });
});
