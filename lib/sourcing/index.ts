/**
 * M2 Sourcing Policy Kernel — Public API Surface
 *
 * This module exports the narrow public interface for the sourcing policy kernel.
 * The kernel is pure, deterministic, and side-effect free.
 *
 * KEY EXPORTS:
 * - validateModelProposal: Sanitize untrusted model output (strips authority fields)
 * - evaluateSourcingPolicy: Deterministic Make-vs-Buy decision
 * - Type definitions for the kernel's vocabulary
 *
 * USAGE:
 * 1. Call validateModelProposal() with the model's output to get validated resource needs
 * 2. Call evaluateSourcingPolicy() with validated needs + factual inventory + optional provider paths
 * 3. The result is a deterministic MAKE/BUY/BLOCKED decision with full reasoning
 *
 * INVARIANTS:
 * - Factual inventory is the ONLY ownership authority (catalog membership ≠ control)
 * - Model-proposed verdicts carry zero authority (stripped during validation)
 * - Empty/invalid requirements fail closed (never MAKE)
 * - Same inputs → byte-identical outputs (deterministic)
 */

export { evaluateSourcingPolicy, validateModelProposal } from "./policy";

export type {
  ApprovedProviderPath,
  FactualResourceInventory,
  SourcingAuthorizingResult,
  SourcingDecision,
  SourcingEvaluationInput,
  SourcingEvaluationResult,
  SourcingInvalidResult,
  SourcingReasonCode,
  UntrustedModelProposal,
  ValidatedResourceNeeds,
} from "./types";
