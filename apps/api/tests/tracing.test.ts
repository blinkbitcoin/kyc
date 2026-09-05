import { SpanStatusCode, trace } from '@opentelemetry/api';
import { vi } from 'vitest';
import {
  instrumentProvider,
  setActiveSpanAttributes,
  withSpan,
  withSpanSync,
} from '../src/tracing';

const makeSpan = () => ({
  recordException: vi.fn(),
  setStatus: vi.fn(),
  setAttributes: vi.fn(),
  setAttribute: vi.fn(),
  end: vi.fn(),
});

describe('withSpan / withSpanSync', () => {
  let span: ReturnType<typeof makeSpan>;

  beforeEach(() => {
    span = makeSpan();
    vi.spyOn(trace, 'getTracer').mockReturnValue({
      startActiveSpan: (_name: string, _opts: unknown, fn: (s: unknown) => unknown) => fn(span),
    } as never);
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns the callback result and ends the span', async () => {
    await expect(withSpan('op', {}, async () => 42)).resolves.toBe(42);
    expect(span.end).toHaveBeenCalledOnce();
    expect(span.setStatus).not.toHaveBeenCalled();
  });

  it('records an Error, sets ERROR status, rethrows, and still ends the span', async () => {
    const err = new Error('boom');
    await expect(
      withSpan('op', {}, async () => {
        throw err;
      })
    ).rejects.toBe(err);
    expect(span.recordException).toHaveBeenCalledWith(err);
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR, message: 'boom' });
    expect(span.end).toHaveBeenCalledOnce();
  });

  it('stringifies non-Error throwables', async () => {
    await expect(
      withSpan('op', {}, async () => {
        throw 'raw';
      })
    ).rejects.toBe('raw');
    expect(span.recordException).toHaveBeenCalledWith('raw');
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR, message: 'raw' });
  });

  it('sync variant returns the result', () => {
    expect(withSpanSync('op', {}, () => 'ok')).toBe('ok');
    expect(span.end).toHaveBeenCalledOnce();
  });

  it('sync variant records failures and rethrows', () => {
    expect(() =>
      withSpanSync('op', {}, () => {
        throw new Error('sync');
      })
    ).toThrow('sync');
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR, message: 'sync' });
    expect(span.end).toHaveBeenCalledOnce();
  });

  it('sync variant stringifies non-Error throwables', () => {
    expect(() =>
      withSpanSync('op', {}, () => {
        throw 7;
      })
    ).toThrow();
    expect(span.recordException).toHaveBeenCalledWith('7');
  });
});

describe('setActiveSpanAttributes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('forwards to the active span', () => {
    const active = makeSpan();
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(active as never);
    setActiveSpanAttributes({ 'enduser.id': 'u1' });
    expect(active.setAttributes).toHaveBeenCalledWith({ 'enduser.id': 'u1' });
  });

  it('is a no-op without an active span', () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);
    expect(() => setActiveSpanAttributes({ a: 1 })).not.toThrow();
  });
});

describe('instrumentProvider', () => {
  let span: ReturnType<typeof makeSpan>;

  const baseProvider = () => ({
    createSession: vi.fn(async () => ({ accessToken: 'tok', providerApplicantId: 'a1' })),
    refreshToken: vi.fn(async () => ({ accessToken: 'tok2' })),
    getStatus: vi.fn(async () => 'approved' as const),
    verifyWebhook: vi.fn(() => true),
    parseWebhookEvent: vi.fn(() => null),
  });

  beforeEach(() => {
    span = makeSpan();
    vi.spyOn(trace, 'getTracer').mockReturnValue({
      startActiveSpan: (_name: string, _opts: unknown, fn: (s: unknown) => unknown) => fn(span),
    } as never);
  });

  afterEach(() => vi.restoreAllMocks());

  it('omits getStatusByUserId when the provider does not implement it', () => {
    expect(instrumentProvider(baseProvider(), 'mock').getStatusByUserId).toBeUndefined();
  });

  it('traces createSession and refreshToken and forwards the arguments', async () => {
    const inner = baseProvider();
    const traced = instrumentProvider(inner, 'sumsub');

    await expect(traced.createSession('u1', { platform: 'IOS' })).resolves.toEqual({
      accessToken: 'tok',
      providerApplicantId: 'a1',
    });
    expect(inner.createSession).toHaveBeenCalledWith('u1', { platform: 'IOS' });

    await expect(
      traced.refreshToken({ userId: 'u1', providerApplicantId: 'a1' }, { platform: 'WEB' })
    ).resolves.toEqual({ accessToken: 'tok2' });
    expect(span.end).toHaveBeenCalledTimes(2);
  });

  it('tags getStatus with the resulting status', async () => {
    await instrumentProvider(baseProvider(), 'mock').getStatus('a1');
    expect(span.setAttribute).toHaveBeenCalledWith('kyc.status', 'approved');
  });

  it('tags getStatusByUserId with the resulting status when implemented', async () => {
    const inner = { ...baseProvider(), getStatusByUserId: vi.fn(async () => 'pending' as const) };
    const traced = instrumentProvider(inner, 'sumsub');
    await expect(traced.getStatusByUserId!('u1')).resolves.toBe('pending');
    expect(span.setAttribute).toHaveBeenCalledWith('kyc.status', 'pending');
  });

  it('tags webhook verification and parsing outcomes', () => {
    const inner = baseProvider();
    const traced = instrumentProvider(inner, 'mock');
    expect(traced.verifyWebhook({}, '{}', '127.0.0.1')).toBe(true);
    expect(span.setAttribute).toHaveBeenCalledWith('kyc.webhook.verified', true);
    expect(traced.parseWebhookEvent('{}')).toBeNull();
    expect(span.setAttribute).toHaveBeenCalledWith('kyc.webhook.malformed', true);
    expect(inner.verifyWebhook).toHaveBeenCalledWith({}, '{}', '127.0.0.1');
  });
});
