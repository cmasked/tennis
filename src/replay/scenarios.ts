/**
 * Synthetic authoritative snapshots for duplicate, correction, and uncertainty exercises.
 */
import type { MatchSnapshot } from "../engine/model.ts";
import type { GameRecord } from "../scoring.ts";

// Entirely synthetic. No real provider data, players or credentials retained.
const hold = (
  game: number,
  server: number,
  finalScore: string,
  content: string,
): GameRecord => ({
  set: 1,
  game,
  server,
  finalScore,
  content,
  tiebreak: false,
});
const first = hold(1, 1, "1-0", "15:0,30:0,40:0");
const saved = hold(
  2,
  2,
  "1-1",
  "15:0,30:0,40:0 BP,40:15 BP,40:30 BP,40:40,40:A",
);
const broken = hold(3, 1, "1-2", "0:15,0:30,0:40 BP");
const base = (games: GameRecord[]): MatchSnapshot => ({
  matchKey: "synthetic-match",
  players: ["Alex Example", "Jordan Example"],
  games,
});
export const scenarios: { title: string; snapshot: MatchSnapshot }[] = [
  {
    title: "Ordinary hold; omitted terminal point can be reconstructed",
    snapshot: base([first]),
  },
  {
    title: "Deuce game: Jordan saves three break points and holds",
    snapshot: base([first, saved]),
  },
  {
    title: "Jordan breaks Alex; a new match moment appears",
    snapshot: base([first, saved, broken]),
  },
  {
    title: "Identical snapshot: no duplicate moments",
    snapshot: base([first, saved, broken]),
  },
  {
    title: "Corrected game three: previous break must be retracted",
    snapshot: base([first, saved, hold(3, 1, "2-1", "15:0,30:0,40:0")]),
  },
  {
    title: "Gap in game four: hold known, missing points remain unknown",
    snapshot: base([
      first,
      saved,
      hold(3, 1, "2-1", "15:0,30:0,40:0"),
      hold(4, 2, "2-2", "0:15,0:40"),
    ]),
  },
  {
    title: "Separate incomplete history: cannot invent games one and two",
    snapshot: {
      ...base([hold(3, 1, "2-1", "15:0,30:0,40:0")]),
      matchKey: "synthetic-missing-games",
    },
  },
  {
    title:
      "Provider-shaped tiebreak sample: unverified string reconstruction stays explicit",
    snapshot: {
      ...base([{ ...hold(1, 1, "", "*1:0,1:1"), tiebreak: true }]),
      matchKey: "synthetic-tiebreak",
    },
  },
];
