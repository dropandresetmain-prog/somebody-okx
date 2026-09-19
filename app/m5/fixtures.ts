import type { FixtureScenario, FixtureSnapshot, ObjectiveWorkspaceView, RequirementView, MissionStoryEvent } from "./workspace";

const EPOCH = Date.UTC(2026, 8, 19, 9);
const minute = (n: number) => EPOCH + n * 60_000;

function empty(key: string, title: string, request: string): ObjectiveWorkspaceView {
  return {
    provenance: "frontend_fixture",
    objective: { objectiveKey: key, title, request, state: "received", createdAt: EPOCH, updatedAt: EPOCH },
    somebodyNow: { headline: "An Objective, not another to-do list.", detail: "Somebody is interpreting your request into an outcome that can be proved.", ball: "Somebody", condition: "working", currentRequirementKey: null },
    outcome: null, requirements: [], workers: [], assignments: [], decisions: [], attention: [], external: [], artifacts: [], evidence: [], missionStory: [], xray: null,
    completion: { accepted: false, proofRefs: [], summary: "Completion has not been accepted.", remaining: [], acceptedAt: null },
  };
}
function requirement(key: string, title: string, proof: string, priority: "required" | "supporting" = "required"): RequirementView {
  return { requirementKey: key, title, mustBeTrue: proof, priority, state: "active", strategy: null, contractRevision: 1, resolution: null };
}

// Snapshot authoring only: each saved view is independent, never a runtime reducer.
function author(initial: ObjectiveWorkspaceView) {
  const snapshots: FixtureSnapshot[] = [];
  function save(id: string, label: string, at: number, change: (view: ObjectiveWorkspaceView) => void, event: Omit<MissionStoryEvent, "id" | "at">) {
    const view = structuredClone(snapshots.at(-1)?.view ?? initial);
    view.objective.updatedAt = minute(at);
    change(view);
    view.missionStory.push({ ...event, id: `${initial.objective.objectiveKey}-event-${id}`, at: minute(at) });
    snapshots.push({ id, label, view, action: null });
  }
  function connect(labels: string[], founderAt: string[] = []) {
    snapshots.forEach((snapshot, index) => {
      const next = snapshots[index + 1];
      if (next) snapshot.action = { label: labels[index], nextSnapshotId: next.id, requiresFounder: founderAt.includes(snapshot.id) };
    });
    return snapshots;
  }
  return { save, connect };
}

const make = author(empty("obj-partner", "A partner worth pursuing", "Evaluate whether Northstar Studio is a suitable launch partner."));
make.save("received", "Objective received", 0, () => {}, { title: "You set the Objective", detail: "A partnership evaluation, not permission to contact or commit.", kind: "objective", relatedIds: ["obj-partner"] });
make.save("contract", "Done means", 1, v => {
  v.objective.state = "planning";
  v.outcome = { contractId: "contract-partner", revision: 1, intent: "A grounded go / no-go recommendation, with risks and unknowns.", minimumCompletionBar: "partner-minimum", levels: [
    { levelKey: "partner-minimum", label: "Decision-ready evaluation", statement: "Company fit checked against recorded needs and public evidence.", status: "current" },
    { levelKey: "partner-extra", label: "Direct partner response", statement: "Optional confirmation from the partner; no outreach authorized.", status: "pending" },
  ] };
  v.requirements = [requirement("req-partner", "Verify partner fit", "Evaluation artifact plus independently checked source coverage."), requirement("req-response", "Hear from the partner", "Founder-authorized outreach and an observed reply.", "supporting")];
  v.somebodyNow = { headline: "First, make success checkable.", detail: "The evaluation is required. A partner response is supporting, not a hidden completion condition.", ball: "Somebody", condition: "working", currentRequirementKey: "req-partner" };
}, { title: "Somebody defined the completion bar", detail: "Required proof is separate from optional outreach.", kind: "management", relatedIds: ["contract-partner", "req-partner", "req-response"] });
make.save("working", "Internal work", 2, v => {
  v.objective.state = "executing";
  v.requirements[0].strategy = "MAKE";
  v.workers = [{ workerKey: "worker-research", displayName: "Partnership Researcher", responsibility: "Compare partner evidence with our company criteria.", lifecycle: "assigned", staffing: { outcome: "create", reason: "No existing worker has this evaluation context; governed research primitives are available." }, verifiedHistory: [], reservedForAssignmentId: "assignment-partner" }];
  v.decisions = [{ decisionId: "decision-partner", requirementKey: "req-partner", strategy: "MAKE", summary: "Keep the evaluation in-house.", rationale: "Company records and public research are already controlled; an external wrapper adds no missing resource.", authorization: "authorized", selectedOptionId: "option-research", at: minute(2), options: [{ optionId: "option-research", strategy: "MAKE", label: "Create a research That Guy", eligibility: "eligible", reason: "Required research primitives and company criteria are available.", facts: [{ label: "Access", value: "Company criteria + public evidence", provenance: "persisted_evidence" }, { label: "Internal cost", value: "Not measured", provenance: "unknown" }] }] }];
  v.assignments = [{ assignmentId: "assignment-partner", workerKey: "worker-research", requirementKey: "req-partner", decisionId: "decision-partner", state: "running", resultSummary: null, proofRefs: [] }];
  v.somebodyNow = { headline: "The right That Guy. A bounded brief.", detail: "Somebody created a researcher and assigned the evaluation. No outreach or spend is authorized.", ball: "Somebody", condition: "working", currentRequirementKey: "req-partner" };
}, { title: "Somebody created a research That Guy", detail: "MAKE was authorized against the available internal resources.", kind: "staffing", relatedIds: ["decision-partner", "worker-research", "assignment-partner"] });
make.save("result", "Worker result received", 6, v => {
  v.assignments[0].state = "result_submitted";
  v.assignments[0].resultSummary = "Proceed to a scoped conversation; customer overlap is promising, delivery capacity remains uncertain.";
  v.workers[0].lifecycle = "available"; v.workers[0].reservedForAssignmentId = null;
  v.artifacts = [{ artifactId: "artifact-partner", label: "Partner evaluation", versions: [{ id: "partner-v1", version: 1, summary: "Fit, risks, source excerpts and recommended next action.", at: minute(6), evidenceRefs: ["evidence-partner"] }] }];
  v.evidence = [{ evidenceId: "evidence-partner", label: "Evaluation source coverage", summary: "Company criteria and two separate public observations are attached to the evaluation in this fixture.", origin: "application_observation", state: "received", requirementKey: "req-partner", providerId: null, observedAt: minute(6) }];
  v.somebodyNow.headline = "The worker is done. The Objective is not.";
  v.somebodyNow.detail = "Somebody is checking the artifact and source coverage before accepting any proof.";
}, { title: "A result arrived, not a completion claim", detail: "The researcher submitted evaluation v1 for application verification.", kind: "artifact", relatedIds: ["assignment-partner", "artifact-partner", "evidence-partner"] });
make.save("verified", "Assignment verified", 7, v => {
  v.evidence[0].state = "verified"; v.assignments[0].state = "verified"; v.assignments[0].proofRefs = ["evidence-partner"];
  v.somebodyNow.headline = "The assignment’s proof checks out.";
  v.somebodyNow.detail = "The Requirement still needs its own accepted resolution against this Outcome Contract.";
}, { title: "Assignment verification accepted", detail: "Artifact and coverage checks passed; Requirement satisfaction remains separate.", kind: "verification", relatedIds: ["assignment-partner", "evidence-partner"] });
make.save("satisfied", "Requirement satisfied", 8, v => {
  v.requirements[0].state = "satisfied";
  v.requirements[0].resolution = { resolutionId: "resolution-partner", proofRefs: ["evidence-partner"], acceptedAt: minute(8) };
  v.somebodyNow.headline = "Required proof is in. One final gate.";
  v.somebodyNow.detail = "Somebody is presenting the independent completion verdict, not relying on the worker’s claim.";
}, { title: "Partner-fit Requirement satisfied", detail: "The accepted resolution cites the verified evidence explicitly.", kind: "verification", relatedIds: ["req-partner", "evidence-partner"] });
make.save("completed", "Objective accepted", 9, v => {
  v.objective.state = "completed"; v.outcome!.levels[0].status = "achieved";
  v.completion = { accepted: true, proofRefs: ["evidence-partner"], summary: "Decision-ready evaluation accepted. Pursue a scoped conversation, not an unconditional partnership.", remaining: ["Partner response is pending. No outreach has been authorized.", "Delivery capacity remains uncertain."], acceptedAt: minute(9) };
  v.somebodyNow = { headline: "Done means proved. This one is.", detail: "The required evaluation is accepted. Optional outreach remains pending and is not silently marked done.", ball: "Nobody — complete", condition: "verified", currentRequirementKey: null };
}, { title: "Objective independently accepted", detail: "Minimum outcome achieved; supporting work and uncertainty are retained.", kind: "completion", relatedIds: ["obj-partner", "req-partner", "evidence-partner"] });

const buy = author(empty("obj-launch", "A launch that lands", "Fix our launch message. Prepare an evidence-backed relaunch today."));
buy.save("received", "Objective received", 0, () => {}, { title: "You gave Somebody the relaunch brief", detail: "Prepare the relaunch pack; public publishing is outside this contract.", kind: "objective", relatedIds: ["obj-launch"] });
buy.save("contract", "Outcome Contract", 1, v => {
  v.objective.state = "planning";
  v.outcome = { contractId: "contract-launch", revision: 1, intent: "A relaunch pack grounded in audience evidence, independently checked and ready for you to publish.", minimumCompletionBar: "launch-ready", levels: [
    { levelKey: "launch-ready", label: "Relaunch-ready pack", statement: "Verified audience evidence is reflected in the revised launch copy.", status: "current" },
    { levelKey: "launch-impact", label: "Audience response", statement: "Post-launch response is observed; publishing is not authorized here.", status: "pending" },
  ] };
  v.requirements = [requirement("req-draft", "Diagnose the launch message", "Current message checked against company positioning."), requirement("req-pack", "Prepare the relaunch pack", "Revised copy must reflect verified audience evidence."), requirement("req-impact", "Observe audience response", "Post-publication observations, after separate authority.", "supporting")];
  v.somebodyNow = { headline: "A better message. Evidence to back it.", detail: "Somebody has separated a usable relaunch pack from the supporting goal of measuring audience response.", ball: "Somebody", condition: "working", currentRequirementKey: "req-draft" };
}, { title: "Somebody set a bounded Outcome Contract", detail: "Relaunch preparation is required; public publishing is not implicitly authorized.", kind: "management", relatedIds: ["contract-launch", "req-draft", "req-pack"] });
buy.save("working", "That Guy reused", 2, v => {
  v.objective.state = "executing"; v.requirements[0].strategy = "MAKE";
  v.workers = [{ workerKey: "worker-growth", displayName: "Growth Operator", responsibility: "Turn company positioning and observed audience evidence into launch copy.", lifecycle: "assigned", staffing: { outcome: "reuse", reason: "Available persistent worker with verified positioning work and retained company context." }, verifiedHistory: ["Positioning review accepted on 18 September"], reservedForAssignmentId: "assignment-draft" }];
  v.decisions = [{ decisionId: "decision-draft", requirementKey: "req-draft", strategy: "MAKE", summary: "Reuse the Growth Operator.", rationale: "The company already controls positioning records and writing capability.", authorization: "authorized", selectedOptionId: "option-draft", at: minute(2), options: [{ optionId: "option-draft", strategy: "MAKE", label: "Growth Operator", eligibility: "eligible", reason: "Available, with verified relevant history.", facts: [{ label: "Context", value: "Retained positioning review", provenance: "persisted_evidence" }] }] }];
  v.assignments = [{ assignmentId: "assignment-draft", workerKey: "worker-growth", requirementKey: "req-draft", decisionId: "decision-draft", state: "running", resultSummary: null, proofRefs: [] }];
  v.somebodyNow.headline = "Why start over? That Guy knows the company.";
  v.somebodyNow.detail = "Somebody reused the Growth Operator for the internal diagnosis. One assignment is running.";
}, { title: "Growth Operator reused", detail: "The staffing decision cites availability, verified history and retained context.", kind: "staffing", relatedIds: ["worker-growth", "assignment-draft", "decision-draft"] });
buy.save("resource", "External resource needed", 6, v => {
  v.objective.state = "waiting_for_resource";
  v.workers[0].lifecycle = "available"; v.workers[0].reservedForAssignmentId = null;
  v.assignments[0].state = "verified"; v.assignments[0].resultSummary = "The message leads with features, not the audience’s problem."; v.assignments[0].proofRefs = ["evidence-draft"];
  v.evidence = [{ evidenceId: "evidence-draft", label: "Positioning check", summary: "The company positioning record supports a problem-first revision.", origin: "application_observation", state: "verified", requirementKey: "req-draft", providerId: null, observedAt: minute(5) }];
  v.artifacts = [{ artifactId: "artifact-launch", label: "Relaunch message", versions: [{ id: "launch-v1", version: 1, summary: "Feature-first launch copy; audience assumptions explicitly unverified.", at: minute(5), evidenceRefs: ["evidence-draft"] }] }];
  v.requirements[0].state = "satisfied"; v.requirements[0].resolution = { resolutionId: "resolution-draft", proofRefs: ["evidence-draft"], acceptedAt: minute(6) };
  v.requirements.splice(1, 0, requirement("req-audience", "Obtain audience evidence", "Privileged social-intelligence result received and independently verified."));
  v.requirements[1].strategy = "BUY";
  v.decisions.push({ decisionId: "decision-audience", requirementKey: "req-audience", strategy: "BUY", summary: "Buy the missing access. Keep the thinking in-house.", rationale: "Internal writing cannot manufacture privileged audience observations. Newsliquid supplies the missing resource, not a replacement manager.", authorization: "approval_required", selectedOptionId: "option-news", at: minute(6), options: [
    { optionId: "option-internal", strategy: "MAKE", label: "Research internally", eligibility: "ineligible", reason: "The company does not control the privileged audience data.", facts: [{ label: "Access", value: "Public sources only", provenance: "persisted_evidence" }] },
    { optionId: "option-news", strategy: "BUY", label: "Newsliquid audience evidence", eligibility: "ineligible", reason: "Resource fits the request, but spend authority is not yet granted.", facts: [{ label: "Maximum", value: "$0.40 · illustrative fixture quote", provenance: "provider_quote" }, { label: "Resource", value: "Privileged social intelligence", provenance: "registry_data" }, { label: "Delivery", value: "Not measured", provenance: "unknown" }] },
    { optionId: "option-hybrid", strategy: "HYBRID", label: "External analysis + internal rewrite", eligibility: "ineligible", reason: "Spend authority is absent, and purchased analysis duplicates internal writing capability.", facts: [{ label: "Added benefit", value: "Not established", provenance: "unknown" }] },
    { optionId: "option-wrapper", strategy: "BUY", label: "Generic growth wrapper", eligibility: "ineligible", reason: "Duplicates internal reasoning without supplying the required privileged data.", facts: [{ label: "Resource match", value: "Does not meet this Requirement", provenance: "registry_data" }] },
  ] });
  v.external = [{ providerId: "provider-news", name: "Newsliquid", resource: "Audience evidence", requirementKey: "req-audience", decisionId: "decision-audience", intent: null, payment: { paymentId: "payment-news", state: "prepared", maximumUsd: 0.4, history: [{ id: "payment-news-prepared", state: "prepared", at: minute(6) }] }, boundaryNote: "Illustrative fixture only. Generic acquisition is not connected to the real M3 payment rail." }];
  v.somebodyNow = { headline: "The missing piece is access, not another thinker.", detail: "Somebody compared MAKE, BUY and HYBRID. The recommendation is BUY; authority is still required.", ball: "Somebody", condition: "waiting", currentRequirementKey: "req-audience" };
}, { title: "A new Requirement emerged", detail: "The internal diagnosis exposed an audience-data gap. The explicit BUY decision addresses that gap.", kind: "management", relatedIds: ["req-audience", "decision-audience", "evidence-draft"] });
buy.save("approval", "Needs your approval", 7, v => {
  v.objective.state = "approval_required";
  v.external[0].payment.state = "awaiting_approval"; v.external[0].payment.history.push({ id: "payment-news-approval", state: "awaiting_approval", at: minute(7) });
  v.attention = [{ id: "attention-news", kind: "approval", title: "A little access. Your call.", detail: "Approve one audience-evidence acquisition from Newsliquid, up to $0.40. No recurring spend, publication or additional purchase is authorized.", requestedAction: "Approve up to $0.40", requirementKey: "req-audience", maximumUsd: 0.4 }];
  v.somebodyNow = { headline: "Somebody needs your say, not your supervision.", detail: "The next move needs spend authority. Work is paused at this boundary; nothing has been paid.", ball: "You", condition: "needs_you", currentRequirementKey: "req-audience" };
}, { title: "Somebody asked for bounded authority", detail: "One provider, one resource, a $0.40 maximum. No payment attempted.", kind: "approval", relatedIds: ["decision-audience", "provider-news", "req-audience"] });
buy.save("approved", "Approval granted", 8, v => {
  v.attention = []; v.objective.state = "waiting_for_resource";
  v.decisions[1].authorization = "authorized"; v.decisions[1].options[1].eligibility = "eligible"; v.decisions[1].options[1].reason = "Resource fit and bounded founder authority recorded in this fixture.";
  v.external[0].intent = { intentId: "intent-news", kind: "external_acquisition", state: "authorized", approvalId: "approval-news" };
  v.external[0].payment.state = "approved"; v.external[0].payment.history.push({ id: "payment-news-approved", state: "approved", at: minute(8) });
  v.somebodyNow = { headline: "Approved is permission. It is not payment.", detail: "A generic acquisition intent is now authorized. This fixture illustrates the unwired M3 boundary.", ball: "Somebody", condition: "working", currentRequirementKey: "req-audience" };
}, { title: "Founder approval recorded in the fixture", detail: "Somebody authorized one acquisition intent within the approved maximum.", kind: "approval", relatedIds: ["decision-audience", "intent-news"] });
const paymentMoments = [
  { id: "attempted", state: "payment_attempted", at: 9, headline: "The payment attempt has begun.", detail: "An attempt is recorded. Submission and settlement have not been confirmed." },
  { id: "submitted", state: "submitted", at: 10, headline: "Submitted. Not settled.", detail: "Somebody is waiting for settlement evidence. A submission is not proof of payment success." },
  { id: "settled", state: "settled", at: 11, headline: "Payment settled. The resource is still due.", detail: "Settlement and provider delivery remain distinct. Nobody has accepted audience evidence yet." },
  { id: "result", state: "result_received", at: 12, headline: "New evidence. Not yet trusted.", detail: "The provider result arrived. Somebody is checking scope and provenance before it can satisfy the Requirement." },
  { id: "verified", state: "verified", at: 13, headline: "The evidence checks out. Put it to work.", detail: "Audience evidence is independently verified. The relaunch pack itself is still unfinished." },
] as const;
for (const moment of paymentMoments) buy.save(moment.id, moment.state.replaceAll("_", " "), moment.at, v => {
  const external = v.external[0];
  external.payment.state = moment.state;
  external.payment.history.push({ id: `payment-news-${moment.id}`, state: moment.state, at: minute(moment.at) });
  external.intent!.state = moment.state === "result_received" ? "result_recorded" : moment.state === "verified" ? "verified" : "handed_off";
  v.somebodyNow = { headline: moment.headline, detail: moment.detail, ball: moment.state === "settled" || moment.state === "submitted" ? "Provider" : "Somebody", condition: moment.state === "settled" || moment.state === "submitted" ? "waiting" : "working", currentRequirementKey: "req-audience" };
  if (moment.state === "result_received") v.evidence.push({ evidenceId: "evidence-audience", label: "Audience language & objections", summary: "Fixture sample: people ask what changes in their workday, not how many features ship. Source scope and freshness are attached for checking.", origin: "provider_result", state: "received", requirementKey: "req-audience", providerId: "provider-news", observedAt: minute(12) });
  if (moment.state === "verified") {
    v.evidence[1].state = "verified"; v.requirements[1].state = "satisfied";
    v.requirements[1].resolution = { resolutionId: "resolution-audience", proofRefs: ["evidence-audience"], acceptedAt: minute(13) };
  }
}, { title: moment.headline, detail: moment.detail, kind: moment.state === "verified" ? "verification" : "external", relatedIds: moment.state === "verified" || moment.state === "result_received" ? ["intent-news", "evidence-audience"] : ["intent-news"] });
buy.save("resumed", "Internal work resumes", 14, v => {
  v.objective.state = "executing"; v.requirements[2].strategy = "MAKE";
  v.workers[0].lifecycle = "assigned"; v.workers[0].reservedForAssignmentId = "assignment-pack";
  v.decisions.push({ decisionId: "decision-pack", requirementKey: "req-pack", strategy: "MAKE", summary: "Use the new evidence to rewrite internally.", rationale: "Verified audience language is now available to the Growth Operator. There is no need to buy writing capability.", authorization: "authorized", selectedOptionId: "option-pack", at: minute(14), options: [{ optionId: "option-pack", strategy: "MAKE", label: "Growth Operator", eligibility: "eligible", reason: "Available after the earlier assignment; verified evidence is attached.", facts: [{ label: "Input", value: "Verified audience evidence", provenance: "persisted_evidence" }] }] });
  v.assignments.push({ assignmentId: "assignment-pack", workerKey: "worker-growth", requirementKey: "req-pack", decisionId: "decision-pack", state: "running", resultSummary: null, proofRefs: [] });
  v.somebodyNow = { headline: "Same That Guy. Better information.", detail: "Somebody attached the verified audience evidence to a new bounded rewrite assignment. Work resumes inside the company.", ball: "Somebody", condition: "working", currentRequirementKey: "req-pack" };
}, { title: "Somebody sent verified evidence back into work", detail: "The new assignment explicitly uses the audience evidence; this relationship is not inferred from timestamps.", kind: "management", relatedIds: ["evidence-audience", "assignment-pack", "decision-pack"] });
buy.save("revision", "Artifact revised", 17, v => {
  v.assignments[1].state = "result_submitted"; v.assignments[1].resultSummary = "Problem-first relaunch pack submitted for independent checking.";
  v.workers[0].lifecycle = "available"; v.workers[0].reservedForAssignmentId = null;
  v.artifacts[0].versions.push({ id: "launch-v2", version: 2, summary: "Leads with the workday outcome; answers audience objections instead of listing features.", at: minute(17), evidenceRefs: ["evidence-audience"] });
  v.evidence.push({ evidenceId: "evidence-pack", label: "Relaunch pack read-back", summary: "Revision 2 was read back from the company artifact; audience claims and source references checked against the verified provider result.", origin: "application_observation", state: "received", requirementKey: "req-pack", providerId: null, observedAt: minute(17) });
  v.somebodyNow.headline = "The message changed. Here is what changed it.";
  v.somebodyNow.detail = "Version 2 cites the audience evidence. The worker has submitted its result; independent acceptance is still pending.";
}, { title: "Relaunch message advanced from v1 to v2", detail: "Revision 2 explicitly cites audience evidence. A submitted rewrite is not yet an accepted outcome.", kind: "artifact", relatedIds: ["artifact-launch", "evidence-audience", "assignment-pack"] });
buy.save("assignment-verified", "Rewrite verified", 18, v => {
  v.assignments[1].state = "verified"; v.assignments[1].proofRefs = ["evidence-pack"]; v.evidence[2].state = "verified";
  v.somebodyNow.headline = "The rewrite passed its own checks.";
  v.somebodyNow.detail = "Somebody still needs an accepted Requirement resolution and an independent Objective verdict.";
}, { title: "Rewrite assignment verified", detail: "Application read-back accepted. Requirement satisfaction has not been inferred from the worker result.", kind: "verification", relatedIds: ["assignment-pack", "evidence-pack"] });
buy.save("requirements-satisfied", "Required outcomes proved", 19, v => {
  v.requirements[2].state = "satisfied"; v.requirements[2].resolution = { resolutionId: "resolution-pack", proofRefs: ["evidence-pack", "evidence-audience"], acceptedAt: minute(19) };
  v.somebodyNow.headline = "Every required result now has accepted proof.";
  v.somebodyNow.detail = "The completion gate is separate. Supporting audience response is still pending.";
}, { title: "Relaunch-pack Requirement satisfied", detail: "The resolution cites both the revised-artifact check and the verified audience evidence.", kind: "verification", relatedIds: ["req-pack", "evidence-pack", "evidence-audience"] });
buy.save("completed", "Objective independently accepted", 20, v => {
  v.objective.state = "completed"; v.outcome!.levels[0].status = "achieved";
  v.completion = { accepted: true, proofRefs: ["evidence-draft", "evidence-audience", "evidence-pack"], summary: "The evidence-backed relaunch pack is ready for founder review and publication. No public launch or audience lift is claimed.", remaining: ["Audience response remains pending.", "Publishing requires separate authority and is outside this fixture’s completion bar."], acceptedAt: minute(20) };
  v.somebodyNow = { headline: "Ready to relaunch. Nothing hand-waved.", detail: "The required pack is independently accepted. Somebody tells you exactly what is done, pending and outside scope.", ball: "Nobody — complete", condition: "verified", currentRequirementKey: null };
}, { title: "Objective independently accepted", detail: "Required proof accepted; supporting response and publication remain explicitly unclaimed.", kind: "completion", relatedIds: ["obj-launch", "req-pack", "evidence-pack"] });

const interrupted = author(empty("obj-supplier", "An agreement we can stand behind", "Review the supplier agreement before we commit."));
interrupted.save("blocked", "Authority boundary", 3, v => {
  v.objective.state = "blocked";
  v.outcome = { contractId: "contract-supplier", revision: 1, intent: "A supplier review with an authorized decision on liability exposure.", minimumCompletionBar: "supplier-ready", levels: [{ levelKey: "supplier-ready", label: "Authorized risk decision", statement: "Founder or qualified counsel resolves the liability clause.", status: "not_proven" }] };
  v.requirements = [requirement("req-liability", "Resolve the liability clause", "Explicit founder direction or a qualified legal review.")];
  v.requirements[0].state = "blocked"; v.requirements[0].strategy = "ASK_FOUNDER";
  v.attention = [{ id: "attention-liability", kind: "blocker", title: "This needs authority, not more AI.", detail: "The agreement has an uncapped liability clause. Somebody cannot supply professional legal authority or accept this risk for you.", requestedAction: "Arrange a qualified review or clarify the permitted scope.", requirementKey: "req-liability", maximumUsd: null }];
  v.somebodyNow = { headline: "Somebody knows where to stop.", detail: "No qualified review or risk acceptance is authorized. The engine is paused; retrying would not resolve the missing authority.", ball: "You", condition: "blocked", currentRequirementKey: "req-liability" };
  v.decisions = [{ decisionId: "decision-liability", requirementKey: "req-liability", strategy: "ASK_FOUNDER", summary: "Escalate the material liability question.", rationale: "Ordinary summarization cannot replace qualified review or founder authority.", authorization: "refused", selectedOptionId: null, options: [], at: minute(3) }];
}, { title: "Somebody stopped at an authority boundary", detail: "ASK_FOUNDER is a strategy, not an invented backend ASK state. No automatic retry or false completion.", kind: "management", relatedIds: ["req-liability", "decision-liability"] });

export const fixtureScenarios: FixtureScenario[] = [
  { id: "launch", title: "A launch that lands", path: "MAKE → BUY → MAKE", initialSnapshotId: "approval", snapshots: buy.connect(["Interpret the Objective", "Reuse the Growth Operator", "Receive the internal diagnosis", "Request bounded approval", "Approve up to $0.40", "Record payment attempt", "Record submission", "Confirm settlement", "Receive provider result", "Verify provider evidence", "Resume internal work", "Receive revised artifact", "Verify the assignment", "Accept required proof", "Accept the Objective"], ["approval"]) },
  { id: "partner", title: "A partner worth pursuing", path: "MAKE · internal research", initialSnapshotId: "working", snapshots: make.connect(["Interpret the Objective", "Create the researcher", "Receive the worker result", "Verify the assignment", "Accept Requirement proof", "Accept the Objective"]) },
  { id: "supplier", title: "An agreement we can stand behind", path: "BLOCKED · founder authority", initialSnapshotId: "blocked", snapshots: interrupted.connect([]) },
];

export function selectFixture(scenarioId: string, snapshotId?: string): { scenario: FixtureScenario; snapshot: FixtureSnapshot } {
  const scenario = fixtureScenarios.find(item => item.id === scenarioId) ?? fixtureScenarios[0];
  const snapshot = scenario.snapshots.find(item => item.id === snapshotId) ?? scenario.snapshots.find(item => item.id === scenario.initialSnapshotId)!;
  return { scenario, snapshot };
}
