// The default UI over useVerification: one screen per state and nothing
// else. Every decision that is not "what does this state look like" lives in
// the hook, the machine or webViewProps - so a host that wants its own look
// calls useVerification directly and reuses HostedWebView. A host that only
// wants its own colors and copy recolors (`theme`), restyles (`styles`) and
// relabels (`labels`) this one; nothing it renders is hard-coded here.

import React, { useMemo } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import {
  describeFailure,
  failureLabel,
  isLaunchable,
  isRestartableError,
  outcomeLabel,
} from '@blinkbitcoin/kyc-core/hosted';

import { HostedWebView } from './hosted/HostedWebView';
import { resolveLabels, resolveStyles } from './theme';
import { useVerification } from './useVerification';

import type { VerificationProps } from './types';

export const DEFAULT_LABEL = 'Verify identity';

export const Verification: React.FC<VerificationProps> = ({
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
  checkPermissions,
  onOpenSettings,
  allowedNavigationOrigins,
  renderLoading,
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
    webViewRef,
  } = useVerification(source, {
    onComplete,
    onError,
    onCancel,
    onStatusChange,
    checkPermissions,
    successDelayMs,
  });
  const s = useMemo(() => resolveStyles(theme, styles), [theme, styles]);
  const t = useMemo(() => resolveLabels(label, labels), [label, labels]);

  // The hosted page is mounted ONCE and kept mounted across
  // 'verifying' -> 'pending': it is the same element in the same position of
  // the same parent, so React never unmounts it. A remount would reload the
  // page and drop the provider's in-page state exactly while the user waits
  // for the review ('submitted' and a non-approved 'complete' can still be
  // followed by more messages: a retry, a token refresh, a final decision).
  // 'pending' only shrinks the page to nothing and mutes it.
  //
  // A launchable source runs the provider SDK in-process: no page, no
  // WebView, just a placeholder behind the native screen.
  const pageUrl = isLaunchable(source) ? undefined : session?.url;
  const showsPage =
    pageUrl !== undefined && (status === 'verifying' || status === 'pending');
  const hidden = status === 'pending';

  const overlay = ((): React.ReactElement | null => {
    switch (status) {
      case 'idle':
        return (
          <View style={s.screen}>
            <Text style={s.title}>{t.title}</Text>
            <Text style={s.subtitle}>{t.subtitle}</Text>
            <TouchableOpacity
              style={s.button}
              onPress={start}
              testID="verification-start-button"
              accessibilityRole="button"
              accessibilityLabel={t.start}
            >
              <Text style={s.buttonText}>{t.start}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.secondaryButton}
              onPress={cancel}
              testID="verification-cancel-button"
              accessibilityRole="button"
              accessibilityLabel={t.cancel}
            >
              <Text style={s.secondaryButtonText}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        );

      case 'loading':
        return (
          <View style={s.screen}>
            <ActivityIndicator
              size="large"
              color={theme?.primaryColor}
              testID="loading-indicator"
              accessibilityLabel={t.loading}
            />
            <Text style={s.subtitle}>{t.loading}</Text>
          </View>
        );

      case 'verifying':
      case 'pending':
        if (!showsPage) {
          return (
            <View style={s.screen} testID="launch-screen">
              <Text style={s.title}>{t.inProgressTitle}</Text>
              <Text style={s.subtitle}>{t.inProgressSubtitle}</Text>
            </View>
          );
        }
        return hidden ? (
          <View style={s.screen} testID="pending-screen">
            <Text style={s.title}>{t.pendingTitle}</Text>
            <Text style={s.subtitle} testID="pending-message">
              {outcomeLabel(t, result?.status)}
            </Text>
          </View>
        ) : (
          // The page owns the screen while it runs, so the only affordance
          // the component adds is a way out of it.
          <View style={s.actions}>
            <TouchableOpacity
              style={s.secondaryButton}
              onPress={cancel}
              testID="verification-cancel-button"
              accessibilityRole="button"
              accessibilityLabel={t.cancel}
            >
              <Text style={s.secondaryButtonText}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        );

      case 'success':
        return (
          <View style={s.screen} testID="success-screen">
            <Text style={s.successText} accessibilityLabel={t.outcomeApproved}>
              {t.outcomeApproved}
            </Text>
          </View>
        );

      case 'permissionDenied':
        return (
          <View style={s.screen} testID="permission-screen">
            <Text style={s.title}>{t.permissionTitle}</Text>
            <Text style={s.subtitle}>{t.permissionMessage}</Text>
            {/* 'blocked' cannot be retried in place - only the OS settings
                can change it - and 'denied' can, so each reason gets exactly
                the affordance that can resolve it. */}
            {permissionReason === 'blocked' && onOpenSettings ? (
              <TouchableOpacity
                style={s.button}
                onPress={onOpenSettings}
                testID="open-settings-button"
                accessibilityRole="button"
                accessibilityLabel={t.openSettings}
              >
                <Text style={s.buttonText}>{t.openSettings}</Text>
              </TouchableOpacity>
            ) : null}
            {permissionReason === 'denied' ? (
              <TouchableOpacity
                style={s.secondaryButton}
                onPress={retry}
                testID="retry-button"
                accessibilityRole="button"
                accessibilityLabel={t.retry}
              >
                <Text style={s.secondaryButtonText}>{t.retry}</Text>
              </TouchableOpacity>
            ) : null}
            {permissionReason === 'blocked' && !onOpenSettings ? (
              // No settings escape hatch and retrying in place cannot help -
              // the only way out is to cancel.
              <TouchableOpacity
                style={s.secondaryButton}
                onPress={cancel}
                testID="verification-cancel-button"
                accessibilityRole="button"
                accessibilityLabel={t.cancel}
              >
                <Text style={s.secondaryButtonText}>{t.cancel}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );

      case 'offline':
        return (
          <View style={s.screen} testID="offline-screen">
            <Text style={s.title}>{t.offlineTitle}</Text>
            <Text style={s.subtitle}>{t.offlineMessage}</Text>
            <TouchableOpacity
              style={s.button}
              onPress={retry}
              testID="check-connection-button"
              accessibilityRole="button"
              accessibilityLabel={t.checkConnection}
            >
              <Text style={s.buttonText}>{t.checkConnection}</Text>
            </TouchableOpacity>
          </View>
        );

      case 'error': {
        const failure = describeFailure(error);
        const restartable = isRestartableError(failure.code);
        const action = restartable ? t.restart : t.retry;
        return (
          <View style={s.screen} testID="error-screen">
            <Text style={s.errorTitle}>{t.errorTitle}</Text>
            <Text style={s.subtitle} testID="error-message">
              {failureLabel(t, failure)}
            </Text>
            <TouchableOpacity
              style={s.button}
              onPress={restartable ? restart : retry}
              testID={restartable ? 'restart-button' : 'retry-button'}
              accessibilityRole="button"
              accessibilityLabel={action}
            >
              <Text style={s.buttonText}>{action}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.secondaryButton}
              onPress={cancel}
              testID="verification-cancel-button"
              accessibilityRole="button"
              accessibilityLabel={t.cancel}
            >
              <Text style={s.secondaryButtonText}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        );
      }
    }
  })();

  return (
    <View style={[s.root, style]}>
      {showsPage ? (
        <View
          style={hidden ? s.hiddenWebView : s.page}
          pointerEvents={hidden ? 'none' : 'auto'}
          accessibilityElementsHidden={hidden}
          importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        >
          <HostedWebView
            url={pageUrl}
            allowedOrigin={session?.allowedOrigin}
            allowedNavigationOrigins={allowedNavigationOrigins}
            onMessage={handleMessage}
            onEvent={handleEvent}
            webViewRef={webViewRef}
            renderLoading={renderLoading}
          />
        </View>
      ) : null}
      {overlay}
    </View>
  );
};
