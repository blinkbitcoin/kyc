// Test doubles for hosts (demo apps, Maestro/Playwright flows, unit tests).
// Apollo-free and UI-free - a demo renders its own buttons and drives the
// source through `controller`. Never import this from production code.

export { createFakeLaunchableSource } from './verification/fakeSource';
export type {
  FakeLaunchableSource,
  FakeLaunchableSourceOptions,
  FakeLaunchController,
  FakeOutcome,
} from './verification/fakeSource';
