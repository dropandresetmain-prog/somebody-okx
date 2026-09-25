// Components import CSS for Next.js. node:test (via tsx) has no CSS loader, so
// register a no-op handler. Import this FIRST in any test that renders them.
const req = require as unknown as { extensions: Record<string, (mod: { exports: unknown }) => void> };
if (!req.extensions[".css"]) {
  req.extensions[".css"] = (mod) => {
    mod.exports = {};
  };
}

export {};
