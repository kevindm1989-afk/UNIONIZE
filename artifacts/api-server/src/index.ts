import app from "./app";
import { logger } from "./lib/logger";

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'ADMIN_PASSWORD',
  'PORTAL_URL',
  'EMAIL_FROM',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
];

const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
