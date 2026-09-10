/**
 * Separate file (not a describe block in App.test.tsx) because it needs a
 * whole-module mock of ../src/config to force the fake-native branch -
 * KYC_MODE is normally fixed at bundle time by Babel's
 * transform-inline-environment-variables, so exercising every branch means
 * mocking it per test file rather than per test.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('../src/config', () => ({
  ...jest.requireActual('../src/config'),
  KYC_MODE: 'fake-native',
}));

// Imported after the mock above so the module picks up the mocked KYC_MODE.
import { IdentityVerificationScreen } from '../App';

test('fake-sdk-screen mounts for the duration of a native launch', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <IdentityVerificationScreen onOutcome={jest.fn()} />,
    );
  });

  expect(
    renderer!.root.findAllByProps({ testID: 'fake-sdk-screen' }),
  ).toHaveLength(0);

  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'verification-start-button' })
      .props.onPress();
  });

  // createFakeLaunchableSource({ outcome: 'manual' }) leaves launch() pending
  // until the overlay's own buttons settle it - exactly the window the
  // overlay exists to cover.
  expect(
    renderer!.root.findByProps({ testID: 'fake-sdk-screen' }),
  ).toBeTruthy();
});
