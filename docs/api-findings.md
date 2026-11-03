# Matchstat API findings

## Confirmed by a user-run request

The founder successfully requested:

`GET /tennis/v2/upcoming/matches/atp?limit=10&autoPost=false&include=all&includeAll=false&page=1`

Host: `tennis-api-atp-wta-itf.p.rapidapi.com`. Authentication is server-side
`X-RapidAPI-Key` plus `X-RapidAPI-Host`. Credentials are not recorded here.
The previous `/tennis/v2/atp/fixtures` route was replaced with the route shown
in RapidAPI's current console. Earlier 403 failures later cleared; their exact
cause was not established.

Observed JSON includes `total` and `matches`. The sample reported total 350;
the subsequent CLI output reported an array length of 10. Total is not the
number of rows returned on the page. Neither value establishes current coverage.

Observed match fields:

| Field | Observed shape | Use |
| --- | --- | --- |
| `id`, `matchId` | Integer | Keep separately; equality in one row does not establish equivalence |
| `liveMatchId` | String | Distinct live identifier, not interchangeable with fixture IDs |
| `player1`, `player2` | Objects with integer `id` and string `name` | Display participants |
| `tournament` | Object with integer `id` and string `name` | Display tournament |
| `date` | ISO timestamp with UTC suffix | Scheduled time, converted to viewer's local timezone |
| `court` | String, observed `I.hard` | Display provider label without guessing mappings |
| `links.match`, `links.live` | Relative URLs with `type` and `source` query parameters | Candidate documented lookup routes; not yet exercised |

The adapter validates the required fields above and ignores additional fields.
Missing/null schedule, surface, and live ID are represented as unknown. Wrong
types or invalid timestamp syntax fail with a field path, never raw response data.
The `tournament.date` field is not used as the match start time. Match schedules
can change; a returned timestamp is not proof that the match is still upcoming.

The pasted response also contained odds, h2h summaries, and predictions. These
are not live match statistics, are not validated, and are not part of this slice.
The pasted JSON was truncated by the diagnostic output limit; that is not evidence
that the provider returned malformed JSON. Other top-level fields remain unverified.

## Still unresolved

- Actual live score, server, point-by-point routes and payload completeness.
- Event timestamps, ordering, corrections, duplicates, gaps and recovery.
- Freshness/latency, coverage and tournament-specific scoring formats.
- Nullability and field variation across other matches and doubles.
- Pagination behavior beyond this observed first page.
- Commercial display, redistribution, caching and point-history retention rights.

Do not infer shot types, rally duration or match outcomes from fixtures or odds.
Next: confirm the provider reference and use a returned live lookup link for one
suitable match, respecting request limits. Do not automatically follow those links
or fetch additional pages in the fixtures command.

## Validation and quota

Tests use entirely synthetic match data, not retained provider responses.
`npm test` and `npm run typecheck` make no tennis API requests.
`npm run api:fixtures` makes one request with no retries or pagination.
No API requests were made while implementing the validated fixture list.
Real response recording remains opt-in (`--save`) and subject to retention terms.

## Live-lookup inspector implementation

`npm run api:live -- <numeric-match-id>` now performs one ATP lookup using the
exact path/query pattern observed in `links.live`. It uses the fixture's numeric
`matchId`, preserving `type=atp&source=today`, not the compound `liveMatchId`.
This observed template has not yet been independently tested against a live
response. The command does not claim that every upcoming fixture is available
in the `today` source. It prints redacted JSON for schema discovery, with explicit
truncation and uncertainty notices, and never automatically follows a mapping.
No live scoring, server, statistics or point-history fields are assumed.
The inspector tests use synthetic JSON; no provider requests were made during
implementation. A real user-run lookup is the next validation step.

## Live-event discovery command

`npm run api:live-list` now requests
`/tennis/v2/extend/api/events/live` once, using the endpoint listed in the supplied
project provider reference. The response schema and availability on the user's
plan have not yet been independently observed. Output is redacted JSON with a
16000-character display limit, not a guessed interpretation of live event fields.
Synthetic tests confirm one request, no retries or automatic follow-ups, safe
credential handling, and explicit uncertainty for empty results.

Use this before choosing a match to inspect. A scheduled fixture or old example
ID does not establish that a match is currently live. The next user-run response
will establish the actual event structure and the appropriate identifier/lookup
route. Do not assume live-event IDs work with the ATP fixture mapping command.
No provider requests were made while adding this command.

## Observed live-event response and readable adapter

The founder's successful `api:live-list` output established an envelope of
`success: true` and `results: [...]`, with ATP and WTA events across tour tiers.
The redacted terminal output was truncated by our old display limit; no complete
feed count can be established from that excerpt.

| Observed field | Shape | Interpretation / limits |
| --- | --- | --- |
| `id` | String | Live event identifier; not the numeric ATP fixture ID |
| `matchId` | Compound string | Distinct identifier, retained without interpreting its components |
| `participant1`, `participant2` | Strings | Player display names |
| `league`, `tourType` | Strings | Tournament label and tour dataset |
| `status` | String, observed `InPlay` | Provider claim, not independent confirmation of current play |
| `score` | String or null | Raw reported score, not yet parsed into tennis state |
| `points` | String or null | Current game score such as `30-40`, not a point history |
| `indicator` | String or null | Meaning unverified; not mapped to a server |
| `updatedAt` | Integer, millisecond-scale | Displayed as epoch milliseconds; upstream timing semantics unverified |
| `startTimestamp` | Integer, second-scale | Observed but not used as a freshness timestamp |

`src/live-events.ts` validates the observed envelope and required display fields,
keeps nullable scores/identifiers explicit, ignores extra fields, and separates
live identifiers from fixture identifiers. `api:live-list` now prints the full
readable list by default; optional tour/tournament filtering happens locally.
`--raw` retains the old redacted JSON inspection mode without extra requests
within that invocation. The broad raw credential redactor also hid `matchKey`;
we do not treat its redacted value as evidence of a missing provider field.

Fetch time and provider update time are displayed separately. A >120s difference
is labeled potentially stale, explicitly as a heuristic; it is not a measured
provider latency guarantee. Future timestamps are flagged. Provider status is
preserved even if it differs from InPlay. Snapshot output never implies polling.

Point-history discovery remains blocked: an attempt to read the official
`https://docs.tennis-api.com/getting-started` reference received HTTP 403 from the
cloud CONNECT proxy on this setup. This is documentation-access evidence, not a
tennis API permission failure. No point-history endpoint was guessed or called.
We need accessible official documentation or its exact route/parameters before
adding that request. No provider API quota was consumed during this update.

## Supplied provider reference: point history and supporting feeds

The founder supplied endpoint reference text defining these routes:

- `/tennis/v2/extend/api/event/pbp/{player1Id}/{player2Id}/{tournamentId}/{roundId}`
- `/tennis/v2/extend/api/event/get/statistics/{eventId}`
- `/tennis/v2/extend/api/event/timeline/{eventId}`

This supplies the route information previously blocked by cloud documentation
access. It is documentation evidence; real detail responses remain unverified.
The compound `matchKey` provides the four PBP identifiers. `matchId` is documented
as a deprecated alias scheduled for removal on 3 December 2026; prefer matchKey.
The numeric-looking live `id` is used for statistics/timeline, not the fixture ID.

Point history is documented as `meta` plus `result.sets[].games[]`, with server
0/1/2, tiebreak boolean, game number, final score and `fifteens_content` strings.
The latter contains comma-separated score records, BP markers and tiebreak
serving markers; complete grammar, terminal-point encoding, completeness and
corrections still need real-data validation. Server 1/2 refers to returned PBP
player order. Do not apply that meaning to the discovery feed's indicator.

Statistics are documented by period/category/metric/player, with numeric value
and optional total/percentage. They may contain whole-match totals only.
Timeline supplies ordered text rows, not structured authoritative hold/break
facts reconstructed by our own engine. Coverage/retention can vary.

`api:validate` now requests all three for one selected provider InPlay event,
preceded by one discovery call. Synthetic tests cover exact request accounting,
identifier routing, preferred matchKey, null/no-match behavior, player-order
preservation, malformed schemas and early termination on HTTP 401/403/429.
It reports samples and whole-response counts but does not persist real provider
data or claim engine readiness. No API quota was spent in implementation.

Scoring rules must remain explicit: Grand Slam men's main-draw singles are
best-of-five; women's singles are best-of-three. Tournament label alone is not
enough to infer format across qualifying, doubles and special competitions.

## First combined user-run validation

A user-run match returned PBP player names consistent with discovery, three
sets, 19 game records, and 112 comma-separated score entries. Timeline returned
18 rows. This is evidence of accessible PBP/timeline coverage for that match,
not a general coverage guarantee. The final game's contents were not shown in
the provided excerpt; an ongoing nineteenth game remains a hypothesis.

Completed games in the supplied output ended their sequences at nonterminal
scores such as 40:15 while finalScore advanced. This supports an omitted-finishing-
point encoding hypothesis. The scoring foundation now labels a finishing point
as reconstructed only if a valid recorded sequence plus game-score winner permits
exactly that winner to finish on the next point. It never fills arbitrary gaps.
Ordinary game deuce/advantage scoring and computed break-point saves are tested;
tiebreak reconstruction remains explicitly deferred pending format/examples.

Statistics failed at the expected top-level player1 path. This does not establish
that statistics are unavailable: the actual response shape was not previously
printed. The validator now emits a bounded schema tree on parsing failures with
field names/types but no scalar values, preserving the failure status.

Timeline cross-checks support the observed "Game N - Name - holds/breaks to X"
wording, reporting mismatches and unsupported rows without overriding scoring.
These are consistency checks with limited alignment assumptions, not evidence
of live freshness or complete scoring history. Documentation licensing questions,
correction handling across snapshots, tiebreaks and match-format selection remain
open before a reliable production engine can be claimed.

## Offline engine foundation

The provider adapter is now separated from the domain engine. The live validator
reuses `adaptMatchstatPoints`; the standalone replay consumes synthetic domain
snapshots and makes zero API requests. No raw responses were retained.

Structured moments carry stable IDs, game position, confidence and evidence
basis. Snapshot reconciliation exposes additions, updates and retractions rather
than repeatedly appending commentary. Duplicate game records withhold moments
for the affected game. This is not durable deduplication or an ingestion ordering
guarantee. See offline-replay.md for tested scenarios and deferred capabilities.
