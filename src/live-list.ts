/**
 * Live discovery CLI. Filters are applied locally after exactly one provider fetch.
 * Raw mode inspects the envelope; readable mode validates the observed live-event fields.
 */
import { fetchLiveEvents, formatLiveInspection } from "./live-inspector.ts";
import {
  parseLiveEvents,
  parseLiveOptions,
  formatLiveEvents,
} from "./live-events.ts";

try {
  const options = parseLiveOptions(process.argv.slice(2));
  const key = process.env.TENNIS_API_KEY;
  const payload = await fetchLiveEvents(key);
  const fetchedAt = Date.now();
  const output = options.raw
    ? formatLiveInspection(payload, key!.trim(), "list")
    : formatLiveEvents(parseLiveEvents(payload), options, fetchedAt);
  // Defense in depth if the provider echoes the exact credential in a text field.
  console.log(output.split(key!.trim()).join("[REDACTED]"));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Unexpected live-events failure.",
  );
  process.exitCode = 1;
}
