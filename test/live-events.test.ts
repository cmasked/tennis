import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLiveEvents,
  parseLiveOptions,
  formatLiveEvents,
} from "../src/live-events.ts";
const now = Date.parse("2026-11-04T12:00:00Z");
// Synthetic data matching observed field shapes, not recorded provider data.
function sample() {
  return {
    success: true,
    results: [
      {
        id: "100",
        matchId: "1-2-3-4",
        participant1: "Test A",
        participant2: "Test B",
        league: "Synthetic Paris",
        tourType: "atp",
        status: "InPlay",
        score: "6-3,2-1",
        points: "30-40",
        indicator: "1,0",
        updatedAt: now - 30000,
        matchKey: "1-2-3-4",
        unexpected: true,
      },
    ],
  };
}
test("normalizes observed fields and preserves distinct identifiers", () => {
  const events = parseLiveEvents(sample());
  assert.equal(events[0].eventId, "100");
  assert.equal(events[0].matchId, "1-2-3-4");
  assert.equal(events[0].points, "30-40");
  assert.equal(events[0].matchKey, "1-2-3-4");
  assert.equal("unexpected" in events[0], false);
});
test("renders readable scores with freshness and no invented server or history", () => {
  const output = formatLiveEvents(parseLiveEvents(sample()), {}, now, "UTC");
  for (const text of [
    "Test A vs Test B",
    "6-3,2-1",
    "30-40",
    "InPlay",
    "30s before fetch",
    "meaning remains unverified",
    "not point-by-point history",
  ])
    assert.ok(output.includes(text), text);
});
test("null and missing optional fields stay unavailable", () => {
  const payload = sample();
  const item = payload.results[0] as Record<string, unknown>;
  for (const field of ["score", "points", "indicator", "matchId", "updatedAt"])
    item[field] = null;
  assert.match(
    formatLiveEvents(parseLiveEvents(payload), {}, now, "UTC"),
    /Update time unavailable/,
  );
  delete item.points;
  assert.equal(parseLiveEvents(payload)[0].points, null);
});
test("rejects invalid envelopes, required fields and timestamp types with safe paths", () => {
  for (const value of [
    [],
    {},
    { success: false, results: [] },
    { success: true, results: null },
  ])
    assert.throws(() => parseLiveEvents(value));
  for (const field of [
    "id",
    "participant1",
    "participant2",
    "league",
    "tourType",
    "status",
    "updatedAt",
  ]) {
    const payload = sample();
    (payload.results[0] as Record<string, unknown>)[field] =
      field === "updatedAt" ? "private-value" : 123;
    assert.throws(
      () => parseLiveEvents(payload),
      (error) =>
        error instanceof Error &&
        error.message.includes(field) &&
        !error.message.includes("private-value"),
    );
  }
});
test("local filters preserve feed counts and distinguish no results from no matches", () => {
  const events = parseLiveEvents(sample());
  assert.match(
    formatLiveEvents(events, { tournament: "PARIS", tour: "atp" }, now, "UTC"),
    /1 shown \/ 1 returned/,
  );
  assert.match(
    formatLiveEvents(events, { tour: "wta" }, now, "UTC"),
    /Other events were returned/,
  );
  assert.match(
    formatLiveEvents([], {}, now, "UTC"),
    /Provider returned no events/,
  );
});
test("stale and future timestamps are explicit without claiming measured latency", () => {
  const events = parseLiveEvents(sample());
  events[0].updatedAt = now - 180000;
  assert.match(formatLiveEvents(events, {}, now, "UTC"), /Potentially stale/);
  events[0].updatedAt = now + 180000;
  assert.match(
    formatLiveEvents(events, {}, now, "UTC"),
    /ahead of this computer/,
  );
});
test("retains provider non-live status instead of mislabeling it", () => {
  const payload = sample();
  payload.results[0].status = "Finished";
  assert.match(
    formatLiveEvents(parseLiveEvents(payload), {}, now, "UTC"),
    /Provider status: Finished/,
  );
});
test("CLI options are validated before fetching and support quoted tournament names", () => {
  assert.deepEqual(
    parseLiveOptions(["--tour", "atp", "--tournament", "Paris Masters"]),
    { tour: "atp", tournament: "Paris Masters", raw: false },
  );
  assert.equal(parseLiveOptions(["--raw"]).raw, true);
  for (const args of [
    ["--tour", "itf"],
    ["--tour"],
    ["--tournament"],
    ["--tournament", "--raw"],
    ["--bad"],
  ])
    assert.throws(() => parseLiveOptions(args));
});
test("terminal controls in provider text are removed", () => {
  const payload = sample();
  payload.results[0].participant1 = "\u001b[31mTest\nA";
  const output = formatLiveEvents(parseLiveEvents(payload), {}, now, "UTC");
  assert.equal(output.includes("\u001b"), false);
  assert.equal(output.includes("Test\nA"), false);
});
