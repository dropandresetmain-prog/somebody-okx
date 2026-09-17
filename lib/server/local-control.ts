const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function isLocalControlRequest(request: Request): boolean {
  const target = new URL(request.url);
  if (!loopback.has(target.hostname)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    // Next may canonicalize 127.0.0.1 to localhost. Both are the same loopback server.
    return (
      loopback.has(source.hostname) &&
      source.protocol === target.protocol &&
      source.port === target.port
    );
  } catch {
    return false;
  }
}
