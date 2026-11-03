import { replayProviderBridge } from './replay/provider.ts';
import { replayFormats } from './replay/formats.ts';
import { buildMoments, reconcileMoments, type MatchMoment } from './engine/moments.ts';
import { scenarios } from './replay/scenarios.ts';
if (process.argv.length !== 2) {
  console.error('Usage: npm run replay (no arguments). This is synthetic offline data.');
  process.exitCode = 1;
} else {
  console.log('SYNTHETIC OFFLINE REPLAY — no API key, network requests, or real match data.');
  console.log('Snapshots are shown immediately in order; this is an engine demonstration, not a live match.');
  let previous: MatchMoment[] = [], matchKey = '';
  scenarios.forEach((scenario, index) => {
    if (scenario.snapshot.matchKey !== matchKey) { previous = []; matchKey = scenario.snapshot.matchKey; }
    const moments = buildMoments(scenario.snapshot);
    const changes = reconcileMoments(previous, moments);
    console.log(`\n${index + 1}. ${scenario.title}`);
    for (const moment of changes.removed) console.log(`  RETRACT: ${moment.text}`);
    for (const moment of changes.updated) console.log(`  UPDATE [${moment.confidence}]: ${moment.text}`);
    for (const moment of changes.added) console.log(`  ${moment.kind === 'uncertainty' ? 'UNCERTAIN' : 'NEW'} [${moment.confidence}]: ${moment.text}`);
    if (!changes.added.length && !changes.updated.length && !changes.removed.length) console.log('  No changes; no duplicate commentary.');
    previous = moments;
  });
  console.log(replayFormats());
  console.log(replayProviderBridge());
  console.log('\nScope: ordinary advantage games, deterministic moments and snapshot corrections. Explicit-format set/match points and canonical tiebreak rules are demonstrated separately. Conservative provider-history reconstruction is now tested synthetically. Real tiebreak encoding, persistent deduplication and live delivery remain unverified or unimplemented.');
}
