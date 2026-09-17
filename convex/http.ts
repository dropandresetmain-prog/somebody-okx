import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

/**
 * Public Unipile new-message webhook.
 * Configure in Unipile as:
 *   POST https://<deployment>.convex.site/webhooks/unipile?token=<UNIPILE_WEBHOOK_SECRET>
 * Only Development `acrobatic-swan-765` should receive writes from this lane's verification.
 */
http.route({
  path: "/webhooks/unipile",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.UNIPILE_WEBHOOK_SECRET?.trim();
    if (!expected || expected.length < 16) {
      return new Response("Unipile webhook is not configured", { status: 503 });
    }
    const url = new URL(request.url);
    const token =
      url.searchParams.get("token") ||
      request.headers.get("x-unipile-webhook-secret") ||
      "";
    if (token !== expected)
      return new Response("Unauthorized", { status: 401 });

    const raw = await request.text();
    try {
      const result: string = await ctx.runAction(
        internal.unipile.handleWebhook,
        {
          raw,
          retrievedAt: Date.now(),
        },
      );
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Webhook failed";
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
  }),
});

export default http;
