import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { adaptMatchstatPoints } from "../src/adapters/matchstat-points.ts";
import { buildMoments, reconcileMoments } from "../src/engine/moments.ts";
import { scenarios } from "../src/replay/scenarios.ts";
import type { MatchSnapshot } from "../src/engine/model.ts";

function providerSample() {
  return {
    success: true,
    meta: {
      player1: { name: "Synthetic One" },
      player2: { name: "Synthetic Two" },
    },
    result: {
      score: "1-0",
      sets: [
        {
          setNumber: 1,
          setScore: "",
          games: [
            {
              gameNumber: 1,
              server: 1,
              tiebreak: false,
              finalScore: "1-0",
              fifteens_content: "15:0,30:0,40:0",
            },
          ],
        },
      ],
    },
  };
}
test("provider adapter produces engine input without passing through provider objects", () => {
  const raw = providerSample();
  const snapshot = adaptMatchstatPoints(raw, "sample");
  assert.deepEqual(snapshot.players, ["Synthetic One", "Synthetic Two"]);
  assert.deepEqual(snapshot.games[0], {
    set: 1,
    game: 1,
    server: 1,
    tiebreak: false,
    finalScore: "1-0",
    content: "15:0,30:0,40:0",
  });
  raw.meta.player1.name = "Changed";
  assert.equal(snapshot.players[0], "Synthetic One");
  assert.equal(buildMoments(snapshot)[0].kind, "hold");
});
test("adapter preserves response side order and rejects malformed required fields", () => {
  const raw = providerSample();
  [raw.meta.player1, raw.meta.player2] = [raw.meta.player2, raw.meta.player1];
  assert.equal(adaptMatchstatPoints(raw, "sample").players[0], "Synthetic Two");
  for (const field of [
    "gameNumber",
    "server",
    "tiebreak",
    "finalScore",
    "fifteens_content",
  ]) {
    const raw = providerSample();
    delete (raw.result.sets[0].games[0] as Record<string, unknown>)[field];
    assert.throws(() => adaptMatchstatPoints(raw, "sample"), /schema/);
  }
  assert.throws(
    () => adaptMatchstatPoints(providerSample(), ""),
    /stable match key/,
  );
});
test("hold, break and saved-break-point moments have deterministic templates and provenance", () => {
  const moments = buildMoments(scenarios[2].snapshot);
  assert.equal(moments.filter((m) => m.kind === "hold").length, 2);
  assert.equal(moments.filter((m) => m.kind === "break").length, 1);
  const saved = moments.find((m) => m.kind === "break-points-saved")!;
  assert.equal(saved.player, 2);
  assert.equal(saved.basis, "valid-point-prefix");
  assert.match(saved.text, /at least 3 break points/);
  assert.equal(
    moments.find((m) => m.kind === "break")!.basis,
    "game-score-and-server",
  );
  assert.ok(
    moments.every((m) => !/ace|winner shot|nervous|rally/.test(m.text)),
  );
});
test("identical authoritative snapshots produce no duplicate changes", () => {
  const moments = buildMoments(scenarios[2].snapshot);
  assert.deepEqual(
    reconcileMoments(moments, buildMoments(scenarios[3].snapshot)),
    { added: [], updated: [], removed: [] },
  );
});
test("corrected snapshot retracts previous break and emits replacement hold", () => {
  const changes = reconcileMoments(
    buildMoments(scenarios[3].snapshot),
    buildMoments(scenarios[4].snapshot),
  );
  assert.equal(changes.removed.length, 1);
  assert.equal(changes.removed[0].kind, "break");
  assert.equal(changes.added.length, 1);
  assert.equal(changes.added[0].kind, "hold");
});
test("same moment updated in place instead of becoming an additional event", () => {
  const snapshot = structuredClone(scenarios[1].snapshot);
  const previous = buildMoments(snapshot);
  snapshot.games[1].content =
    "15:0,30:0,40:0 BP,40:15 BP,40:30 BP,40:40,A:40 BP,40:40,40:A";
  const changes = reconcileMoments(previous, buildMoments(snapshot));
  assert.equal(changes.added.length, 0);
  assert.equal(changes.removed.length, 0);
  assert.equal(changes.updated.length, 1);
  assert.match(changes.updated[0].text, /at least 4/);
});
test("point gaps and missing games remain explicit without invented missing points", () => {
  const gap = buildMoments(scenarios[5].snapshot);
  assert.ok(gap.some((m) => m.game === 4 && m.kind === "hold"));
  assert.ok(gap.some((m) => m.game === 4 && m.confidence === "unknown"));
  const missing = buildMoments(scenarios[6].snapshot);
  assert.ok(missing.every((m) => m.kind === "uncertainty"));
});
test("tiebreak and duplicate records are withheld instead of generating commentary", () => {
  assert.ok(
    buildMoments(scenarios[7].snapshot).every((m) => m.kind === "uncertainty"),
  );
  const snapshot = structuredClone(scenarios[0].snapshot);
  snapshot.games.push({ ...snapshot.games[0] });
  const moments = buildMoments(snapshot);
  assert.equal(moments.length, 1);
  assert.equal(moments[0].kind, "uncertainty");
  assert.match(moments[0].text, /Duplicate game records/);
});
test("engine does not mutate snapshots or conflate match identities", () => {
  const snapshot = structuredClone(scenarios[0].snapshot);
  const before = JSON.stringify(snapshot);
  const first = buildMoments(snapshot);
  assert.equal(JSON.stringify(snapshot), before);
  const other: MatchSnapshot = { ...snapshot, matchKey: "other-match" };
  assert.notEqual(first[0].id, buildMoments(other)[0].id);
});
test("actual replay CLI runs without a key while network fetch is forbidden", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      new URL("./helpers/no-network.ts", import.meta.url).href,
      "src/replay.ts",
    ],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8",
      env: { ...process.env, TENNIS_API_KEY: "" },
    },
  );
  assert.equal(child.status, 0, child.stderr);
  for (const text of [
    "SYNTHETIC OFFLINE REPLAY",
    "saves at least 3",
    "No changes; no duplicate commentary",
    "RETRACT:",
    "UNCERTAIN",
  ])
    assert.ok(child.stdout.includes(text), text);
});
