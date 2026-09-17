import type { Quote } from "../procurement/types";

const CLAIMS_MARKER = /SOMEBODY_CLAIMS\s*:\s*(\{[\s\S]*\})\s*$/m;

const ALLOWED_KEYS = new Set([
  "unitCents",
  "setupCents",
  "deliveryCents",
  "taxCents",
  "quantity",
  "moq",
  "stock",
  "deliveryAt",
  "branded",
  "currency",
]);

export type ClaimExtractionContext = {
  /** Provider source time for the message (ms). */
  referenceAt: number;
  /** Mission hard deadline when known — used only to resolve weekday delivery phrasing. */
  deadlineAt?: number | null;
  /** IANA timezone for local morning/afternoon delivery phrasing (e.g. Asia/Singapore). */
  timeZone?: string;
};

export type ClaimExtractionPath = "trailer" | "natural_language" | "model" | "none";

export type ClaimExtractionResult = {
  claims: Partial<Quote>;
  path: ClaimExtractionPath;
  /** Raw supplier text with optional trailer stripped. */
  text: string;
};

/** Development/demo default for Somebody procurement wall-clock phrasing. */
export const DEFAULT_PROCUREMENT_TIME_ZONE = "Asia/Singapore";

/**
 * Resolve an IANA timezone. Invalid/unknown values fall back to Asia/Singapore —
 * never to the host's implicit UTC/local zone.
 */
export function resolveTimeZone(
  value?: string | null,
  env: Record<string, string | undefined> = process.env,
): string {
  const candidate =
    value?.trim() ||
    env.SOMEBODY_TIME_ZONE?.trim() ||
    DEFAULT_PROCUREMENT_TIME_ZONE;
  if (isValidTimeZone(candidate)) return candidate;
  if (
    candidate !== DEFAULT_PROCUREMENT_TIME_ZONE &&
    isValidTimeZone(DEFAULT_PROCUREMENT_TIME_ZONE)
  )
    return DEFAULT_PROCUREMENT_TIME_ZONE;
  throw new Error(
    `Invalid procurement timezone "${candidate}"; set SOMEBODY_TIME_ZONE to a valid IANA name (e.g. Asia/Singapore)`,
  );
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function readZonedParts(ms: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekday = WEEKDAY_SHORT[get("weekday")];
  if (weekday === undefined) throw new Error("Unable to read zoned weekday");
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday,
  };
}

/** Convert a civil wall time in `timeZone` to an epoch millisecond instant. */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 5; i++) {
    const local = readZonedParts(utc, timeZone);
    const asUtcLike = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = wanted - asUtcLike;
    if (delta === 0) break;
    utc += delta;
  }
  return utc;
}

function addLocalDays(
  parts: Pick<ZonedParts, "year" | "month" | "day">,
  deltaDays: number,
  timeZone: string,
): Pick<ZonedParts, "year" | "month" | "day"> {
  const noon = zonedWallTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    12,
    0,
    timeZone,
  );
  return readZonedParts(noon + deltaDays * 86_400_000, timeZone);
}

/**
 * Deterministic test/debug fast-path. Optional in live traffic — not required.
 */
export function extractControlledClaims(text: string): Partial<Quote> | null {
  const match = text.match(CLAIMS_MARKER);
  if (!match?.[1]) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    throw new Error("Controlled claims trailer is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Controlled claims trailer must be a JSON object");
  return sanitizePartialQuote(parsed);
}

export function stripClaimsTrailer(text: string): string {
  return text.replace(CLAIMS_MARKER, "").trim();
}

/** Drop unknown keys and invalid values. Never invents fields that were absent. */
export function sanitizePartialQuote(input: unknown): Partial<Quote> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Claims must be a JSON object");
  const claims: Partial<Quote> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    if (key === "branded") {
      if (typeof value !== "boolean") continue;
      claims.branded = value;
      continue;
    }
    if (key === "currency") {
      if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) continue;
      claims.currency = value;
      continue;
    }
    if (typeof value !== "number" || !Number.isSafeInteger(value)) continue;
    if (key === "quantity" || key === "deliveryAt") {
      if (value < 1) continue;
    } else if (value < 0) continue;
    (claims as Record<string, number>)[key] = value;
  }
  return claims;
}

function dollarsToCents(amount: number): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function parseMoneyToken(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return dollarsToCents(value);
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Resolve a weekday phrase onto the calendar week around the mission deadline
 * (fallback: message reference time) in the configured procurement timezone.
 * Morning → 09:00 local; afternoon → 15:00 local; unspecified → 12:00 local.
 */
export function resolveWeekdayDeliveryAt(
  weekday: string,
  context: ClaimExtractionContext,
  timeOfDay: "morning" | "afternoon" | "unspecified" = "unspecified",
): number | null {
  const target = WEEKDAYS[weekday.toLowerCase()];
  if (target === undefined) return null;
  const timeZone = resolveTimeZone(context.timeZone);
  const anchor = context.deadlineAt ?? context.referenceAt;
  const local = readZonedParts(anchor, timeZone);
  let delta = target - local.weekday;
  // Prefer the occurrence in the same week as the deadline; if the named day
  // is before the anchor weekday by more than 3 days, use the next week.
  if (delta < -3) delta += 7;
  if (delta > 3 && context.deadlineAt == null) delta -= 7;
  const day = addLocalDays(local, delta, timeZone);
  const hour =
    timeOfDay === "morning" ? 9 : timeOfDay === "afternoon" ? 15 : 12;
  return zonedWallTimeToUtc(day.year, day.month, day.day, hour, 0, timeZone);
}

/**
 * Bounded free-text extractor. Only emits fields explicitly supported by the
 * supplier message. Does not invent zero fees, stock, dates, MOQ, branding, or currency.
 */
export function extractNaturalLanguageClaims(
  text: string,
  context: ClaimExtractionContext,
): Partial<Quote> {
  const claims: Partial<Quote> = {};
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return claims;
  const lower = normalized.toLowerCase();

  // Unit price: "$18 each", "18/ea", "SGD 18 per unit", "18 dollars each", "$18ea"
  const unit =
    normalized.match(
      /(?:sgd\s*)?\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:each|ea\b|\/\s*ea\b|\/\s*unit|per\s+(?:unit|pc|piece)|dollars?\s+each)/i,
    ) ||
    normalized.match(
      /(?:unit(?:\s*price)?|price)\s*(?:is|:)?\s*(?:sgd\s*)?\$?\s*(\d+(?:\.\d{1,2})?)/i,
    );
  if (unit?.[1]) {
    const cents = parseMoneyToken(unit[1]);
    if (cents !== null) claims.unitCents = cents;
  }

  // Delivery fee: "delivery is $15", "$15 delivery", "deliv $15", "del $15"
  const deliveryFee =
    normalized.match(
      /(?:delivery|shipping|ship|courier|deliv|del)\s*(?:fee|cost|charge)?\s*(?:is|:)?\s*(?:sgd\s*)?\$?\s*(\d+(?:\.\d{1,2})?)/i,
    ) ||
    normalized.match(
      /(?:sgd\s*)?\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:for\s+)?(?:delivery|shipping|ship|courier|deliv)\b/i,
    );
  if (deliveryFee?.[1]) {
    const cents = parseMoneyToken(deliveryFee[1]);
    if (cents !== null) claims.deliveryCents = cents;
  }

  // Setup fee only when an amount is stated (not when merely omitted).
  const setup = normalized.match(
    /(?:setup|set-up|set up)\s*(?:fee|cost|charge)?\s*(?:is|:)?\s*(?:sgd\s*)?\$?\s*(\d+(?:\.\d{1,2})?)/i,
  );
  if (setup?.[1]) {
    const cents = parseMoneyToken(setup[1]);
    if (cents !== null) claims.setupCents = cents;
  }
  if (
    /\b(?:no|without|waived)\s+setup\b/i.test(normalized) ||
    /\bsetup\s*(?:fee|charge)?\s*(?:is\s+)?(?:waived|none|0|zero)\b/i.test(
      normalized,
    )
  )
    claims.setupCents = 0;

  // Tax only when stated.
  const tax = normalized.match(
    /(?:tax|gst|vat)\s*(?:is|:)?\s*(?:sgd\s*)?\$?\s*(\d+(?:\.\d{1,2})?)/i,
  );
  if (tax?.[1]) {
    const cents = parseMoneyToken(tax[1]);
    if (cents !== null) claims.taxCents = cents;
  }
  if (/\b(?:no|without|zero)\s+(?:tax|gst|vat)\b/i.test(normalized))
    claims.taxCents = 0;

  // Stock: "40 in stock", "stock 40", "we have 40", "stk 40"
  const stock =
    normalized.match(/\b(\d+)\s+in\s+stock\b/i) ||
    normalized.match(/\b(?:stock|stk)(?:\s*(?:is|:|of))?\s*(\d+)\b/i) ||
    normalized.match(/\b(?:we\s+have|available)\s+(\d+)\b/i);
  if (stock?.[1]) claims.stock = Number(stock[1]);

  // MOQ
  const moq =
    normalized.match(/\bmoq\s*(?:is|:)?\s*(\d+)\b/i) ||
    normalized.match(/\bmin(?:imum)?(?:\s+order)?(?:\s+qty|\s+quantity)?\s*(?:is|:)?\s*(\d+)\b/i);
  if (moq?.[1]) claims.moq = Number(moq[1]);

  // Quantity offered
  const quantity = normalized.match(
    /\b(?:qty|quantity|can\s+do|for)\s+(\d+)\s*(?:units?|pcs?|pieces?)?\b/i,
  );
  if (quantity?.[1] && !/moq|stock|minimum/i.test(quantity[0]))
    claims.quantity = Number(quantity[1]);

  // Branding
  if (
    /\b(?:unbranded|no\s+branding|without\s+(?:logo|branding|printing)|plain\s+only)\b/i.test(
      lower,
    )
  )
    claims.branded = false;
  else if (
    /\b(?:branded|branding|logo|printing|print(?:ed)?|with\s+(?:your\s+)?logo|including\s+logo)\b/i.test(
      lower,
    )
  )
    claims.branded = true;

  // Currency only when explicitly named (never infer SGD from "$" alone).
  if (/\bsgd\b/i.test(normalized) || /\bs\$/.test(normalized))
    claims.currency = "SGD";
  else if (/\busd\b/i.test(normalized)) claims.currency = "USD";

  // Delivery timing via weekday phrases (thu / thurs / thursday, am → morning).
  const weekday = lower.match(
    /\b(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/,
  );
  if (weekday?.[1]) {
    const token = weekday[1];
    const full =
      token.startsWith("mon")
        ? "monday"
        : token.startsWith("tue")
          ? "tuesday"
          : token.startsWith("wed")
            ? "wednesday"
            : token.startsWith("thu")
              ? "thursday"
              : token.startsWith("fri")
                ? "friday"
                : token.startsWith("sat")
                  ? "saturday"
                  : "sunday";
    const tod =
      /\b(?:morning|am)\b/i.test(lower)
        ? "morning"
        : /\b(?:afternoon|evening|pm)\b/i.test(lower)
          ? "afternoon"
          : "unspecified";
    const at = resolveWeekdayDeliveryAt(full, context, tod);
    if (at !== null) claims.deliveryAt = at;
  }

  // Absolute ISO / numeric epoch only when explicitly present.
  const iso = normalized.match(
    /\b(20\d{2}-\d{2}-\d{2}(?:[t\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?z?)?)\b/i,
  );
  if (iso?.[1] && claims.deliveryAt === undefined) {
    const ms = Date.parse(iso[1]);
    if (Number.isFinite(ms)) claims.deliveryAt = ms;
  }

  return claims;
}

/**
 * Sync normalize: trailer fast-path, else natural-language. Empty claims are allowed.
 */
export function normalizeSupplierClaims(
  text: string,
  context: ClaimExtractionContext,
): ClaimExtractionResult {
  const scoped: ClaimExtractionContext = {
    ...context,
    timeZone: resolveTimeZone(context.timeZone),
  };
  const raw = text.trim();
  const stripped = stripClaimsTrailer(raw);
  const display = (stripped || raw).slice(0, 1500);
  try {
    const trailer = extractControlledClaims(raw);
    if (trailer && Object.keys(trailer).length > 0)
      return { claims: trailer, path: "trailer", text: display };
  } catch {
    // Invalid trailer falls through to natural language rather than rejecting the message.
  }
  const claims = extractNaturalLanguageClaims(display, scoped);
  return {
    claims,
    path: Object.keys(claims).length ? "natural_language" : "none",
    text: display,
  };
}
