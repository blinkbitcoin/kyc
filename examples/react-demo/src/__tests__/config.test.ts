import {
  API_ORIGIN,
  GRAPHQL_URL,
  KYC_MODE,
  KYC_UI,
  resolveApiOrigin,
  resolveKycMode,
  resolveKycUi,
} from '../config';

describe('demo config', () => {
  it('points at the local reference backend', () => {
    expect(API_ORIGIN).toBe('http://localhost:4000');
    expect(GRAPHQL_URL).toBe('http://localhost:4000/graphql');
    expect(resolveApiOrigin(undefined)).toBe('http://localhost:4000');
    expect(resolveApiOrigin('')).toBe('http://localhost:4000');
  });

  it('takes the E2E stack backend origin from VITE_API_ORIGIN', () => {
    expect(resolveApiOrigin('http://localhost:4123')).toBe(
      'http://localhost:4123',
    );
  });

  it('defaults to hosted mode', () => {
    expect(KYC_MODE).toBe('hosted');
    expect(resolveKycMode(undefined)).toBe('hosted');
    expect(resolveKycMode('native')).toBe('hosted');
  });

  it('proxy is the only other mode', () => {
    expect(resolveKycMode('proxy')).toBe('proxy');
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
