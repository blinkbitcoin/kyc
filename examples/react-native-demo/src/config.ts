// Demo configuration. A real host app would take this from its own
// environment/config system; here the backend is always the local reference
// backend from examples/full-service-demo.

import { Platform } from 'react-native';

// KYC_MODE is inlined at bundle time by babel (see babel.config.js); declare
// the shape we read without pulling in full @types/node.
declare const process: { env: { KYC_MODE?: string; KYC_UI?: string } };

const BACKEND_PORT = 4000;

// The Android emulator reaches the host machine through 10.0.2.2. The E2E
// runner additionally does `adb reverse tcp:4000 tcp:4000`
// (scripts/e2e/android-maestro.sh), which is what makes the *hosted page URL*
// the backend mints (http://localhost:4000/hosted/<id>) load inside the
// WebView. Both routes reach the same backend.
export const getDevBackendHost = (platformOs: string): string =>
  platformOs === 'android' ? '10.0.2.2' : 'localhost';

// Not exported: nothing outside this module needs the bare origin, only the
// derived GRAPHQL_URL - keep it private until something does.
const API_ORIGIN = `http://${getDevBackendHost(Platform.OS)}:${BACKEND_PORT}`;

export const GRAPHQL_URL = `${API_ORIGIN}/graphql`;

export type KycMode = 'native' | 'hosted' | 'proxy' | 'fake-native';

// Verification mode, toggled at bundle time by KYC_MODE:
//   native      → the provider's native SDK runs in-process (needs Sumsub
//                 credentials and the SDK peer; manual sandbox only)
//   hosted      → the backend's hosted page in a hardened WebView
//   proxy       → same page, but the backend orchestrates the whole session
//   fake-native → a scripted LaunchableSource + an in-app fake SDK screen,
//                 so the native-launch branch is testable without a provider
export const resolveKycMode = (mode?: string): KycMode =>
  mode === 'hosted' || mode === 'proxy' || mode === 'fake-native'
    ? mode
    : 'native';
export const KYC_MODE: KycMode = resolveKycMode(process.env.KYC_MODE);

export type KycUi = 'default' | 'themed';

// Look of the built-in screens, toggled at bundle time by KYC_UI:
//   default → the component's own copy and colors
//   themed  → Blink's palette and Spanish copy through the `theme` and
//             `labels` props (src/theme.ts) - the same flow, restyled
export const resolveKycUi = (ui?: string): KycUi =>
  ui === 'themed' ? 'themed' : 'default';
export const KYC_UI: KycUi = resolveKycUi(process.env.KYC_UI);
