import { Platform } from 'react-native';

import {
  API_ORIGIN,
  getDevBackendHost,
  GRAPHQL_URL,
  KYC_MODE,
} from '../config';

describe('getDevBackendHost', () => {
  it('uses the emulator host alias on Android', () => {
    expect(getDevBackendHost('android')).toBe('10.0.2.2');
  });

  it('uses localhost on iOS', () => {
    expect(getDevBackendHost('ios')).toBe('localhost');
  });
});

describe('API_ORIGIN / GRAPHQL_URL', () => {
  it('points at the backend for the current platform', () => {
    expect(API_ORIGIN).toBe(`http://${getDevBackendHost(Platform.OS)}:4000`);
  });

  it('derives the GraphQL endpoint from the origin', () => {
    expect(GRAPHQL_URL).toBe(`${API_ORIGIN}/graphql`);
  });
});

describe('KYC_MODE', () => {
  it('defaults to native', () => {
    expect(KYC_MODE).toBe('native');
  });
});
