# Visual Tennis Companion — first data integration

A small backend-only TypeScript tool to test a Matchstat RapidAPI key against
`GET https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/upcoming/matches/atp?limit=10&autoPost=false&include=all&includeAll=false&page=1`.
No mobile app or match engine yet.

## Offline engine replay — no API requests

```powershell
cd D:\tennis\tennis
git pull origin main
npm test
npm run typecheck
npm run replay
```

Replay uses clearly labeled synthetic snapshots and requires no key. It shows
holds, breaks, saved break points, duplicate suppression, corrections/retractions,
and explicit uncertainty. Additional scenarios demonstrate explicit best-of-three/
five formats, set/match points, saved pressure points, and seven/ten-point
tiebreak rules with service rotation. These canonical point-winner scenarios
do not claim that provider tiebreak strings are already supported.
See [the offline review guide](docs/offline-replay.md)
for expected output, important files, and current limitations. You do not need
to run any `api:*` command to review this increment.

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

## Discover currently live matches first

```powershell
cd D:\tennis\tennis
git pull origin main
npm run api:live-list
```

Only the final command calls the tennis API: **one request, no retries** to
`/tennis/v2/extend/api/events/live`. It prints a validated, readable snapshot with
participants, tournament, tour, provider status, reported score, current game
points, event ID, compound match ID, and provider update time. It does not fetch
upcoming fixtures, inspect individual matches, poll, follow links, or save data.

Optional local filters (each invocation still makes one request):

```powershell
npm run api:live-list -- --tour atp --tournament Paris
```

Use **one** list command per check, not all examples in sequence. Filters are
applied after fetching the feed; they do not reduce or increase request count.
Times use your computer's timezone. Missing scores/points are explicitly marked
unavailable. Events whose `updatedAt` is over 120 seconds before fetch are marked
potentially stale; this is a heuristic, not a proven latency measurement. Unknown
provider status strings are displayed rather than silently treated as InPlay.

To inspect raw redacted JSON instead of the readable list, use `--raw`. This is
an alternative command, not a second step; it makes another request if run again.
Raw output is capped at 16000 characters; the readable list is not subject to
that JSON display cap. Local filters do not apply in raw mode.

Current game points are not point-by-point history. Server indicator semantics
are unverified. Event IDs and compound match IDs are not fixture IDs; don't feed
them into `api:live`. We still need a verified documented point-history route.

## Inspect one ATP live lookup

This is a separate fixture-to-live mapping tool, not a live-event discovery
command. Use it only when you need a specific fixture lookup. Use the numeric
**Match ID** from the fixture list (not a live-event ID or compound Live ID):

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

## Validate discovery, point history, statistics and timeline together

```powershell
cd D:\tennis\tennis
git pull origin main
npm run api:validate -- --tour atp
```

**At most four API requests per invocation**: one live discovery, then three
detail requests for one provider-reported InPlay event. The tool prefers the most
recent provider update timestamp among matching events with usable identifiers.
Add `--tournament Paris` to restrict selection; it never falls back to a different
tournament. If no matching event is found, it stops after one request. Missing
credentials fail before any request. Access/quota errors stop remaining detail
requests. There are no retries, polling, additional pages or disk recordings.

It reports documented-schema checks, response player ordering/name agreement,
raw per-game point score sequences (first sample games), game/sequence counts,
statistics metrics (sample), and the last 12 timeline texts. Counts cover the
entire fetched payload even when displayed examples are limited. This is an
inspection command: comma-separated score entries are not yet interpreted as
complete points or used to announce tennis events. Gaps and partial coverage
remain possible. Empty sections are shown as zero, not hidden as successful
coverage. Schema failures mark the run failed while independent sections are
still checked; compare the output before deciding whether this provider meets
our engine's requirements. No credentials or raw response files are saved.

### Scoring analysis in the combined validator

`api:validate` also analyzes ordinary advantage games using the returned point
sequences and game-score progression. It reports holds/breaks where the game
winner and server are known, verified adjacent score transitions, break points
saved within the verified prefix, BP marker disagreements, and possible omitted
finishing points. A terminal point is labeled `reconstructed` only when the game
result supplies a winner and exactly one legal next point for that winner would
finish the game. It is never labeled as a directly observed feed point.

After gaps, duplicate scores, corrections or unsupported notation, further point
attribution is withheld. Game-score gaps prevent winner attribution. Tiebreak
point reconstruction is explicitly deferred; no default tiebreak format is
assumed. This is a scoring foundation, not a complete live engine.

Supported timeline hold/break text is cross-checked against derived game results.
Disagreements and unrecognized text remain visible; timeline text is not used to
silently override point history. Histories with game-order gaps withhold alignment.

If statistics (or another detail response) fails schema validation, the command
prints a bounded field/type tree without scalar values. This allows us to debug
response nesting without saving raw data or spending additional requests. Such
checks still count as failed. The request budget remains at most four.

Offline verification consumes no tennis API quota:

```powershell
npm test
npm run typecheck
```
