// Demo host for the @blinkbitcoin/kyc-react web package. Bootstrap: proves
// the workspace wiring; the verification flow lands with the web phase.
import { describePackage } from '@blinkbitcoin/kyc-react';

import { KYC_MODE } from './config';

export const App = () => (
  <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
    <h1 data-testid="app-ready">KYC demo</h1>
    <p data-testid="package-name">{describePackage()}</p>
    <p data-testid="kyc-mode">{`mode: ${KYC_MODE}`}</p>
  </main>
);
