export type FetchedPage = {
  url: string;
  finalUrl: string;
  html: string;
  retrievedAt: number;
};

const DEFAULT_TIMEOUT_MS = 20000;

export async function fetchPublicHtml(
  url: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<FetchedPage> {
  if (!/^https:\/\//i.test(url))
    throw new Error("Catalogue source URL must be https");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const retrievedAt = Date.now();
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "User-Agent": "SomebodyProcurementBot/0.1 (+local-dev; catalogue-evidence)",
    },
  });
  if (!response.ok)
    throw new Error(
      `Catalogue page fetch failed (${response.status}) for ${url}`,
    );
  const html = await response.text();
  if (!html.trim()) throw new Error(`Catalogue page returned empty body: ${url}`);
  return {
    url,
    finalUrl: response.url || url,
    html,
    retrievedAt,
  };
}

/** Strip scripts/styles and tags to readable text for conservative extraction. */
export function htmlToExtractableText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}
