import { describe, it } from "node:test";
import assert from "node:assert";
import {
  assertRoleRequirementsSatisfied,
  M1_ROLE_REQUIREMENTS,
  planObjectiveWithModel,
  validatePlannerProposal,
} from "../lib/objective/planner";
import type { PlanningModel } from "../lib/objective/planner";

describe("Blocker D: role-capability satisfiability", () => {
  describe("assertRoleRequirementsSatisfied", () => {
    it("returns ok:true when all required permissions are granted", () => {
      const result = assertRoleRequirementsSatisfied({
        grantedPermissions: ["read_company_record", "read_public_web", "record_finding"],
        role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
      });
      assert.strictEqual(result.ok, true);
    });

    it("returns ok:false with missing permissions when envelope is insufficient", () => {
      const result = assertRoleRequirementsSatisfied({
        grantedPermissions: ["read_public_web", "record_finding"],
        role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.deepStrictEqual(result.missing, ["read_company_record"]);
      }
    });

    it("document_drafting alone fails RESEARCH_ROLE", () => {
      const plan = validatePlannerProposal({
        capabilityKeys: ["document_drafting"],
        responsibility: "Draft a document",
        requiredResourceClasses: [],
      });
      const granted = plan.capabilityKeys.flatMap((key) => {
        if (key === "document_drafting")
          return ["update_company_artifact", "record_finding"];
        return [];
      });
      const result = assertRoleRequirementsSatisfied({
        grantedPermissions: granted,
        role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.missing.includes("read_company_record"));
        assert.ok(result.missing.includes("read_public_web"));
      }
    });

    it("public_information_research alone fails RESEARCH_ROLE", () => {
      const plan = validatePlannerProposal({
        capabilityKeys: ["public_information_research"],
        responsibility: "Research public info",
        requiredResourceClasses: [],
      });
      const granted = plan.capabilityKeys.flatMap((key) => {
        if (key === "public_information_research") return ["read_public_web", "record_finding"];
        return [];
      });
      const result = assertRoleRequirementsSatisfied({
        grantedPermissions: granted,
        role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.missing.includes("read_company_record"));
      }
    });

    it("company_records_lookup alone fails RESEARCH_ROLE", () => {
      const plan = validatePlannerProposal({
        capabilityKeys: ["company_records_lookup"],
        responsibility: "Look up company records",
        requiredResourceClasses: [],
      });
      const granted = plan.capabilityKeys.flatMap((key) => {
        if (key === "company_records_lookup") return ["read_company_record", "record_finding"];
        return [];
      });
      const result = assertRoleRequirementsSatisfied({
        grantedPermissions: granted,
        role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.missing.includes("read_public_web"));
      }
    });

    it("both research capabilities satisfy RESEARCH_ROLE", () => {
      const plan = validatePlannerProposal({
        capabilityKeys: ["company_records_lookup", "public_information_research"],
        responsibility: "Research with internal and external sources",
        requiredResourceClasses: [],
      });
      const granted = plan.capabilityKeys.flatMap((key) => {
        if (key === "company_records_lookup") return ["read_company_record", "record_finding"];
        if (key === "public_information_research") return ["read_public_web", "record_finding"];
        return [];
      });
      const result = assertRoleRequirementsSatisfied({
        grantedPermissions: granted,
        role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
      });
      assert.strictEqual(result.ok, true);
    });
  });

  describe("planObjectiveWithModel", () => {
    it("unknown capability key fails closed", async () => {
      const model: PlanningModel = {
        async proposePlan() {
          return {
            capabilityKeys: ["unknown_capability_xyz"],
            responsibility: "Do something",
            requiredResourceClasses: [],
          };
        },
      };
      await assert.rejects(
        planObjectiveWithModel({
          request: "Test request",
          role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
          model,
        }),
        /Planner proposed no controlled capability/,
      );
    });

    it("unknown resource class fails closed and is reported", async () => {
      const model: PlanningModel = {
        async proposePlan() {
          return {
            capabilityKeys: ["company_records_lookup", "public_information_research"],
            responsibility: "Research task",
            requiredResourceClasses: ["unknown_resource_class"],
          };
        },
      };
      const plan = await planObjectiveWithModel({
        request: "Test request",
        role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
        model,
      });
      assert.ok(plan.rejectedResourceClasses.includes("unknown_resource_class"));
    });

    it("insufficient capability set for RESEARCH_ROLE fails", async () => {
      const model: PlanningModel = {
        async proposePlan() {
          return {
            capabilityKeys: ["document_drafting"],
            responsibility: "Draft a document",
            requiredResourceClasses: [],
          };
        },
      };
      await assert.rejects(
        planObjectiveWithModel({
          request: "Test request",
          role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
          model,
        }),
        /Role RESEARCH_ROLE requirements not satisfied/,
      );
    });

    it("public_information_research alone fails RESEARCH_ROLE", async () => {
      const model: PlanningModel = {
        async proposePlan() {
          return {
            capabilityKeys: ["public_information_research"],
            responsibility: "Research public info",
            requiredResourceClasses: [],
          };
        },
      };
      await assert.rejects(
        planObjectiveWithModel({
          request: "Test request",
          role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
          model,
        }),
        /Role RESEARCH_ROLE requirements not satisfied/,
      );
    });

    it("spend/permission smuggling fails: model requests authorize_external_spend", async () => {
      const model: PlanningModel = {
        async proposePlan() {
          return {
            capabilityKeys: ["company_records_lookup", "public_information_research"],
            responsibility: "Research task",
            requiredResourceClasses: [],
            requestedToolPermissions: ["authorize_external_spend"],
          };
        },
      };
      const plan = await planObjectiveWithModel({
        request: "Test request",
        role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
        model,
      });
      // The spend permission must be denied, not granted.
      assert.ok(plan.deniedToolPermissions.includes("authorize_external_spend"));
    });

    it("model cannot invent a capability key", async () => {
      const model: PlanningModel = {
        async proposePlan() {
          return {
            capabilityKeys: ["company_records_lookup", "public_information_research", "fake_capability" as any],
            responsibility: "Research task",
            requiredResourceClasses: [],
          };
        },
      };
      const plan = await planObjectiveWithModel({
        request: "Test request",
        role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
        model,
      });
      // The fake capability must be rejected, not accepted.
      assert.ok(plan.rejectedCapabilityKeys.includes("fake_capability"));
      assert.ok(!plan.capabilityKeys.includes("fake_capability" as any));
    });

    it("valid RESEARCH_ROLE proposal validates and satisfies role requirements", async () => {
      const model: PlanningModel = {
        async proposePlan() {
          return {
            capabilityKeys: ["company_records_lookup", "public_information_research"],
            responsibility: "Research with internal and external sources",
            requiredResourceClasses: [],
          };
        },
      };
      const plan = await planObjectiveWithModel({
        request: "Test request",
        role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
        model,
      });
      assert.deepStrictEqual(plan.capabilityKeys, [
        "company_records_lookup",
        "public_information_research",
      ]);
      assert.strictEqual(plan.responsibility, "Research with internal and external sources");
    });

    it("model is only an injected stub: proposal is not trusted before validation", async () => {
      const model: PlanningModel = {
        async proposePlan() {
          // Model claims it has permissions it shouldn't have.
          return {
            capabilityKeys: ["document_drafting"],
            responsibility: "Draft a document",
            requiredResourceClasses: [],
            requestedToolPermissions: ["read_company_record", "read_public_web"],
          };
        },
      };
      await assert.rejects(
        planObjectiveWithModel({
          request: "Test request",
          role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
          model,
        }),
        /Role RESEARCH_ROLE requirements not satisfied/,
      );
      // The model's requested permissions are denied because document_drafting
      // doesn't grant read_company_record or read_public_web.
    });

    it("model cannot widen its own tool set by requesting permissions", async () => {
      const model: PlanningModel = {
        async proposePlan() {
          return {
            capabilityKeys: ["company_records_lookup", "public_information_research"],
            responsibility: "Research task",
            requiredResourceClasses: [],
            requestedToolPermissions: ["read_public_web", "authorize_external_spend"],
          };
        },
      };
      const plan = await planObjectiveWithModel({
        request: "Test request",
        role: M1_ROLE_REQUIREMENTS.RESEARCH_ROLE,
        model,
      });
      // The requested authorize_external_spend is denied because it's not in the envelope.
      assert.ok(plan.deniedToolPermissions.includes("authorize_external_spend"));
      // The requested read_public_web is granted because it's in the envelope.
      assert.ok(!plan.deniedToolPermissions.includes("read_public_web"));
    });
  });
});
