/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as workforce from "./internal/workforce.js";
import type * as management from "../management.js";
import type * as managementValidators from "../managementValidators.js";
import type * as objectiveArgs from "../objectiveArgs.js";
import type * as objectiveRunner from "../objectiveRunner.js";
import type * as objectiveValidators from "../objectiveValidators.js";
import type * as objectives from "../objectives.js";
import type * as workforceGuards from "../workforceGuards.js";
import type * as workforceValidators from "../workforceValidators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "internal/workforce": typeof workforce;
  management: typeof management;
  managementValidators: typeof managementValidators;
  objectiveArgs: typeof objectiveArgs;
  objectiveRunner: typeof objectiveRunner;
  objectiveValidators: typeof objectiveValidators;
  objectives: typeof objectives;
  workforceGuards: typeof workforceGuards;
  workforceValidators: typeof workforceValidators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
