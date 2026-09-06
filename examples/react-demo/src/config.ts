// Demo configuration - a real host app would take this from its own
// environment/config system.
export const API_ORIGIN = 'http://localhost:4000';
export const GRAPHQL_URL = `${API_ORIGIN}/graphql`;

export type KycMode = 'hosted' | 'proxy';

// Verification mode, toggled at build time by VITE_KYC_MODE.
// hosted → the backend's hosted page in an origin-pinned iframe (default)
// proxy  → the backend orchestrates session, refresh and status
const MODE = import.meta.env.VITE_KYC_MODE;
export const KYC_MODE: KycMode = MODE === 'proxy' ? 'proxy' : 'hosted';
