/**
 * The three callbacks VerificationScreen wires reach onOutcome. The source
 * is mocked per test file (buildSource is what KYC_MODE selects), so the
 * screen is driven by a scripted fake instead of the backend.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { createFakeLaunchableSource } from '@blinkbitcoin/kyc-core/testing';

import { VerificationScreen } from '../App';

import type { VerificationSource } from '@blinkbitcoin/kyc-react-native';

const mockBuildSource = jest.fn();
jest.mock('../src/source', () => ({
  buildSource: (...args: unknown[]) => mockBuildSource(...args),
}));

const renderWith = async (source: VerificationSource) => {
  mockBuildSource.mockReturnValue({ source, controller: null });
  const onOutcome = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <VerificationScreen onOutcome={onOutcome} />,
    );
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ testID: 'verification-start-button' })
      .props.onPress();
  });
  return onOutcome;
};

test('a declined fake launch completes with its status', async () => {
  const onOutcome = await renderWith(
    createFakeLaunchableSource({ outcome: 'declined' }),
  );
  expect(onOutcome).toHaveBeenCalledWith({
    kind: 'completed',
    result: expect.objectContaining({ status: 'declined' }),
  });
});

test('a source that cannot start reports the error', async () => {
  const onOutcome = await renderWith({
    start: async () => {
      throw Object.assign(new Error('down'), { code: 'PROVIDER_UNAVAILABLE' });
    },
    interpret: () => null,
  });
  expect(onOutcome).toHaveBeenCalledWith({
    kind: 'error',
    error: expect.objectContaining({ code: 'PROVIDER_UNAVAILABLE' }),
  });
});

test('cancelling from the idle screen reports the cancellation', async () => {
  mockBuildSource.mockReturnValue({
    source: createFakeLaunchableSource({ outcome: 'manual' }),
    controller: null,
  });
  const onOutcome = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <VerificationScreen onOutcome={onOutcome} />,
    );
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findByProps({ testID: 'verification-cancel-button' })
      .props.onPress();
  });
  expect(onOutcome).toHaveBeenCalledWith({ kind: 'cancelled' });
});
