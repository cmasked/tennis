import { parseFeedEvent } from "./client.ts";
import type { FeedEvent } from "./contract.ts";

// Minimal SSE consumer for Node diagnostics/tests. Browser EventSource handles
// framing itself; mobile can use a compatible SSE library with our same reducer.
export async function* readFeedEvents(
  response: Response,
): AsyncGenerator<FeedEvent> {
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/event-stream") ||
    !response.body
  )
    throw new Error("Expected a successful SSE response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 2_000_000)
        throw new Error("SSE frame exceeded diagnostic size limit.");
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const fields = frame.split(/\r?\n/);
        const data = fields
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue; // Comments/heartbeats never count as match updates.
        const event = parseFeedEvent(JSON.parse(data));
        const id = fields
          .find((line) => line.startsWith("id:"))
          ?.slice(3)
          .trim();
        const name = fields
          .find((line) => line.startsWith("event:"))
          ?.slice(6)
          .trim();
        if (id !== event.snapshot.cursor || name !== event.type)
          throw new Error("SSE envelope and payload disagree.");
        yield event;
      }
    }
  } finally {
    await reader.cancel().catch(() => {}); // Breaking a loop releases its stream.
    reader.releaseLock();
  }
}
