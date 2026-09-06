import { loadSumsubSdk, SUMSUB_NATIVE_MODULE } from '../sdk';

import type { SumsubSdkLike } from '../sdk';

const fakeSdk = { init: jest.fn() } as unknown as SumsubSdkLike;

describe('SUMSUB_NATIVE_MODULE', () => {
  it('names the optional peer this package wraps', () => {
    expect(SUMSUB_NATIVE_MODULE).toBe('@sumsub/react-native-mobilesdk-module');
  });
});

describe('loadSumsubSdk', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('returns null when the optional peer is not installed', () => {
    // Simulate the real "peer not installed" require failure: a virtual
    // module whose factory throws, exactly as node's own resolution does in
    // a host that never added the Sumsub SDK.
    jest.doMock(
      SUMSUB_NATIVE_MODULE,
      () => {
        throw new Error(`Cannot find module '${SUMSUB_NATIVE_MODULE}'`);
      },
      { virtual: true },
    );
    expect(loadSumsubSdk()).toBeNull();
  });

  it('unwraps an ES-module default export', () => {
    jest.doMock(
      SUMSUB_NATIVE_MODULE,
      () => ({ __esModule: true, default: fakeSdk }),
      {
        virtual: true,
      },
    );
    expect(loadSumsubSdk()).toBe(fakeSdk);
  });

  it('accepts a CommonJS module that IS the SDK', () => {
    jest.doMock(SUMSUB_NATIVE_MODULE, () => fakeSdk, { virtual: true });
    expect(loadSumsubSdk()).toBe(fakeSdk);
  });
});
