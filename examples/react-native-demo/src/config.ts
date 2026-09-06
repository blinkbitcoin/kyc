// Demo configuration. A real host app would take this from its own
// environment/config system; here the backend is always the local reference
// backend from apps/api.

import { Platform } from 'react-native';

// KYC_MODE is inlined at bundle time by babel (see babel.config.js); declare
// the shape we read without pulling in full @types/node.
declare const process: { env: { KYC_MODE?: string } };

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
const MODE = process.env.KYC_MODE;
export const KYC_MODE: KycMode =
  MODE === 'hosted' || MODE === 'proxy' || MODE === 'fake-native'
    ? MODE
    : 'native';
