// The default UI over useVerification: one screen per state and nothing else.
// Every decision that is not "what does this state look like" lives in the
// hook, the shared machine or frameProps - so a host that wants its own look
// calls useVerification directly and reuses HostedFrame / MountPoint.
//
// Plain DOM and inline styles, exactly like @blinkbitcoin/esign-react: the
// package ships no CSS file, so it cannot collide with a host's stylesheet or
// need a bundler plugin.

import {
  describeFailure,
  describeOutcome,
  getErrorMessage,
  isLaunchable,
  isRestartableError,
} from '@blinkbitcoin/kyc-core';

import { HostedFrame } from './hosted/HostedFrame';
import { isMountable } from './mountable';
import { MountPoint } from './MountPoint';
import { useVerification } from './useVerification';

import type { CSSProperties, FC, ReactElement } from 'react';
import type { VerificationSession } from '@blinkbitcoin/kyc-core';
import type { MountableSource } from './mountable';
import type { VerificationProps } from './types';

export const DEFAULT_LABEL = 'Verify identity';

export const Verification: FC<VerificationProps> = ({
  source,
  onComplete,
  onError,
  onCancel,
  onStatusChange,
  label = DEFAULT_LABEL,
  successDelayMs,
  frameTitle,
  style,
}) => {
  const {
    status,
    permissionReason,
    session,
    result,
    error,
    start,
    retry,
    restart,
    cancel,
    handleMessage,
    handleEvent,
    iframeRef,
  } = useVerification(source, {
    onComplete,
    onError,
    onCancel,
    onStatusChange,
    successDelayMs,
  });

  // The embedding primitive is mounted ONCE and kept mounted across
  // 'verifying' -> 'pending': it is the same element in the same position of
  // the same parent, so React never unmounts it. A remount would reload the
  // hosted page (or re-run the SDK's mount) and drop the provider's in-page
  // state exactly while the user waits for the review - 'submitted' and a
  // non-approved 'complete' can still be followed by more messages: a retry,
  // a token refresh, a final decision. 'pending' only hides and mutes it.
  //
  // A launchable source runs the provider SDK out of process: no page, no
  // iframe, just a placeholder behind the provider's own window.
  const embedding = status === 'verifying' || status === 'pending';
  const showsMount = embedding && isMountable(source);
  const pageUrl = isLaunchable(source) ? undefined : session?.url;
  const showsPage = !showsMount && embedding && pageUrl !== undefined;
  const showsEmbed = showsMount || showsPage;
  const hidden = status === 'pending';

  // Only the 'session' action can enter 'verifying' / 'pending', so a session
  // is present whenever the embed is shown, and `pageUrl` is a string exactly
  // when `showsPage` is true. Both are read through a local rather than an
  // optional chain that could never be false.
  const active = session as VerificationSession;
  const url = pageUrl as string;

  const overlay = ((): ReactElement | null => {
    switch (status) {
      case 'idle':
        return (
          <div style={styles.screen}>
            <h2 style={styles.title}>{label}</h2>
            <p style={styles.subtitle}>
              Have your ID document ready and allow camera access.
            </p>
            <button
              type="button"
              style={styles.button}
              onClick={start}
              data-testid="verification-start-button"
              aria-label={label}
            >
              {label}
            </button>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={cancel}
              data-testid="verification-cancel-button"
              aria-label="Cancel verification"
            >
              Cancel
            </button>
          </div>
        );

      case 'loading':
        return (
          <div style={styles.screen}>
            <div
              style={styles.spinner}
              data-testid="loading-indicator"
              role="progressbar"
              aria-label="Loading, please wait"
            />
            <p style={styles.subtitle}>Preparing verification...</p>
          </div>
        );

      case 'verifying':
      case 'pending':
        if (!showsEmbed) {
          return (
            <div style={styles.screen} data-testid="launch-screen">
              <h2 style={styles.title}>Verification in progress</h2>
              <p style={styles.subtitle}>
                Follow the steps in the verification window.
              </p>
            </div>
          );
        }
        return hidden ? (
          <div style={styles.screen} data-testid="pending-screen">
            <h2 style={styles.title}>Thanks</h2>
            <p style={styles.subtitle} data-testid="pending-message">
              {describeOutcome(result?.status)}
            </p>
          </div>
        ) : (
          // The page owns the screen while it runs, so the only affordance
          // the component adds is a way out of it.
          <div style={styles.actions}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={cancel}
              data-testid="verification-cancel-button"
              aria-label="Cancel verification"
            >
              Cancel
            </button>
          </div>
        );

      case 'success':
        return (
          <div style={styles.screen} data-testid="success-screen">
            <p style={styles.successText} aria-label="Verification complete">
              {describeOutcome('approved')}
            </p>
          </div>
        );

      case 'permissionDenied':
        // There is no 'blocked' arm on the web: the browser only reports that
        // the user refused, and there is no settings intent to fire, so this
        // screen always offers Try again. `permissionReason` is surfaced as a
        // data attribute so a host reading the DOM sees the same value the
        // hook exposes.
        return (
          <div
            style={styles.screen}
            data-testid="permission-screen"
            data-permission-reason={permissionReason}
          >
            <h2 style={styles.title}>Camera access needed</h2>
            <p style={styles.subtitle}>
              {getErrorMessage('PERMISSION_DENIED')}
            </p>
            <p style={styles.hint}>
              Allow camera access for this site in your browser, then try again.
            </p>
            <button
              type="button"
              style={styles.button}
              onClick={retry}
              data-testid="retry-button"
              aria-label="Try again"
            >
              Try again
            </button>
          </div>
        );

      case 'offline':
        return (
          <div style={styles.screen} data-testid="offline-screen">
            <h2 style={styles.title}>No connection</h2>
            <p style={styles.subtitle}>
              A connection is required to verify your identity.
            </p>
            <button
              type="button"
              style={styles.button}
              onClick={retry}
              data-testid="check-connection-button"
              aria-label="Check connection"
            >
              Check connection
            </button>
          </div>
        );

      case 'error': {
        const failure = describeFailure(error);
        const restartable = isRestartableError(failure.code);
        return (
          <div style={styles.screen} data-testid="error-screen">
            <h2 style={styles.errorTitle}>Verification failed</h2>
            <p style={styles.subtitle} data-testid="error-message">
              {failure.message}
            </p>
            <button
              type="button"
              style={styles.button}
              onClick={restartable ? restart : retry}
              data-testid={restartable ? 'restart-button' : 'retry-button'}
              aria-label={restartable ? 'Restart verification' : 'Try again'}
            >
              {restartable ? 'Restart' : 'Try again'}
            </button>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={cancel}
              data-testid="verification-cancel-button"
              aria-label="Cancel verification"
            >
              Cancel
            </button>
          </div>
        );
      }
    }
  })();

  return (
    <div style={{ ...styles.root, ...style }}>
      {showsEmbed ? (
        // `hidden` + `inert` + `aria-hidden` take the wrapper out of the
        // accessibility tree, out of hit-testing and out of the tab order.
        // The style deliberately re-asserts `display: block`, because the UA
        // stylesheet's `[hidden] { display: none }` would take the frame out
        // of layout, and a display:none iframe is allowed to drop its
        // rendering. Zero size plus `visibility: hidden` hides it while the
        // document - and therefore the bridge - stays alive.
        <div
          style={hidden ? styles.hiddenEmbed : styles.embed}
          hidden={hidden}
          // A non-empty string, because no single value renders on both
          // supported React majors otherwise: React 18 does not know `inert`
          // and drops `inert={true}` as "a non-boolean attribute given
          // `true`", while React 19 rejects `inert=""` as "an empty string for
          // a boolean attribute ... treated as false". A truthy string is
          // passed straight through by 18 (`inert="true"`) and normalized by
          // 19 (`inert=""`); the HTML attribute is present either way, which
          // is all the DOM looks at. The cast is only needed because
          // @types/react types the prop the way React 19 accepts it.
          inert={(hidden ? 'true' : undefined) as unknown as boolean}
          aria-hidden={hidden}
        >
          {showsMount ? (
            <MountPoint
              source={source as MountableSource}
              session={active}
              onEvent={handleEvent}
            />
          ) : (
            <HostedFrame
              url={url}
              allowedOrigin={active.allowedOrigin}
              onMessage={handleMessage}
              onEvent={handleEvent}
              frameRef={iframeRef}
              title={frameTitle}
            />
          )}
        </div>
      ) : null}
      {overlay}
    </div>
  );
};

// Inline styles mirroring the RN component's StyleSheet (WCAG AA colors).
const styles: Record<string, CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', width: '100%' },
  embed: { display: 'block', width: '100%', flex: 1 },
  // Keeps the page's bridge alive under the pending overlay without showing
  // the (already-submitted) hosted page. See the note at the call site for
  // why `display` is set explicitly.
  hiddenEmbed: {
    display: 'block',
    width: 0,
    height: 0,
    overflow: 'hidden',
    visibility: 'hidden',
  },
  actions: { display: 'flex', justifyContent: 'center', padding: '12px 0' },
  screen: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    fontFamily: 'system-ui, sans-serif',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    margin: '0 0 10px',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    margin: '0 0 20px',
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    color: '#888',
    margin: '0 0 20px',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    padding: '12px 30px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    marginBottom: 10,
  },
  secondaryButton: {
    background: 'none',
    color: '#007AFF',
    fontSize: 16,
    padding: '12px 30px',
    border: 'none',
    cursor: 'pointer',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '4px solid #ddd',
    borderTopColor: '#007AFF',
    borderRadius: '50%',
    marginBottom: 10,
  },
  successText: {
    fontSize: 20,
    color: '#1E7E34',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 20,
    color: '#C82333',
    fontWeight: 'bold',
    margin: '0 0 10px',
  },
};
