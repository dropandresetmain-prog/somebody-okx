import type {
  Mission,
  MissionEvent,
  MissionView,
} from "@/lib/procurement/types";

export type ConversationRole = "user" | "somebody" | "system";

export type ConversationMessage = {
  id: string;
  role: ConversationRole;
  text: string;
  at: number;
  source: "request" | "question" | "activity" | "event" | "recommendation" | "decision" | "completion";
};

const money = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  maximumFractionDigits: 2,
});

function formatMoney(cents: number) {
  return money.format(cents / 100);
}

function skipEventText(text: string) {
  const lower = text.toLowerCase();
  return (
    lower.includes("development fixtures are available") ||
    lower.includes("openai agents sdk")
  );
}

/**
 * Build a chat thread from persisted mission state + events.
 * Display-only: does not invent procurement decisions.
 */
export function buildConversation(
  view: MissionView & { mission: Mission },
): ConversationMessage[] {
  const { mission, events } = view;
  const messages: ConversationMessage[] = [];

  messages.push({
    id: `request:${mission.key}`,
    role: "user",
    text: mission.request,
    at: mission.createdAt,
    source: "request",
  });

  if (mission.state === "clarifying") {
    messages.push({
      id: `clarify:${mission.key}:${mission.question ?? "needs"}`,
      role: "somebody",
      text:
        mission.question ??
        "I can take this. Before I source options, I need quantity, total budget, delivery deadline, and whether branding is required.",
      at: mission.updatedAt,
      source: mission.question ? "question" : "activity",
    });
  }

  const chronological = [...events]
    .filter((event) => !skipEventText(event.text))
    .sort((a, b) => a.at - b.at);

  for (const event of chronological) {
    const mapped = mapEvent(event, mission);
    if (mapped) messages.push(mapped);
  }

  if (mission.recommendation) {
    const vendor = mission.vendors.find(
      (item) => item.id === mission.recommendation?.vendorId,
    );
    messages.push({
      id: `recommendation:${mission.key}:${mission.recommendation.version}`,
      role: "somebody",
      text: vendor
        ? `Recommendation ready: ${vendor.name} at ${formatMoney(mission.recommendation.totalCents)}. ${mission.recommendation.rationale}`
        : `Recommendation v${mission.recommendation.version} is ready for your decision.`,
      at: mission.updatedAt,
      source: "recommendation",
    });
  } else if (mission.noViableOption) {
    messages.push({
      id: `nvo:${mission.key}:${mission.noViableOption.evidenceVersion}`,
      role: "somebody",
      text: `No viable option right now. ${mission.noViableOption.reason}`,
      at: mission.updatedAt,
      source: "recommendation",
    });
  }

  const latestDecision = mission.approvals[mission.approvals.length - 1];
  if (latestDecision) {
    messages.push({
      id: `decision:${mission.key}:${latestDecision.version}`,
      role: "user",
      text:
        latestDecision.decision === "approved"
          ? "Approved. Proceed with the recommended vendor."
          : "Rejected this recommendation.",
      at: latestDecision.at,
      source: "decision",
    });
  }

  if (mission.state === "complete") {
    messages.push({
      id: `complete:${mission.key}`,
      role: "somebody",
      text:
        mission.activity ||
        "Mission complete. Required effects were verified against persisted state.",
      at: mission.updatedAt,
      source: "completion",
    });
  } else if (
    mission.state === "sourcing" ||
    mission.state === "verifying" ||
    mission.state === "approved"
  ) {
    const progressId = `progress:${mission.key}:${mission.state}:${mission.evidenceVersion}`;
    if (!messages.some((item) => item.id === progressId)) {
      messages.push({
        id: progressId,
        role: "somebody",
        text: mission.activity,
        at: mission.updatedAt,
        source: "activity",
      });
    }
  }

  return dedupeMessages(messages);
}

function mapEvent(
  event: MissionEvent,
  mission: Mission,
): ConversationMessage | null {
  if (event.kind === "decision") {
    return {
      id: `event-decision:${event.at}:${event.text.slice(0, 24)}`,
      role: "system",
      text: event.text,
      at: event.at,
      source: "event",
    };
  }
  if (event.kind === "evidence" || event.kind === "effect") {
    return {
      id: `event-ops:${event.at}:${event.text.slice(0, 24)}`,
      role: "system",
      text: event.text,
      at: event.at,
      source: "event",
    };
  }
  if (event.kind === "agent") {
    // Prefer the live mission.question / activity bubbles over raw agent event clones.
    if (mission.question && event.text.includes(mission.question)) return null;
    if (event.text === mission.activity) return null;
    return {
      id: `event-agent:${event.at}:${event.text.slice(0, 24)}`,
      role: "somebody",
      text: event.text,
      at: event.at,
      source: "event",
    };
  }
  // Avoid duplicating the initial create system note and question text.
  if (event.text === mission.question) return null;
  if (event.text.startsWith("Brief confirmed")) {
    return {
      id: `event-brief:${event.at}`,
      role: "system",
      text: event.text,
      at: event.at,
      source: "event",
    };
  }
  return {
    id: `event:${event.at}:${event.text.slice(0, 24)}`,
    role: "system",
    text: event.text,
    at: event.at,
    source: "event",
  };
}

function dedupeMessages(messages: ConversationMessage[]) {
  const seen = new Set<string>();
  const ordered = [...messages].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const result: ConversationMessage[] = [];
  for (const message of ordered) {
    const fingerprint = `${message.role}:${message.text}`;
    if (seen.has(fingerprint)) continue;
    // Prefer richer recommendation/completion cards over plain activity clones.
    if (
      message.source === "activity" &&
      ordered.some(
        (other) =>
          other !== message &&
          other.text === message.text &&
          (other.source === "recommendation" || other.source === "completion"),
      )
    ) {
      continue;
    }
    seen.add(fingerprint);
    result.push(message);
  }
  return result;
}

export function conversationStatusLabel(mission: Mission) {
  switch (mission.state) {
    case "clarifying":
      return "Waiting for your brief";
    case "sourcing":
      return "Sourcing vendors";
    case "awaiting_approval":
      return "Needs your approval";
    case "approved":
      return "Approved — executing";
    case "verifying":
      return "Verifying effects";
    case "complete":
      return "Complete";
    case "blocked":
      return "Blocked";
    default:
      return mission.state;
  }
}
