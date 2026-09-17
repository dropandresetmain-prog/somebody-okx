/* eslint-disable */
/**
 * Hand-maintained stand-in for Convex codegen output. `npx convex codegen`
 * requires deployment authentication that is unavailable in this sandbox, so
 * this file mirrors what codegen would emit for the current modules. Replace
 * by running `npx convex dev` against the fresh somebody-okx deployment.
 *
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as objectives from "../objectives.js";

declare const fullApi: ApiFromModules<{
  objectives: typeof objectives;
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
