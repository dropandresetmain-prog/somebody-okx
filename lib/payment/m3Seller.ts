import express, { type Express } from "express";
import type { Server } from "node:http";
import {
  OKXFacilitatorClient,
} from "@okxweb3/x402-core";
import {
  paymentMiddlewareFromHTTPServer,
} from "@okxweb3/x402-express";
import {
  ExactEvmScheme,
} from "@okxweb3/x402-evm/exact/server";
import {
  x402HTTPResourceServer,
  x402ResourceServer,
  type FacilitatorClient,
  type RouteConfig,
  type RoutesConfig,
} from "@okxweb3/x402-core/server";

export const M3_SELLER_NETWORK = "eip155:1952" as const;
export const M3_SELLER_PATH = "/m3/paid-ping" as const;
export const M3_SELLER_PORT = 4021 as const;
export const M3_SELLER_DEFAULT_HOST = "127.0.0.1" as const;
export const M3_SELLER_ASSET =
  "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c" as const;
export const M3_SELLER_ASSET_NAME = "USD₮0" as const;
export const M3_SELLER_ASSET_VERSION = "1" as const;
export const M3_SELLER_AMOUNT = "10000" as const;
export const M3_SELLER_TIMEOUT_SECONDS = 60 as const;

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);
const REQUIRED_CREDENTIAL_ENV = [
  "OKX_API_KEY",
  "OKX_SECRET_KEY",
  "OKX_API_PASSPHRASE",
] as const;

export type M3SellerConfig = {
  receiver: string;
  apiKey: string;
  secretKey: string;
  passphrase: string;
  host: string;
  port: typeof M3_SELLER_PORT;
};

export type M3SellerPreflight = {
  ok: boolean;
  missing: string[];
  errors: string[];
};

export function inspectM3SellerEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  options: { requireCredentials?: boolean } = {},
): M3SellerPreflight {
  const requireCredentials = options.requireCredentials ?? true;
  const missing: string[] = [];
  const errors: string[] = [];

  const receiver = env.M3_SELLER_RECEIVER_ADDRESS?.trim();
  if (!receiver) missing.push("M3_SELLER_RECEIVER_ADDRESS");
  else if (!ADDRESS_PATTERN.test(receiver)) {
    errors.push("M3_SELLER_RECEIVER_ADDRESS must be a 20-byte EVM address");
  }

  if (requireCredentials) {
    for (const name of REQUIRED_CREDENTIAL_ENV) {
      if (!env[name]?.trim()) missing.push(name);
    }
  }

  const host = (env.M3_SELLER_HOST ?? M3_SELLER_DEFAULT_HOST).trim();
  if (!LOOPBACK_HOSTS.has(host)) {
    errors.push("M3_SELLER_HOST must be 127.0.0.1 or localhost");
  }

  const portText = (env.M3_SELLER_PORT ?? String(M3_SELLER_PORT)).trim();
  const port = Number(portText);
  if (!Number.isInteger(port) || port !== M3_SELLER_PORT) {
    errors.push(`M3_SELLER_PORT must remain ${M3_SELLER_PORT}`);
  }

  const networkOverride = env.M3_SELLER_NETWORK?.trim();
  if (networkOverride && networkOverride !== M3_SELLER_NETWORK) {
    errors.push(`M3_SELLER_NETWORK must remain ${M3_SELLER_NETWORK}`);
  }

  return { ok: missing.length === 0 && errors.length === 0, missing, errors };
}

export function readM3SellerConfig(
  env: NodeJS.ProcessEnv = process.env,
): M3SellerConfig {
  const preflight = inspectM3SellerEnvironment(env);
  if (!preflight.ok) {
    const details = [
      preflight.missing.length > 0
        ? `missing ${preflight.missing.join(", ")}`
        : "",
      ...preflight.errors,
    ].filter(Boolean);
    throw new Error(`M3 seller configuration invalid: ${details.join("; ")}`);
  }

  return {
    receiver: env.M3_SELLER_RECEIVER_ADDRESS!.trim(),
    apiKey: env.OKX_API_KEY!.trim(),
    secretKey: env.OKX_SECRET_KEY!.trim(),
    passphrase: env.OKX_API_PASSPHRASE!.trim(),
    host: (env.M3_SELLER_HOST ?? M3_SELLER_DEFAULT_HOST).trim(),
    port: M3_SELLER_PORT,
  };
}

export function createM3SellerRoutes(receiver: string): RoutesConfig {
  if (!ADDRESS_PATTERN.test(receiver)) {
    throw new Error("M3 seller receiver must be a 20-byte EVM address");
  }

  const route: RouteConfig = {
    accepts: {
      scheme: "exact",
      network: M3_SELLER_NETWORK,
      payTo: receiver,
      price: {
        asset: M3_SELLER_ASSET,
        amount: M3_SELLER_AMOUNT,
        extra: {
          name: M3_SELLER_ASSET_NAME,
          version: M3_SELLER_ASSET_VERSION,
        },
      },
      maxTimeoutSeconds: M3_SELLER_TIMEOUT_SECONDS,
    },
    resource: M3_SELLER_PATH,
    description: "Somebody M3 controlled Testnet payment",
    mimeType: "application/json",
    unpaidResponseBody: () => ({
      contentType: "application/json",
      body: { ok: false, error: "payment_required" },
    }),
  };

  return {
    [`GET ${M3_SELLER_PATH}`]: route,
  } as Record<string, RouteConfig>;
}

export type M3SellerInstance = {
  app: Express;
  config: M3SellerConfig;
  routes: RoutesConfig;
  resourceServer: x402ResourceServer;
  httpResourceServer: x402HTTPResourceServer;
  initialize: () => Promise<void>;
};

export function createM3SellerApp(options: {
  env?: NodeJS.ProcessEnv;
  facilitatorClient?: FacilitatorClient;
  app?: Express;
} = {}): M3SellerInstance {
  const config = readM3SellerConfig(options.env);
  const routes = createM3SellerRoutes(config.receiver);
  const facilitator =
    options.facilitatorClient ??
    new OKXFacilitatorClient({
      apiKey: config.apiKey,
      secretKey: config.secretKey,
      passphrase: config.passphrase,
      syncSettle: true,
    });
  const resourceServer = new x402ResourceServer(facilitator).register(
    M3_SELLER_NETWORK,
    new ExactEvmScheme(),
  );
  const httpResourceServer = new x402HTTPResourceServer(resourceServer, routes);
  const app = options.app ?? express();
  let initialized = false;

  // The SDK must initialize against the facilitator before any protected
  // request is accepted. The gate also closes the listen-before-initialize race.
  app.use((_req, res, next) => {
    if (!initialized) {
      res.status(503).json({ ok: false, error: "seller_not_ready" });
      return;
    }
    next();
  });
  app.use(paymentMiddlewareFromHTTPServer(httpResourceServer, undefined, undefined, false));
  app.get(M3_SELLER_PATH, (_req, res) => {
    res.json({
      ok: true,
      message: "Somebody M3 payment verified",
      resource: "m3-paid-ping",
    });
  });

  return {
    app,
    config,
    routes,
    resourceServer,
    httpResourceServer,
    initialize: async () => {
      await httpResourceServer.initialize();
      initialized = true;
    },
  };
}

export async function startM3Seller(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ seller: M3SellerInstance; server: Server }> {
  const seller = createM3SellerApp({ env });
  const server = await new Promise<Server>((resolve, reject) => {
    const candidate = seller.app.listen(seller.config.port, seller.config.host, () => {
      resolve(candidate);
    });
    candidate.once("error", reject);
  });

  try {
    await seller.initialize();
  } catch (error) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const message = error instanceof Error ? error.message : "unknown initialization error";
    throw new Error(`M3 seller facilitator initialization failed: ${message}`);
  }

  return { seller, server };
}
