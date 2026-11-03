import { fetchLiveEvents, formatLiveInspection } from './live-inspector.ts';

if (process.argv.length !== 2) {
  console.error('Usage: npm run api:live-list (no arguments)');
  process.exitCode = 1;
} else {
  try {
    const key = process.env.TENNIS_API_KEY;
    const payload = await fetchLiveEvents(key);
    console.log(formatLiveInspection(payload, key!.trim(), 'list'));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unexpected live-events failure.');
    process.exitCode = 1;
  }
}
