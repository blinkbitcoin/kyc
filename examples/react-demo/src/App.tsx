// Demo host for the @blinkbitcoin/kyc-react web package. The verification
// screen and the hosted/proxy mode switch land with the demo phase; today
// this only proves the app boots and the mode is inlined.
import { KYC_MODE } from './config';

export const App = () => (
  <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
    <h1 data-testid="app-ready">KYC demo</h1>
    <p data-testid="package-name">@blinkbitcoin/kyc-react</p>
    <p data-testid="kyc-mode">{`mode: ${KYC_MODE}`}</p>
  </main>
);
