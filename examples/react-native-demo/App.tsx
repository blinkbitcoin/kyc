/**
 * Demo host for @blinkbitcoin/kyc-react-native.
 *
 * One screen serves every KYC_MODE (native | hosted | proxy | fake-native):
 * only the source differs, so this file is the reference for the wiring a
 * real host app writes. KYC_UI=themed shows the same flow under a host's
 * own palette and copy (src/theme.ts). The toolbar and the outcome line exist for the
 * Maestro suite - a product screen would not need them.
 *
 * @format
 */

import { ApolloProvider } from '@apollo/client/react';
import { Verification } from '@blinkbitcoin/kyc-react-native';
import { useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { apolloClient } from './src/apollo';
import { KYC_MODE, KYC_UI } from './src/config';
import { buildSource } from './src/source';
import { uiProps } from './src/theme';

import type { FakeLaunchController } from '@blinkbitcoin/kyc-core/testing';
import type {
  VerificationError,
  VerificationResult,
} from '@blinkbitcoin/kyc-react-native';

export type Outcome =
  | { kind: 'completed'; result: VerificationResult }
  | { kind: 'error'; error: VerificationError }
  | { kind: 'cancelled' }
  | null;

export const outcomeText = (outcome: Outcome): string => {
  switch (outcome?.kind) {
    case 'completed':
      return `completed: ${outcome.result.status}`;
    case 'error':
      return `error: ${outcome.error.code}`;
    case 'cancelled':
      return 'cancelled';
    default:
      return 'no outcome yet';
  }
};

// The demo deliberately has no permission library. A real host would call
// whatever it already uses here, e.g. react-native-permissions:
//
//   checkPermissions={async () => {
//     const result = await request(PERMISSIONS.IOS.CAMERA);
//     if (result === RESULTS.GRANTED) return 'granted';
//     // 'blocked' is the arm only the OS settings can clear; the component
//     // shows open-settings-button for it (when onOpenSettings is given) and
//     // retry-button for 'denied'.
//     return result === RESULTS.BLOCKED ? 'blocked' : 'denied';
//   }}
//   onOpenSettings={openSettings}
//
// Returning 'granted' means the WebView / native SDK prompts for itself.
export const checkDemoPermissions = async (): Promise<'granted'> => 'granted';

/**
 * Stand-in for the provider's native SDK screen in fake-native mode. The
 * library renders `launch-screen` for the duration of a native launch; this
 * overlays the buttons that settle it.
 */
export const FakeSdkScreen = ({
  controller,
}: {
  controller: FakeLaunchController;
}) => (
  <View style={styles.fakeSdk} testID="fake-sdk-screen">
    <Text style={styles.fakeSdkTitle}>Fake provider SDK</Text>
    <TouchableOpacity
      accessibilityRole="button"
      onPress={() => controller.approve()}
      testID="fake-sdk-approve"
    >
      <Text style={styles.fakeSdkButton}>Approve</Text>
    </TouchableOpacity>
    <TouchableOpacity
      accessibilityRole="button"
      onPress={() => controller.decline()}
      testID="fake-sdk-decline"
    >
      <Text style={styles.fakeSdkButton}>Decline</Text>
    </TouchableOpacity>
    <TouchableOpacity
      accessibilityRole="button"
      onPress={() => controller.cancel()}
      testID="fake-sdk-cancel"
    >
      <Text style={styles.fakeSdkButton}>Cancel</Text>
    </TouchableOpacity>
  </View>
);

/**
 * The flow itself. Remounted by "Start over" (key change), so the source is
 * built once per mount with a lazy useState initialiser - never per render.
 */
export const VerificationScreen = ({
  onOutcome,
}: {
  onOutcome: (outcome: Outcome) => void;
}) => {
  const [launching, setLaunching] = useState(false);
  const [{ source, controller }] = useState(() =>
    buildSource(KYC_MODE, { onLaunchingChange: setLaunching }),
  );

  return (
    <View style={styles.flow}>
      <Verification
        source={source}
        onComplete={result => onOutcome({ kind: 'completed', result })}
        onError={error => onOutcome({ kind: 'error', error })}
        onCancel={() => onOutcome({ kind: 'cancelled' })}
        successDelayMs={4000}
        checkPermissions={checkDemoPermissions}
        {...uiProps(KYC_UI)}
      />
      {controller && launching ? (
        <FakeSdkScreen controller={controller} />
      ) : null}
    </View>
  );
};

const AppContent = () => {
  const insets = useSafeAreaInsets();
  const [sessionKey, setSessionKey] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>(null);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.toolbar}>
        <Text style={styles.mode} testID="mode-label">
          {`mode: ${KYC_MODE}`}
        </Text>
        <TouchableOpacity
          accessibilityLabel="Start over"
          accessibilityRole="button"
          onPress={() => {
            setOutcome(null);
            setSessionKey(key => key + 1);
          }}
          testID="reset-button"
        >
          <Text style={styles.toolbarText}>Start over</Text>
        </TouchableOpacity>
      </View>
      <VerificationScreen key={sessionKey} onOutcome={setOutcome} />
      <Text style={styles.outcome} testID="outcome">
        {outcomeText(outcome)}
      </Text>
    </View>
  );
};

const App = () => {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <ApolloProvider client={apolloClient}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <AppContent />
      </SafeAreaProvider>
    </ApolloProvider>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  toolbarText: { color: '#007AFF', fontSize: 15 },
  mode: { color: '#666', fontSize: 13 },
  flow: { flex: 1 },
  outcome: { fontSize: 15, paddingHorizontal: 16, paddingVertical: 12 },
  fakeSdk: {
    alignItems: 'center',
    backgroundColor: '#fff',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  fakeSdkTitle: { fontSize: 20, fontWeight: '600', marginBottom: 24 },
  fakeSdkButton: { color: '#007AFF', fontSize: 17, paddingVertical: 12 },
});

export default App;
