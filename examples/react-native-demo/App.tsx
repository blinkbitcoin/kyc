/**
 * Demo host for @blinkbitcoin/kyc-react-native. Bootstrap: shows that the
 * package resolves through the workspace; the verification screen lands
 * with the React Native phase.
 *
 * @format
 */

import { describePackage } from '@blinkbitcoin/kyc-react-native';
import {
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { KYC_MODE } from './src/config';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title} testID="app-ready">
        KYC demo
      </Text>
      <Text style={styles.body} testID="package-name">
        {describePackage()}
      </Text>
      <Text style={styles.body} testID="kyc-mode">
        {`mode: ${KYC_MODE}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 8 },
  body: { fontSize: 15, marginBottom: 4 },
});

export default App;
