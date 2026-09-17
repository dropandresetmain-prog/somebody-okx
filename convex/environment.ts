export const DEVELOPMENT = "acrobatic-swan-765";
export function assertDevelopment() {
  const actual = new URL(
    process.env.CONVEX_CLOUD_URL || "https://unknown.invalid",
  ).hostname.split(".")[0];
  if (
    actual !== DEVELOPMENT ||
    process.env.HEALTH_PROBE_WRITES_ENABLED !== "true"
  )
    throw new Error(`Development writes refused on ${actual}`);
}
export function assertAccess(token: string) {
  assertDevelopment();
  const expected = process.env.DEVELOPMENT_ACCESS_TOKEN;
  if (!expected || expected.length < 32 || token !== expected)
    throw new Error("Development access denied");
}
