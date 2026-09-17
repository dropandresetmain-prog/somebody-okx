/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as effectAdapter from "../effectAdapter.js";
import type * as environment from "../environment.js";
import type * as gateway from "../gateway.js";
import type * as googleWorkspace from "../googleWorkspace.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as missions from "../missions.js";
import type * as unipile from "../unipile.js";
import type * as unipileStore from "../unipileStore.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  effectAdapter: typeof effectAdapter;
  environment: typeof environment;
  gateway: typeof gateway;
  googleWorkspace: typeof googleWorkspace;
  health: typeof health;
  http: typeof http;
  missions: typeof missions;
  unipile: typeof unipile;
  unipileStore: typeof unipileStore;
  validators: typeof validators;
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
