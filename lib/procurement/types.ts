export type Workflow =
  | "clarifying"
  | "sourcing"
  | "awaiting_approval"
  | "approved"
  | "verifying"
  | "blocked"
  | "complete";
export type Channel = "Web" | "Gmail" | "WhatsApp" | "Instagram";
export type CommunicationState =
  | "none"
  | "pending"
  | "attempted"
  | "unverified"
  | "verified";
export type EvidenceProvider =
  | "fixture"
  | "web"
  | "gmail"
  | "whatsapp"
  | "instagram";
export type Quote = {
  unitCents: number;
  setupCents: number;
  deliveryCents: number;
  taxCents: number;
  quantity: number;
  moq: number;
  stock: number;
  deliveryAt: number;
  branded: boolean;
  currency: string;
};
export type QuoteField = keyof Quote;
export type EvidenceProvenance = {
  provider: EvidenceProvider;
  channel: Channel;
  observationId: string;
  parentId?: string;
  url?: string;
  observedAt: number;
  retrievedAt?: number;
  sourceLabel?: string;
};
export type EvidenceInput = {
  vendorId: string;
  source: string;
  authority: "catalogue" | "vendor";
  revision: number;
  observedAt: number;
  text: string;
  claims: Partial<Quote>;
  provenance: EvidenceProvenance;
};
export type Evidence = EvidenceInput & { id: string };
export type Evaluation = {
  status: "waiting" | "needs_clarification" | "eligible" | "ineligible";
  missing: string[];
  conflicts: string[];
  reasons: string[];
  requiredQuantity: number | null;
  orderQuantity: number | null;
  totalCents: number | null;
  quote: Partial<Quote>;
  currentEvidenceIds: string[];
  supersededEvidenceIds: string[];
  supersededClaims?: { evidenceId: string; fields: string[] }[];
};
export type SupplierRanking = {
  evidenceVersion: number;
  rankedVendorIds: string[];
  topVendorId: string | null;
  noViableOption: boolean;
  incompleteVendorIds: string[];
};
export type Vendor = {
  id: string;
  name: string;
  channel: Channel;
  product: string;
  endpointRef: string;
  communication: CommunicationState;
  evaluation: Evaluation;
};
export type Effect = {
  key: string;
  kind:
    | "rfq"
    | "clarification"
    | "confirmation"
    | "rejection"
    | "purchase_order";
  targetId: string;
  endpointRef: string;
  payload: string;
  gated: boolean;
  approvalVersion: number | null;
  status: "pending" | "attempted" | "unverified" | "verified";
  attempts: number;
  receiptId: string | null;
  verifiedAt: number | null;
};
export type Recommendation = {
  vendorId: string;
  version: number;
  evidenceVersion: number;
  totalCents: number;
  orderQuantity: number;
  rationale: string;
};
export type Approval = {
  version: number;
  recommendationVersion: number;
  evidenceVersion: number;
  vendorId: string;
  decision: "approved" | "rejected";
  at: number;
};
export type Mission = {
  key: string;
  title: string;
  request: string;
  createdAt: number;
  updatedAt: number;
  state: Workflow;
  requirements: {
    quantity: number | null;
    budgetCents: number | null;
    deadlineAt: number | null;
    branded: boolean | null;
  };
  question: string | null;
  activity: string;
  evidenceVersion: number;
  accountingEndpointRef: string;
  vendors: Vendor[];
  evidence: Evidence[];
  effects: Effect[];
  recommendation: Recommendation | null;
  ranking: SupplierRanking;
  noViableOption: { evidenceVersion: number; reason: string } | null;
  approvals: Approval[];
  recommendationCounter: number;
  run: {
    id: string;
    status: "running" | "stopped" | "failed";
    startedAt: number;
    leaseUntil: number;
    model: string;
    toolCalls: number;
    summary: string;
  } | null;
};
export type MissionEvent = {
  at: number;
  kind: "agent" | "evidence" | "decision" | "effect" | "system";
  text: string;
};
export type MissionView = {
  mission: Mission | null;
  events: MissionEvent[];
  liveAiEnabled: boolean;
  deployment: string;
};
export type AgentCommand =
  | { type: "ask_requirements"; question: string }
  | { type: "request_quote"; vendorId: string }
  | { type: "clarify_quote"; vendorId: string; question: string }
  | { type: "recommend"; vendorId: string; rationale: string }
  | { type: "record_no_viable_option"; reason: string }
  | { type: "execute_effect"; effectKey: string }
  | { type: "verify_effect"; effectKey: string }
  | { type: "complete_mission" };
export type UserCommand =
  | { type: "create"; request: string; key: string }
  | {
      type: "answer_requirements";
      quantity: number;
      budgetCents: number;
      deadlineAt: number;
      branded: boolean;
    }
  | { type: "approve"; recommendationVersion: number }
  | { type: "reject"; recommendationVersion: number }
  | { type: "ingest_external_evidence"; evidence: EvidenceInput }
  | {
      type: "ingest_fixture_observation";
      vendorId: string;
      stage: "initial" | "clarification" | "update";
    }
  | { type: "run_agent" };
export type Command = AgentCommand | UserCommand;
