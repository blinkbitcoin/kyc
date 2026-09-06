// The default UI over useVerification: one screen per state and nothing
// else. Every decision that is not "what does this state look like" lives in
// the hook, the machine or webViewProps - so a host that wants its own look
// calls useVerification directly and reuses HostedWebView.

import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getErrorMessage, isLaunchable } from '@blinkbitcoin/kyc-core/hosted';

import { HostedWebView } from './hosted/HostedWebView';
import { useVerification } from './useVerification';
import { describeOutcome, isRestartableError } from './verificationMachine';

import type { VerificationError } from './verificationMachine';
import type { VerificationProps } from './types';

export const DEFAULT_LABEL = 'Verify identity';

export const Verification: React.FC<VerificationProps> = ({
  source,
  onComplete,
  onError,
  onCancel,
  onStatusChange,
  label = DEFAULT_LABEL,
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
          <View style={styles.screen}>
            <Text style={styles.title}>{label}</Text>
            <Text style={styles.subtitle}>
              Have your ID document ready and allow camera access.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={start}
              testID="verification-start-button"
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text style={styles.buttonText}>{label}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={cancel}
              testID="verification-cancel-button"
              accessibilityRole="button"
              accessibilityLabel="Cancel verification"
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        );

      case 'loading':
        return (
          <View style={styles.screen}>
            <ActivityIndicator
              size="large"
              testID="loading-indicator"
              accessibilityLabel="Loading, please wait"
            />
            <Text style={styles.subtitle}>Preparing verification...</Text>
          </View>
        );

      case 'verifying':
      case 'pending':
        if (!showsPage) {
          return (
            <View style={styles.screen} testID="launch-screen">
              <Text style={styles.title}>Verification in progress</Text>
              <Text style={styles.subtitle}>
                Follow the steps in the verification screen.
              </Text>
            </View>
          );
        }
        return hidden ? (
          <View style={styles.screen} testID="pending-screen">
            <Text style={styles.title}>Thanks</Text>
            <Text style={styles.subtitle} testID="pending-message">
              {describeOutcome(result?.status)}
            </Text>
          </View>
        ) : (
          // The page owns the screen while it runs, so the only affordance
          // the component adds is a way out of it.
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={cancel}
              testID="verification-cancel-button"
              accessibilityRole="button"
              accessibilityLabel="Cancel verification"
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        );

      case 'success':
        return (
          <View style={styles.screen} testID="success-screen">
            <Text
              style={styles.successText}
              accessibilityLabel="Verification complete"
            >
              {describeOutcome('approved')}
            </Text>
          </View>
        );

      case 'permissionDenied':
        return (
          <View style={styles.screen} testID="permission-screen">
            <Text style={styles.title}>Camera access needed</Text>
            <Text style={styles.subtitle}>
              {getErrorMessage('PERMISSION_DENIED')}
            </Text>
            {/* 'blocked' cannot be retried in place - only the OS settings
                can change it - and 'denied' can, so each reason gets exactly
                the affordance that can resolve it. */}
            {permissionReason === 'blocked' && onOpenSettings ? (
              <TouchableOpacity
                style={styles.button}
                onPress={onOpenSettings}
                testID="open-settings-button"
                accessibilityRole="button"
                accessibilityLabel="Open settings"
              >
                <Text style={styles.buttonText}>Open settings</Text>
              </TouchableOpacity>
            ) : null}
            {permissionReason === 'denied' ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={retry}
                testID="retry-button"
                accessibilityRole="button"
                accessibilityLabel="Try again"
              >
                <Text style={styles.secondaryButtonText}>Try again</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );

      case 'offline':
        return (
          <View style={styles.screen} testID="offline-screen">
            <Text style={styles.title}>No connection</Text>
            <Text style={styles.subtitle}>
              A connection is required to verify your identity.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={retry}
              testID="check-connection-button"
              accessibilityRole="button"
              accessibilityLabel="Check connection"
            >
              <Text style={styles.buttonText}>Check connection</Text>
            </TouchableOpacity>
          </View>
        );

      case 'error': {
        const failure = error as VerificationError;
        const restartable = isRestartableError(failure.code);
        return (
          <View style={styles.screen} testID="error-screen">
            <Text style={styles.errorTitle}>Verification failed</Text>
            <Text style={styles.subtitle} testID="error-message">
              {failure.message}
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={restartable ? restart : retry}
              testID={restartable ? 'restart-button' : 'retry-button'}
              accessibilityRole="button"
              accessibilityLabel={
                restartable ? 'Restart verification' : 'Try again'
              }
            >
              <Text style={styles.buttonText}>
                {restartable ? 'Restart' : 'Try again'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={cancel}
              testID="verification-cancel-button"
              accessibilityRole="button"
              accessibilityLabel="Cancel verification"
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        );
      }
    }
  })();

  return (
    <View style={[styles.root, style]}>
      {showsPage ? (
        <View
          style={hidden ? styles.hiddenWebView : styles.page}
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: { flex: 1, width: '100%' },
  actions: { alignItems: 'center', paddingVertical: 12 },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { paddingHorizontal: 30, paddingVertical: 12 },
  secondaryButtonText: { color: '#007AFF', fontSize: 16 },
  // Darker green / red for WCAG AA contrast (4.5:1)
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
    marginBottom: 10,
  },
  // Keeps the page's bridge alive under the pending overlay without showing
  // the (already-submitted) hosted page.
  hiddenWebView: { position: 'absolute', width: 0, height: 0, opacity: 0 },
});
