import {
  createHostedFrameProps,
  createMessageGuard,
  FRAME_ALLOW,
  FRAME_REFERRER_POLICY,
  FRAME_SANDBOX,
} from '../frameProps';

const URL = 'https://kyc.example.com/hosted/sess-1?x=1';
const ORIGIN = 'https://kyc.example.com';

describe('createHostedFrameProps', () => {
  const props = createHostedFrameProps({
    url: URL,
    title: 'Identity verification',
  });

  it('is the one place the iframe is configured', () => {
    expect(props).toEqual({
      src: URL,
      title: 'Identity verification',
      allow: FRAME_ALLOW,
      sandbox: FRAME_SANDBOX,
      referrerPolicy: FRAME_REFERRER_POLICY,
      loading: 'eager',
    });
  });

  it('delegates camera, microphone and fullscreen, which the provider needs for liveness and document capture', () => {
    expect(FRAME_ALLOW).toBe('camera; microphone; fullscreen');
  });

  it('keeps allow-same-origin, which the provider SDK needs for its own storage', () => {
    expect(FRAME_SANDBOX.split(' ').sort()).toEqual([
      'allow-forms',
      'allow-same-origin',
      'allow-scripts',
    ]);
    expect(FRAME_SANDBOX).not.toContain('allow-popups');
    expect(FRAME_SANDBOX).not.toContain('allow-top-navigation');
  });

  it('never leaks a full referrer to the provider', () => {
    expect(FRAME_REFERRER_POLICY).toBe('strict-origin-when-cross-origin');
  });
});

describe('createMessageGuard', () => {
  const frameWindow = {} as Window;
  const accepts = createMessageGuard({
    allowedOrigin: ORIGIN,
    getFrameWindow: () => frameWindow,
  });

  it('accepts a message from the pinned origin sent by the frame itself', () => {
    expect(accepts({ origin: ORIGIN, source: frameWindow })).toBe(true);
  });

  it('rejects a message from any other origin', () => {
    expect(
      accepts({ origin: 'https://evil.example', source: frameWindow }),
    ).toBe(false);
  });

  it('rejects a message from the right origin but a different window', () => {
    expect(accepts({ origin: ORIGIN, source: {} as Window })).toBe(false);
    expect(accepts({ origin: ORIGIN, source: null })).toBe(false);
  });

  it('rejects everything while the frame has no window', () => {
    const detached = createMessageGuard({
      allowedOrigin: ORIGIN,
      getFrameWindow: () => null,
    });
    expect(detached({ origin: ORIGIN, source: frameWindow })).toBe(false);
  });

  it('rejects everything when there is no origin to pin', () => {
    const unpinned = createMessageGuard({
      allowedOrigin: undefined,
      getFrameWindow: () => frameWindow,
    });
    expect(unpinned({ origin: ORIGIN, source: frameWindow })).toBe(false);
  });
});
