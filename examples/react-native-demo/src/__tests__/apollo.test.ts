import { apolloClient, getAuthToken } from '../apollo';

describe('demo Apollo wiring', () => {
  it('sends a fixed dev token that the backend treats as the userId', () => {
    expect(getAuthToken()).toBe('demo-user');
  });

  it('builds a client the proxy source can use', () => {
    expect(typeof apolloClient.mutate).toBe('function');
    expect(typeof apolloClient.query).toBe('function');
  });
});
