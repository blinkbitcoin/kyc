// Demo configuration - a real host app would take this from its own
// environment/config system. VITE_API_ORIGIN is how the demo finds a backend
// on a custom port (the E2E stack sets it from KYC_API_PORT, e2e/ports.ts).
export const resolveApiOrigin = (origin?: string): string =>
  origin !== undefined && origin !== '' ? origin : 'http://localhost:5100';
export const API_ORIGIN = resolveApiOrigin(import.meta.env.VITE_API_ORIGIN);
export const GRAPHQL_URL = `${API_ORIGIN}/graphql`;

export type KycMode = 'hosted' | 'proxy';

// Verification mode, toggled at build time by VITE_KYC_MODE.
// hosted → the backend's hosted page in an origin-pinned iframe (default)
// proxy  → the backend orchestrates session, refresh and status
export const resolveKycMode = (mode?: string): KycMode =>
  mode === 'proxy' ? 'proxy' : 'hosted';
export const KYC_MODE: KycMode = resolveKycMode(import.meta.env.VITE_KYC_MODE);

export type KycUi = 'default' | 'themed';

// Look of the built-in screens, toggled at build time by VITE_KYC_UI:
//   default → the component's own copy and colors
//   themed  → Blink's palette and Spanish copy through the `theme` and
//             `labels` props (src/theme.ts) - the same flow, restyled
export const resolveKycUi = (ui?: string): KycUi =>
  ui === 'themed' ? 'themed' : 'default';
export const KYC_UI: KycUi = resolveKycUi(import.meta.env.VITE_KYC_UI);
