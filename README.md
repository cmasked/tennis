# Visual Tennis Companion — first data integration

A small backend-only TypeScript tool to test a Matchstat RapidAPI key against
`GET https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/atp/fixtures`.
No mobile app or match engine yet.

## Requirements and installation

Node.js 24.10+ (Node 24 LTS recommended), npm, and an active RapidAPI subscription
to Matchstat Tennis API — ATP WTA ITF. A valid RapidAPI key alone may not grant
access to this particular API. Use the free plan for this experiment.

```sh
cd /workspace/tennis
npm ci --cache /workspace/.npm-cache
cp -n .env.example .env
```

Edit `.env` privately and set `TENNIS_API_KEY`. Do not paste the key in chat,
commit it, or put it in frontend code. Alternatively inject this environment
variable using your environment's secure settings. For a proxy-backed binding,
allow the destination `tennis-api-atp-wta-itf.p.rapidapi.com`.

## Test your key

```sh
npm run api:fixtures
```

Each invocation makes **one request**, with a 20-second timeout and no retries.
It prints a response summary, not the key, headers, or raw provider body. A success
means this endpoint returned acceptable JSON; it does not validate point-by-point
coverage, latency, licensing, or all fixture fields.

Optional: after confirming provider retention terms permit local development
storage, save a redacted response for schema inspection:

```sh
npm run api:fixtures -- --save
```

Responses go into Git-ignored `local-data/`. Redaction removes credential-like
fields and the supplied key; inspect any recorded data before sharing it.
An empty array is reported as empty, not an authentication failure. Object
payloads need inspection to identify where fixtures live; no undocumented
player, date, or match-ID fields are assumed.

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

`src/client.ts` handles the HTTP request and minimal envelope validation.
`src/fixtures.ts` loads configuration, prints a summary, and optionally saves data.
After a real response is available, document its observed fields and strengthen
the schema before implementing normalization or the match engine.
