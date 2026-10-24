export const API_HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';
export const FIXTURES_URL = `https://${API_HOST}/tennis/v2/atp/fixtures`;

// Only validate the envelope until a real payload establishes the provider schema.
// No player, fixture, or match ID fields are assumed here.
export function parsePayload(text: string): Record<string, unknown> | unknown[] {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('Provider returned invalid JSON. Response body was not logged.'); }
  if (value === null || typeof value !== 'object') {
    throw new Error('Expected a JSON object or array. Provider schema is not yet verified.');
  }
  const object = value as Record<string, unknown>;
  if (!Array.isArray(value) && ('error' in object || 'errors' in object || object.success === false)) {
    throw new Error('Provider returned an error envelope. Response body was not logged.');
  }
  return value as Record<string, unknown> | unknown[];
}

export async function fetchFixtures(key: string | undefined, request: typeof fetch = fetch) {
  if (!key?.trim()) throw new Error('Set TENNIS_API_KEY in .env or your shell before running this command.');
  let response: Response;
  try {
    response = await request(FIXTURES_URL, {
      headers: { 'X-RapidAPI-Key': key.trim(), 'X-RapidAPI-Host': API_HOST, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    });
  } catch {
    throw new Error('Request failed or timed out. Check connectivity, proxy policy, and API host. No automatic retry was made.');
  }
  if (!response.ok) {
    const explanation = response.status === 401 || response.status === 403
      ? 'Check the key, RapidAPI subscription to this API, and environment network permissions.'
      : response.status === 429
        ? 'Rate limit or quota reached. Wait and check your RapidAPI usage before retrying.'
        : 'Provider request failed. Try again later after checking provider status.';
    throw new Error(`HTTP ${response.status}. ${explanation}`);
  }
  return parsePayload(await response.text());
}

export function summarize(payload: Record<string, unknown> | unknown[]): string {
  if (Array.isArray(payload)) return `Top-level array: ${payload.length} items${payload.length === 0 ? ' (empty result)' : ''}.`;
  const arrays = Object.entries(payload).filter(([, value]) => Array.isArray(value));
  return `JSON object with ${Object.keys(payload).length} top-level fields.` +
    (arrays.length ? ` Top-level array lengths: ${arrays.map(([, value]) => (value as unknown[]).length).join(', ')}.` : '') +
    ' Fixture schema and match availability still require inspection.';
}
