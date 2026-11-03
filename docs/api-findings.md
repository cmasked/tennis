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
