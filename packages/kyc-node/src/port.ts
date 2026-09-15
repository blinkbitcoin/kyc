// Where the kyc service listens, when nobody says otherwise. Every service in
// the repo is KYC_PORT_BASE plus a fixed offset (table: scripts/lib/ports.mjs;
// 5000 is everybody's port and 4100 is esign's, hence 5100), so one variable
// moves a whole worktree. This package cannot import that table - it is
// published - so it declares the base and its offset as literals, and
// scripts/lib/ports.test.mjs keeps them on the table.

export const PORT_BASE_DEFAULT = 5100;
// The kyc service's offset (SERVICES.api). Not this host's: a host that
// embeds this package binds its OWN port (the access-token example is
// base + 3), while the hosted page and the mock's webhook callbacks are
// served by the service at base + 0. So PORT is deliberately not read here -
// it would point every minted URL at whichever host happened to mint it.
export const API_OFFSET = 0;

const digits = (value: string | undefined): number | undefined =>
  value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined;

/** The origin the kyc service serves on, derived from `env`. */
export const serviceOrigin = (
  env: Record<string, string | undefined>,
): string =>
  `http://localhost:${(digits(env.KYC_PORT_BASE) ?? PORT_BASE_DEFAULT) + API_OFFSET}`;
