# Review the offline match engine

This demonstration uses fictional players and synthetic match snapshots. It is
not recorded tennis data, live coverage, or a completed scoring engine.

## Run on Windows

From PowerShell:

```powershell
cd D:\tennis\tennis
git pull origin main
npm test
npm run typecheck
npm run replay
```

The tests, type check and replay consume **zero tennis API requests**. No `.env`
or key is required by replay, and it does not load `.env`, save files, or import
the HTTP client. Node 24 LTS is the supported runtime. No new dependencies were
added for this increment. `api:*` commands still make real requests; don't run
those for this review.

## What to check

| Replay step | Expected result |
| --- | --- |
| 1: ordinary game | Alex holds at 1-0 |
| 2: pressure/deuce | Jordan saves at least three break points and holds for 1-1 |
| 3: break | Jordan breaks Alex for 1-2 in Alex-first score order |
| 4: repeated snapshot | No new commentary |
| 5: corrected snapshot | Previous Jordan break is retracted; Alex hold replaces it |
| 6: missing point | Game result can establish a hold, but point gap is flagged; missing points are not invented |
| 7: incomplete game history | Outcome withheld because earlier games are missing |
| 8: tiebreak | Unsupported reconstruction is flagged explicitly |

The replay prints snapshots immediately in sequence; it does not animate or wait
between points. Review whether each explanation is clear and whether corrections
and uncertainty are understandable. Share the terminal output or the numbered
scenario you find confusing. This does not require an API request.

## Data flow and important files

`src/adapters/matchstat-points.ts` validates the documented provider fields and
maps them to our `MatchSnapshot` input. It preserves response player order and
passes no credentials or HTTP objects to the engine. The existing live validator
now uses this adapter for its scoring analysis too.

`src/engine/model.ts` defines that input. `src/scoring.ts` applies ordinary
advantage-game rules and records uncertainty. `src/engine/moments.ts` turns those
results into structured moments with stable IDs, confidence and evidence basis.
Commentary uses fixed templates rather than a generative model.

`reconcileMoments` compares the newly computed moment list with the previous
list: additions, changed records and retractions are separate. Identical snapshots
produce no changes. This is in-memory snapshot reconciliation, not durable event
storage or a notification delivery guarantee. The caller must supply the correct
current snapshot; old/out-of-order snapshot rejection is not implemented.

`src/replay/scenarios.ts` supplies synthetic domain input, while adapter tests use
synthetic provider-shaped responses. No real match data was retained. Tests cover
both paths plus the actual CLI with fetch disabled and an empty key.

## Limits

This increment does not implement set/match-point detection, set/match winners,
comeback ranking, tiebreak rules, no-ad formats, persistence, stale-snapshot
rejection, or production notification delivery. Scoring format selection must
be explicit before these are added. Statistics schema differences remain open.

The engine may know a game outcome from adjacent game scores even if intermediate
points are missing. It can only state break-point saves observed in the valid
score prefix, hence "at least". Omitted terminal points are labeled reconstructed
in scoring analysis; no invented point-level timing or shot labels are produced.
