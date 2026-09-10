import { Platform } from 'react-native';

import {
  getDevBackendHost,
  GRAPHQL_URL,
  KYC_MODE,
  KYC_UI,
  resolveBackendPort,
  resolveKycMode,
  resolveKycUi,
} from '../config';

describe('getDevBackendHost', () => {
  it('uses the emulator host alias on Android', () => {
    expect(getDevBackendHost('android')).toBe('10.0.2.2');
  });

  it('uses localhost on iOS', () => {
    expect(getDevBackendHost('ios')).toBe('localhost');
  });
});

describe('resolveBackendPort', () => {
  it('defaults to 5000 and reads KYC_API_PORT', () => {
    expect(resolveBackendPort(undefined)).toBe(5000);
    expect(resolveBackendPort('')).toBe(5000);
    expect(resolveBackendPort('abc')).toBe(5000);
    expect(resolveBackendPort('5010')).toBe(5010);
  });
});

describe('GRAPHQL_URL', () => {
  it('derives the GraphQL endpoint from the backend origin for the current platform', () => {
    expect(GRAPHQL_URL).toBe(
      `http://${getDevBackendHost(Platform.OS)}:5000/graphql`,
    );
  });
});

describe('KYC_MODE', () => {
  it('defaults to native', () => {
    expect(KYC_MODE).toBe('native');
  });
});

describe('resolveKycMode', () => {
  it.each(['hosted', 'proxy', 'fake-native'] as const)('accepts %s', mode => {
    expect(resolveKycMode(mode)).toBe(mode);
  });

  it('falls back to native for anything else', () => {
    expect(resolveKycMode(undefined)).toBe('native');
    expect(resolveKycMode('web')).toBe('native');
  });
});

describe('KYC_UI', () => {
  it('defaults to the component look', () => {
    expect(KYC_UI).toBe('default');
    expect(resolveKycUi(undefined)).toBe('default');
    expect(resolveKycUi('neon')).toBe('default');
  });

  it('themed is the only other value', () => {
    expect(resolveKycUi('themed')).toBe('themed');
  });
});
