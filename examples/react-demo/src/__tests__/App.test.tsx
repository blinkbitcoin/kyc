import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getAuthToken } from '../apollo';
import { App, outcomeText, VerificationScreen } from '../App';

describe('demo App', () => {
  it('boots to the idle verification screen with the mode label', () => {
    render(<App />);

    expect(screen.getByTestId('mode-label').textContent).toBe('mode: hosted');
    expect(screen.getByTestId('verification-start-button')).toBeTruthy();
    expect(screen.getByTestId('outcome').textContent).toBe('no outcome yet');
  });

  it('"Start over" remounts the verification component', async () => {
    render(<App />);

    const before = screen.getByTestId('verification-start-button');
    // fireEvent is act-wrapped, so the click's state updates are flushed
    // before it returns - but React can still commit the remount on a
    // microtask, so the element-identity assertion is awaited via waitFor
    // rather than read back synchronously.
    fireEvent.click(screen.getByTestId('reset-button'));

    await waitFor(() => {
      expect(screen.getByTestId('verification-start-button')).not.toBe(before);
    });
    expect(screen.getByTestId('outcome').textContent).toBe('no outcome yet');
  });
});

describe('outcomeText', () => {
  it('reports every terminal outcome the component can produce', () => {
    expect(
      outcomeText({ kind: 'completed', result: { status: 'approved' } }),
    ).toBe('completed: approved');
    expect(
      outcomeText({ kind: 'completed', result: { status: 'declined' } }),
    ).toBe('completed: declined');
    expect(
      outcomeText({
        kind: 'error',
        error: { code: 'MOCK_ERROR', message: 'x' },
      }),
    ).toBe('error: MOCK_ERROR');
    expect(outcomeText({ kind: 'cancelled' })).toBe('cancelled');
    expect(outcomeText(null)).toBe('no outcome yet');
  });
});

describe('proxy mode', () => {
  it('labels itself and still renders the same idle screen', async () => {
    vi.resetModules();
    vi.doMock('../config', () => ({
      API_ORIGIN: 'http://localhost:5100',
      GRAPHQL_URL: 'http://localhost:5100/graphql',
      KYC_MODE: 'proxy',
      KYC_UI: 'default',
    }));

    const { App: ProxyApp } = await import('../App');
    render(<ProxyApp />);

    expect(screen.getByTestId('mode-label').textContent).toBe('mode: proxy');
    expect(screen.getByTestId('verification-start-button')).toBeTruthy();

    vi.doUnmock('../config');
    vi.resetModules();
  });
});

describe('getAuthToken', () => {
  it('returns the demo passthrough token', () => {
    expect(getAuthToken()).toBe('demo-user');
  });
});

describe('VerificationScreen', () => {
  it('reports a cancellation from the idle screen', () => {
    const onOutcome = vi.fn();
    render(<VerificationScreen onOutcome={onOutcome} />);

    fireEvent.click(screen.getByTestId('verification-cancel-button'));

    expect(onOutcome).toHaveBeenCalledWith({ kind: 'cancelled' });
  });
});
