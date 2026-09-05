import { SpanStatusCode, trace } from '@opentelemetry/api';
import { vi } from 'vitest';
import { setActiveSpanAttributes, withSpan, withSpanSync } from '../src/tracing';

const makeSpan = () => ({
  recordException: vi.fn(),
  setStatus: vi.fn(),
  setAttributes: vi.fn(),
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
