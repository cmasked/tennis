import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeGames,
  crossCheckTimeline,
  type GameRecord,
} from "../src/scoring.ts";
import { describeShape } from "../src/diagnostics.ts";
function game(
  content: string,
  overrides: Partial<GameRecord> = {},
): GameRecord {
  return {
    set: 1,
    game: 1,
    server: 1,
    tiebreak: false,
    finalScore: "1-0",
    content,
    ...overrides,
  };
}
test("reconstructs legal omitted finishing point with explicit provenance", () => {
  const [result] = analyzeGames([game("15:0,30:0,40:0,40:15")]);
  assert.equal(result.verifiedTransitions, 4);
  assert.equal(result.terminal, "reconstructed");
  assert.equal(result.outcome, "hold");
});
test("calculates deuce break points saved without relying on BP markers", () => {
  const [result] = analyzeGames([
    game(
      "0:15,0:30,0:40 BP,15:40 BP,30:40 BP,40:40,A:40,40:40,40:A BP,40:40,A:40",
    ),
  ]);
  assert.equal(result.breakPointsSaved, 4);
  assert.equal(result.terminal, "reconstructed");
  assert.equal(result.warnings.length, 0);
});
test("detects break of serve from game-score progression independently of point completeness", () => {
  const results = analyzeGames([
    game("15:0,30:0,40:0"),
    game("15:0,30:0,40:0 BP", { game: 2, server: 2, finalScore: "2-0" }),
  ]);
  assert.equal(results[1].outcome, "break");
  assert.equal(results[1].winner, 1);
});
test("gaps, duplicates, corrections and unsupported notation withhold further point attribution", () => {
  for (const sequence of [
    "15:0,40:0",
    "15:0,15:0",
    "15:0,0:0",
    "15:0,banana",
    "0:0,0:0",
  ]) {
    const [result] = analyzeGames([game(sequence)]);
    assert.equal(result.terminal, "unknown");
    assert.ok(result.warnings.length > 0);
  }
});
test("incompatible final winner cannot manufacture a terminal point", () => {
  const [result] = analyzeGames([game("0:15,0:30,0:40")]);
  assert.equal(result.terminal, "unknown");
  assert.match(result.warnings.join(" "), /cannot win/);
});
test("ongoing game has no winner or invented terminal point", () => {
  const [result] = analyzeGames([game("15:0", { finalScore: "0-0" })]);
  assert.equal(result.winner, null);
  assert.equal(result.terminal, "unknown");
});
test("tiebreak points and unknown server are not interpreted as ordinary holds or breaks", () => {
  assert.equal(
    analyzeGames([game("*1:0,1:1", { tiebreak: true })])[0].verifiedTransitions,
    0,
  );
  const [result] = analyzeGames([
    game("0:15,0:30,0:40", { server: 0, finalScore: "0-1" }),
  ]);
  assert.equal(result.outcome, "unknown");
  assert.equal(result.breakPointsSaved, 0);
});
test("flags inconsistent BP markers without replacing calculated scoring facts", () => {
  const [result] = analyzeGames([game("15:0 BP,30:0,40:0")]);
  assert.match(result.warnings.join(" "), /BP marker conflicts/);
});
test("game-score jumps and missing game numbers withhold winner attribution and alignment", () => {
  for (const value of [
    game("15:0", { finalScore: "2-0" }),
    game("15:0", { game: 2, finalScore: "2-0" }),
  ]) {
    const results = analyzeGames([value]);
    assert.equal(results[0].winner, null);
    assert.match(crossCheckTimeline(results, [], ["A", "B"]), /withheld/);
  }
});
test("cross-checks supported timeline wording by winner and outcome and exposes disagreements", () => {
  const results = analyzeGames([game("15:0,30:0,40:0")]);
  assert.match(
    crossCheckTimeline(results, ["Game 1 - A - holds to 0"], ["A", "B"]),
    /1 agree; 0 disagree/,
  );
  assert.match(
    crossCheckTimeline(results, ["Game 1 - B - breaks to 0"], ["A", "B"]),
    /0 agree; 1 disagree/,
  );
  assert.match(
    crossCheckTimeline(results, ["Unrecognized provider text"], ["A", "B"]),
    /1 unmatched/,
  );
});
test("diagnostics reveal nesting and types without string/number/credential values", () => {
  const output = describeShape({
    success: true,
    results: [
      {
        player1: null,
        secret: "DO-NOT-PRINT",
        statistics: { aces: 123456789 },
        message: "DO-NOT-PRINT",
      },
    ],
    apiKey: "DO-NOT-PRINT",
  });
  assert.match(output, /response.results\[0\].player1: null/);
  assert.equal(output.includes("DO-NOT-PRINT"), false);
  assert.equal(output.includes("123456789"), false);
  assert.equal(output.includes("apiKey"), false);
});
