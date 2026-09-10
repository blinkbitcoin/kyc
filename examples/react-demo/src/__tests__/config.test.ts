import {
  API_ORIGIN,
  GRAPHQL_URL,
  KYC_MODE,
  KYC_UI,
  resolveKycMode,
  resolveKycUi,
} from '../config';

describe('demo config', () => {
  it('points at the local reference backend', () => {
    expect(API_ORIGIN).toBe('http://localhost:4000');
    expect(GRAPHQL_URL).toBe('http://localhost:4000/graphql');
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
