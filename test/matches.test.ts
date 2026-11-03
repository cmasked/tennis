import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUpcomingPage, formatUpcomingPage } from '../src/matches.ts';

// Entirely synthetic data, shaped like the response observed by the founder.
function sample() {
  return { total: 350, matches: [{ id: 101, matchId: 102, liveMatchId: 'synthetic-live-1',
    player1: { id: 1, name: 'Test Player A' }, player2: { id: 2, name: 'Test Player B' },
    tournament: { id: 3, name: 'Synthetic Open', country: 'TEST' },
    date: '2026-11-03T18:35:00.000Z', court: 'I.hard', odds: { ignored: true },
  }] };
}
test('normalizes observed fields without conflating identifiers or retaining extra stats', () => {
  const page = parseUpcomingPage(sample());
  assert.equal(page.total, 350);
  assert.equal(page.matches.length, 1);
  assert.equal(page.matches[0].id, 101);
  assert.equal(page.matches[0].matchId, 102);
  assert.equal(page.matches[0].scheduledAt, '2026-11-03T18:35:00.000Z');
  assert.equal('odds' in page.matches[0], false);
});
test('renders match names, tournament, IDs, and timezone-converted schedule', () => {
  const output = formatUpcomingPage(parseUpcomingPage(sample()), 'Asia/Kolkata');
  for (const expected of ['1 returned; 350 total', 'Test Player A vs Test Player B', 'Synthetic Open', 'I.hard', '4 Nov 2026', '00:05', 'Asia/Kolkata', 'Fixture ID: 101 | Match ID: 102', 'synthetic-live-1', 'not been verified']) {
    assert.ok(output.includes(expected), expected);
  }
});
test('handles empty pages without inventing matches', () => {
  assert.match(formatUpcomingPage(parseUpcomingPage({ total: 0, matches: [] }), 'UTC'), /No matches returned/);
});
test('missing optional schedule, live ID, and surface remain unknown', () => {
  const payload = sample();
  const match = payload.matches[0] as Record<string, unknown>;
  delete match.date; delete match.liveMatchId; match.court = null;
  const page = parseUpcomingPage(payload);
  assert.equal(page.matches[0].scheduledAt, null);
  assert.match(formatUpcomingPage(page, 'UTC'), /Scheduled: Not available/);
  assert.match(formatUpcomingPage(page, 'UTC'), /Live ID: Not available/);
});
test('rejects invalid required fields with safe field paths', () => {
  for (const field of ['id', 'matchId', 'player1', 'player2', 'tournament']) {
    const payload = sample();
    delete (payload.matches[0] as Record<string, unknown>)[field];
    assert.throws(() => parseUpcomingPage(payload), new RegExp(`matches\\[0\\].${field}`));
  }
  for (const value of [null, [], {}, { total: -1, matches: [] }, { total: 0, matches: {} }, { ...sample(), total: 0 }]) {
    assert.throws(() => parseUpcomingPage(value));
  }
});
test('rejects invalid names, identifiers and timestamps without echoing payload values', () => {
  for (const mutate of [
    (m: Record<string, unknown>) => { m.date = 'private-invalid-date'; },
    (m: Record<string, unknown>) => { m.id = '101'; },
    (m: Record<string, unknown>) => { m.player1 = { id: 1, name: '' }; },
    (m: Record<string, unknown>) => { m.tournament = { id: 3, name: ' ' }; },
  ]) {
    const payload = sample(); mutate(payload.matches[0]);
    assert.throws(() => parseUpcomingPage(payload), error => error instanceof Error && !error.message.includes('private-invalid-date'));
  }
});
test('provider control characters cannot inject terminal escape sequences', () => {
  const payload = sample(); payload.matches[0].player1.name = '\u001b[31mTest\nName';
  const output = formatUpcomingPage(parseUpcomingPage(payload), 'UTC');
  assert.equal(output.includes('\u001b'), false);
  assert.equal(output.includes('Test\nName'), false);
});
