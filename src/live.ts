import { fetchLiveLookup, formatLiveInspection } from './live-inspector.ts';

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: npm run api:live -- <numeric-match-id>');
  process.exitCode = 1;
} else {
  try {
    const key = process.env.TENNIS_API_KEY;
    const payload = await fetchLiveLookup(args[0], key);
    console.log(formatLiveInspection(payload, key!.trim()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unexpected live lookup failure.');
    process.exitCode = 1;
  }
}
