import type { MatchSnapshot } from './model.ts';
import type { HistoryResult } from './history.ts';
export function summarizeHistory(snapshot: MatchSnapshot, history: HistoryResult, discoveryStatus?: string): string {
  const safe = (text: string) => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
  const players = snapshot.players.map(safe);
  const lines = ['MATCH SUMMARY (derived from supplied history and explicit format)'];
  const state = history.state;
  if (!state) return lines.concat('Insufficient start-of-match history; no match story established.').join('\n');
  if (history.stopped) lines.push('Partial verified prefix only. Later results and current match state are withheld.');
  const scores = state.completedSets.map(set => set.games.join('-'));
  if (!state.winner) scores.push(state.games.join('-'));
  lines.push(`Sets/games in ${players[0]} / ${players[1]} order: ${scores.join(', ')}.`);
  if (state.winner && !history.stopped) {
    lines.push(`${players[state.winner - 1]} wins the match, ${state.setsWon[state.winner - 1]} sets to ${state.setsWon[state.winner === 1 ? 1 : 0]}.`);
    if (discoveryStatus === 'InPlay') lines.push('WARNING: discovery says InPlay, but supplied history finishes the match. Treat discovery/live status as inconsistent; this is not evidence of current play.');
  }
  const saved = (['break-point-saved', 'set-point-saved', 'match-point-saved'] as const).map(kind => [kind, [1, 2].map(side => history.moments.filter(m => m.kind === kind && m.player === side).length)] as const);
  for (const [kind, counts] of saved) if (counts.some(count => count > 0)) lines.push(`${kind.replaceAll('-', ' ')} in reconstructed prefix: ${players[0]} ${counts[0]}, ${players[1]} ${counts[1]}.`);
  lines.push(`${history.observedPoints} recorded score transitions + ${history.reconstructedPoints} explicitly reconstructed terminal points. No shot types or emotions inferred.`, 'History consistency is not a guarantee of provider freshness or completeness.');
  return lines.join('\n');
}
