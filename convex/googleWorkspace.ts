"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertDevelopment } from "./environment";
import {
  isGoogleWorkspaceLive,
  loadGoogleConfig,
  readCalendarMissionContext,
  readDriveMissionContext,
  sendGmailEffect,
  verifyGmailOutbound,
  listGmailVendorReplies,
  gmailMessageToEvidenceInput,
  projectMissionToSheet,
} from "../lib/google";
import type { Mission } from "../lib/procurement/types";

const calendarContext = v.object({
  eventId: v.string(),
  calendarId: v.string(),
  summary: v.string(),
  description: v.union(v.string(), v.null()),
  location: v.union(v.string(), v.null()),
  startAt: v.union(v.number(), v.null()),
  endAt: v.union(v.number(), v.null()),
  timeZone: v.union(v.string(), v.null()),
  attendeeCount: v.union(v.number(), v.null()),
  headcountClues: v.array(v.string()),
  logisticsNotes: v.array(v.string()),
  htmlLink: v.union(v.string(), v.null()),
});

const driveFile = v.object({
  fileId: v.string(),
  name: v.string(),
  mimeType: v.string(),
  modifiedAt: v.union(v.string(), v.null()),
  webViewLink: v.union(v.string(), v.null()),
  sizeBytes: v.union(v.number(), v.null()),
  relevance: v.union(
    v.literal("brief"),
    v.literal("sponsor"),
    v.literal("branding"),
    v.literal("other"),
  ),
});

function envConfig() {
  if (!isGoogleWorkspaceLive(process.env))
    throw new Error("GOOGLE_WORKSPACE_LIVE must be true for live Google actions");
  return loadGoogleConfig(process.env);
}

export const loadMissionContext = internalAction({
  args: {},
  returns: v.object({
    calendar: calendarContext,
    drive: v.object({
      folderId: v.string(),
      files: v.array(driveFile),
    }),
  }),
  handler: async () => {
    assertDevelopment();
    const config = envConfig();
    const calendar = await readCalendarMissionContext(config);
    const drive = await readDriveMissionContext(config);
    return { calendar, drive };
  },
});

export const deliverGmailEffect = internalAction({
  args: {
    effectKey: v.string(),
    kind: v.union(v.literal("rfq"), v.literal("clarification")),
    endpointRef: v.string(),
    payload: v.string(),
    threadId: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    messageId: v.string(),
    threadId: v.string(),
    to: v.string(),
    effectKey: v.string(),
    endpointRef: v.string(),
    payload: v.string(),
  }),
  handler: async (_ctx, args) => {
    assertDevelopment();
    const config = envConfig();
    const receipt = await sendGmailEffect({
      config,
      kind: args.kind,
      effectKey: args.effectKey,
      endpointRef: args.endpointRef,
      payload: args.payload,
      threadId: args.threadId,
    });
    return {
      messageId: receipt.messageId,
      threadId: receipt.threadId,
      to: receipt.to,
      effectKey: receipt.effectKey,
      endpointRef: receipt.endpointRef,
      payload: receipt.payload,
    };
  },
});

export const readBackGmailEffect = internalAction({
  args: {
    effectKey: v.string(),
    endpointRef: v.string(),
    payload: v.string(),
    messageId: v.string(),
  },
  returns: v.object({
    messageId: v.string(),
    threadId: v.string(),
    effectKey: v.string(),
    endpointRef: v.string(),
    payload: v.string(),
  }),
  handler: async (_ctx, args) => {
    assertDevelopment();
    const config = envConfig();
    const receipt = await verifyGmailOutbound({
      config,
      effectKey: args.effectKey,
      endpointRef: args.endpointRef,
      payload: args.payload,
      messageId: args.messageId,
    });
    return {
      messageId: receipt.messageId,
      threadId: receipt.threadId,
      effectKey: receipt.effectKey,
      endpointRef: receipt.endpointRef,
      payload: receipt.payload,
    };
  },
});

export const ingestGmailReplies = internalAction({
  args: {
    key: v.string(),
    vendorId: v.string(),
  },
  returns: v.object({
    ingested: v.number(),
    skippedDuplicates: v.number(),
    messageIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    assertDevelopment();
    const config = envConfig();
    const mission = (await ctx.runQuery(internal.missions.read, {
      key: args.key,
    })) as Mission;
    const vendor = mission.vendors.find((item) => item.id === args.vendorId);
    if (!vendor || vendor.channel !== "Gmail")
      throw new Error("Gmail inbound requires a configured Gmail vendor");
    const replies = await listGmailVendorReplies({
      config,
      endpointRef: vendor.endpointRef,
    });
    let ingested = 0;
    let skippedDuplicates = 0;
    const messageIds: string[] = [];
    for (const reply of replies) {
      const evidence = gmailMessageToEvidenceInput({
        vendorId: vendor.id,
        message: reply,
        deadlineAt: mission.requirements.deadlineAt,
      });
      try {
        await ctx.runMutation(internal.missions.apply, {
          key: args.key,
          command: JSON.stringify({
            type: "ingest_external_evidence",
            evidence,
          }),
        });
        ingested++;
        messageIds.push(reply.messageId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("Evidence identity was reused")) {
          skippedDuplicates++;
          messageIds.push(reply.messageId);
          continue;
        }
        throw error;
      }
    }
    return { ingested, skippedDuplicates, messageIds };
  },
});

export const projectComparisonSheet = internalAction({
  args: { key: v.string() },
  returns: v.object({
    spreadsheetId: v.string(),
    sheetName: v.string(),
    updatedRows: v.number(),
  }),
  handler: async (ctx, args) => {
    assertDevelopment();
    const config = envConfig();
    const mission = (await ctx.runQuery(internal.missions.read, {
      key: args.key,
    })) as Mission;
    const result = await projectMissionToSheet({ config, mission });
    return {
      spreadsheetId: result.spreadsheetId,
      sheetName: result.sheetName,
      updatedRows: result.updatedRows,
    };
  },
});
