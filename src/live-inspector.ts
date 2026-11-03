/**
 * Fixed provider lookup routes and redacted JSON inspection.
 * Identifier families remain separate: fixture ID, live event ID, and compound match key.
 */
import { API_HOST, fetchProviderJson } from "./client.ts";

export function liveLookupUrl(matchId: string): string {
  if (!/^[1-9]\d*$/.test(matchId) || !Number.isSafeInteger(Number(matchId))) {
    throw new Error(
      "Supply one positive numeric Match ID from the fixture list, not the compound Live ID.",
    );
  }
  // This exact lookup pattern was observed in links.live on an ATP fixture.
  // Keep type and source; do not substitute the compound liveMatchId.
  return `https://${API_HOST}/tennis/v2/matches/${matchId}/live?type=atp&source=today`;
}

export function fetchLiveLookup(
  matchId: string,
  key: string | undefined,
  request: typeof fetch = fetch,
) {
  return fetchProviderJson(liveLookupUrl(matchId), key, request);
}

// Endpoint specified in the project's provider reference; its live response
// structure still needs to be observed. This is not an upcoming-fixtures query.
export const LIVE_EVENTS_URL = `https://${API_HOST}/tennis/v2/extend/api/events/live`;

export function fetchLiveEvents(
  key: string | undefined,
  request: typeof fetch = fetch,
) {
  return fetchProviderJson(LIVE_EVENTS_URL, key, request);
}

export function formatLiveInspection(
  payload: unknown,
  key: string,
  mode: "lookup" | "list" = "lookup",
): string {
  // The live response schema is not yet observed. Print redacted JSON for
  // inspection, not invented normalized score/server/point fields.
  const serialized = JSON.stringify(
    payload,
    (field, value: unknown) => {
      if (/key|token|secret|authorization|password|cookie/i.test(field))
        return "[REDACTED]";
      if (typeof value === "string") {
        const redacted = key ? value.split(key).join("[REDACTED]") : value;
        return redacted.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
      }
      return value;
    },
    2,
  );
  const redacted = key ? serialized.split(key).join("[REDACTED]") : serialized;
  const limit = 16000;
  return [
    mode === "list"
      ? "Live-events request succeeded. JSON envelope validated; event schema is not yet verified."
      : "ATP live lookup succeeded. JSON envelope validated; live field schema is not yet verified.",
    "One request only: no polling, pagination, or automatic follow-up requests.",
    mode === "list"
      ? "Provider-reported live events below. Coverage, status semantics, and identifier mapping need inspection."
      : "A live lookup may return only a mapping, an empty result, or an unavailable match.",
    ...(mode === "list"
      ? [
          "Do not pass an arbitrary event ID to api:live: that command expects a numeric ATP fixture Match ID.",
        ]
      : []),
    "Do not interpret this as verified live scoring or point history.",
    "",
    redacted.slice(0, limit),
    ...(redacted.length > limit
      ? [
          "[Display truncated at 16000 characters; not evidence of invalid provider JSON.]",
        ]
      : []),
  ].join("\n");
}
