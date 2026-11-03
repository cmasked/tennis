import { test } from "node:test";
import assert from "node:assert/strict";
import {
  awardPoint,
  createPointMatch,
  pointLabel,
  pressureFor,
  STANDARD_BEST_OF_THREE,
  SLAM_MENS_SINGLES,
  type Player,
  type PointState,
  type ScoringFormat,
} from "../src/engine/point-engine.ts";
function points(state: PointState, winner: Player, count: number) {
  for (let i = 0; i < count; i++) state = awardPoint(state, winner).state;
  return state;
}
function game(state: PointState, winner: Player) {
  return points(state, winner, 4);
}
function set(state: PointState, winner: Player) {
  for (let i = 0; i < 6; i++) state = game(state, winner);
  return state;
}
function sixAll(
  format: ScoringFormat = STANDARD_BEST_OF_THREE,
  server: Player = 1,
) {
  let state = createPointMatch(format, server);
  for (let i = 0; i < 6; i++) {
    state = game(state, 1);
    state = game(state, 2);
  }
  return state;
}
test("ordinary deuce needs two points and pressure identifies receiver break point", () => {
  let state = createPointMatch(STANDARD_BEST_OF_THREE, 1);
  state = points(state, 1, 3);
  state = points(state, 2, 3);
  assert.equal(pointLabel(state), "Deuce");
  let step = awardPoint(state, 2);
  state = step.state;
  assert.equal(pointLabel(state), "Advantage player 2");
  assert.equal(pressureFor(state, 2).breakPoint, true);
  assert.ok(
    step.moments.some(
      (m) => m.kind === "break-point-created" && m.player === 2,
    ),
  );
  step = awardPoint(state, 1);
  assert.equal(pointLabel(step.state), "Deuce");
  assert.ok(
    step.moments.some((m) => m.kind === "break-point-saved" && m.player === 1),
  );
  state = points(step.state, 1, 2);
  assert.deepEqual(state.games, [1, 0]);
  assert.equal(state.server, 2);
});
test("set point is distinct from match point and saved events are explicit", () => {
  let state = createPointMatch(STANDARD_BEST_OF_THREE, 1);
  for (let i = 0; i < 5; i++) state = game(state, 1);
  state = points(state, 1, 3);
  assert.deepEqual(pressureFor(state, 1), {
    breakPoint: true,
    setPoint: true,
    matchPoint: false,
  });
  const step = awardPoint(state, 2);
  assert.ok(step.moments.some((m) => m.kind === "set-point-saved"));
  assert.equal(step.state.completedSets.length, 0);
});
test("best of three finishes after two sets, with match point created and saved", () => {
  let state = set(createPointMatch(STANDARD_BEST_OF_THREE, 1), 1);
  for (let i = 0; i < 5; i++) state = game(state, 1);
  state = points(state, 1, 2);
  const created = awardPoint(state, 1);
  state = created.state;
  assert.ok(created.moments.some((m) => m.kind === "match-point-created"));
  const saved = awardPoint(state, 2);
  state = saved.state;
  assert.ok(
    saved.moments.some((m) => m.kind === "match-point-saved" && m.player === 2),
  );
  const finished = awardPoint(state, 1);
  assert.equal(finished.state.winner, 1);
  assert.deepEqual(finished.state.setsWon, [2, 0]);
  assert.ok(finished.moments.some((m) => m.kind === "match-won"));
  assert.throws(() => awardPoint(finished.state, 2), /complete/);
  assert.deepEqual(pressureFor(finished.state, 1), {
    breakPoint: false,
    setPoint: false,
    matchPoint: false,
  });
});
test("best of five does not end at two sets and ends at three", () => {
  let state = set(set(createPointMatch(SLAM_MENS_SINGLES, 2), 2), 2);
  assert.equal(state.winner, null);
  state = set(state, 2);
  assert.equal(state.winner, 2);
  assert.deepEqual(state.setsWon, [0, 3]);
});
test("ordinary sets require six games with two-game margin (7-5)", () => {
  let state = createPointMatch(STANDARD_BEST_OF_THREE, 1);
  for (let i = 0; i < 5; i++) {
    state = game(state, 1);
    state = game(state, 2);
  }
  state = game(state, 1);
  assert.equal(state.completedSets.length, 0);
  state = game(state, 1);
  assert.deepEqual(state.completedSets[0].games, [7, 5]);
});
test("tiebreak begins only at configured threshold; service order rotates 1 then pairs", () => {
  for (const first of [1, 2] as Player[]) {
    let state = sixAll(STANDARD_BEST_OF_THREE, first);
    assert.equal(state.tiebreakFirstServer, first);
    const servers: Player[] = [];
    for (const winner of [1, 2, 1, 2, 1, 2, 1] as Player[]) {
      servers.push(state.server);
      state = awardPoint(state, winner).state;
    }
    const second = first === 1 ? 2 : 1;
    assert.deepEqual(servers, [
      first,
      second,
      second,
      first,
      first,
      second,
      second,
    ]);
    assert.equal(pressureFor(state, 1).breakPoint, false);
    assert.equal(pressureFor(state, 2).breakPoint, false);
  }
});
test("seven-point tiebreak extends through 7-6 and ends at 8-6; next set server is correct", () => {
  let state = sixAll();
  for (let i = 0; i < 6; i++) {
    state = awardPoint(state, 1).state;
    state = awardPoint(state, 2).state;
  }
  assert.equal(pressureFor(state, 1).setPoint, false);
  state = awardPoint(state, 1).state;
  assert.equal(state.completedSets.length, 0);
  assert.equal(pressureFor(state, 1).setPoint, true);
  state = awardPoint(state, 1).state;
  assert.deepEqual(state.completedSets[0].tiebreak, [8, 6]);
  assert.deepEqual(state.completedSets[0].games, [7, 6]);
  assert.equal(state.server, 2);
});
test("deciding set uses explicitly selected ten-point target and still needs two-point lead", () => {
  let state = createPointMatch(SLAM_MENS_SINGLES, 1);
  for (const winner of [1, 2, 1, 2] as Player[]) state = set(state, winner);
  for (let i = 0; i < 6; i++) {
    state = game(state, 1);
    state = game(state, 2);
  }
  state = points(state, 1, 7);
  assert.equal(state.winner, null);
  assert.equal(pressureFor(state, 1).matchPoint, false);
  state = points(state, 2, 9);
  state = points(state, 1, 2);
  assert.deepEqual(state.points, [9, 9]);
  assert.equal(pressureFor(state, 1).matchPoint, false);
  state = awardPoint(state, 1).state;
  assert.equal(pressureFor(state, 1).matchPoint, true);
  state = awardPoint(state, 2).state;
  assert.equal(state.winner, null);
  state = points(state, 2, 2);
  assert.equal(state.winner, 2);
  assert.deepEqual(state.completedSets[4].tiebreak, [10, 12]);
});
test("explicit advantage set has no tiebreak at 6-6", () => {
  let state = sixAll({
    ...STANDARD_BEST_OF_THREE,
    regularTiebreak: null,
    decidingTiebreak: null,
  });
  assert.equal(state.tiebreakFirstServer, null);
  state = game(state, 1);
  assert.equal(state.completedSets.length, 0);
  state = game(state, 1);
  assert.deepEqual(state.completedSets[0].games, [8, 6]);
});
test("explicit no-ad format ends on deciding point at 40-40", () => {
  let state = createPointMatch(
    { ...STANDARD_BEST_OF_THREE, gameMode: "no-ad" },
    1,
  );
  state = points(state, 1, 3);
  state = points(state, 2, 3);
  assert.equal(pressureFor(state, 2).breakPoint, true);
  state = awardPoint(state, 2).state;
  assert.deepEqual(state.games, [0, 1]);
});
test("state and format are not mutated and invalid point winners/formats are rejected", () => {
  const format = structuredClone(STANDARD_BEST_OF_THREE);
  const state = createPointMatch(format, 1);
  format.bestOf = 5;
  assert.equal(state.format.bestOf, 3);
  const before = JSON.stringify(state);
  pressureFor(state, 1);
  awardPoint(state, 1);
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => awardPoint(state, 0 as Player), /Point winner/);
  assert.throws(
    () => createPointMatch({ ...STANDARD_BEST_OF_THREE, bestOf: 1 as 3 }, 1),
    /Unsupported/,
  );
  assert.throws(
    () =>
      createPointMatch(
        {
          ...STANDARD_BEST_OF_THREE,
          regularTiebreak: { atGames: 6, target: 0 },
        },
        1,
      ),
    /Invalid tiebreak/,
  );
});

test("best-of-three deciding override applies only in the final set and tiebreak match point can be saved", () => {
  const format = {
    ...STANDARD_BEST_OF_THREE,
    decidingTiebreak: { atGames: 6, target: 10 },
  };
  let state = set(createPointMatch(format, 1), 1);
  state = set(state, 2);
  for (let i = 0; i < 6; i++) {
    state = game(state, 1);
    state = game(state, 2);
  }
  state = points(state, 1, 9);
  assert.equal(pressureFor(state, 1).matchPoint, true);
  const step = awardPoint(state, 2);
  assert.ok(
    step.moments.some((m) => m.kind === "match-point-saved" && m.player === 2),
  );
  assert.equal(
    step.moments.some((m) => m.kind === "break-point-saved"),
    false,
  );
  assert.throws(() => pressureFor(state, 3 as Player), /Pressure player/);
});
