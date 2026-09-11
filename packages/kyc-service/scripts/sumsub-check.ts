// Is this configuration good for a live run? App-token auth and the level
// in one call: mints a 60-second access token for a throwaway user on
// SUMSUB_LEVEL_NAME and says what is wrong when Sumsub refuses. Reads the
// service's .env when present (make sumsub-env); the environment wins.
//   make sumsub-check
// Exit 1 on anything but a minted token, so a script can gate on it.

import { fileURLToPath } from 'node:url';
import {
  createSumsubClient,
  HttpError,
  missingSumsubConfig,
  sumsubConfigFromEnv,
} from '@blinkbitcoin/kyc-node';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const fail = (message: string): never => {
  console.error(`sumsub check: ${message}`);
  process.exit(1);
};

const config = sumsubConfigFromEnv();
const missing = missingSumsubConfig(config);
if (missing.length > 0) {
  fail(
    `missing ${missing.join(', ')} - write packages/kyc-service/.env with \`make sumsub-env\` (docs/integration/sumsub.md, section 1)`
  );
}

const publicBase = process.env.PUBLIC_BASE_URL ?? '';
if (publicBase === '' || /localhost|127\.0\.0\.1/.test(publicBase)) {
  console.warn(
    'sumsub check: PUBLIC_BASE_URL is local - real Sumsub webhooks cannot reach this backend (the automated tier signs its own; the device matrix needs a public URL)'
  );
}

const client = createSumsubClient(config);
const userId = `sumsub-check-${Date.now()}`;

const main = async (): Promise<void> => {
  try {
    const minted = await client.createAccessToken(userId, config.levelName, 60);
    console.log(
      `sumsub check: ok - ${config.baseUrl}, level "${config.levelName}", token for ${minted.userId} (${minted.token.length} chars)`
    );
  } catch (error) {
    if (error instanceof HttpError) {
      const hint =
        error.status === 401
          ? 'SUMSUB_APP_TOKEN / SUMSUB_SECRET_KEY are not accepted (wrong values, wrong environment, or the app token was revoked)'
          : error.status === 403
            ? 'the app token is accepted but not allowed to do this (check its permissions in the dashboard)'
            : error.status >= 400 && error.status < 500
              ? `Sumsub rejected the request - if the body names the level, SUMSUB_LEVEL_NAME ("${config.levelName}") does not exist in this sandbox`
              : 'Sumsub answered a server error - retry, then check https://status.sumsub.com';
      fail(`HTTP ${error.status} from ${config.baseUrl}: ${hint}\n${error.message}`);
    }
    fail(`${(error as Error).message} (is ${config.baseUrl} reachable?)`);
  }
};

// The package is CommonJS, so no top-level await
void main();
