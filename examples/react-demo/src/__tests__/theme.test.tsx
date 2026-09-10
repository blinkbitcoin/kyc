import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BLINK_LABELS, BLINK_THEME, uiProps } from '../theme';

describe('uiProps', () => {
  it('hands the component nothing for the default look', () => {
    expect(uiProps('default')).toEqual({});
  });

  it('hands it the Blink palette and the Spanish copy when themed', () => {
    expect(uiProps('themed')).toEqual({
      theme: BLINK_THEME,
      labels: BLINK_LABELS,
    });
  });
});

describe('themed UI', () => {
  it('shows Blink copy and colors on the idle screen', async () => {
    vi.resetModules();
    vi.doMock('../config', () => ({
      API_ORIGIN: 'http://localhost:5100',
      GRAPHQL_URL: 'http://localhost:5100/graphql',
      KYC_MODE: 'hosted',
      KYC_UI: 'themed',
    }));

    const { VerificationScreen } = await import('../App');
    render(<VerificationScreen onOutcome={vi.fn()} />);

    const start = screen.getByTestId('verification-start-button');
    expect(start.textContent).toBe(BLINK_LABELS.start);
    expect(start.style.backgroundColor).toBe('rgb(247, 147, 26)');

    vi.doUnmock('../config');
    vi.resetModules();
  });
});
