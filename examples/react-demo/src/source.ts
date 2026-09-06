// One verification source per VITE_KYC_MODE. The component, the callbacks
// and the screen are identical across modes.
import { createHostedSource, createProxySource } from '@blinkbitcoin/kyc-react';

import { apolloClient } from './apollo';

import type { ApolloClient } from '@apollo/client';
import type { VerificationSource } from '@blinkbitcoin/kyc-react';
import type { KycMode } from './config';

export const buildSource = (
  mode: KycMode,
  client: ApolloClient = apolloClient,
): VerificationSource => {
  // Both modes talk to this repo's backend: hosted mode still needs someone
  // to mint the page URL, which is what a real app's own API would do.
  const proxy = createProxySource({ client, platform: 'WEB' });

  if (mode === 'proxy') {
    return proxy;
  }

  return createHostedSource({
    getSession: () => proxy.start(),
    refreshToken: previous => proxy.refreshToken(previous),
  });
};
