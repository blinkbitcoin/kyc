// The default UI over useVerification: one screen per state and nothing else.
// Every decision that is not "what does this state look like" lives in the
// hook, the shared machine or frameProps - so a host that wants its own look
// calls useVerification directly and reuses HostedFrame / MountPoint. A host
// that only wants its own colors and copy recolors (`theme`), restyles
// (`styles`) and relabels (`labels`) this one; nothing it renders is
// hard-coded here.
//
// Plain DOM and inline styles: the package ships no CSS file, so it cannot
// collide with a host's stylesheet or need a bundler plugin.

import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  describeFailure,
  failureLabel,
  isLaunchable,
  isRestartableError,
  outcomeLabel,
} from '@blinkbitcoin/kyc-core/hosted';

import { HostedFrame } from './hosted/HostedFrame';
import { isMountable } from './mountable';
import { MountPoint } from './MountPoint';
import { resolveLabels, resolveStyles } from './theme';
import { useVerification } from './useVerification';

import type { FC, ReactElement } from 'react';
import type { VerificationSession } from '@blinkbitcoin/kyc-core/hosted';
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
  theme,
  styles,
  labels,
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
  const s = useMemo(() => resolveStyles(theme, styles), [theme, styles]);
  const t = useMemo(() => resolveLabels(label, labels), [label, labels]);

  // `inert` is set on the DOM node, not as a prop: no single prop value
  // renders warning-free on both supported React majors (18 does not know
  // the attribute and drops `inert={true}`; 19 warns on the string form).
  // toggleAttribute is what the HTML attribute is anyway.
  const embedRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    embedRef.current?.toggleAttribute('inert', hidden);
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
          <div style={s.screen}>
            <h2 style={s.title}>{t.title}</h2>
            <p style={s.subtitle}>{t.subtitle}</p>
            <button
              type="button"
              style={s.button}
              onClick={start}
              data-testid="verification-start-button"
              aria-label={t.start}
            >
              {t.start}
            </button>
            <button
              type="button"
              style={s.secondaryButton}
              onClick={cancel}
              data-testid="verification-cancel-button"
              aria-label={t.cancel}
            >
              {t.cancel}
            </button>
          </div>
        );

      case 'loading':
        return (
          <div style={s.screen}>
            <div
              style={s.spinner}
              data-testid="loading-indicator"
              role="progressbar"
              aria-label={t.loading}
            />
            <p style={s.subtitle}>{t.loading}</p>
          </div>
        );

      case 'verifying':
      case 'pending':
        if (!showsEmbed) {
          return (
            <div style={s.screen} data-testid="launch-screen">
              <h2 style={s.title}>{t.inProgressTitle}</h2>
              <p style={s.subtitle}>{t.inProgressSubtitle}</p>
            </div>
          );
        }
        return hidden ? (
          <div style={s.screen} data-testid="pending-screen">
            <h2 style={s.title}>{t.pendingTitle}</h2>
            <p style={s.subtitle} data-testid="pending-message">
              {outcomeLabel(t, result?.status)}
            </p>
          </div>
        ) : (
          // The page owns the screen while it runs, so the only affordance
          // the component adds is a way out of it.
          <div style={s.actions}>
            <button
              type="button"
              style={s.secondaryButton}
              onClick={cancel}
              data-testid="verification-cancel-button"
              aria-label={t.cancel}
            >
              {t.cancel}
            </button>
          </div>
        );

      case 'success':
        return (
          <div style={s.screen} data-testid="success-screen">
            <p style={s.successText} aria-label={t.outcomeApproved}>
              {t.outcomeApproved}
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
            style={s.screen}
            data-testid="permission-screen"
            data-permission-reason={permissionReason}
          >
            <h2 style={s.title}>{t.permissionTitle}</h2>
            <p style={s.subtitle}>{t.permissionMessage}</p>
            <p style={s.hint}>{t.permissionHint}</p>
            <button
              type="button"
              style={s.button}
              onClick={retry}
              data-testid="retry-button"
              aria-label={t.retry}
            >
              {t.retry}
            </button>
          </div>
        );

      case 'offline':
        return (
          <div style={s.screen} data-testid="offline-screen">
            <h2 style={s.title}>{t.offlineTitle}</h2>
            <p style={s.subtitle}>{t.offlineMessage}</p>
            <button
              type="button"
              style={s.button}
              onClick={retry}
              data-testid="check-connection-button"
              aria-label={t.checkConnection}
            >
              {t.checkConnection}
            </button>
          </div>
        );

      case 'error': {
        const failure = describeFailure(error);
        const restartable = isRestartableError(failure.code);
        const action = restartable ? t.restart : t.retry;
        return (
          <div style={s.screen} data-testid="error-screen">
            <h2 style={s.errorTitle}>{t.errorTitle}</h2>
            <p style={s.subtitle} data-testid="error-message">
              {failureLabel(t, failure)}
            </p>
            <button
              type="button"
              style={s.button}
              onClick={restartable ? restart : retry}
              data-testid={restartable ? 'restart-button' : 'retry-button'}
              aria-label={action}
            >
              {action}
            </button>
            <button
              type="button"
              style={s.secondaryButton}
              onClick={cancel}
              data-testid="verification-cancel-button"
              aria-label={t.cancel}
            >
              {t.cancel}
            </button>
          </div>
        );
      }
    }
  })();

  return (
    <div style={{ ...s.root, ...style }}>
      {showsEmbed ? (
        // `hidden` + `inert` + `aria-hidden` take the wrapper out of the
        // accessibility tree, out of hit-testing and out of the tab order.
        // The style deliberately re-asserts `display: block`, because the UA
        // stylesheet's `[hidden] { display: none }` would take the frame out
        // of layout, and a display:none iframe is allowed to drop its
        // rendering. Zero size plus `visibility: hidden` hides it while the
        // document - and therefore the bridge - stays alive.
        <div
          style={hidden ? s.hiddenEmbed : s.embed}
          hidden={hidden}
          ref={embedRef}
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
