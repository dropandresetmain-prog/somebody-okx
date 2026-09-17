import { defaultCatalogueSource } from "../web/catalogueSource";
import type {
  EvidenceInput,
  Evaluation,
  Mission,
  Quote,
  SupplierRanking,
  Vendor,
} from "./types";

export const DEVELOPMENT_ACCOUNTING_ENDPOINT = "qbo.sandbox";
const catalogueSource = defaultCatalogueSource();
const DEVELOPMENT_ENDPOINTS: Record<string, string> = {
  catalogue: catalogueSource.endpointRef,
  studio: "dev.gmail.paper-pine",
  express: "dev.whatsapp.good-things",
  social: "dev.instagram.little-objects",
};

export const emptyEvaluation = (): Evaluation => ({
  status: "waiting",
  missing: [],
  conflicts: [],
  reasons: [],
  requiredQuantity: null,
  orderQuantity: null,
  totalCents: null,
  quote: {},
  currentEvidenceIds: [],
  supersededEvidenceIds: [],
});
export const emptyRanking = (evidenceVersion = 0): SupplierRanking => ({
  evidenceVersion,
  rankedVendorIds: [],
  topVendorId: null,
  noViableOption: false,
  incompleteVendorIds: [],
});
export function createMission(
  key: string,
  request: string,
  now: number,
): Mission {
  const configured = [
    {
      id: "catalogue",
      name: catalogueSource.supplierName,
      channel: "Web" as const,
      product: catalogueSource.productName,
    },
    {
      id: "studio",
      name: "Paper & Pine",
      channel: "Gmail" as const,
      product: "Desk gift set",
    },
    {
      id: "express",
      name: "Good Things Studio",
      channel: "WhatsApp" as const,
      product: "Custom canvas tote",
    },
    {
      id: "social",
      name: "Little Objects",
      channel: "Instagram" as const,
      product: "Botanical desk kit",
    },
  ];
  const vendors: Vendor[] = configured.map((v) => ({
    ...v,
    endpointRef: DEVELOPMENT_ENDPOINTS[v.id]!,
    communication: "none",
    evaluation: emptyEvaluation(),
  }));
  return {
    key,
    title: "Sponsor gifts, sorted.",
    request,
    createdAt: now,
    updatedAt: now,
    state: "clarifying",
    requirements: {
      quantity: null,
      budgetCents: null,
      deadlineAt: null,
      branded: null,
    },
    question: null,
    activity: "Ready to clarify your brief",
    evidenceVersion: 0,
    accountingEndpointRef: DEVELOPMENT_ACCOUNTING_ENDPOINT,
    vendors,
    evidence: [],
    effects: [],
    recommendation: null,
    ranking: emptyRanking(),
    noViableOption: null,
    approvals: [],
    recommendationCounter: 0,
    run: null,
  };
}
export function hydrateMission(raw: Mission): Mission {
  return {
    ...raw,
    accountingEndpointRef:
      raw.accountingEndpointRef || DEVELOPMENT_ACCOUNTING_ENDPOINT,
    ranking: raw.ranking ?? emptyRanking(raw.evidenceVersion),
    noViableOption: raw.noViableOption ?? null,
    recommendation: raw.recommendation
      ? {
          ...raw.recommendation,
          orderQuantity:
            raw.recommendation.orderQuantity ?? raw.requirements.quantity ?? 0,
        }
      : null,
    vendors: raw.vendors.map((vendor) => {
      const legacy = vendor as Vendor & { contacted?: boolean };
      return {
        ...vendor,
        communication: vendor.communication ?? (legacy.contacted ? "pending" : "none"),
        evaluation: {
          ...vendor.evaluation,
          requiredQuantity:
            vendor.evaluation.requiredQuantity ?? raw.requirements.quantity,
          orderQuantity: vendor.evaluation.orderQuantity ?? null,
        },
      };
    }),
    evidence: raw.evidence.map((item) => {
      const configured = raw.vendors.find((vendor) => vendor.id === item.vendorId);
      return {
        ...item,
        provenance: item.provenance ?? {
          provider: "fixture",
          channel: configured?.channel ?? "Web",
          observationId: item.id,
          observedAt: item.observedAt,
          sourceLabel: item.source,
        },
      };
    }),
  };
}
// Named Development observations. Domain policy never branches on these vendor IDs.
export function fixtureEvidence(
  m: Mission,
  vendorId: string,
  stage: "initial" | "clarification" | "update",
  now: number,
): EvidenceInput {
  const configured = m.vendors.find((v) => v.id === vendorId);
  if (!configured) throw new Error("Unknown vendor or unconfigured recipient endpoint");
  const deadline = m.requirements.deadlineAt!;
  const quantity = m.requirements.quantity!;
  const base: Quote = {
    unitCents: 2200,
    setupCents: 0,
    deliveryCents: 2500,
    taxCents: 0,
    quantity,
    moq: 10,
    stock: 100,
    deliveryAt: deadline - 3600000,
    branded: true,
    currency: "SGD",
  };
  let claims: Partial<Quote> = base;
  let text =
    "Confirmed: all-in quote includes branding and tax, with delivery before your receiving deadline.";
  if (configured.channel === "Web") {
    throw new Error(
      "Web catalogue evidence must come from public web retrieval (provider web), not Development fixtures",
    );
  }
  if (vendorId === "studio" && stage === "initial") {
    claims = {
      unitCents: 2400,
      quantity,
      moq: 10,
      stock: 40,
      currency: "SGD",
      branded: true,
    };
    text = `We can do ${quantity} desk sets at $24 each with your logo. Let me check delivery and the final charges.`;
  }
  if (vendorId === "studio" && stage !== "initial") {
    claims = { ...base, unitCents: 2400 };
    text =
      "Confirmed: $24 each, no setup charge or additional tax, $25 delivery. Stock available; arrival one hour before the deadline.";
  }
  if (vendorId === "express") {
    claims = { ...base, unitCents: 1800, deliveryCents: 1500 };
    text =
      "Yep, $18 each with printing + $15 delivery. Everything included. We can get them there before your cutoff.";
  }
  if (vendorId === "express" && stage === "update") {
    claims = { deliveryAt: deadline + 86400000 };
    text =
      "Correction from production: printed totes can only arrive the following day. Our earlier delivery promise was wrong.";
  }
  if (vendorId === "social") {
    claims = { ...base, unitCents: 2900, deliveryCents: 3000 };
    text =
      "Our desk kits are $29 each, branded sleeves included. $30 delivery, no extra tax or setup. Ready in time.";
  }
  const observationId = `${vendorId}:${stage}`;
  return {
    vendorId,
    source: `Development fixture / ${configured.channel}`,
    authority: "vendor",
    revision: stage === "initial" ? 1 : stage === "clarification" ? 2 : 3,
    observedAt: now,
    text,
    claims,
    provenance: {
      provider: "fixture",
      channel: configured.channel,
      observationId,
      parentId: `fixture-thread:${vendorId}`,
      observedAt: now,
      retrievedAt: now,
      sourceLabel: "Development fixture observation",
    },
  };
}
