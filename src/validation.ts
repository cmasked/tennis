/**
 * Bundled provider feasibility checks. Discovery costs one request; details cost up to three.
 * Parsers, scoring analysis and timeline cross-checks reuse those payloads without extra requests.
 */
import { adaptMatchstatStatistics } from "./adapters/matchstat-statistics.ts";
import { summarizeHistory } from "./engine/summary.ts";
import { reconstructHistory, formatHistory } from "./engine/history.ts";
import type { ScoringFormat } from "./engine/point-engine.ts";
import { adaptMatchstatPoints } from "./adapters/matchstat-points.ts";
import {
  analyzeGames,
  formatGameAnalysis,
  crossCheckTimeline,
} from "./scoring.ts";
import { describeShape } from "./diagnostics.ts";
import { API_HOST, fetchProviderJson } from "./client.ts";
import { fetchLiveEvents } from "./live-inspector.ts";
import {
  parseLiveEvents,
  type LiveEvent,
  type LiveFilters,
} from "./live-events.ts";

function fail(path: string): never {
  throw new Error(`Unexpected response schema at ${path}.`);
}
function obj(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(path);
  return value as Record<string, unknown>;
}
function str(value: unknown, path: string): string {
  if (typeof value !== "string") return fail(path);
  return value;
}
function num(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fail(path);
  return value;
}
function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path);
  return value;
}
function name(value: unknown, path: string): string {
  return str(obj(value, path).name, `${path}.name`);
}
export function detailUrls(event: LiveEvent) {
  // matchId is a deprecated alias; prefer the documented matchKey.
  const key = event.matchKey ?? event.matchId;
  if (
    !key ||
    !/^[1-9]\d*-[1-9]\d*-[1-9]\d*-[1-9]\d*$/.test(key) ||
    !/^[1-9]\d*$/.test(event.eventId)
  )
    throw new Error(
      "Selected event lacks valid documented identifiers. No detail requests made.",
    );
  return {
    points: `https://${API_HOST}/tennis/v2/extend/api/event/pbp/${key.split("-").join("/")}`,
    statistics: `https://${API_HOST}/tennis/v2/extend/api/event/get/statistics/${event.eventId}`,
    timeline: `https://${API_HOST}/tennis/v2/extend/api/event/timeline/${event.eventId}`,
  };
}
function identity(first: string, second: string, event: LiveEvent): string {
  const normalize = (s: string) => s.trim().toLowerCase();
  const expected = [event.player1, event.player2].map(normalize).sort();
  const actual = [first, second].map(normalize).sort();
  return expected.every((v, i) => v === actual[i])
    ? "Player names match discovery (response side order preserved)."
    : "WARNING: player names differ from discovery; do not combine these responses until resolved.";
}
export function inspectPoints(payload: unknown, event: LiveEvent): string {
  const root = obj(payload, "point-history");
  if (root.success !== true) return fail("point-history.success");
  const meta = obj(root.meta, "meta");
  const first = name(meta.player1, "meta.player1"),
    second = name(meta.player2, "meta.player2");
  const result = obj(root.result, "result");
  const sets = list(result.sets, "result.sets");
  const lines = [
    identity(first, second, event),
    `Response order: ${first} / ${second}`,
    `Reported score: ${str(result.score, "result.score")}`,
    `Sets supplied: ${sets.length}`,
  ];
  let games = 0,
    entries = 0,
    empty = 0;
  sets.forEach((value, si) => {
    const set = obj(value, `sets[${si}]`);
    num(set.setNumber, "setNumber");
    str(set.setScore, "setScore");
    list(set.games, "games").forEach((value, gi) => {
      const game = obj(value, `games[${gi}]`);
      const server = num(game.server, "server");
      if (![0, 1, 2].includes(server)) return fail("server");
      if (typeof game.tiebreak !== "boolean") return fail("tiebreak");
      num(game.gameNumber, "gameNumber");
      str(game.finalScore, "finalScore");
      const content = str(game.fifteens_content, "fifteens_content");
      const scores = content
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      games++;
      entries += scores.length;
      if (!scores.length) empty++;
      if (lines.length < 15)
        lines.push(
          `Set ${set.setNumber}, game ${game.gameNumber}: server=${server === 0 ? "unknown" : server === 1 ? first : second}; tiebreak=${game.tiebreak}; final=${game.finalScore}; sequence=${content || "(empty)"}`,
        );
    });
  });
  lines.push(
    `Games supplied: ${games}; nonempty comma-separated score entries: ${entries}; empty game sequences: ${empty}.`,
    "Entries are raw score records, not verified complete points. Gaps, corrections, terminal-point encoding and tiebreak notation still need verification.",
  );
  const snapshot = adaptMatchstatPoints(
    payload,
    event.matchKey ?? event.matchId ?? event.eventId,
  );
  lines.push(formatGameAnalysis(analyzeGames(snapshot.games)));
  return lines.join("\n");
}
export function inspectStatistics(payload: unknown, event: LiveEvent): string {
  const stats = adaptMatchstatStatistics(payload);
  const [first, second] = stats.players;
  const lines = [
    identity(first, second, event),
    `Statistics envelope: ${stats.envelope}.`,
    `Response order: ${first} / ${second}`,
    `Periods supplied: ${stats.periods.join(", ") || "(none)"}`,
  ];
  for (const metric of stats.metrics.slice(0, 20)) {
    const values = metric.values.map(
      (cell) =>
        `${cell.value}${cell.total === undefined ? "" : "/" + cell.total}${cell.percentage === undefined ? "" : ` (${cell.percentage}%)`}`,
    );
    lines.push(
      `${metric.period}.${metric.category}.${metric.name}: ${values[0]} / ${values[1]}`,
    );
  }
  lines.push(
    `Validated metrics: ${stats.metrics.length}. Values follow response player order. These are cumulative statistics, not point-ending labels.`,
  );
  if (stats.metrics.length > 20)
    lines.push(
      "Showing first 20 metrics; all returned metrics were validated.",
    );
  if (!stats.metrics.length)
    lines.push(
      "No statistics metrics supplied; do not interpret unavailable values as zero.",
    );
  return lines.join("\n");
}
export function inspectTimeline(payload: unknown): string {
  const root = obj(payload, "timeline");
  if (root.success !== true) return fail("timeline.success");
  const rows = list(root.results, "timeline.results");
  const texts = rows.map((value, i) => {
    const item = obj(value, `timeline[${i}]`);
    str(item.id, "timeline.id");
    return str(item.text, "timeline.text");
  });
  return [
    `Timeline entries supplied: ${rows.length}.`,
    ...texts.slice(-12),
    "Provider text only; hold/break meaning has not been independently reconstructed.",
  ].join("\n");
}
export async function validateLiveMatch(
  key: string | undefined,
  filters: LiveFilters & { format?: ScoringFormat } = {},
  request: typeof fetch = fetch,
  log: (s: string) => void = () => {},
) {
  let calls = 0;
  const counted: typeof fetch = async (url, options) => {
    calls++;
    return request(url, options);
  };
  log(
    "Request budget: at most 4 (1 live discovery + point history + statistics + timeline). No retries or polling.",
  );
  const events = parseLiveEvents(await fetchLiveEvents(key, counted));
  const eligible = events.filter(
    (e) =>
      e.status === "InPlay" &&
      (!filters.tour || e.tour === filters.tour) &&
      (!filters.tournament ||
        e.tournament.toLowerCase().includes(filters.tournament.toLowerCase())),
  );
  // Prefer recently updated entries. Never silently fall back outside filters.
  eligible.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const event = eligible.find((e) => {
    try {
      detailUrls(e);
      return true;
    } catch {
      return false;
    }
  });
  if (!event) {
    log(
      "No matching InPlay event with valid identifiers. Stopped after discovery; no detail requests.",
    );
    return { calls, failures: 0, selected: false };
  }
  log(
    `Selected: ${event.player1} vs ${event.player2} | ${event.tournament} | ${event.tour}\nEvent ID: ${event.eventId} | Match key: ${event.matchKey ?? event.matchId}\nProvider updatedAt: ${event.updatedAt === null ? "unknown" : new Date(event.updatedAt).toISOString()}. InPlay and freshness are provider claims.`,
  );
  const urls = detailUrls(event);
  let failures = 0;
  let pointsPayload: unknown;
  for (const [label, url, inspect] of [
    ["POINT HISTORY", urls.points, (p: unknown) => inspectPoints(p, event)],
    [
      "STATISTICS",
      urls.statistics,
      (p: unknown) => inspectStatistics(p, event),
    ],
    ["TIMELINE", urls.timeline, inspectTimeline],
  ] as const) {
    let payload: unknown;
    try {
      payload = await fetchProviderJson(url, key, counted);
      log(`\n${label}\n${inspect(payload)}`);
      if (label === "POINT HISTORY") {
        pointsPayload = payload;
        if (filters.format) {
          const snapshot = adaptMatchstatPoints(
            payload,
            event.matchKey ?? event.matchId ?? event.eventId,
          );
          const agreement = identity(
            snapshot.players[0],
            snapshot.players[1],
            event,
          );
          if (agreement.startsWith("WARNING")) {
            failures++;
            log("FORMAT-AWARE HISTORY withheld: player identity mismatch.");
          } else {
            log(
              `Explicit format: best-of-${filters.format.bestOf}, ${filters.format.gameMode}.`,
            );
            const history = reconstructHistory(snapshot, filters.format);
            log(formatHistory(history, snapshot.players));
            log(summarizeHistory(snapshot, history, event.status));
            if (history.stopped) failures++;
          }
        } else
          log(
            "FORMAT-AWARE HISTORY not run: supply --format standard-bo3 or slam-men explicitly.",
          );
      }
      if (label === "TIMELINE" && pointsPayload)
        log(compareResponses(pointsPayload, payload));
    } catch (error) {
      failures++;
      const message =
        error instanceof Error ? error.message : "Unexpected failure";
      log(`\n${label}: FAILED — ${message}`);
      if (payload !== undefined) log(describeShape(payload));
      if (/HTTP (401|403|429)/.test(message)) {
        log("Stopped to avoid further requests after access/quota failure.");
        break;
      }
    }
  }
  log(
    `\nRequests made: ${calls}. Failed checks: ${failures}. This run does not establish latency, completeness, correction handling, licensing, or engine readiness.`,
  );
  return { calls, failures, selected: true };
}

function compareResponses(points: unknown, timeline: unknown): string {
  const root = obj(points, "points");
  const meta = obj(root.meta, "meta");
  const snapshot = adaptMatchstatPoints(points, "validation-match");
  const texts = list(obj(timeline, "timeline").results, "results").map((v) =>
    str(obj(v, "row").text, "text"),
  );
  return crossCheckTimeline(analyzeGames(snapshot.games), texts, [
    name(meta.player1, "player1"),
    name(meta.player2, "player2"),
  ]);
}
