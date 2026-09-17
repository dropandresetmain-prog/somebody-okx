/* eslint-disable */
/**
 * Hand-maintained stand-in for Convex codegen output. `npx convex codegen`
 * requires deployment authentication that is unavailable in this sandbox, so
 * this file mirrors what codegen would emit for the current modules. Replace
 * by running `npx convex dev` against the fresh somebody-okx deployment.
 *
 * @module
 */

import { anyApi } from "convex/server";

export const api = anyApi;
export const internal = anyApi;
