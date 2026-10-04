/**
 * The server's copy of the engine is plain CommonJS, shared with the Socket.io
 * server, so it has no types of its own. Only the parity test imports it, and
 * the test's whole job is to assert the two agree at runtime — a hand-written
 * declaration here would just be a second thing to keep in sync.
 */
declare module '*/server/runner.cjs' {
  const mod: Record<string, any>;
  export = mod;
}
