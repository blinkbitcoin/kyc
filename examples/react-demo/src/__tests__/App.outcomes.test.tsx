// The callbacks IdentityVerificationScreen wires reach onOutcome. The source is
// mocked (buildSource is what VITE_KYC_MODE selects), so the screen is
// driven by a scripted source instead of the backend.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IdentityVerificationScreen } from '../App';

import type {
  LaunchableSource,
  VerificationSource,
} from '@blinkbitcoin/kyc-react';

const { mockBuildSource } = vi.hoisted(() => ({ mockBuildSource: vi.fn() }));
vi.mock('../source', () => ({
  buildSource: (...args: unknown[]) => mockBuildSource(...args),
}));

const session = {
  provider: 'fake',
  sessionId: 'sess-1',
  allowedOrigin: 'https://kyc.example.com',
};

const renderAndStart = async (source: VerificationSource) => {
  mockBuildSource.mockReturnValue(source);
  const onOutcome = vi.fn();
  render(<IdentityVerificationScreen onOutcome={onOutcome} />);
  await act(async () => {
    fireEvent.click(screen.getByTestId('verification-start-button'));
  });
  return onOutcome;
};

describe('IdentityVerificationScreen outcomes', () => {
  it('a declined launch completes with its status', async () => {
    const launchable: LaunchableSource = {
      start: async () => session,
      interpret: () => null,
      launch: async () => ({ status: 'declined' }),
    };
    const onOutcome = await renderAndStart(launchable);
    await waitFor(() => {
      expect(onOutcome).toHaveBeenCalledWith({
        kind: 'completed',
        result: expect.objectContaining({ status: 'declined' }),
      });
    });
  });

  it('a source that cannot start reports the error', async () => {
    const onOutcome = await renderAndStart({
      start: async () => {
        throw Object.assign(new Error('down'), {
          code: 'PROVIDER_UNAVAILABLE',
        });
      },
      interpret: () => null,
    });
    await waitFor(() => {
      expect(onOutcome).toHaveBeenCalledWith({
        kind: 'error',
        error: expect.objectContaining({ code: 'PROVIDER_UNAVAILABLE' }),
      });
    });
  });
});
