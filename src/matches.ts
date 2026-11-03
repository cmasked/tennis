// Provider adapter for the fields observed in the upcoming-matches response.
// Extra provider fields are deliberately ignored; this is not a live-score model.
export interface UpcomingMatch {
  id: number;
  matchId: number;
  liveMatchId: string | null;
  player1: { id: number; name: string };
  player2: { id: number; name: string };
  tournament: { id: number; name: string };
  scheduledAt: string | null;
  surface: string | null;
}
export interface UpcomingPage { total: number; matches: UpcomingMatch[] }

function invalid(path: string): never {
  // Report field paths only, never untrusted payload contents.
  throw new Error(`Invalid upcoming-match response at ${path}. Expected schema is based on observed fields.`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(path);
  return value as Record<string, unknown>;
}
function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid(path);
  return value;
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) return invalid(path);
  return value.trim();
}
function optionalText(value: unknown, path: string): string | null {
  return value === undefined || value === null ? null : text(value, path);
}
function player(value: unknown, path: string) {
  const item = object(value, path);
  return { id: integer(item.id, `${path}.id`), name: text(item.name, `${path}.name`) };
}
export function parseUpcomingPage(value: unknown): UpcomingPage {
  const root = object(value, 'response');
  const total = integer(root.total, 'total');
  if (!Array.isArray(root.matches)) return invalid('matches');
  const matches = root.matches.map((value, index): UpcomingMatch => {
    const path = `matches[${index}]`;
    const item = object(value, path);
    const tournament = object(item.tournament, `${path}.tournament`);
    const scheduledAt = optionalText(item.date, `${path}.date`);
    if (scheduledAt !== null && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(scheduledAt) || !Number.isFinite(Date.parse(scheduledAt)))) {
      return invalid(`${path}.date`);
    }
    return {
      id: integer(item.id, `${path}.id`),
      matchId: integer(item.matchId, `${path}.matchId`),
      liveMatchId: optionalText(item.liveMatchId, `${path}.liveMatchId`),
      player1: player(item.player1, `${path}.player1`),
      player2: player(item.player2, `${path}.player2`),
      tournament: { id: integer(tournament.id, `${path}.tournament.id`), name: text(tournament.name, `${path}.tournament.name`) },
      scheduledAt,
      surface: optionalText(item.court, `${path}.court`),
    };
  });
  if (total < matches.length) return invalid('total');
  return { total, matches };
}

export function formatUpcomingPage(page: UpcomingPage, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone });
  // Strip control characters from provider text before printing to a terminal.
  const safe = (value: string) => value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
  const lines = [`Upcoming ATP matches: ${page.matches.length} returned; ${page.total} total reported.`, `Scheduled times shown in ${timeZone}; schedule freshness is not verified.`];
  if (!page.matches.length) lines.push('No matches returned on this page.');
  page.matches.forEach((match, index) => {
    lines.push('', `${index + 1}. ${safe(match.player1.name)} vs ${safe(match.player2.name)}`,
      `   Tournament: ${safe(match.tournament.name)} | Surface: ${safe(match.surface ?? 'Unknown')}`,
      `   Scheduled: ${match.scheduledAt ? dateFormat.format(new Date(match.scheduledAt)) : 'Not available'}`,
      `   Fixture ID: ${match.id} | Match ID: ${match.matchId} | Live ID: ${safe(match.liveMatchId ?? 'Not available')}`);
  });
  lines.push('', 'Upcoming fixtures only: live scores and point-by-point statistics have not been verified.');
  return lines.join('\n');
}
