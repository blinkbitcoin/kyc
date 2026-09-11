// The service's port: PORT, else KYC_PORT_BASE plus this service's offset
// (every service in the repo is base + offset, table in scripts/lib/ports.mjs;
// 5000 is everybody's port and 4100 is esign's, hence 5100). The origin
// derived from it is what PUBLIC_BASE_URL defaults to in insecure dev.

export const PORT_BASE_DEFAULT = 5100;
export const PORT_OFFSET = 0;

const digits = (value: string | undefined): number | undefined =>
  value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined;

export const resolvePort = (env: NodeJS.ProcessEnv = process.env): number =>
  digits(env.PORT) ?? (digits(env.KYC_PORT_BASE) ?? PORT_BASE_DEFAULT) + PORT_OFFSET;

export const localOrigin = (env: NodeJS.ProcessEnv = process.env): string =>
  `http://localhost:${resolvePort(env)}`;
