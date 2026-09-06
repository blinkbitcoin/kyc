import { API_ORIGIN, GRAPHQL_URL, KYC_MODE } from '../config';

describe('demo config', () => {
  it('points at the local reference backend', () => {
    expect(API_ORIGIN).toBe('http://localhost:4000');
    expect(GRAPHQL_URL).toBe('http://localhost:4000/graphql');
  });

  it('defaults to hosted mode', () => {
    expect(KYC_MODE).toBe('hosted');
  });
});
