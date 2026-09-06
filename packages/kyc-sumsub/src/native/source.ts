// createSumsubNativeSource: the Sumsub Mobile SDK behind kyc-core's
// LaunchableSource. The component never learns the provider's name - it sees
// start() / launch() / interpret() and nothing else.
//
// Token refresh needs no capability here: the SDK asks for a fresh token
// itself through the expiration handler, and that handler IS the host's
// getAccessToken. The SDK object is injectable for tests and for a demo that
// must not link the native module (see __mocks__/).

import { ClientErrorCodes } from '@blinkbitcoin/kyc-core/hosted';

import type {
  LaunchableSource,
  VerificationEvent,
  VerificationResult,
  VerificationSession,
  VerificationSourceError,
} from '@blinkbitcoin/kyc-core/hosted';

import { mapSumsubMobileResult, mapSumsubMobileStatus } from '../mapping';
import { sumsubSession } from '../provider';
import { loadSumsubSdk } from './sdk';

import type { SumsubSdkLike } from './sdk';
import type { SNSMobileSDKResult } from '../types';

export interface SumsubNativeSourceOptions {
  /** Mints a Sumsub access token; also the SDK's own expiration handler. */
  getAccessToken: () => Promise<string>;
  /** BCP-47 tag passed to the SDK; omitted when absent so the SDK decides. */
  locale?: string;
  /** Forwards the SDK's log lines to the console. */
  debug?: boolean;
  /** Injected SDK double; defaults to the lazily required native module. */
  sdk?: SumsubSdkLike;
}

/** The flow never reached a provider verdict (init, build or launch threw). */
export const SUMSUB_LAUNCH_FAILED = 'SUMSUB_LAUNCH_FAILED';

/**
 * Statuses a successful launch reports when the applicant closed the SDK
 * before finishing: no verdict was reached, so the flow is a cancellation
 * and the resolved status is advisory (see core's `LaunchableSource.launch`).
 */
const CANCELLED_STATUSES = new Set(['initial', 'incomplete']);

const sourceError = (
  code: string,
  message?: string,
): VerificationSourceError => ({
  code,
  ...(message ? { message } : {}),
});

const isSourceError = (value: unknown): value is VerificationSourceError =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as VerificationSourceError).code === 'string';

const toSourceError = (
  error: unknown,
  code: string,
): VerificationSourceError =>
  isSourceError(error)
    ? error
    : sourceError(code, error instanceof Error ? error.message : undefined);

export const createSumsubNativeSource = ({
  getAccessToken,
  locale,
  debug = false,
  sdk,
}: SumsubNativeSourceOptions): LaunchableSource => {
  const resolveSdk = (): SumsubSdkLike => {
    const resolved = sdk ?? loadSumsubSdk();
    if (!resolved) {
      throw sourceError(
        ClientErrorCodes.SDK_UNAVAILABLE,
        'The Sumsub mobile SDK is not installed in this build.',
      );
    }
    return resolved;
  };

  // The native SDK owns the screen: a second launch would race the first one
  // over the same UI, so it is refused (parity with kyc-core's fake source).
  let launching = false;

  return {
    async start(): Promise<VerificationSession> {
      // Fail before the UI shows a spinner rather than at launch time.
      resolveSdk();
      return sumsubSession({ accessToken: await getAccessToken() });
    },

    // Native mode renders no page, so there are no raw messages to translate.
    interpret: (): VerificationEvent | null => null,

    async launch(
      session: VerificationSession,
      onEvent: (event: VerificationEvent) => void,
    ): Promise<VerificationResult> {
      if (launching) {
        throw sourceError(
          ClientErrorCodes.SDK_UNAVAILABLE,
          'launch already in progress',
        );
      }
      launching = true;

      try {
        let applicantId: string | undefined;
        let result: SNSMobileSDKResult;

        try {
          // The SDK cannot start without a token, and an empty string only
          // surfaces as an opaque provider error much later.
          if (!session.accessToken) {
            throw sourceError(
              SUMSUB_LAUNCH_FAILED,
              'session carries no access token',
            );
          }

          let builder = resolveSdk()
            .init(session.accessToken, getAccessToken)
            .withHandlers({
              onStatusChanged: ({ newStatus }) => {
                const status = mapSumsubMobileStatus(newStatus);
                if (status) {
                  onEvent({ type: 'statusChanged', status });
                }
              },
              onEvent: ({ eventType, payload }) => {
                if (eventType !== 'ApplicantLoaded') return;
                const loaded = (payload ?? {}).applicantId;
                if (typeof loaded === 'string') {
                  applicantId = loaded;
                  onEvent({ type: 'applicantLoaded', applicantId: loaded });
                }
              },
              onLog: ({ message }) => {
                if (debug) {
                  console.log(`[kyc-sumsub] ${message}`);
                }
              },
            })
            .withDebug(debug);

          if (locale) {
            builder = builder.withLocale(locale);
          }

          result = await builder.build().launch();
        } catch (error) {
          throw toSourceError(error, SUMSUB_LAUNCH_FAILED);
        }

        const event = mapSumsubMobileResult(result);

        // No verdict was reached: the applicant closed the SDK. The contract
        // is a cancel event plus an advisory resolution, never a `complete`.
        if (event.type === 'complete' && CANCELLED_STATUSES.has(event.status)) {
          onEvent({ type: 'cancel' });
          return {
            status: event.status,
            ...(applicantId ? { applicantId } : {}),
          };
        }

        const enriched: VerificationEvent =
          event.type === 'complete' && applicantId
            ? { ...event, applicantId }
            : event;
        onEvent(enriched);

        if (enriched.type !== 'complete') {
          throw sourceError(
            (enriched as { code: string }).code,
            (enriched as { message?: string }).message,
          );
        }

        return {
          status: enriched.status,
          ...(applicantId ? { applicantId } : {}),
        };
      } finally {
        launching = false;
      }
    },
  };
};
