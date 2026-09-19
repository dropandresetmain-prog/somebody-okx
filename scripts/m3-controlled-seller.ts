import { startM3Seller, M3_SELLER_PATH } from "../lib/payment/m3Seller";

startM3Seller()
  .then(({ seller, server }) => {
    console.log(`M3 seller ready at http://${seller.config.host}:${seller.config.port}${M3_SELLER_PATH}`);

    const shutdown = () => {
      server.close(() => process.exit(0));
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown seller startup error";
    console.error(`M3 seller startup failed: ${message}`);
    process.exitCode = 1;
  });
