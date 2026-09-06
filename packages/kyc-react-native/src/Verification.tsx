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

  switch (status) {
    case 'idle':
      return (
        <View style={[styles.container, style]}>
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
        <View style={[styles.container, style]}>
          <ActivityIndicator
            size="large"
            testID="loading-indicator"
            accessibilityLabel="Loading, please wait"
          />
          <Text style={styles.subtitle}>Preparing verification...</Text>
        </View>
      );

    case 'verifying':
      // A launchable source runs the provider SDK in-process: no page, no
      // WebView, just a placeholder behind the native screen.
      if (session?.url && !isLaunchable(source)) {
        return (
          <HostedWebView
            url={session.url}
            allowedOrigin={session.allowedOrigin}
            allowedNavigationOrigins={allowedNavigationOrigins}
            onMessage={handleMessage}
            onEvent={handleEvent}
            webViewRef={webViewRef}
            renderLoading={renderLoading}
            style={style}
          />
        );
      }
      return (
        <View style={[styles.container, style]} testID="launch-screen">
          <Text style={styles.title}>Verification in progress</Text>
          <Text style={styles.subtitle}>
            Follow the steps in the verification screen.
          </Text>
        </View>
      );

    case 'pending':
      // 'submitted' (and a non-approved 'complete') land here while the
      // hosted page may still be posting messages (a decline can still be
      // followed by a retry, a token refresh, etc.) - so the page stays
      // mounted, invisibly, instead of being torn down under the overlay.
      // A launchable source has no page to keep alive: the native SDK's own
      // screen is still the one showing, so this is the same placeholder as
      // 'verifying'.
      if (session?.url && !isLaunchable(source)) {
        return (
          <View style={[styles.container, style]} testID="pending-screen">
            <View
              style={styles.hiddenWebView}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <HostedWebView
                url={session.url}
                allowedOrigin={session.allowedOrigin}
                allowedNavigationOrigins={allowedNavigationOrigins}
                onMessage={handleMessage}
                onEvent={handleEvent}
                webViewRef={webViewRef}
                renderLoading={renderLoading}
              />
            </View>
            <Text style={styles.title}>Thanks</Text>
            <Text style={styles.subtitle} testID="pending-message">
              {describeOutcome(result?.status)}
            </Text>
          </View>
        );
      }
      return (
        <View style={[styles.container, style]} testID="launch-screen">
          <Text style={styles.title}>Verification in progress</Text>
          <Text style={styles.subtitle}>
            Follow the steps in the verification screen.
          </Text>
        </View>
      );

    case 'success':
      return (
        <View style={[styles.container, style]} testID="success-screen">
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
        <View style={[styles.container, style]} testID="permission-screen">
          <Text style={styles.title}>Camera access needed</Text>
          <Text style={styles.subtitle}>
            {getErrorMessage('PERMISSION_DENIED')}
          </Text>
          {onOpenSettings ? (
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
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={retry}
            testID="retry-button"
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );

    case 'offline':
      // retry() flips the machine to 'loading' the instant it is called
      // (useVerification's begin() dispatches 'begin' before it ever checks
      // connectivity), so this screen is always gone again before
      // isCheckingConnection could render here - it is not read.
      return (
        <View style={[styles.container, style]} testID="offline-screen">
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
        <View style={[styles.container, style]} testID="error-screen">
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
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
