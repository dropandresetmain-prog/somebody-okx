import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { commandSchema } from "../../../lib/procurement/commands";
import { isLocalControlRequest } from "../../../lib/server/local-control";

export async function POST(request: Request) {
  // Local Development control surface only; this is not a user-authentication system.
  if (!isLocalControlRequest(request))
    return Response.json(
      { error: "Local Development access only" },
      { status: 403 },
    );
  if (
    process.env.NEXT_PUBLIC_CONVEX_URL !==
    "https://acrobatic-swan-765.convex.cloud"
  )
    return Response.json(
      { error: "Development deployment mismatch" },
      { status: 503 },
    );
  const accessToken = process.env.DEVELOPMENT_ACCESS_TOKEN;
  if (!accessToken)
    return Response.json(
      {
        error:
          "Development access token is not configured. See docs/DEVELOPMENT_SLICE.md.",
      },
      { status: 503 },
    );
  try {
    const body = await request.text();
    if (body.length > 10000)
      return Response.json({ error: "Command is too large" }, { status: 413 });
    const input = JSON.parse(body);
    const command = commandSchema.parse(input.command);
    const key = command.type === "create" ? command.key : input.key;
    if (typeof key !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(key))
      throw new Error("Invalid mission key");
    const result = await new ConvexHttpClient(
      process.env.NEXT_PUBLIC_CONVEX_URL,
    ).action(api.gateway.command, {
      accessToken,
      key,
      command: JSON.stringify(command),
    });
    return Response.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Command failed";
    return Response.json({ error: message.slice(0, 600) }, { status: 400 });
  }
}
