// Where this deployment says it is reachable: the hosted-page URL handed to
// clients and the `allowedOrigin` they pin postMessage to both derive from
// PUBLIC_BASE_URL. On its own so the mock adapter (which posts its webhooks
// back here) and the boot guard (which imports the adapters) do not form a
// cycle.

import { type Env, isInsecureDevAllowed } from './env';
import { localOrigin } from './port';

// A loop, not `/\/+$/`: CodeQL's js/polynomial-redos flags that regex on
// input the code does not control (the URL comes from the environment).
const stripTrailingSlashes = (value: string): string => {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
};

/**
 * Base URL this backend is reachable at, without a trailing slash. The
 * local-origin default (the port this process listens on) applies to
 * insecure dev ONLY - anywhere else validateConfig has already refused to
 * boot a sessions deployment without an explicit value, so there is nothing
 * to guess.
 */
export const getPublicBaseUrl = (env: Env = process.env): string =>
  stripTrailingSlashes(env.PUBLIC_BASE_URL || (isInsecureDevAllowed(env) ? localOrigin(env) : ''));

/**
 * Origin of the hosted page, handed to clients as `allowedOrigin` so they can
 * pin postMessage. Falls back to the raw base URL if it is unparseable -
 * validateConfig refuses to boot in that case anyway.
 */
export const getPublicOrigin = (env: Env = process.env): string => {
  const base = getPublicBaseUrl(env);
  try {
    return new URL(base).origin;
  } catch {
    return base;
  }
};
