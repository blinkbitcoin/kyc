import { createSessionTokenProvider } from '../sessionToken';

const setup = () => {
  let n = 0;
  const start = jest.fn(async () => ({
    sessionId: `s-${++n}`,
    accessToken: `first-${n}`,
  }));
  const refresh = jest.fn(async (sessionId: string) => `fresh-${sessionId}`);
  return {
    start,
    refresh,
    provider: createSessionTokenProvider({ start, refresh }),
  };
};

describe('createSessionTokenProvider', () => {
  it('starts once, then refreshes the same session on every later call', async () => {
    const { provider, start, refresh } = setup();
    expect(provider.sessionId).toBeNull();

    await expect(provider.getAccessToken()).resolves.toBe('first-1');
    expect(provider.sessionId).toBe('s-1');
    await expect(provider.getAccessToken()).resolves.toBe('fresh-s-1');
    await expect(provider.getAccessToken()).resolves.toBe('fresh-s-1');

    expect(start).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledWith('s-1');
  });

  it('shares one start between concurrent first calls', async () => {
    const { provider, start } = setup();
    const tokens = await Promise.all([
      provider.getAccessToken(),
      provider.getAccessToken(),
    ]);
    expect(tokens).toEqual(['first-1', 'first-1']);
    expect(start).toHaveBeenCalledTimes(1);
    expect(provider.sessionId).toBe('s-1');
  });

  it('keeps no session when the start fails, so the next call starts again', async () => {
    const { provider, start } = setup();
    start.mockRejectedValueOnce(new Error('offline'));
    await expect(provider.getAccessToken()).rejects.toThrow('offline');
    expect(provider.sessionId).toBeNull();
    // the rejected start never reached the API's counter: the retry is the first real start
    await expect(provider.getAccessToken()).resolves.toBe('first-1');
    expect(provider.sessionId).toBe('s-1');
  });

  it('propagates a refresh failure and keeps the session', async () => {
    const { provider, refresh } = setup();
    await provider.getAccessToken();
    refresh.mockRejectedValueOnce(new Error('expired'));
    await expect(provider.getAccessToken()).rejects.toThrow('expired');
    expect(provider.sessionId).toBe('s-1');
  });

  it('reset forgets the session: the next call starts a new one', async () => {
    const { provider, start } = setup();
    await provider.getAccessToken();
    provider.reset();
    expect(provider.sessionId).toBeNull();
    await expect(provider.getAccessToken()).resolves.toBe('first-2');
    expect(start).toHaveBeenCalledTimes(2);
  });
});
