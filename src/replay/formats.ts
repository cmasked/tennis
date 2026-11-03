import { awardPoint, createPointMatch, pointLabel, pressureFor, STANDARD_BEST_OF_THREE, SLAM_MENS_SINGLES, type Player, type PointState, type ScoringFormat } from '../engine/point-engine.ts';
function game(state: PointState, winner: Player) { for (let i = 0; i < 4; i++) state = awardPoint(state, winner).state; return state; }
function set(state: PointState, winner: Player) { for (let i = 0; i < 6; i++) state = game(state, winner); return state; }
function sixAll(format: ScoringFormat) {
  let state = createPointMatch(format, 1);
  for (let i = 0; i < 6; i++) { state = game(state, 1); state = game(state, 2); }
  return state;
}
export function replayFormats(): string {
  const lines = ['\nEXPLICIT FORMAT REPLAY — synthetic canonical point winners, independent of provider tiebreak encoding.'];
  let state = createPointMatch(STANDARD_BEST_OF_THREE, 1);
  for (let i = 0; i < 5; i++) state = game(state, 1);
  for (let i = 0; i < 3; i++) state = awardPoint(state, 1).state;
  lines.push(`9. Best-of-three: set score 5-0, game ${pointLabel(state)}; player 1 set point=${pressureFor(state, 1).setPoint}, match point=${pressureFor(state, 1).matchPoint}.`);
  state = awardPoint(state, 2).state;
  lines.push(`   Player 2 saves a set point; score now ${pointLabel(state)}.`);
  state = awardPoint(state, 1).state;
  for (let i = 0; i < 5; i++) state = game(state, 1);
  for (let i = 0; i < 3; i++) state = awardPoint(state, 1).state;
  const finished = awardPoint(state, 1);
  lines.push(`10. Player 1 match point=${pressureFor(state, 1).matchPoint}; next winning point emits ${finished.moments.map(m => m.kind).join(', ')}. Sets: ${finished.state.setsWon.join('-')}.`);
  state = sixAll(STANDARD_BEST_OF_THREE);
  const servers: number[] = [];
  for (const winner of [1, 2, 1, 2, 1, 2, 1] as Player[]) { servers.push(state.server); state = awardPoint(state, winner).state; }
  lines.push(`11. Seven-point tiebreak: first seven point servers=${servers.join(', ')} (first server 1); play continues until target AND two-point lead.`);
  state = sixAll(STANDARD_BEST_OF_THREE);
  for (let i = 0; i < 6; i++) { state = awardPoint(state, 1).state; state = awardPoint(state, 2).state; }
  state = awardPoint(state, 1).state;
  lines.push(`   At 7-6: set complete=${state.completedSets.length > 0}; next player 1 point wins set.`);
  state = awardPoint(state, 1).state;
  lines.push(`   Set result ${state.completedSets[0].games.join('-')}, tiebreak ${state.completedSets[0].tiebreak!.join('-')}; next server=${state.server}.`);
  state = createPointMatch(SLAM_MENS_SINGLES, 1);
  state = set(state, 1); state = set(state, 2); state = set(state, 1); state = set(state, 2);
  for (let i = 0; i < 6; i++) { state = game(state, 1); state = game(state, 2); }
  for (let i = 0; i < 9; i++) state = awardPoint(state, 1).state;
  lines.push(`12. Explicit best-of-five deciding-set format: 6-6 games, ${pointLabel(state)}; player 1 match point=${pressureFor(state, 1).matchPoint}. Winning point finishes at 10-0, not 7-0.`);
  lines.push('Canonical tiebreak rules are tested offline. Mapping real provider tiebreak strings to these points remains unverified.');
  return lines.join('\n');
}
