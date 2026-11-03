// Replay integration tests fail if the CLI starts using the provider fetch path.
globalThis.fetch = async () => {
  throw new Error("Network forbidden in offline replay test");
};
