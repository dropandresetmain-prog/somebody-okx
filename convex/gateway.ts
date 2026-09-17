import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertAccess } from "./environment";
import { commandSchema } from "../lib/procurement/commands";
import { dispatch } from "./effectAdapter";
import type { Mission } from "../lib/procurement/types";
import { sourceCatalogueEvidence } from "../lib/web/sourceCatalogueEvidence";

export const command = action({
  args: { accessToken: v.string(), key: v.string(), command: v.string() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    assertAccess(args.accessToken);
    const command = commandSchema.parse(JSON.parse(args.command));
    if (command.type === "execute_effect" || command.type === "verify_effect")
      return await dispatch(ctx, args.key, command);
    const result = await ctx.runMutation(internal.missions.apply, {
      key: args.key,
      command: JSON.stringify(command),
    });
    // Web catalogue: request_quote retrieves public evidence. Other channels
    // still use explicit ingest_fixture_observation in Development smoke paths.
    if (command.type === "request_quote") {
      const mission = (await ctx.runQuery(internal.missions.read, {
        key: args.key,
      })) as Mission;
      const configured = mission.vendors.find(
        (vendor) => vendor.id === command.vendorId,
      );
      if (configured?.channel === "Web") {
        const evidence = await sourceCatalogueEvidence(
          mission,
          command.vendorId,
        );
        await ctx.runMutation(internal.missions.apply, {
          key: args.key,
          command: JSON.stringify({
            type: "ingest_external_evidence",
            evidence,
          }),
        });
      }
    }
    return result;
  },
});
