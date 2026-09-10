// A fake @sumsub/react-native-mobilesdk-module: records the builder chain,
// lets a test drive the handlers, and resolves (or rejects) launch() on
// demand. Used by this package's tests and mapped into the React Native
// demo's Jest via moduleNameMapper, so the demo never loads the real native
// module. Shipped as a test double (`files` in package.json lists __mocks__)
// so a consumer can point its own Jest at this file - see the README.

import type {
  SumsubBuilderLike,
  SumsubHandlers,
  SumsubInstanceLike,
  SumsubSdkLike,
} from '../../src/providers/sumsub/sdk';
import type { SNSMobileSDKResult } from '@blinkbitcoin/kyc-core/sumsub';

export interface SumsubMockState {
  accessToken?: string;
  tokenExpirationHandler?: () => Promise<string>;
  handlers: SumsubHandlers;
  debug?: boolean;
  locale?: string;
  built: number;
  launched: number;
  dismissed: number;
  result: SNSMobileSDKResult;
  launchError?: unknown;
}

const initialState = (): SumsubMockState => ({
  accessToken: undefined,
  tokenExpirationHandler: undefined,
  handlers: {},
  debug: undefined,
  locale: undefined,
  built: 0,
  launched: 0,
  dismissed: 0,
  result: { success: true, status: 'Approved' },
  launchError: undefined,
});

export const sumsubMockState: SumsubMockState = initialState();

export const resetSumsubMock = (): void => {
  Object.assign(sumsubMockState, initialState());
};

/** What the next launch() resolves with. */
export const setSumsubMockResult = (result: SNSMobileSDKResult): void => {
  sumsubMockState.result = result;
};

/** Make the next launch() reject instead of resolving. */
export const setSumsubMockLaunchError = (error: unknown): void => {
  sumsubMockState.launchError = error;
};

export const emitSumsubStatus = (
  prevStatus: string,
  newStatus: string,
): void => {
  sumsubMockState.handlers.onStatusChanged?.({ prevStatus, newStatus });
};

/** Omit `payload` to reproduce the SDK events that carry no data. */
export const emitSumsubEvent = (
  eventType: string,
  payload?: Record<string, unknown>,
): void => {
  sumsubMockState.handlers.onEvent?.({ eventType, payload });
};

export const emitSumsubLog = (message: string): void => {
  sumsubMockState.handlers.onLog?.({ message });
};

const instance: SumsubInstanceLike = {
  launch: async () => {
    sumsubMockState.launched += 1;
    if (sumsubMockState.launchError !== undefined) {
      throw sumsubMockState.launchError;
    }
    return sumsubMockState.result;
  },
  dismiss: () => {
    sumsubMockState.dismissed += 1;
  },
};

const builder: SumsubBuilderLike = {
  withHandlers: handlers => {
    sumsubMockState.handlers = handlers;
    return builder;
  },
  withDebug: debug => {
    sumsubMockState.debug = debug;
    return builder;
  },
  withLocale: locale => {
    sumsubMockState.locale = locale;
    return builder;
  },
  build: () => {
    sumsubMockState.built += 1;
    return instance;
  },
};

const SNSMobileSDK: SumsubSdkLike = {
  init: (accessToken, tokenExpirationHandler) => {
    sumsubMockState.accessToken = accessToken;
    sumsubMockState.tokenExpirationHandler = tokenExpirationHandler;
    return builder;
  },
};

export default SNSMobileSDK;
