# kyc-react-native-example

React Native 0.86 host for `@blinkbitcoin/kyc-react-native`: manual testing and
the Maestro E2E target. `KYC_MODE` (native | hosted | proxy | fake-native) is
inlined at bundle time by Babel. Bootstrap status: boots and shows the package
name; the verification screen lands with the React Native phase.

Run from the repo root: `make start`, then `make ios` / `make android`.
E2E: `make e2e-backend-up && make e2e-android` (see the root Makefile).
