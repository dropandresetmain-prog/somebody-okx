// Outcome Contract identity portability — application-owned levelKey / bar normalization.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseOutcomeContractProposal,
  validateOutcomeContractStructure,
} from "../lib/management/proposals";

const baseIntent = "Ship a relaunch-ready audience message.";

function level(statement: string, label: string, levelKey?: string) {
  return levelKey === undefined
    ? { statement, label }
    : { levelKey, statement, label };
}

test("1: explicit valid levelKeys are unchanged", () => {
  const raw = {
    intent: baseIntent,
    levels: [
      level("draft exists", "Draft", "page_draft"),
      level("page is live", "Live", "page_live"),
    ],
    minimumCompletionBar: "page_live",
    ambiguities: [],
  };
  const result = parseOutcomeContractProposal(raw);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.value.levels.map((l) => l.levelKey),
    ["page_draft", "page_live"],
  );
  assert.equal(result.value.minimumCompletionBar, "page_live");
});

test("2: missing levelKey with unique label derives deterministic snake_case", () => {
  const result = parseOutcomeContractProposal({
    intent: baseIntent,
    levels: [level("minimum viable outcome holds", "Minimum Viable")],
    minimumCompletionBar: "minimum_viable",
    ambiguities: [],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.levels[0]?.levelKey, "minimum_viable");
});

test("3: hyphen and case cosmetic variants normalize for keys and bar", () => {
  const result = parseOutcomeContractProposal({
    intent: baseIntent,
    levels: [level("launch plan is saved", "Launch-plan")],
    minimumCompletionBar: "Launch Plan",
    ambiguities: [],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.levels[0]?.levelKey, "launch_plan");
  assert.equal(result.value.minimumCompletionBar, "launch_plan");
});

test("4: duplicate canonical labels fail closed", () => {
  const result = parseOutcomeContractProposal({
    intent: baseIntent,
    levels: [
      level("first", "Launch Plan"),
      level("second", "launch-plan"),
    ],
    minimumCompletionBar: "launch_plan",
    ambiguities: [],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /duplicate levelKey launch_plan/.test(e)));
});

test("5: missing label and missing levelKey fail closed", () => {
  const result = parseOutcomeContractProposal({
    intent: baseIntent,
    levels: [{ statement: "orphan level with no identity fields" }],
    minimumCompletionBar: "anything",
    ambiguities: [],
  });
  assert.equal(result.ok, false);
});

test("6: bar exact generated levelKey works", () => {
  const result = parseOutcomeContractProposal({
    intent: baseIntent,
    levels: [level("plan saved", "Launch Plan")],
    minimumCompletionBar: "launch_plan",
    ambiguities: [],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.minimumCompletionBar, "launch_plan");
});

test("7: bar hyphen variant maps to same generated key", () => {
  const result = parseOutcomeContractProposal({
    intent: baseIntent,
    levels: [level("plan saved", "Launch Plan")],
    minimumCompletionBar: "launch-plan",
    ambiguities: [],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.minimumCompletionBar, "launch_plan");
});

test("8: bar label variant maps when unique", () => {
  const result = parseOutcomeContractProposal({
    intent: baseIntent,
    levels: [
      level("diagnosis done", "Diagnosis"),
      level("plan saved", "Launch Plan"),
    ],
    minimumCompletionBar: "Launch Plan",
    ambiguities: [],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.minimumCompletionBar, "launch_plan");
});

test("9: ambiguous or nonmatching bar fails closed", () => {
  const nonmatch = parseOutcomeContractProposal({
    intent: baseIntent,
    levels: [level("ready", "Ready", "relaunch_ready")],
    minimumCompletionBar: "not_a_declared_level",
    ambiguities: [],
  });
  assert.equal(nonmatch.ok, false);

  const ambiguous = parseOutcomeContractProposal({
    intent: baseIntent,
    levels: [
      level("a", "Alpha"),
      level("b", "Beta"),
    ],
    minimumCompletionBar: "gamma",
    ambiguities: [],
  });
  assert.equal(ambiguous.ok, false);
});

test("10: no level statement or label is invented or changed", () => {
  const statements = [
    "scoped audience evidence exists on record",
    "a launch-week plan is saved and reviewable",
    "founder-approved copy is queued",
    "message is live with tracking",
  ];
  const labels = ["Evidence", "Launch Plan", "Copy", "Live"];
  const result = parseOutcomeContractProposal({
    intent: baseIntent,
    levels: statements.map((statement, i) => ({ statement, label: labels[i]! })),
    minimumCompletionBar: "launch-plan",
    ambiguities: [],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.levels.map((l) => l.statement), statements);
  assert.deepEqual(result.value.levels.map((l) => l.label), labels);
});

test("11: Nex failure shape passes structural validation deterministically", () => {
  const nexShape = {
    intent: baseIntent,
    levels: [
      {
        label: "Evidence",
        statement: "scoped audience evidence exists on record",
      },
      {
        label: "Launch Plan",
        statement: "a launch-week plan is saved and reviewable",
      },
      {
        label: "Copy",
        statement: "founder-approved copy is queued",
      },
      {
        label: "Live",
        statement: "message is live with tracking",
      },
    ],
    minimumCompletionBar: "launch-plan",
    ambiguities: [],
  };
  const parsed = parseOutcomeContractProposal(nexShape);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.minimumCompletionBar, "launch_plan");
  assert.equal(
    parsed.value.levels.find((l) => l.label === "Launch Plan")?.levelKey,
    "launch_plan",
  );

  const structural = validateOutcomeContractStructure(nexShape);
  assert.equal(structural.ok, true);
});
