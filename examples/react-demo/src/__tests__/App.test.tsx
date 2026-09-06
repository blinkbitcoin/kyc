import { render, screen } from '@testing-library/react';
import { App } from '../App';

describe('demo App', () => {
  it('renders the ready heading and the package description', () => {
    render(<App />);
    expect(screen.getByTestId('app-ready').textContent).toBe('KYC demo');
    expect(screen.getByTestId('package-name').textContent).toBe(
      '@blinkbitcoin/kyc-react',
    );
    expect(screen.getByTestId('kyc-mode').textContent).toBe('mode: hosted');
  });
});
