import { factValue } from "../../options";
import type { GroundedOption } from "../../types";
import type { EvalCase } from "./types";
import { summarizeFacts } from "./classify";
import { caseShapeFor } from "./classify";

const AT = 1_700_000_000_000;

function cloneOption(o: GroundedOption): GroundedOption {
  return structuredClone(o);
}

function baseFromCase(caseRow: EvalCase): EvalCase | null {
  if (caseRow.eligible.length < 2) return null;
  return caseRow;
}

function mkVariant(
  base: EvalCase,
  caseId: string,
  eligible: GroundedOption[],
  reference: EvalCase["reference"],
  provenanceSuffix: string,
): EvalCase {
  return {
    ...base,
    caseId,
    corpusSource: "REAL_DERIVED_VARIANT",
    provenance: `${base.provenance} — ${provenanceSuffix}`,
    eligible,
    caseShape: caseShapeFor(eligible.length, reference.kind),
    reference,
    incumbent: undefined,
    factsSummary: summarizeFacts(eligible),
  };
}

export function buildDiscriminationVariants(realCases: EvalCase[]): EvalCase[] {
  const variants: EvalCase[] = [];
  const twoExternal = realCases.find((c) => c.caseId === "v7_cp2_two_external_providers_price_dominance");
  const makeVsBuy = realCases.find((c) => c.caseId === "v7_cp2_make_vs_buy_both_eligible");

  if (twoExternal) {
    const externals = twoExternal.eligible.filter((o) => o.kind === "external");
    if (externals.length >= 2) {
      const onlyBuy = externals.map(cloneOption);
      const sorted = [...onlyBuy].sort(
        (x, y) => (x.external?.priceUsd ?? 0) - (y.external?.priceUsd ?? 0),
      );
      const cheaper = sorted[0]!;
      const pricier = sorted[1]!;
      variants.push(
        mkVariant(
          twoExternal,
          "disc_external_price_only_two_buy",
          [cheaper, pricier],
          {
            kind: "DETERMINISTIC_DOMINANCE",
            expectedOptionId: cheaper.optionId,
            notes: "Isolated: two BUY options, price differs only.",
          },
          "external price dominance (BUY-only subset)",
        ),
      );
    }
  }

  if (makeVsBuy) {
    const make = makeVsBuy.eligible.find((o) => o.kind === "internal");
    const buy = makeVsBuy.eligible.find((o) => o.kind === "external");
    if (make && buy) {
      const m = cloneOption(make);
      const b = cloneOption(buy);
      // A. MAKE strictly superior: cheaper and faster on known totals
      m.facts.internalCostUsd = factValue(0.2, "measured", "high", "variant", AT);
      m.facts.executionMinutes = factValue(20, "measured", "high", "variant", AT);
      b.facts.externalPriceUsd = factValue(5, "provider_quote", "high", "variant", AT);
      b.facts.executionMinutes = factValue(120, "provider_quote", "medium", "variant", AT);
      b.facts.queueMinutes = factValue(20, "provider_quote", "medium", "variant", AT);
      if (b.external) b.external.priceUsd = 5;
      variants.push(
        mkVariant(makeVsBuy, "disc_make_strictly_superior", [m, b], {
          kind: "DETERMINISTIC_DOMINANCE",
          expectedOptionId: m.optionId,
          notes: "MAKE cheaper and faster on known cost and total minutes.",
        }, "MAKE strictly superior"),
      );

      // B. MAKE strictly inferior on known cost/time
      const m2 = cloneOption(make);
      const b2 = cloneOption(buy);
      m2.facts.internalCostUsd = factValue(8, "measured", "high", "variant", AT);
      m2.facts.executionMinutes = factValue(200, "measured", "high", "variant", AT);
      b2.facts.externalPriceUsd = factValue(1, "provider_quote", "high", "variant", AT);
      b2.facts.executionMinutes = factValue(30, "provider_quote", "medium", "variant", AT);
      if (b2.external) b2.external.priceUsd = 1;
      variants.push(
        mkVariant(makeVsBuy, "disc_make_strictly_inferior", [m2, b2], {
          kind: "DETERMINISTIC_DOMINANCE",
          expectedOptionId: b2.optionId,
          notes: "BUY cheaper and faster on known facts.",
        }, "MAKE strictly inferior"),
      );

      // C. Cheaper but slower (tradeoff)
      const m3 = cloneOption(make);
      const b3 = cloneOption(buy);
      m3.facts.internalCostUsd = factValue(0.3, "measured", "high", "variant", AT);
      m3.facts.executionMinutes = factValue(150, "measured", "high", "variant", AT);
      b3.facts.externalPriceUsd = factValue(2.5, "provider_quote", "high", "variant", AT);
      b3.facts.executionMinutes = factValue(40, "provider_quote", "medium", "variant", AT);
      if (b3.external) b3.external.priceUsd = 2.5;
      variants.push(
        mkVariant(makeVsBuy, "disc_cheaper_slower_tradeoff", [m3, b3], {
          kind: "HUMAN_REVIEW",
          expectedOptionId: null,
          notes: "MAKE cheaper; BUY faster — genuine tradeoff.",
        }, "cost vs speed tradeoff"),
      );

      // D. Faster but more expensive
      const m4 = cloneOption(make);
      const b4 = cloneOption(buy);
      m4.facts.internalCostUsd = factValue(0.5, "measured", "high", "variant", AT);
      m4.facts.executionMinutes = factValue(25, "measured", "high", "variant", AT);
      b4.facts.externalPriceUsd = factValue(4, "provider_quote", "high", "variant", AT);
      b4.facts.executionMinutes = factValue(120, "provider_quote", "medium", "variant", AT);
      if (b4.external) b4.external.priceUsd = 4;
      variants.push(
        mkVariant(makeVsBuy, "disc_faster_cheaper_internal", [m4, b4], {
          kind: "DETERMINISTIC_DOMINANCE",
          expectedOptionId: m4.optionId,
          notes: "MAKE faster and cheaper on known facts.",
        }, "MAKE faster and cheaper"),
      );

      // E. Missing quality on BUY
      const m5 = cloneOption(make);
      const b5 = cloneOption(buy);
      m5.facts.expectedQuality = factValue("comparable", "measured", "high", "variant", AT);
      b5.facts.expectedQuality = null;
      variants.push(
        mkVariant(makeVsBuy, "disc_missing_quality_on_buy", [m5, b5], {
          kind: "HUMAN_REVIEW",
          expectedOptionId: null,
          notes: "BUY quality null — must not be treated as worse.",
        }, "missing-fact quality"),
      );

      // F. Reliability dominance
      const b6a = cloneOption(buy);
      const b6b = cloneOption(buy);
      b6b.optionId = `${b6b.optionId}_rel_alt`;
      if (b6b.external) b6b.external.offeringId = `${b6b.external.offeringId}_alt`;
      b6a.facts.reliability = factValue("proven_once", "registry_data", "medium", "v", AT);
      b6b.facts.reliability = factValue("proven_repeatedly", "registry_data", "high", "v", AT);
      b6a.facts.externalPriceUsd = factValue(2, "provider_quote", "high", "v", AT);
      b6b.facts.externalPriceUsd = factValue(2, "provider_quote", "high", "v", AT);
      if (b6a.external) b6a.external.priceUsd = 2;
      if (b6b.external) b6b.external.priceUsd = 2;
      variants.push(
        mkVariant(makeVsBuy, "disc_reliability_two_buy", [b6a, b6b], {
          kind: "DETERMINISTIC_DOMINANCE",
          expectedOptionId: b6b.optionId,
          notes: "Same price/time; higher reliability on B.",
        }, "reliability dominance"),
      );
    }
  }

  const base = baseFromCase(makeVsBuy ?? twoExternal ?? realCases[0]!);
  if (base) {
    const hybrid = base.eligible.find((o) => o.kind === "hybrid");
    if (hybrid && makeVsBuy) {
      variants.push(
        mkVariant(
          makeVsBuy,
          "disc_hybrid_present_observation",
          makeVsBuy.eligible.filter((o) => ["internal", "external", "hybrid"].includes(o.kind)),
          { kind: "HUMAN_REVIEW", expectedOptionId: null, notes: "HYBRID present; no target rate." },
          "HYBRID observation set",
        ),
      );
    }
  }

  return variants;
}
