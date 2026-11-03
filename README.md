# Visual Tennis Companion — first data integration

A small backend-only TypeScript tool to test a Matchstat RapidAPI key against
`GET https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/upcoming/matches/atp?limit=10&autoPost=false&include=all&includeAll=false&page=1`.
No mobile app or match engine yet.

## Requirements and installation

Node.js 24.10+ (Node 24 LTS recommended), npm, and an active RapidAPI subscription
to Matchstat Tennis API — ATP WTA ITF. A valid RapidAPI key alone may not grant
access to this particular API. Use the free plan for this experiment.

```sh
cd tennis
npm ci
cp -n .env.example .env
```

Edit `.env` privately and set `TENNIS_API_KEY`. Do not paste the key in chat,
commit it, or put it in frontend code. Alternatively inject this environment
variable using your environment's secure settings. For a proxy-backed binding,
allow the destination `tennis-api-atp-wta-itf.p.rapidapi.com`.

On Windows, run from your clone (for example `D:\tennis\tennis`). If `.env`
already exists, keep it; otherwise copy `.env.example` to `.env`.

## Test your key

```sh
npm run api:fixtures
```

Each invocation makes **one request**, with a 20-second timeout and no retries.
It validates `total`, `matches`, participant and tournament fields, identifiers,
and scheduled timestamps. It prints a readable match list with times in your
computer's timezone, not the key, headers, or raw provider body. Unknown schedules
and optional fields are labeled explicitly. This does not validate live scores,
point-by-point coverage, latency, licensing, or all fixture fields.

Optional: after confirming provider retention terms permit local development
storage, save a redacted response for schema inspection:

```sh
npm run api:fixtures -- --save
```

Responses go into Git-ignored `local-data/`. Redaction removes credential-like
fields and the supplied key; inspect any recorded data before sharing it.
An empty `matches` array is reported as an empty page. Malformed required fields
fail with a field path (for example `matches[0].player1.name`). Extra provider
fields are ignored. No additional pages or live links are fetched automatically.

## Troubleshooting

- Missing key: set `TENNIS_API_KEY` in `.env` or the process environment.
- HTTP 401/403: check the key, subscription to this API, and environment access policy.
- HTTP 429: stop and check your quota; there are no automatic retries.
- HTTP 5xx: provider error; check service status before trying again.
- Network failure: check connectivity and allow the API host in environment settings.
- Invalid JSON or error envelope: the command fails rather than treating it as fixtures.

The command respects inherited HTTP/HTTPS proxy settings and TLS verification.
It refuses redirects so authentication headers stay on the fixed API host.

## Development checks

```sh
npm test
npm run typecheck
```

Tests use synthetic HTTP responses and spend no API quota. They cover credential
headers, missing configuration, empty results, malformed JSON, provider errors,
rate limits, and network failures. They are not recorded tennis data.

`src/client.ts` handles HTTP and JSON envelope validation.
`src/matches.ts` validates observed fixture fields and formats the match list.
`src/fixtures.ts` loads configuration, runs the adapter, and optionally saves data.
See [API findings](docs/api-findings.md) for confirmed fields and open questions.
The tests include synthetic match parsing, invalid fields, missing optional data,
and timezone conversion; none consume API quota.

## Inspect one ATP live lookup

Use the numeric **Match ID** from the fixture list (not the compound Live ID):

```powershell
git pull origin main
npm run api:live -- 1389644
```

The number above is from an earlier user-run fixture list, not a guarantee that
this match is currently live or still available through the `source=today`
lookup. Prefer a match scheduled around the time you test. This command makes
exactly one request to the observed link pattern
`/tennis/v2/matches/{matchId}/live?type=atp&source=today`.
It does not first fetch fixtures, poll, retry, or follow additional links.

The command prints redacted provider JSON, capped at 16000 characters. Review
it before sharing. It checks the JSON envelope but does not yet validate or
interpret the unknown live schema. A successful lookup may contain a mapping
rather than scores; missing/empty data does not establish lack of API coverage.
We will inspect actual fields before implementing score or point-history parsing.
An invalid ID or missing key fails without an API request. This inspector does
not save provider data to disk. The same backend-only key from `.env` is used.
