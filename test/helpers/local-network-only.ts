// Feed checks may use their own local HTTP server, never a provider endpoint.
const original = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== "127.0.0.1")
    throw new Error("External network forbidden in feed checks");
  return original(input, options);
};
