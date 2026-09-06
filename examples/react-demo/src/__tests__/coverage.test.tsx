// Supplementary to config.test.ts / source.test.ts / App.test.tsx (the exact
// files the demo brief specifies): those drive the idle screen and the
// source factory, but never invoke the outcome callbacks that only fire once
// the library's state machine reaches a terminal state, nor the Apollo auth
// callback that only runs once a request is actually made. Both are simple,
// pure pieces of this demo's own wiring - covered directly here to clear the
// vite.config.ts coverage floors without complicating the brief's own tests.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getAuthToken } from '../apollo';
import { VerificationScreen } from '../App';

describe('getAuthToken', () => {
  it('returns the demo passthrough token', () => {
    expect(getAuthToken()).toBe('demo-user');
  });
});

describe('VerificationScreen', () => {
  it('reports a cancellation from the idle screen', () => {
    const onOutcome = vi.fn();
    render(<VerificationScreen onOutcome={onOutcome} />);

    screen.getByTestId('verification-cancel-button').click();

    expect(onOutcome).toHaveBeenCalledWith({ kind: 'cancelled' });
  });
});
