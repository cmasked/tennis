import { createServer, type ServerResponse } from "node:http";
import { FeedStore } from "./store.ts";
import { createDemo } from "./demo.ts";
import {
  diagnosticHtml,
  diagnosticCss,
  diagnosticJs,
} from "./diagnostic-page.ts";
import type { FeedEvent } from "./contract.ts";

// Dependency injection lets integration tests exercise real HTTP/SSE without
// starting timers, touching API credentials, or leaving a server running.
export function createFeedServer(
  store = new FeedStore(),
  heartbeatMs = 15_000,
) {
  const demo = createDemo(store);
  const streams = new Set<ServerResponse>();
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    );
    const json = (status: number, value: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    const host = request.headers.host ?? "";
    // Local dev only. Reject foreign Host/Origin to avoid exposing mutation
    // controls through a browser page hosted on another site (DNS rebinding/CSRF).
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) {
      json(403, { error: "Local development host required" });
      return;
    }
    if (request.headers.origin && request.headers.origin !== `http://${host}`) {
      json(403, { error: "Cross-origin requests are not enabled" });
      return;
    }
    let url: URL;
    try {
      url = new URL(request.url ?? "/", `http://${host}`);
    } catch {
      json(400, { error: "Invalid URL" });
      return;
    }
    if (
      request.method === "GET" &&
      ["/", "/diagnostic.js", "/diagnostic.css"].includes(url.pathname)
    ) {
      const contents =
        url.pathname === "/"
          ? diagnosticHtml
          : url.pathname.endsWith(".js")
            ? diagnosticJs
            : diagnosticCss;
      response.writeHead(200, {
        "Content-Type":
          url.pathname === "/"
            ? "text/html; charset=utf-8"
            : url.pathname.endsWith(".js")
              ? "text/javascript; charset=utf-8"
              : "text/css; charset=utf-8",
      });
      response.end(contents);
      return;
    }
    if (request.method === "GET" && url.pathname === "/health") {
      json(200, { ok: true, mode: "synthetic-only", schemaVersion: 1 });
      return;
    }
    if (request.method === "GET" && url.pathname === "/matches") {
      json(200, { matches: store.list(), demo: demo.status() });
      return;
    }
    if (request.method === "POST" && url.pathname === "/demo/step") {
      json(200, demo.step());
      return;
    }
    if (request.method === "POST" && url.pathname === "/demo/reset") {
      json(200, demo.reset());
      return;
    }
    const match = /^\/matches\/([A-Za-z0-9_-]{1,100})(\/events)?$/.exec(
      url.pathname,
    );
    if (!match || request.method !== "GET") {
      json(404, { error: "Route not found" });
      return;
    }
    const id = match[1],
      snapshot = store.get(id);
    if (!snapshot) {
      json(404, { error: "Match not found" });
      return;
    }
    if (!match[2]) {
      json(200, snapshot);
      return;
    }
    // Header wins over query so native EventSource retries don't reuse an old
    // explicit query cursor after receiving newer messages.
    const cursor =
      request.headers["last-event-id"] ??
      url.searchParams.get("cursor") ??
      undefined;
    if (Array.isArray(cursor) || (cursor && cursor.length > 150)) {
      json(400, { error: "Invalid cursor" });
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();
    streams.add(response);
    const pending: FeedEvent[] = [];
    let blocked = false;
    const flush = () => {
      while (!blocked && pending.length && !response.destroyed) {
        const event = pending.shift()!;
        // write(false) means accepted but buffered, NOT rejected. Wait for drain
        // rather than destroying the first large snapshot (which would loop on reconnect).
        blocked = !response.write(
          `id: ${event.snapshot.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        );
      }
    };
    const send = (event: FeedEvent) => {
      if (response.destroyed || response.writableEnded) return;
      // Bounded backpressure queue. A genuinely slow client must reconnect and
      // resume/reset rather than accumulate unlimited replacement snapshots.
      if (pending.length >= 50) {
        response.destroy();
        return;
      }
      pending.push(event);
      flush();
    };
    response.on("drain", () => {
      blocked = false;
      flush();
    });
    // Both operations are synchronous within one event-loop turn, so a source
    // update cannot race between the backlog read and listener registration.
    for (const event of store.resume(id, cursor) ?? []) send(event);
    const unsubscribe = store.subscribe(id, send);
    const heartbeat = setInterval(() => {
      if (!blocked && !pending.length && !response.destroyed)
        blocked = !response.write(
          ": transport heartbeat; not provider freshness\n\n",
        );
    }, heartbeatMs);
    heartbeat.unref();
    response.on("close", () => {
      unsubscribe();
      clearInterval(heartbeat);
      pending.length = 0;
      streams.delete(response);
    });
  });
  server.requestTimeout = 10_000;
  return {
    server,
    store,
    close: async () => {
      for (const response of streams) response.end();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
