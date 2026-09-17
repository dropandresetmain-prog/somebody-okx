export type PurchaseOrderIntent = {
  effectKey: string;
  missionKey: string;
  vendorId: string;
  vendorName: string;
  product: string;
  requiredQuantity: number | null;
  orderQuantity: number;
  totalCents: number;
  currency: string;
  evidenceVersion: number;
};

export type QuickBooksConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  realmId: string;
  /** Optional overrides when the company already has stable refs. */
  expenseAccountId?: string;
  itemId?: string;
  environment?: "sandbox" | "production";
};

export type QuickBooksPurchaseOrder = {
  Id: string;
  SyncToken?: string;
  DocNumber?: string;
  PrivateNote?: string;
  TotalAmt?: number;
  CurrencyRef?: { value: string; name?: string };
  VendorRef?: { value: string; name?: string };
  Line?: Array<{
    Amount?: number;
    Description?: string;
    DetailType?: string;
    ItemBasedExpenseLineDetail?: {
      Qty?: number;
      UnitPrice?: number;
      ItemRef?: { value: string; name?: string };
    };
    AccountBasedExpenseLineDetail?: {
      AccountRef?: { value: string; name?: string };
    };
  }>;
};

export type VerifiedPurchaseOrderView = {
  providerId: string;
  docNumber: string;
  vendorName: string | null;
  orderQuantity: number | null;
  totalCents: number;
  currency: string;
  privateNote: string;
};

export type CompanyCurrencyCapability = {
  multiCurrencyEnabled: boolean;
  homeCurrency: string;
  supportedCurrencies: string[];
};

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

/** DocNumber max length in QBO is 21. Stable hash keeps retries reconcilable. */
export function docNumberForEffect(effectKey: string): string {
  // FNV-1a 64-bit — portable across Convex actions and Node proof scripts.
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < effectKey.length; i++) {
    hash ^= BigInt(effectKey.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `S${hash.toString(16).padStart(16, "0")}`;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`;
  const encoded =
    typeof Buffer !== "undefined"
      ? Buffer.from(raw).toString("base64")
      : btoa(raw);
  return `Basic ${encoded}`;
}

export function privateNoteForIntent(intent: PurchaseOrderIntent): string {
  return [
    "Somebody purchase_order",
    `effectKey=${intent.effectKey}`,
    `missionKey=${intent.missionKey}`,
    `vendorId=${intent.vendorId}`,
    `requiredQuantity=${intent.requiredQuantity ?? ""}`,
    `orderQuantity=${intent.orderQuantity}`,
    `totalCents=${intent.totalCents}`,
    `currency=${intent.currency}`,
    `evidenceVersion=${intent.evidenceVersion}`,
  ].join("; ");
}

export function parsePurchaseOrderIntentPayload(
  payload: string,
): Omit<
  PurchaseOrderIntent,
  "effectKey" | "missionKey" | "vendorName" | "product"
> {
  const raw = JSON.parse(payload) as Record<string, unknown>;
  if (
    typeof raw.vendorId !== "string" ||
    typeof raw.orderQuantity !== "number" ||
    typeof raw.totalCents !== "number" ||
    typeof raw.currency !== "string" ||
    typeof raw.evidenceVersion !== "number"
  ) {
    throw new Error("Purchase order payload is missing required fields");
  }
  return {
    vendorId: raw.vendorId,
    requiredQuantity:
      typeof raw.requiredQuantity === "number" ? raw.requiredQuantity : null,
    orderQuantity: raw.orderQuantity,
    totalCents: raw.totalCents,
    currency: raw.currency,
    evidenceVersion: raw.evidenceVersion,
  };
}

export function readConfig(
  env: Record<string, string | undefined> = process.env,
): QuickBooksConfig {
  const clientId = env.QBO_CLIENT_ID?.trim();
  const clientSecret = env.QBO_CLIENT_SECRET?.trim();
  const refreshToken = env.QBO_REFRESH_TOKEN?.trim();
  const realmId = env.QBO_REALM_ID?.trim();
  if (!clientId || !clientSecret || !refreshToken || !realmId) {
    throw new Error(
      "QuickBooks Sandbox requires QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REFRESH_TOKEN, and QBO_REALM_ID",
    );
  }
  if (env.QBO_ENVIRONMENT === "production") {
    throw new Error("Production QuickBooks writes are out of scope");
  }
  return {
    clientId,
    clientSecret,
    refreshToken,
    realmId,
    expenseAccountId: env.QBO_EXPENSE_ACCOUNT_ID?.trim() || undefined,
    itemId: env.QBO_ITEM_ID?.trim() || undefined,
    environment: "sandbox",
  };
}

function apiBase(config: QuickBooksConfig): string {
  return config.environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

async function refreshAccessToken(config: QuickBooksConfig): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(config.clientId, config.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!response.ok) {
    throw new Error(
      `QuickBooks token refresh failed (${response.status}). Re-authorize the Sandbox app.`,
    );
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token)
    throw new Error("QuickBooks token response missing access_token");
  return json.access_token;
}

async function qboFetch<T>(
  config: QuickBooksConfig,
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${apiBase(config)}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `QuickBooks API ${init?.method ?? "GET"} ${path} failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function queryPath(realmId: string, query: string): string {
  return `/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=75`;
}

export function canRepresentCurrency(
  intentCurrency: string,
  capability: CompanyCurrencyCapability,
): boolean {
  const normalized = intentCurrency.toUpperCase();
  const home = capability.homeCurrency.toUpperCase();
  if (!capability.multiCurrencyEnabled) return home === normalized;
  const available = new Set(
    capability.supportedCurrencies.map((code) => code.toUpperCase()),
  );
  if (available.size === 0) available.add(home);
  return available.has(normalized);
}

/** Booking currency for the Sandbox company. No FX conversion of amounts. */
export function bookingCurrencyForIntent(
  intentCurrency: string,
  capability: CompanyCurrencyCapability,
): string {
  return canRepresentCurrency(intentCurrency, capability)
    ? intentCurrency.toUpperCase()
    : capability.homeCurrency.toUpperCase();
}

export async function readCompanyCurrencyCapability(
  config: QuickBooksConfig,
  accessToken?: string,
): Promise<CompanyCurrencyCapability> {
  const token = accessToken ?? (await refreshAccessToken(config));
  const prefs = await qboFetch<{
    Preferences?: {
      CurrencyPrefs?: {
        MultiCurrencyEnabled?: boolean;
        HomeCurrency?: { value?: string };
      };
    };
  }>(config, token, `/v3/company/${config.realmId}/preferences?minorversion=75`);
  const multiCurrencyEnabled = Boolean(
    prefs.Preferences?.CurrencyPrefs?.MultiCurrencyEnabled,
  );
  const homeCurrency =
    prefs.Preferences?.CurrencyPrefs?.HomeCurrency?.value?.toUpperCase() ?? "";
  if (!homeCurrency) {
    throw new Error("QuickBooks Preferences did not return HomeCurrency");
  }

  const supportedCurrencies = new Set<string>([homeCurrency]);
  if (multiCurrencyEnabled) {
    try {
      const data = await qboFetch<{
        QueryResponse?: {
          CompanyCurrency?: Array<{ Code?: string; Active?: boolean }>;
        };
      }>(
        config,
        token,
        queryPath(config.realmId, "select * from CompanyCurrency"),
      );
      for (const entry of data.QueryResponse?.CompanyCurrency ?? []) {
        if (entry.Code && entry.Active !== false) {
          supportedCurrencies.add(entry.Code.toUpperCase());
        }
      }
    } catch {
      // CompanyCurrency query can fail on some sandboxes; home currency remains authoritative.
    }
  }

  return {
    multiCurrencyEnabled,
    homeCurrency,
    supportedCurrencies: [...supportedCurrencies],
  };
}

type VendorRecord = {
  Id: string;
  DisplayName: string;
  SyncToken?: string;
  CurrencyRef?: { value?: string; name?: string };
};

async function findVendorByName(
  config: QuickBooksConfig,
  accessToken: string,
  displayName: string,
): Promise<VendorRecord | null> {
  const escaped = displayName.replace(/'/g, "\\'");
  const data = await qboFetch<{
    QueryResponse?: { Vendor?: VendorRecord[] };
  }>(
    config,
    accessToken,
    queryPath(
      config.realmId,
      `select * from Vendor where DisplayName = '${escaped}'`,
    ),
  );
  return data.QueryResponse?.Vendor?.[0] ?? null;
}

async function ensureVendor(
  config: QuickBooksConfig,
  accessToken: string,
  displayName: string,
): Promise<VendorRecord> {
  const existing = await findVendorByName(config, accessToken, displayName);
  if (existing) return existing;
  const data = await qboFetch<{ Vendor: VendorRecord }>(
    config,
    accessToken,
    `/v3/company/${config.realmId}/vendor?minorversion=75`,
    {
      method: "POST",
      body: JSON.stringify({ DisplayName: displayName }),
    },
  );
  return data.Vendor;
}

async function findItemByName(
  config: QuickBooksConfig,
  accessToken: string,
  name: string,
): Promise<{ Id: string; Name: string } | null> {
  const escaped = name.replace(/'/g, "\\'");
  const data = await qboFetch<{
    QueryResponse?: { Item?: Array<{ Id: string; Name: string }> };
  }>(
    config,
    accessToken,
    queryPath(
      config.realmId,
      `select Id, Name from Item where Name = '${escaped}'`,
    ),
  );
  return data.QueryResponse?.Item?.[0] ?? null;
}

async function findExpenseAccount(
  config: QuickBooksConfig,
  accessToken: string,
): Promise<string> {
  if (config.expenseAccountId) return config.expenseAccountId;
  const data = await qboFetch<{
    QueryResponse?: { Account?: Array<{ Id: string; Name: string }> };
  }>(
    config,
    accessToken,
    queryPath(
      config.realmId,
      "select Id, Name from Account where AccountType = 'Expense' maxresults 1",
    ),
  );
  const account = data.QueryResponse?.Account?.[0];
  if (!account)
    throw new Error("No Expense account found in QuickBooks Sandbox");
  return account.Id;
}

async function ensureProcurementItem(
  config: QuickBooksConfig,
  accessToken: string,
): Promise<string> {
  if (config.itemId) return config.itemId;
  const name = "Somebody Procurement";
  const existing = await findItemByName(config, accessToken, name);
  if (existing) return existing.Id;
  const expenseAccountId = await findExpenseAccount(config, accessToken);
  const data = await qboFetch<{ Item: { Id: string } }>(
    config,
    accessToken,
    `/v3/company/${config.realmId}/item?minorversion=75`,
    {
      method: "POST",
      body: JSON.stringify({
        Name: name,
        Type: "NonInventory",
        ExpenseAccountRef: { value: expenseAccountId },
      }),
    },
  );
  return data.Item.Id;
}

export async function getPurchaseOrderById(
  config: QuickBooksConfig,
  providerId: string,
): Promise<QuickBooksPurchaseOrder> {
  const accessToken = await refreshAccessToken(config);
  const data = await qboFetch<{ PurchaseOrder: QuickBooksPurchaseOrder }>(
    config,
    accessToken,
    `/v3/company/${config.realmId}/purchaseorder/${providerId}?minorversion=75`,
  );
  return data.PurchaseOrder;
}

export async function findPurchaseOrderByDocNumber(
  config: QuickBooksConfig,
  docNumber: string,
): Promise<QuickBooksPurchaseOrder | null> {
  const accessToken = await refreshAccessToken(config);
  const escaped = docNumber.replace(/'/g, "\\'");
  const data = await qboFetch<{
    QueryResponse?: { PurchaseOrder?: QuickBooksPurchaseOrder[] };
  }>(
    config,
    accessToken,
    queryPath(
      config.realmId,
      `select * from PurchaseOrder where DocNumber = '${escaped}'`,
    ),
  );
  return data.QueryResponse?.PurchaseOrder?.[0] ?? null;
}

export function viewFromPurchaseOrder(
  po: QuickBooksPurchaseOrder,
): VerifiedPurchaseOrderView {
  const line = po.Line?.find(
    (entry) => entry.DetailType === "ItemBasedExpenseLineDetail",
  );
  const qty = line?.ItemBasedExpenseLineDetail?.Qty ?? null;
  const totalAmt = po.TotalAmt ?? line?.Amount ?? 0;
  return {
    providerId: po.Id,
    docNumber: po.DocNumber ?? "",
    vendorName: po.VendorRef?.name ?? null,
    orderQuantity: typeof qty === "number" ? qty : null,
    totalCents: Math.round(Number(totalAmt) * 100),
    currency: po.CurrencyRef?.value ?? "",
    privateNote: po.PrivateNote ?? "",
  };
}

export function assertPurchaseOrderMatchesIntent(
  po: QuickBooksPurchaseOrder,
  intent: PurchaseOrderIntent,
): VerifiedPurchaseOrderView {
  const view = viewFromPurchaseOrder(po);
  if (view.docNumber !== docNumberForEffect(intent.effectKey)) {
    throw new Error("QuickBooks DocNumber does not match the logical effect");
  }
  if (!view.privateNote.includes(`effectKey=${intent.effectKey}`)) {
    throw new Error("QuickBooks PrivateNote is missing the logical effect key");
  }
  if (view.orderQuantity !== intent.orderQuantity) {
    throw new Error(
      `QuickBooks quantity ${view.orderQuantity} does not match orderQuantity ${intent.orderQuantity}`,
    );
  }
  if (view.totalCents !== intent.totalCents) {
    throw new Error(
      `QuickBooks total ${view.totalCents} does not match intended totalCents ${intent.totalCents}`,
    );
  }
  // Currency code matching is intentionally not required for this Sandbox lane:
  // mission intent remains in PrivateNote; company books may be home-currency only.
  if (
    view.vendorName &&
    view.vendorName.toLowerCase() !== intent.vendorName.toLowerCase()
  ) {
    throw new Error(
      `QuickBooks vendor ${view.vendorName} does not match ${intent.vendorName}`,
    );
  }
  return view;
}

/**
 * Create-or-reconcile a Sandbox Purchase Order for a stable logical effect key.
 * Never blindly retries create after an ambiguous prior attempt: DocNumber lookup first.
 */
export async function createOrReconcilePurchaseOrder(
  config: QuickBooksConfig,
  intent: PurchaseOrderIntent,
  existingProviderId?: string | null,
): Promise<{
  providerId: string;
  created: boolean;
  purchaseOrder: QuickBooksPurchaseOrder;
}> {
  const docNumber = docNumberForEffect(intent.effectKey);
  const accessToken = await refreshAccessToken(config);
  const capability = await readCompanyCurrencyCapability(config, accessToken);
  const bookingCurrency = bookingCurrencyForIntent(
    intent.currency,
    capability,
  );

  if (existingProviderId) {
    const existing = await getPurchaseOrderById(config, existingProviderId);
    assertPurchaseOrderMatchesIntent(existing, intent);
    return {
      providerId: existing.Id,
      created: false,
      purchaseOrder: existing,
    };
  }

  const prior = await findPurchaseOrderByDocNumber(config, docNumber);
  if (prior) {
    assertPurchaseOrderMatchesIntent(prior, intent);
    return { providerId: prior.Id, created: false, purchaseOrder: prior };
  }

  const vendor = await ensureVendor(config, accessToken, intent.vendorName);
  const itemId = await ensureProcurementItem(config, accessToken);
  const unitPrice = intent.totalCents / 100 / intent.orderQuantity;
  const amount = intent.totalCents / 100;

  const body: Record<string, unknown> = {
    DocNumber: docNumber,
    PrivateNote: privateNoteForIntent(intent),
    VendorRef: { value: vendor.Id },
    Line: [
      {
        Amount: amount,
        DetailType: "ItemBasedExpenseLineDetail",
        Description: `${intent.product} (${intent.vendorId})`,
        ItemBasedExpenseLineDetail: {
          ItemRef: { value: itemId },
          Qty: intent.orderQuantity,
          UnitPrice: unitPrice,
        },
      },
    ],
  };
  if (capability.multiCurrencyEnabled) {
    body.CurrencyRef = { value: bookingCurrency };
  }

  try {
    const data = await qboFetch<{ PurchaseOrder: QuickBooksPurchaseOrder }>(
      config,
      accessToken,
      `/v3/company/${config.realmId}/purchaseorder?minorversion=75`,
      { method: "POST", body: JSON.stringify(body) },
    );
    assertPurchaseOrderMatchesIntent(data.PurchaseOrder, intent);
    return {
      providerId: data.PurchaseOrder.Id,
      created: true,
      purchaseOrder: data.PurchaseOrder,
    };
  } catch (error) {
    // Ambiguous failure after the request may have succeeded: reconcile, do not create again.
    const recovered = await findPurchaseOrderByDocNumber(config, docNumber);
    if (recovered) {
      assertPurchaseOrderMatchesIntent(recovered, intent);
      return {
        providerId: recovered.Id,
        created: false,
        purchaseOrder: recovered,
      };
    }
    throw error;
  }
}

export async function readBackPurchaseOrder(
  config: QuickBooksConfig,
  providerId: string,
  intent: PurchaseOrderIntent,
): Promise<VerifiedPurchaseOrderView> {
  const po = await getPurchaseOrderById(config, providerId);
  return assertPurchaseOrderMatchesIntent(po, intent);
}
