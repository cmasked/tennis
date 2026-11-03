import assert from "node:assert/strict";
import { createFeedServer } from "./feed/server.ts";
import { readFeedEvents } from "./feed/sse.ts";
import { receive, parseFeedEvent, type ClientState } from "./feed/client.ts";
import type { FeedEvent, FeedSnapshot } from "./feed/contract.ts";

// Self-contained end-to-end check: real loopback HTTP, zero provider requests.
// An ephemeral port avoids conflicts with a separately running diagnostic server.
const app = createFeedServer();
try {
  await new Promise<void>((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(0, "127.0.0.1", resolve);
  });
  const address = app.server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  const base = `http://127.0.0.1:${address.port}`;
  const snapshot = async () => {
    const r = await fetch(`${base}/matches/synthetic-match`);
    assert.equal(r.status, 200);
    return parseFeedEvent({
      type: "reset",
      reason: "initial",
      snapshot: await r.json(),
    }).snapshot;
  };
  const control = async () => {
    const r = await fetch(`${base}/demo/step`, { method: "POST" });
    assert.equal(r.status, 200);
    return r.json();
  };
  const nextEvent = async (
    cursor?: string,
    whileConnected?: () => Promise<unknown>,
  ): Promise<FeedEvent> => {
    const r = await fetch(`${base}/matches/synthetic-match/events`, {
      headers: cursor ? { "Last-Event-ID": cursor } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (whileConnected) await whileConnected();
    for await (const event of readFeedEvents(r)) return event;
    throw new Error("Stream closed before an event");
  };
  const initial = await snapshot();
  let client: ClientState = receive(
    { snapshot: null, needsResync: false },
    { type: "reset", reason: "initial", snapshot: initial },
  );
  assert.equal(initial.source.kind, "synthetic");
  console.log("PASS HTTP snapshot and explicit synthetic source");
  const update = await nextEvent(initial.cursor, control);
  client = receive(client, update);
  assert.equal(client.needsResync, false);
  assert.equal(client.snapshot!.sequence, 2);
  console.log("PASS SSE update delivery");
  await control(); // Simulate source advancing while the client is disconnected.
  const missed = await nextEvent(client.snapshot!.cursor);
  client = receive(client, missed);
  assert.equal(client.snapshot!.sequence, 3);
  console.log("PASS disconnected client resumes missed update");
  await control();
  assert.equal((await snapshot()).sequence, 3);
  console.log("PASS duplicate source produces no event or sequence increment");
  const correction = await nextEvent(client.snapshot!.cursor, control);
  assert.equal(correction.type, "update");
  if (correction.type === "update")
    assert.ok(
      correction.changes.removed.some((moment) => moment.kind === "break"),
    );
  client = receive(client, correction);
  assert.deepEqual(receive(client, correction), client);
  console.log("PASS correction retracts break; duplicate delivery ignored");
  const gap = receive({ snapshot: initial, needsResync: false }, correction);
  assert.equal(gap.needsResync, true);
  const replacement: FeedSnapshot = await snapshot();
  const recovered = receive(gap, {
    type: "reset",
    reason: "initial",
    snapshot: replacement,
  });
  assert.equal(recovered.needsResync, false);
  assert.equal(recovered.snapshot!.cursor, correction.snapshot.cursor);
  console.log("PASS sequence gap detected and recovered by HTTP replacement");
  const reset = await nextEvent("old-process:1");
  assert.equal(reset.type, "reset");
  console.log("PASS invalid/old process cursor receives reset");
  await control();
  const incomplete = await snapshot();
  assert.equal(incomplete.status, "unknown");
  assert.equal(incomplete.current, null);
  console.log("PASS missing point withholds unreliable current state");
  console.log(
    "All feed checks passed. No API key or tennis API requests used.",
  );
} finally {
  await app.close();
}
