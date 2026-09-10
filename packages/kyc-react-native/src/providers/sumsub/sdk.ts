// The slice of @sumsub/react-native-mobilesdk-module this package uses,
// typed as an interface so tests (and the demo) can inject a double - the
// same seam as esign's docusignWebForms.ts. Nothing here imports the peer at
// module scope: hosts that only use the hosted mode must never load it.

import type { SNSMobileSDKResult } from '@blinkbitcoin/kyc-core/sumsub';

export interface SumsubStatusChangedEvent {
  prevStatus: string;
  newStatus: string;
}

export interface SumsubLogEvent {
  message: string;
}

export interface SumsubSdkEvent {
  eventType: string;
  /** Absent for the events that carry no data (the SDK omits the key). */
  payload?: Record<string, unknown>;
}

export interface SumsubHandlers {
  onStatusChanged?: (event: SumsubStatusChangedEvent) => void;
  onLog?: (event: SumsubLogEvent) => void;
  onEvent?: (event: SumsubSdkEvent) => void;
}

export interface SumsubInstanceLike {
  launch(): Promise<SNSMobileSDKResult>;
  /**
   * Present on Android only in practice (iOS has no programmatic dismiss);
   * declared for shape completeness, deliberately unused in v1.
   */
  dismiss(): void;
}

export interface SumsubBuilderLike {
  withHandlers(handlers: SumsubHandlers): SumsubBuilderLike;
  withDebug(debug: boolean): SumsubBuilderLike;
  withLocale(locale: string): SumsubBuilderLike;
  build(): SumsubInstanceLike;
}

export interface SumsubSdkLike {
  init(
    accessToken: string,
    tokenExpirationHandler: () => Promise<string>,
  ): SumsubBuilderLike;
}

/** The optional peer this package wraps (also the Jest moduleNameMapper key). */
export const SUMSUB_NATIVE_MODULE = '@sumsub/react-native-mobilesdk-module';

/**
 * Load the native module lazily. Returns null when the optional peer is not
 * installed, so a host that only ships the hosted mode still bundles - the
 * caller turns the null into SDK_UNAVAILABLE. The specifier is a literal so
 * Metro can resolve it statically for hosts that DO install the peer.
 */
export const loadSumsubSdk = (): SumsubSdkLike | null => {
  try {
    const loaded = require('@sumsub/react-native-mobilesdk-module') as
      | SumsubSdkLike
      | { default?: SumsubSdkLike };
    return (
      (loaded as { default?: SumsubSdkLike }).default ??
      (loaded as SumsubSdkLike)
    );
  } catch {
    return null;
  }
};
