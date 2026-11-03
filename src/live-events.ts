// Adapter for the live-event fields observed in the user's successful response.
export interface LiveEvent {
  eventId: string;
  matchId: string | null;
  player1: string;
  player2: string;
  tournament: string;
  tour: string;
  status: string;
  score: string | null;
  points: string | null;
  indicator: string | null;
  updatedAt: number | null;
}
function invalid(path: string): never {
  throw new Error(`Invalid live-events response at ${path}. No raw field values were logged.`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(path);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) return invalid(path);
  return value.trim();
}
function optionalText(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : text(value, path);
}
export function parseLiveEvents(value: unknown): LiveEvent[] {
  const root = object(value, 'response');
  if (root.success !== true) return invalid('success');
  if (!Array.isArray(root.results)) return invalid('results');
  return root.results.map((value, index) => {
    const path = `results[${index}]`;
    const item = object(value, path);
    const updatedAt = item.updatedAt === undefined ? null : item.updatedAt;
    if (updatedAt !== null && (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt) || updatedAt < 0 || !Number.isFinite(new Date(updatedAt).getTime()))) return invalid(`${path}.updatedAt`);
    return {
      eventId: text(item.id, `${path}.id`),
      matchId: optionalText(item.matchId, `${path}.matchId`),
      player1: text(item.participant1, `${path}.participant1`),
      player2: text(item.participant2, `${path}.participant2`),
      tournament: text(item.league, `${path}.league`),
      tour: text(item.tourType, `${path}.tourType`),
      status: text(item.status, `${path}.status`),
      score: optionalText(item.score, `${path}.score`),
      points: optionalText(item.points, `${path}.points`),
      indicator: optionalText(item.indicator, `${path}.indicator`),
      updatedAt: updatedAt as number | null,
    };
  });
}
export interface LiveFilters { tour?: 'atp' | 'wta'; tournament?: string }
export function parseLiveOptions(args: string[]): LiveFilters & { raw: boolean } {
  const options: LiveFilters & { raw: boolean } = { raw: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--raw') options.raw = true;
    else if (arg === '--tour') {
      const value = args[++index];
      if (value !== 'atp' && value !== 'wta') throw new Error('--tour must be atp or wta.');
      options.tour = value;
    } else if (arg === '--tournament') {
      const value = args[++index];
      if (!value?.trim() || value.startsWith('--')) throw new Error('--tournament requires a name.');
      options.tournament = value.trim();
    } else throw new Error('Usage: npm run api:live-list -- [--tour atp|wta] [--tournament "Paris"] [--raw]');
  }
  return options;
}
export function formatLiveEvents(events: LiveEvent[], options: LiveFilters = {}, now = Date.now(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const selected = events.filter(event => (!options.tour || event.tour === options.tour) && (!options.tournament || event.tournament.toLowerCase().includes(options.tournament.toLowerCase())));
  const safe = (value: string) => value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
  const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone });
  const lines = [`Live-feed snapshot: ${selected.length} shown / ${events.length} returned.`, `Fetched: ${date.format(new Date(now))} (${timeZone}). Filters are local; one request only.`];
  if (!events.length) lines.push('Provider returned no events. This does not establish that no tennis is being played.');
  else if (!selected.length) lines.push('No events match your filters. Other events were returned.');
  selected.forEach((event, index) => {
    const age = event.updatedAt === null ? null : Math.floor((now - event.updatedAt) / 1000);
    const freshness = age === null ? 'Update time unavailable'
      : age < -60 ? 'Provider timestamp is ahead of this computer; check clocks/semantics'
      : age > 120 ? `Potentially stale: timestamp ${age}s before fetch (heuristic, not a provider guarantee)`
      : `Timestamp ${Math.max(0, age)}s before fetch; delivery latency not verified`;
    lines.push('', `${index + 1}. ${safe(event.player1)} vs ${safe(event.player2)}`,
      `   ${safe(event.tournament)} | ${safe(event.tour.toUpperCase())} | Provider status: ${safe(event.status)}`,
      `   Reported score: ${safe(event.score ?? 'Unavailable')} | Current game points: ${safe(event.points ?? 'Unavailable')}`,
      `   Event ID: ${safe(event.eventId)} | Compound match ID: ${safe(event.matchId ?? 'Unavailable')}`,
      `   Provider updatedAt: ${event.updatedAt === null ? 'Unavailable' : date.format(new Date(event.updatedAt))}`,
      `   ${freshness}`);
  });
  lines.push('', 'Snapshot only; no polling. Provider InPlay status is not independent confirmation of current play.',
    'Current game points are not point-by-point history. Server indicator meaning remains unverified.',
    'These event/compound IDs are not fixture Match IDs for api:live. No match lookups were made.');
  return lines.join('\n');
}
