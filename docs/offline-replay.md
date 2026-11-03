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
| 8: provider-shaped tiebreak | Unsupported provider-string reconstruction is flagged explicitly |
| 9: set point | At 5-0 and 40-0, player 1 has set point but not match point; player 2 saves one |
| 10: match point | With a set lead, the winning point emits game, set and match wins |
| 11: seven-point tiebreak | Service sequence starts 1,2,2,1,1,2,2; 7-6 is not enough; 8-6 wins |
| 12: deciding-set format | Best-of-five fifth-set tiebreak targets ten points, not seven |

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

The canonical point engine now supports explicit best-of-three/five formats,
advantage and no-ad games, sets won by a two-game margin, configurable regular
and deciding-set tiebreaks, and advantage sets with no tiebreak. Scoring formats
are passed explicitly; tournament names are never used to infer them.

`src/engine/point-engine.ts` consumes complete, ordered point winners (1 or 2).
It emits structured point/game/set/match wins and pressure-created/saved events.
`pressureFor` looks ahead one legal point to determine break/set/match point.
`src/replay/formats.ts` demonstrates this input path using synthetic point winners.

The provider's full real-world tiebreak score-string grammar is not yet validated.
Scenario 8 preserves the older per-game analyzer's conservative behavior;
scenarios 9–12 test the rules directly, and scenarios 13–15 exercise the new
provider-history bridge using documentation-based synthetic payloads. The bridge
stops at missing points rather than filling them in.

Comeback ranking, standalone match tiebreaks replacing a set, persistence,
stale-snapshot rejection and production notification delivery remain unimplemented.
Doubles receiving-side selection at a no-ad deciding point is not modeled; the
engine only scores a supplied winner. Statistics schema differences remain open.

The engine may know a game outcome from adjacent game scores even if intermediate
points are missing. It can only state break-point saves observed in the valid
score prefix, hence "at least". Omitted terminal points are labeled reconstructed
in scoring analysis; no invented point-level timing or shot labels are produced.

## Provider-history bridge (scenarios 13–15)

The next replay batch exercises synthetic provider-shaped responses through the
actual adapter and `src/engine/history.ts`, rather than only the scoring rules.
It covers a complete two-set match with omitted terminal records, a missing point
that stops reconstruction, and documented numeric tiebreak strings with the
explicitly documented player-1 `*` prefix. Other star placements remain rejected.
This is documentation-based support, not a claim that real tiebreak payloads have
been observed.

The bridge requires a full history starting at set 1/game 1 with a known first
server and explicit format. It checks game numbering, legal service order,
tiebreak flags and game outcomes. It follows a score transition only if exactly
one legal next point matches. It reconstructs a missing terminal only when one
legal point finishes the game at exactly the reported game score. Gaps, duplicate
records, incompatible final scores, or unsupported notation stop the prefix;
no later set/match result is invented. Missing history can still be inspected by
the earlier per-game analysis, without pretending it is a full point stream.

Moments have stable match/set/game/point identities and carry recorded versus
reconstructed evidence. Applying the same authoritative input produces the same
moments. Production ingestion ordering and durable retractions remain future work.

The same bridge is available in a future bundled live check:

```powershell
npm run api:validate -- --tour atp --format standard-bo3
```

This reuses the already fetched point response; the total budget remains **at most
four requests**, not a fifth request. Choose the actual match format explicitly;
`slam-men` selects best-of-five men's Grand Slam main-draw singles rules. The
command's selection filters do not independently verify singles/doubles or format.
Without `--format`, existing per-game inspection still works, but no full-history
pressure reconstruction runs. A stopped bridge counts as a failed check.

## Latest review scenarios

- **16:** concise match result and an explicit warning when discovery says InPlay
  despite a completed history. Historical consistency does not prove live freshness.
- **17:** synthetic statistics under the observed `result` wrapper, with reversed
  player order to show why side identity must be preserved. Counts stay cumulative;
  no individual ace point is inferred.

The nesting fix is tested offline. A further real API request is not required
just to confirm that `result.player1` can be read. Actual metric variations and
real tiebreak encodings remain candidates for a future purposeful live check.
