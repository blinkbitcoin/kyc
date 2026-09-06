import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App, outcomeText } from '../App';

describe('demo App', () => {
  it('boots to the idle verification screen with the mode label', () => {
    render(<App />);

    expect(screen.getByTestId('mode-label').textContent).toBe('mode: hosted');
    expect(screen.getByTestId('verification-start-button')).toBeTruthy();
    expect(screen.getByTestId('outcome').textContent).toBe('no outcome yet');
  });

  it('"Start over" remounts the verification component', () => {
    render(<App />);

    const before = screen.getByTestId('verification-start-button');
    screen.getByTestId('reset-button').click();
    const after = screen.getByTestId('verification-start-button');

    expect(after).not.toBe(before);
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
      API_ORIGIN: 'http://localhost:4000',
      GRAPHQL_URL: 'http://localhost:4000/graphql',
      KYC_MODE: 'proxy',
    }));

    const { App: ProxyApp } = await import('../App');
    render(<ProxyApp />);

    expect(screen.getByTestId('mode-label').textContent).toBe('mode: proxy');
    expect(screen.getByTestId('verification-start-button')).toBeTruthy();

    vi.doUnmock('../config');
    vi.resetModules();
  });
});
