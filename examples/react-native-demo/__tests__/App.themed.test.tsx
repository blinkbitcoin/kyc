/**
 * Separate file, like App.fake-native.test.tsx: KYC_UI is fixed at bundle
 * time by Babel's transform-inline-environment-variables, so the themed
 * branch is forced by mocking ../src/config per test file.
 *
 * @format
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('../src/config', () => ({
  ...jest.requireActual('../src/config'),
  KYC_UI: 'themed',
}));

// Imported after the mock above so the module picks up the mocked KYC_UI.
import { IdentityVerificationScreen } from '../App';
import { BLINK_LABELS, BLINK_THEME } from '../src/theme';

test('the themed UI shows Blink copy and colors on the idle screen', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <IdentityVerificationScreen onOutcome={jest.fn()} />,
    );
  });

  const start = renderer!.root.findByProps({
    testID: 'verification-start-button',
  });
  expect(start.props.accessibilityLabel).toBe(BLINK_LABELS.start);
  expect(
    (StyleSheet.flatten(start.props.style) as { backgroundColor?: string })
      .backgroundColor,
  ).toBe(BLINK_THEME.primaryColor);
});
