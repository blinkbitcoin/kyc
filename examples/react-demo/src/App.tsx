// Demo host for the @blinkbitcoin/kyc-react web package. Mirrors the React
// Native demo: mode-driven source + result reporting around the library
// component; VITE_KYC_UI=themed shows the same flow under a host's own
// palette and copy (src/theme.ts). The toolbar and the outcome line exist for the Playwright
// suite - a product screen would not need them.
import { ApolloProvider } from '@apollo/client/react';
import { Verification } from '@blinkbitcoin/kyc-react';
import { useState } from 'react';

import { apolloClient } from './apollo';
import { KYC_MODE, KYC_UI } from './config';
import { buildSource } from './source';
import { uiProps } from './theme';

import type {
  VerificationError,
  VerificationResult,
} from '@blinkbitcoin/kyc-react';

export type Outcome =
  | { kind: 'completed'; result: VerificationResult }
  | { kind: 'error'; error: VerificationError }
  | { kind: 'cancelled' }
  | null;

export const outcomeText = (outcome: Outcome): string => {
  switch (outcome?.kind) {
    case 'completed':
      return `completed: ${outcome.result.status}`;
    case 'error':
      return `error: ${outcome.error.code}`;
    case 'cancelled':
      return 'cancelled';
    default:
      return 'no outcome yet';
  }
};

// The flow itself. Remounted by "Start over" (key change), so the source is
// built once per mount with a lazy useState initialiser - never per render.
export const VerificationScreen = ({
  onOutcome,
}: {
  onOutcome: (outcome: Outcome) => void;
}) => {
  const [source] = useState(() => buildSource(KYC_MODE));

  return (
    <Verification
      source={source}
      onComplete={result => onOutcome({ kind: 'completed', result })}
      onError={error => onOutcome({ kind: 'error', error })}
      onCancel={() => onOutcome({ kind: 'cancelled' })}
      successDelayMs={4000}
      {...uiProps(KYC_UI)}
    />
  );
};

export const App = () => {
  const [sessionKey, setSessionKey] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>(null);

  return (
    <ApolloProvider client={apolloClient}>
      <main
        style={{
          fontFamily: 'system-ui, sans-serif',
          margin: '40px auto',
          maxWidth: 640,
        }}
      >
        <header
          style={{
            alignItems: 'center',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span
            data-testid="mode-label"
            style={{ color: '#666', fontSize: 13 }}
          >
            {`mode: ${KYC_MODE}`}
          </span>
          <button
            data-testid="reset-button"
            onClick={() => {
              setOutcome(null);
              setSessionKey(key => key + 1);
            }}
            type="button"
          >
            Start over
          </button>
        </header>
        <VerificationScreen key={sessionKey} onOutcome={setOutcome} />
        <p data-testid="outcome" role="status">
          {outcomeText(outcome)}
        </p>
      </main>
    </ApolloProvider>
  );
};
