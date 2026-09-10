// Ports of the web E2E stack (backend + Vite demo per mode), from the
// environment. Every service in this repo runs on a custom port so repos
// and worktrees never clash: set the three variables per worktree (direnv,
// a shell export) and the whole stack moves.
//
//   KYC_API_PORT        the reference backend         default 5100
//   KYC_WEB_PORT        the web demo, hosted mode     default 5101
//   KYC_WEB_PROXY_PORT  the web demo, proxy mode      default 5102
//
// Runs under Node (Playwright config) but is typechecked with the demo's
// browser tsconfig, so no node imports.

declare const process: { env: Record<string, string | undefined> };

export const MODES = ['hosted', 'proxy'] as const;
export type Mode = (typeof MODES)[number];

export interface E2EPorts {
  api: number;
  web: Record<Mode, number>;
}

export const DEFAULT_PORTS: E2EPorts = {
  api: 5100,
  web: { hosted: 5101, proxy: 5102 },
};

// A port from one variable: unset or empty means the default; anything
// else must be a real port number, so a typo fails here and not as a
// server that never comes up
export const portFrom = (
  name: string,
  value: string | undefined,
  fallback: number,
): number => {
  if (value === undefined || value === '') {
    return fallback;
  }
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(
      `${name} must be a port number (1-65535), got ${JSON.stringify(value)}`,
    );
  }
  return Number(value);
};

export const portsFrom = (
  env: Record<string, string | undefined>,
): E2EPorts => ({
  api: portFrom('KYC_API_PORT', env.KYC_API_PORT, DEFAULT_PORTS.api),
  web: {
    hosted: portFrom(
      'KYC_WEB_PORT',
      env.KYC_WEB_PORT,
      DEFAULT_PORTS.web.hosted,
    ),
    proxy: portFrom(
      'KYC_WEB_PROXY_PORT',
      env.KYC_WEB_PROXY_PORT,
      DEFAULT_PORTS.web.proxy,
    ),
  },
});

export const PORTS = portsFrom(process.env);
export const API_ORIGIN = `http://localhost:${PORTS.api}`;
const webOrigin = (mode: Mode): string => `http://localhost:${PORTS.web[mode]}`;

// What CI changes about running the servers. In CI, a listener already on
// a port is a foreign leftover from a previous job, never this suite's own
// server - it must never be adopted, so CI always starts its own and fails
// if the port is taken; locally, reusing a dev server already running on
// these ports is the whole point. Retries: once in CI only, so a flaky
// runner doesn't fail the suite while a real failure still fails fast
// locally instead of being masked by a retry.
export const ciPolicy = (env: Record<string, string | undefined>) => ({
  reuseExistingServer: !env.CI,
  retries: env.CI ? 1 : 0,
});
const { reuseExistingServer, retries } = ciPolicy(process.env);
export { retries };

// Playwright webServer entries. The backend gets its port, the public base
// URL it mints hosted-page URLs from (the iframe must point at THIS
// backend, whatever .env.test says) and the demo origins it must allow
// (CORS); the demo gets the backend origin.
export const backendServer = () => ({
  command: [
    `PORT=${PORTS.api}`,
    `PUBLIC_BASE_URL=${API_ORIGIN}`,
    `CORS_ALLOWED_ORIGINS=${MODES.map(webOrigin).join(',')}`,
    'KYC_PROVIDER=mock npx dotenv-cli -e examples/full-service-demo/.env.test -- npm run dev -w examples/full-service-demo',
  ].join(' '),
  cwd: '../..',
  url: `${API_ORIGIN}/health`,
  reuseExistingServer,
  timeout: 30_000,
});

// Production build + preview (what CI's Web job verifies: the demo bundled
// against the packages' dist)
export const vitePreviewServer = (mode: Mode) => ({
  command: `VITE_API_ORIGIN=${API_ORIGIN} VITE_KYC_MODE=${mode} npm run build -- --outDir dist/${mode} && npm run preview -- --outDir dist/${mode} --port ${PORTS.web[mode]} --strictPort`,
  url: webOrigin(mode),
  reuseExistingServer,
  timeout: 30_000,
});

export const baseURL = (mode: Mode): string => webOrigin(mode);
