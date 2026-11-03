import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FeedStore, type IngestInput } from "../src/feed/store.ts";
import { receive, parseFeedEvent } from "../src/feed/client.ts";
import { freshness, type FeedEvent } from "../src/feed/contract.ts";
import { STANDARD_BEST_OF_THREE } from "../src/engine/point-engine.ts";
import { scenarios } from "../src/replay/scenarios.ts";
import { syntheticProviderMatch } from "../src/replay/provider.ts";
import { adaptMatchstatPoints } from "../src/adapters/matchstat-points.ts";
import { readFeedEvents } from "../src/feed/sse.ts";
import { createFeedServer } from "../src/feed/server.ts";

function input(index: number, revision: number): IngestInput {
  return {
    snapshot: structuredClone(scenarios[index].snapshot),
    format: STANDARD_BEST_OF_THREE,
    source: {
      kind: "synthetic",
      observedAt: "2026-11-04T12:00:00Z",
      providerUpdatedAt: null,
      revision,
    },
  };
}
test("ingestion rejects old revisions and preserves duplicate ordering watermark", () => {
  const store = new FeedStore(5, "test");
  const updates: FeedEvent[] = [];
  const unsubscribe = store.subscribe("synthetic-match", (event) =>
    updates.push(event),
  );
  assert.equal(store.ingest(input(0, 1)), "applied");
  assert.equal(store.ingest(input(0, 4)), "duplicate");
  assert.equal(store.ingest(input(1, 3)), "out-of-order");
  assert.equal(store.ingest(input(1, 4)), "out-of-order");
  assert.equal(store.get("synthetic-match")!.sequence, 1);
  assert.equal(store.ingest(input(1, 5)), "applied");
  assert.equal(updates.length, 2);
  unsubscribe();
  store.ingest(input(2, 6));
  assert.equal(updates.length, 2);
});
test("source corrections retract moments and inconsistent history withholds current state", () => {
  const store = new FeedStore(5, "test");
  store.ingest(input(2, 1));
  const cursor = store.get("synthetic-match")!.cursor;
  store.ingest(input(4, 2));
  const update = store.resume("synthetic-match", cursor)![0];
  assert.equal(update.type, "update");
  if (update.type === "update") {
    assert.equal(update.changes.removed[0].kind, "break");
    assert.equal(update.changes.added[0].kind, "hold");
  }
  store.ingest(input(5, 3));
  const incomplete = store.get("synthetic-match")!;
  assert.equal(incomplete.status, "unknown");
  assert.equal(incomplete.current, null);
  assert.ok(incomplete.uncertainty.length);
});
test("bounded journal replays retained sequence and resets invalid/expired/future cursors", () => {
  const store = new FeedStore(2, "test");
  store.ingest(input(0, 1));
  store.ingest(input(1, 2));
  store.ingest(input(2, 3));
  store.ingest(input(4, 4));
  assert.equal(store.resume("synthetic-match", "test:2")!.length, 2);
  assert.deepEqual(store.resume("synthetic-match", "test:4"), []);
  for (const cursor of [
    "test:1",
    "test:5",
    "old:3",
    "nonsense",
    "test:0",
    "test:9999999999999999999999",
  ])
    assert.equal(store.resume("synthetic-match", cursor)![0].type, "reset");
  assert.equal(store.resume("missing"), null);
});
test("store isolates caller, reader and subscriber mutations", () => {
  const store = new FeedStore(5, "test");
  const data = input(0, 1);
  store.subscribe("synthetic-match", (update) => {
    update.snapshot.players[0] = "Tampered";
  });
  store.ingest(data);
  data.snapshot.players[0] = "Changed";
  const read = store.get("synthetic-match")!;
  read.players[0] = "Changed";
  assert.equal(store.get("synthetic-match")!.players[0], "Alex Example");
});
test("completed feed has no current server and retains completed set results", () => {
  const store = new FeedStore(5, "test");
  const data = input(0, 1);
  data.snapshot = adaptMatchstatPoints(syntheticProviderMatch(), "complete");
  store.ingest(data);
  const snapshot = store.get("complete")!;
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.current!.server, null);
  assert.equal(snapshot.current!.completedSets.length, 2);
});
test("freshness is computed at read time and never inferred from replay or transport heartbeat", () => {
  const store = new FeedStore();
  store.ingest(input(0, 1));
  const snapshot = store.get("synthetic-match")!;
  const now = Date.parse("2026-11-04T12:00:00Z");
  assert.equal(freshness(snapshot, now), "replay");
  snapshot.source.kind = "provider";
  assert.equal(freshness(snapshot, now), "unknown");
  snapshot.source.providerUpdatedAt = new Date(now - 30_000).toISOString();
  assert.equal(freshness(snapshot, now), "recent");
  assert.equal(freshness(snapshot, now + 180_000), "stale");
  snapshot.source.providerUpdatedAt = new Date(now + 180_000).toISOString();
  assert.equal(freshness(snapshot, now), "clock-skew");
});
test("client rejects sequence gaps and cross-match events; reset recovers after process restart", () => {
  const store = new FeedStore(5, "test");
  store.ingest(input(0, 1));
  const initial = store.resume("synthetic-match")![0];
  let client = receive({ snapshot: null, needsResync: false }, initial);
  store.ingest(input(1, 2));
  store.ingest(input(2, 3));
  const missed = store.resume("synthetic-match", "test:2")![0];
  client = receive(client, missed);
  assert.equal(client.needsResync, true);
  assert.equal(client.snapshot!.sequence, 1);
  client = receive(client, store.resume("synthetic-match")![0]);
  assert.equal(client.needsResync, false);
  assert.deepEqual(receive(client, missed), client);
  const other = structuredClone(initial);
  other.snapshot.matchId = "other";
  assert.equal(receive(client, other).needsResync, true);
  const restarted = new FeedStore(5, "restarted");
  restarted.ingest(input(0, 1));
  assert.equal(
    receive(client, restarted.resume("synthetic-match")![0]).snapshot!.epoch,
    "restarted",
  );
});
test("malformed transport envelopes fail before client state is replaced", () => {
  const store = new FeedStore(5, "test");
  store.ingest(input(0, 1));
  const event = store.resume("synthetic-match")![0];
  assert.equal(parseFeedEvent(event).type, "reset");
  for (const mutation of [
    (e: FeedEvent) => {
      e.snapshot.schemaVersion = 2 as 1;
    },
    (e: FeedEvent) => {
      e.snapshot.cursor = "wrong";
    },
    (e: FeedEvent) => {
      e.snapshot.sequence = NaN;
    },
  ]) {
    const copy = structuredClone(event);
    mutation(copy);
    assert.throws(() => parseFeedEvent(copy), /Malformed/);
  }
  assert.throws(() => parseFeedEvent(null));
});
test("SSE parser handles fragmented CRLF frames and ignores comments, but rejects mismatched IDs", async () => {
  const store = new FeedStore(5, "test");
  store.ingest(input(0, 1));
  const event = store.resume("synthetic-match")![0];
  const frame = `: heartbeat\r\n\r\nid: ${event.snapshot.cursor}\r\nevent: reset\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < frame.length; i += 17)
        controller.enqueue(encoder.encode(frame.slice(i, i + 17)));
      controller.close();
    },
  });
  const results: FeedEvent[] = [];
  for await (const parsed of readFeedEvents(
    new Response(stream, { headers: { "Content-Type": "text/event-stream" } }),
  ))
    results.push(parsed);
  assert.deepEqual(results, [event]);
  await assert.rejects(async () => {
    for await (const parsed of readFeedEvents(
      new Response(frame.replace(`id: ${event.snapshot.cursor}`, "id: wrong"), {
        headers: { "Content-Type": "text/event-stream" },
      }),
    ))
      void parsed;
  }, /disagree/);
});
test("real server serves diagnostics and JSON with local-only controls and useful errors", async () => {
  const app = createFeedServer();
  try {
    await new Promise<void>((resolve) =>
      app.server.listen(0, "127.0.0.1", resolve),
    );
    const address = app.server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${base}/health`);
    assert.equal((await health.json()).mode, "synthetic-only");
    const page = await fetch(base);
    assert.match(await page.text(), /Synthetic tennis feed diagnostics/);
    assert.match(
      page.headers.get("content-security-policy")!,
      /default-src 'self'/,
    );
    assert.equal(
      (
        await fetch(`${base}/demo/step`, {
          method: "POST",
          headers: { Origin: "https://example.com" },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(`${base}/matches/missing`)).status, 404);
    assert.equal(
      (
        await fetch(
          `${base}/matches/synthetic-match/events?cursor=${"x".repeat(200)}`,
        )
      ).status,
      400,
    );
    assert.equal((await fetch(`${base}/diagnostic.js`)).status, 200);
  } finally {
    await app.close();
  }
});
test("automated diagnostic checks actual HTTP and SSE while forbidding non-loopback fetches", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      new URL("./helpers/local-network-only.ts", import.meta.url).href,
      "src/feed-check.ts",
    ],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, TENNIS_API_KEY: "" },
    },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /All feed checks passed/);
  assert.match(child.stdout, /correction retracts break/);
});

test("large SSE replacement frames drain successfully instead of forcing a reconnect loop", async () => {
  const app = createFeedServer();
  const data = input(0, 2);
  data.snapshot.players = ["A".repeat(20000), "B".repeat(20000)];
  app.store.ingest(data);
  let iterator: AsyncGenerator<FeedEvent> | undefined;
  try {
    await new Promise<void>((resolve) =>
      app.server.listen(0, "127.0.0.1", resolve),
    );
    const address = app.server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/matches/synthetic-match/events`,
      { signal: AbortSignal.timeout(5000) },
    );
    iterator = readFeedEvents(response);
    const initial = await iterator.next();
    assert.equal(initial.done, false);
    assert.equal(initial.value!.type, "reset");
    const changed = input(1, 3);
    changed.snapshot.players = [...data.snapshot.players];
    app.store.ingest(changed);
    const next = await iterator.next();
    assert.equal(next.done, false);
    assert.equal(next.value!.type, "update");
    assert.equal(next.value!.snapshot.sequence, 3);
  } finally {
    await iterator?.return(undefined);
    await app.close();
  }
});
