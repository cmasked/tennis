import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchProviderJson } from "../src/client.ts";
import {
  liveLookupUrl,
  fetchLiveLookup,
  formatLiveInspection,
} from "../src/live-inspector.ts";

test("live lookup uses observed ATP link pattern and makes exactly one request", async () => {
  let calls = 0;
  const payload = await fetchLiveLookup(
    "101",
    "test-only-key",
    async (url, options) => {
      calls++;
      assert.equal(
        url,
        "https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/matches/101/live?type=atp&source=today",
      );
      assert.equal(options?.redirect, "error");
      assert.equal(
        (options?.headers as Record<string, string>)["X-RapidAPI-Key"],
        "test-only-key",
      );
      return new Response('{"syntheticMapping":{"id":"test-live"}}');
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(payload, { syntheticMapping: { id: "test-live" } });
});
test("invalid IDs fail before any request", () => {
  for (const id of [
    "0",
    "-1",
    "1.5",
    "1-2-3-4",
    "../1",
    "https://example.com",
    "9007199254740992",
  ]) {
    assert.throws(() => liveLookupUrl(id), /positive numeric Match ID/);
  }
});
test("shared client refuses alternate hosts, schemes and credential-bearing URLs", async () => {
  for (const url of [
    "https://example.com/",
    "http://tennis-api-atp-wta-itf.p.rapidapi.com/",
    "https://user@tennis-api-atp-wta-itf.p.rapidapi.com/",
  ]) {
    let calls = 0;
    await assert.rejects(
      fetchProviderJson(url, "test-only-key", async () => {
        calls++;
        return new Response("{}");
      }),
      /fixed HTTPS/,
    );
    assert.equal(calls, 0);
  }
});
test("inspection redacts nested credentials and exact key, and strips terminal controls", () => {
  const output = formatLiveInspection(
    {
      token: "private",
      nested: { apiKey: "private", description: "test-only-key\u001b[31m" },
    },
    "test-only-key",
  );
  assert.equal(output.includes("private"), false);
  assert.equal(output.includes("test-only-key"), false);
  assert.equal(output.includes("\u001b"), false);
  assert.match(output, /REDACTED/);
  assert.match(output, /schema is not yet verified/);
});
test("empty results are displayed without claiming a live match exists", () => {
  assert.match(formatLiveInspection([], "test-only-key"), /\[\]/);
  assert.match(formatLiveInspection({}, "test-only-key"), /unavailable match/);
});
test("large payloads are explicitly marked as truncated", () => {
  const output = formatLiveInspection(
    { synthetic: "x".repeat(17000) },
    "test-only-key",
  );
  assert.match(output, /Display truncated/);
});
test("HTTP errors do not trigger live follow-up requests", async () => {
  let calls = 0;
  await assert.rejects(
    fetchLiveLookup("101", "test-only-key", async () => {
      calls++;
      return new Response("{}", { status: 404 });
    }),
    /HTTP 404/,
  );
  assert.equal(calls, 1);
});
