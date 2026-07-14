/**
 * midi-writer-js ships type definitions, but its package.json "exports" map
 * doesn't expose them under moduleResolution: bundler. Minimal shim so the
 * declaration build succeeds; the runtime API is used as `any`.
 */
declare module "midi-writer-js";
