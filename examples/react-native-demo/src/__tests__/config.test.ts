import { Platform } from 'react-native';
import { getDevBackendHost, GRAPHQL_URL, KYC_MODE } from '../config';

describe('getDevBackendHost', () => {
  it('uses the emulator host alias on Android', () => {
    expect(getDevBackendHost('android')).toBe('10.0.2.2');
  });

  it('uses localhost on iOS', () => {
    expect(getDevBackendHost('ios')).toBe('localhost');
  });
});

describe('GRAPHQL_URL / KYC_MODE', () => {
  it('points at the backend GraphQL endpoint for the current platform', () => {
    expect(GRAPHQL_URL).toBe(
      `http://${getDevBackendHost(Platform.OS)}:4000/graphql`,
    );
  });

  it('defaults the mode to native', () => {
    expect(KYC_MODE).toBe('native');
  });
});
