# Development feed design and review notes

## Why replacement snapshots plus changes?

The mobile app needs one reliable state to render, not a stream of arithmetic
instructions such as “increment games”. If a correction changes a previous point,
the server recomputes the state and sends a replacement. The small change list
exists for emphasis, animation and retraction—not for reconstructing the score.

The code path is `createDemo -> FeedStore.ingest -> reconstructHistory +
buildMoments -> FeedSnapshot -> HTTP/SSE -> receive`. Future provider ingestion
must enter through the same normalized input boundary, after validation.

## Two sequences with different responsibilities

**Source revision:** assigned by ingestion when a fetch starts. A response from
revision 10 arriving after revision 11 is ignored. The store also remembers the
watermark for an identical snapshot so an intervening old response cannot rewind
state. This does not invent provider event IDs or resolve the upstream source's
own out-of-order events. The real ingestion adapter is still required.

**Delivery sequence:** increments only for accepted changed snapshots. Clients
can detect lost updates. An epoch changes on server restart, so an old sequence
cannot be mistaken for a position in a new stream. The cursor is opaque to product
UI; developer diagnostics display it intentionally.

## Recovery examples

- Client has epoch A/sequence 2; server retains 3 and 4: reconnect replays 3,4.
- Client has A/2; earliest retained event is A/10: reset to the latest snapshot.
- Client has epoch A; process restarted as epoch B: reset to B's snapshot.
- Client receives 4 immediately after 2: reducer sets `needsResync`; fetch snapshot
  and apply a reset. Never animate a missing event as though observed.
- Client receives 4 twice: second event is ignored.
- A source correction removes an old break: update includes the removed moment,
  retracted history IDs and the entire corrected state. Remove/revise any old UI
  claim; do not send a “new break” notification for the retraction.

The diagnostic client uses browser EventSource's automatic transport reconnects.
Its manual reconnect button also passes the last known cursor. HTTP recovery
handles explicit sequence gaps. The Node diagnostic uses `receive` directly.

## Backpressure and lifecycle

HTTP SSE writers pause when `write` reports backpressure, then resume on `drain`.
A queue is bounded at 50 frames per client. A client that cannot keep up is closed
and must reconnect/reset. This prevents an unbounded in-memory delivery queue.
The store separately retains 50 updates per match. Heartbeats are comments only,
never sequence-bearing sporting events, and do not refresh provider timestamps.

Connection close unsubscribes listeners and clears the heartbeat timer. Server
shutdown ends all SSE clients and closes HTTP connections. The integration check
starts on an ephemeral loopback port and always shuts down in `finally`.

## Trust and data quality

External JSON is validated by adapters, scoring uses explicit formats, and
frontend JSON is guarded by a protocol-envelope parser. If a point/game gap stops
full-history reconstruction, current score/server/pressure are withheld. Useful
per-game facts may still appear with provenance and warnings. A completed match
has no current server. Synthetic source labeling cannot be inferred as live play.

`providerUpdatedAt` stays null when not supplied. `observedAt` means backend
observation, not court-event time. The UI should recalculate freshness as time
passes. “Recent” timestamps still do not establish actual live latency.

The browser page renders data with textContent, loads only same-origin scripts,
and is a raw developer inspector. The server rejects foreign Origin/Host and
binds to loopback. Those measures do not constitute production authentication,
API authorization, public rate limiting, or a deployment design.

## Tests to audit

`test/feed.test.ts` tests source ordering/watermarks, copies at data boundaries,
correction retractions, missing current state, bounded history resets, process
restart recovery, freshness aging, malformed envelopes, fragmented SSE, HTTP
errors and local-only controls. `feed-check.ts` exercises real local HTTP/SSE
connections, including deliberate disconnects. A child-process test blocks all
non-loopback fetches so a future accidental provider dependency fails loudly.

## Deliberate limits

Everything is in memory. A single process serves a single synthetic scenario;
there is no durable state, real ingestion scheduler, multi-instance coordination,
notification service, user identity, paid Socket.IO integration or production
availability claim. Statistics validation exists separately and is not silently
attached to unsynchronized score events. No real provider responses are recorded.

The frontend contract and local feed are usable now for integration and design
exploration; a production live-feed milestone still requires the documented
real-provider validation and ingestion work.
