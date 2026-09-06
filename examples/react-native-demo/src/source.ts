// One verification source per KYC_MODE. This is the whole "integration" a
// host app has to write: the component, the callbacks and the screen are
// identical across modes.

import { createProxySource } from '@blinkbitcoin/kyc-react-native';
// Hosted mode imports from the Apollo-free subpath on purpose - it dogfoods
// the minimal entry a hosted-only consumer would install.
import { createHostedSource } from '@blinkbitcoin/kyc-react-native/hosted';
import { createFakeLaunchableSource } from '@blinkbitcoin/kyc-core/testing';
import { createSumsubNativeSource } from '@blinkbitcoin/kyc-sumsub/react-native';
import { Platform } from 'react-native';

import { apolloClient } from './apollo';

import type { ApolloClient } from '@apollo/client';
import type { FakeLaunchController } from '@blinkbitcoin/kyc-core/testing';
import type {
  LaunchableSource,
  VerificationSource,
} from '@blinkbitcoin/kyc-react-native';
import type { KycMode } from './config';

export interface DemoSource {
  source: VerificationSource;
  /** Only fake-native has one: it drives the in-app fake SDK screen. */
  controller: FakeLaunchController | null;
}

export interface BuildSourceOptions {
  /** Injected in tests; the demo's own client otherwise. */
  client?: ApolloClient;
  /** Called with true while a native launch() is in flight, false after. */
  onLaunchingChange?: (launching: boolean) => void;
}

/** The backend's platform enum for the device this bundle runs on. */
export const demoPlatform = (platformOs: string): 'IOS' | 'ANDROID' =>
  platformOs === 'ios' ? 'IOS' : 'ANDROID';

export const buildSource = (
  mode: KycMode,
  options: BuildSourceOptions = {},
): DemoSource => {
  const onLaunchingChange = options.onLaunchingChange ?? (() => {});

  if (mode === 'fake-native') {
    // 'manual' means the fake settles only when the demo's own buttons say
    // so, which is exactly what the fake-native Maestro flows drive.
    const fake = createFakeLaunchableSource({
      outcome: 'manual',
      applicantId: 'demo-applicant',
    });
    const source: LaunchableSource = {
      start: () => fake.start(),
      interpret: message => fake.interpret(message),
      launch: async (session, onEvent) => {
        onLaunchingChange(true);
        try {
          return await fake.launch(session, onEvent);
        } finally {
          onLaunchingChange(false);
        }
      },
    };
    return { source, controller: fake.controller };
  }

  // Every remaining mode gets its session from this repo's backend. Even
  // hosted mode does: a real app asks its own API for the hosted url.
  const proxy = createProxySource({
    client: options.client ?? apolloClient,
    platform: demoPlatform(Platform.OS),
  });

  if (mode === 'proxy') {
    return { source: proxy, controller: null };
  }

  if (mode === 'native') {
    return {
      source: createSumsubNativeSource({
        getAccessToken: async () => {
          const session = await proxy.start();
          if (!session.accessToken) {
            throw new Error('The backend returned no access token');
          }
          return session.accessToken;
        },
      }),
      controller: null,
    };
  }

  return {
    source: createHostedSource({
      getSession: () => proxy.start(),
      refreshToken: previous => proxy.refreshToken(previous),
    }),
    controller: null,
  };
};
