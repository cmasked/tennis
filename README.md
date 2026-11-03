# Visual Tennis Companion

A tennis-data and scoring foundation for a visual-first mobile companion.
The goal is to help fans understand a match when they cannot watch it.
The mobile product is not built yet. This repository currently provides:

- Provider adapters and quota-explicit API inspection commands.
- A tested tennis scoring engine and factual match moments.
- Synthetic offline replays, including corrections and incomplete data.
- A **frontend-ready development feed**: HTTP snapshots, SSE updates, reconnect
  recovery, and a browser diagnostic client.

**The development server is synthetic-only. Starting it does not call RapidAPI.**
The provider-facing commands are separate and opt-in. The feed transport has been
validated offline; continuous real-provider ingestion is not implemented.

## 1. Install and run on your PC

Use **Node.js 24 LTS** and npm. No database, Docker, paid subscription, or API key
is required for offline development. We use Node's built-in TypeScript stripping;
`tsc --noEmit` separately checks types. The compiler's `erasableSyntaxOnly` setting
rejects syntax that Node cannot execute directly.

First clone:

```powershell
git clone https://github.com/cmasked/tennis.git
cd tennis
npm ci
```

For your existing checkout:

```powershell
cd D:\tennis\tennis
git pull origin main
npm ci
```

`npm ci` installs the exact lockfile dependencies. It contacts the package registry,
not the tennis API. There are no runtime third-party dependencies in this slice. Prettier is a pinned
development dependency for readable formatting. `npm run format` reformats the
source/docs; `npm run format:check` checks formatting without editing files.
The cloud checkout is `/workspace/tennis`; it is not a path on your Windows PC.

## 2. Verify everything without spending API quota

```powershell
npm test
npm run typecheck
npm run format:check
npm run feed:check
npm run replay
```

| Command              | What it checks                                                                  | Tennis API requests |
| -------------------- | ------------------------------------------------------------------------------- | ------------------- |
| `npm test`           | Rules, adapters, corrections, transport and real loopback HTTP/SSE tests        | 0                   |
| `npm run typecheck`  | TypeScript contracts and erasable syntax                                        | 0                   |
| `npm run feed:check` | Starts its own temporary server; verifies delivery/reconnect/recovery; stops it | 0                   |
| `npm run replay`     | Prints synthetic scoring and match-story scenarios                              | 0                   |
| `npm run dev`        | Starts the manual diagnostic server                                             | 0                   |

Tests use synthetic data. The feed integration check forbids non-loopback fetches,
and the replay integration test forbids fetch entirely. You do not need to paste
all passing output after each change; share failures or confusing behavior.

## 3. Inspect the frontend feed in a browser

```powershell
npm run dev
```

Open the address printed by the server (`http://127.0.0.1:3000`). Leave that
terminal running. This page is a developer inspector, **not the product design**.
It shows the current JSON snapshot and recent events using safe text rendering.

Use **Next synthetic snapshot** to walk through these cases:

1. Initially Alex holds; sequence starts at 1.
2. Jordan saves three break points and holds; an SSE update arrives.
3. Jordan breaks Alex; a new moment appears.
4. The source repeats the identical snapshot. No new sequence/event is emitted.
5. A correction changes the previous break into an Alex hold. The old break is
   retracted; the replacement snapshot and new hold arrive together.
6. A point gap appears. `status` becomes `unknown`, `current` becomes `null`, and
   uncertainty is explicit. Known game results can remain in progression/moments.

Try **Disconnect stream**, advance a few steps, then **Reconnect stream**. The
server replays missed updates if retained, otherwise sends a replacement reset.
Use **Restart scenario** to return to the beginning. This advances the stream
sequence; it does not reuse old IDs. There is no automatic ticking/polling.

**Ctrl+C** stops the server. If port 3000 is busy:

```powershell
$env:PORT=3001
npm run dev
```

The server binds to loopback only. Opening it from a physical phone, adding
public hosting, authentication or CORS requires a separate deployment decision.

## 4. Architecture and data flow

```text
Provider JSON                     Synthetic replay
     |                                  |
validate/map in adapters                 |
     +----------> MatchSnapshot <-------+
                       |
         scoring rules + history reconstruction
                       |
       moments, pressure, progression, uncertainty
                       |
                FeedStore.ingest
                       |
            HTTP snapshot + SSE updates
                       |
          client reducer / diagnostic page
```

Provider parsing lives in `src/adapters/`. Tennis rules live in `src/engine/` and
`src/scoring.ts`. The feed knows our domain contract rather than raw RapidAPI
response shapes. The synthetic source and eventual provider source can therefore
share the same delivery path. **Only the synthetic source is wired to the server
in this version**; provider validation does not automatically start ingestion.

### HTTP and SSE routes

| Route                                 | Purpose                                      |
| ------------------------------------- | -------------------------------------------- |
| `GET /health`                         | Readiness and explicit `synthetic-only` mode |
| `GET /matches`                        | Available snapshots and current demo step    |
| `GET /matches/synthetic-match`        | Authoritative replacement snapshot           |
| `GET /matches/synthetic-match/events` | SSE stream                                   |
| `POST /demo/step`                     | Advance one synthetic source snapshot        |
| `POST /demo/reset`                    | Restart the synthetic scenario               |
| `GET /`                               | Browser diagnostics                          |

Unknown matches/routes return 404. Invalid oversized cursors return 400. Foreign
Host/Origin requests are rejected; mutation controls are local development only.

### The frontend contract

Read [contract.ts](src/feed/contract.ts) for the exact TypeScript definitions.
Every snapshot includes:

| Field                          | Meaning                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `schemaVersion`                | Public contract version; currently 1                                                                 |
| `matchId`, `players`, `format` | Stable identity, ordered names, explicit scoring rules                                               |
| `epoch`, `sequence`, `cursor`  | Process identity and monotonic delivered-update position                                             |
| `source`                       | Synthetic/provider label, backend observation time, provider update time or null, ingestion revision |
| `status`                       | Derived in-progress/completed/unknown; not a claim of live court action                              |
| `current`                      | Sets, games, point score, server, pressure and completed sets; null if inconsistent/incomplete       |
| `progression`                  | Per-game outcomes and warnings                                                                       |
| `moments`                      | Stable factual hold/break/saved-pressure moments and uncertainty                                     |
| `historyMoments`               | Point-positioned pressure/set/match events with evidence provenance                                  |
| `uncertainty`                  | Reasons the feed cannot establish a complete current state                                           |

Pressure is ordered by player 1/player 2. After match completion `current.server`
is null. Complete set scores remain in `completedSets`; reset current games are
not an extra played set. A score is only as authoritative as its supplied history.

`freshness(snapshot, now)` is evaluated at render time. Synthetic data is `replay`;
a missing provider timestamp is `unknown`. A >120-second timestamp age is marked
`stale` by a documented heuristic; future timestamps can indicate clock skew.
An open SSE connection or heartbeat is **not** proof of fresh provider data.

### Updates, duplicate handling and corrections

`FeedStore` accepts an authoritative domain snapshot with a caller-supplied
positive revision. For future polling, assign that revision when the request
begins so a slow older response cannot overwrite newer data. This revision is
our ordering mechanism, not an invented provider event number.

- Older/equal revisions are ignored.
- Identical semantic snapshots advance the internal revision watermark without
  emitting another event or announcing duplicate moments.
- Changed snapshots are recomputed and get the next stream sequence number.
- An `update` event contains the **entire new snapshot**, added/updated/removed
  moments, and retracted history-moment IDs. Replace state; don't add score deltas.
- Corrections can remove sporting claims. A removed moment is not a new point.

Consumers should use `src/feed/client.ts` for sequencing decisions. Its envelope
parser validates protocol fields before applying network JSON. Upstream adapters
validate provider data; the transport parser is not a replacement for them.

### Reconnect and reset algorithm

An SSE frame has an event name, an ID like `epoch:sequence`, and one JSON payload.
Browser EventSource sends `Last-Event-ID` on automatic reconnect. Other clients
can send that header or use `?cursor=...`; the header takes precedence.

The in-memory journal retains the last **50 updates per match** by default.
If the cursor is known and retained, subsequent updates are replayed. An initial,
expired, invalid, future, or previous-process cursor gets a `reset` containing the
latest full snapshot. Matching the current cursor waits for the next update.

The shared client reducer ignores duplicate/older updates, detects sequence gaps,
and requests a reset/full HTTP snapshot. A new process epoch is accepted through
a reset. It does not silently stitch together discontinuous event histories.

The diagnostic page implements the same recovery policy while displaying raw
JSON/events. The automated diagnostic uses the shared reducer directly. These
are developer clients, not a production mobile networking layer.

## 5. Code reading guide

Comments explain module responsibilities, trust boundaries and the important
algorithms. Follow this order to audit the implementation:

1. [model.ts](src/engine/model.ts): our scoring input.
2. [matchstat-points.ts](src/adapters/matchstat-points.ts): provider field validation.
3. [point-engine.ts](src/engine/point-engine.ts): pure point-winning rules and pressure lookahead.
4. [history.ts](src/engine/history.ts): unique legal transition matching, missing-terminal reconstruction and stopping on gaps.
5. [scoring.ts](src/scoring.ts): conservative game-level analysis when a full point stream is unavailable.
6. [moments.ts](src/engine/moments.ts): templates, IDs and correction comparison.
7. [contract.ts](src/feed/contract.ts), [store.ts](src/feed/store.ts): frontend shape, revision ordering and bounded replay journal.
8. [server.ts](src/feed/server.ts): HTTP/SSE framing, cleanup and local-only controls.
9. [client.ts](src/feed/client.ts), [sse.ts](src/feed/sse.ts): receive/recover rules and diagnostic frame parsing.
10. [feed-check.ts](src/feed-check.ts), [feed.test.ts](test/feed.test.ts): runnable end-to-end checks and assertions.

The scoring functions copy state before transitions. `pressureFor` tries the next
legal point without recursively generating more pressure events. A set/match
point exists only when that next point would finish the set/match.

The history bridge tries both possible point winners against each supplied score
record. Exactly one legal match is required. It reconstructs an omitted terminal
point only if one legal next point yields the reported game result. Evidence is
labeled `recorded-score-transition` or `reconstructed-terminal`; unsupported gaps
are never filled with invented winners. Provider player order is preserved.

Break-point saves from a verified prefix may be only a lower bound, hence “at
least”. A timeline cross-check verifies supported provider text against game
outcomes; it never silently overrides score data. Cumulative aces/statistics are
not attributed to individual points without synchronization evidence.

## 6. Optional real-provider validation and quota

Do not run these commands during ordinary offline reviews. Read the request count
first. Existing credentials must stay backend-only and must never be pasted into
chat, a frontend bundle, screenshots, or Git commits.

If needed, copy `.env.example` to `.env` and privately set `TENNIS_API_KEY`.
Keep an existing `.env`; don't overwrite it. `.env`, dependencies and `local-data/`
are Git-ignored. A RapidAPI key also needs access/subscription to this specific API.

| Command                                                    | Maximum provider requests |
| ---------------------------------------------------------- | ------------------------- |
| `npm run api:fixtures`                                     | 1                         |
| `npm run api:live-list -- --tour atp`                      | 1                         |
| `npm run api:live -- <numeric-fixture-match-id>`           | 1                         |
| `npm run api:validate -- --tour atp --format standard-bo3` | 4                         |

The bundled check discovers a provider InPlay event, then fetches PBP, statistics
and timeline for that match. It reuses those responses for scoring; it does not
make more calls for each analysis. No suitable event stops after discovery.
Access/quota errors stop remaining detail requests. No retries or polling.
Choose the actual format explicitly: `standard-bo3` or `slam-men`; automatic
selection does not prove singles/doubles or the applicable rules. Optional
`--tournament Paris` filters selection locally, without fallback elsewhere.

### Identifier mapping

- **Fixture Match ID:** numeric, used by the fixture-to-live lookup.
- **Live event ID:** from discovery `results[].id`, used by statistics/timeline.
- **Compound matchKey:** player1Id-player2Id-tournamentId-roundId, used by PBP.
- `matchId` can be a deprecated compound alias in live responses. These identifier
  families must not be substituted merely because some values happen to match.

Provider requests preserve proxy/TLS verification, refuse redirects, time out
within 20 seconds, and keep secrets in headers. HTTP 401/403 needs key/subscription
or network diagnosis; HTTP 429 means stop and check quota. Schema failures print
bounded field/type diagnostics, not raw response values. Statistics support both
the documented top-level shape and the observed `result` wrapper.

`api:fixtures -- --save` is an opt-in recording path only after checking provider
retention permission. Other diagnostic/feed commands do not record raw responses.
No retained real provider data is needed by our synthetic replay or tests.

## 7. What is verified, and what remains

**Verified offline:** scoring rules and explicit formats, synthetic adapters,
corrections/retractions, duplicate/out-of-order source handling, HTTP snapshots,
SSE delivery, cursor replay/reset, client gap recovery and server startup.

**Observed through user-run real calls:** fixtures/live discovery, one complete
ordinary-game history reconstructing a reported 1–2 set result, 24/24 timeline
agreements, and the nested statistics envelope. Those observations are not live
latency measurements or coverage guarantees.

**Still required before a production live feed:**

- Wire a deliberate, quota-budgeted provider ingestion process into `FeedStore`.
  The current server has no continuous RapidAPI or Socket.IO connection.
- Verify real tiebreak encoding, actual statistic-value variations, timestamps,
  corrections/recovery and coverage across the tournaments we intend to show.
- Select the applicable scoring format from reliable competition metadata.
- Add durable storage/ordering, shared service behavior and notification deduplication.
  This development journal disappears on restart and does not provide exactly-once delivery.
- Evaluate authentication, rate limits, deployment and multi-instance distribution.
- Confirm caching, retention, redistribution and commercial display rights.
- Evaluate the paid REST/streaming plan only after verifying its documented payloads,
  limits, costs and reconnect semantics. Streaming alone does not guarantee completeness.

No standalone match tiebreak replacing a set, retirement/walkover event engine,
full doubles receiving-side rules, or complete Catch Me Up ranking exists yet.
The frontend can now integrate against a versioned synthetic feed while these
real-data limitations remain explicit. This is a development milestone, not a
claim that production validation is complete.

More detail: [offline replay guide](docs/offline-replay.md),
[provider findings](docs/api-findings.md), [feed design](docs/feed-design.md).
