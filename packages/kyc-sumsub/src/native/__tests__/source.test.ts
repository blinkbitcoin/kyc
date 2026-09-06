import { ClientErrorCodes, isLaunchable } from '@blinkbitcoin/kyc-core/hosted';

import SNSMobileSDK, {
  emitSumsubEvent,
  emitSumsubLog,
  emitSumsubStatus,
  resetSumsubMock,
  setSumsubMockLaunchError,
  setSumsubMockResult,
  sumsubMockState,
} from '../../../__mocks__/@sumsub/react-native-mobilesdk-module';
import { createSumsubNativeSource, SUMSUB_LAUNCH_FAILED } from '../source';
import { SUMSUB_NATIVE_MODULE } from '../sdk';

import type { VerificationEvent } from '@blinkbitcoin/kyc-core/hosted';

const collect = () => {
  const events: VerificationEvent[] = [];
  return { events, onEvent: (event: VerificationEvent) => events.push(event) };
};

const session = { provider: 'sumsub', accessToken: 'tok-1' };

const makeSource = (
  over: Partial<Parameters<typeof createSumsubNativeSource>[0]> = {},
) =>
  createSumsubNativeSource({
    getAccessToken: jest.fn().mockResolvedValue('tok-1'),
    sdk: SNSMobileSDK,
    ...over,
  });

beforeEach(() => resetSumsubMock());
afterEach(() => jest.restoreAllMocks());

describe('createSumsubNativeSource - the source contract', () => {
  it('is launchable', () => {
    expect(isLaunchable(makeSource())).toBe(true);
  });

  it('starts a Sumsub-tagged session from the host callback', async () => {
    const getAccessToken = jest.fn().mockResolvedValue('tok-9');
    await expect(makeSource({ getAccessToken }).start()).resolves.toEqual({
      provider: 'sumsub',
      accessToken: 'tok-9',
    });
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('interprets nothing: the native flow has no embedded page', () => {
    expect(
      makeSource().interpret({ source: 'kyc-bridge', v: 1, type: 'cancel' }),
    ).toBeNull();
  });
});

describe('createSumsubNativeSource - the SDK is not installed', () => {
  // No `sdk` option, and the peer's own require() is forced to fail exactly
  // as it does when the optional peer is not installed: loadSumsubSdk()
  // returns null. Isolated per test so the throwing factory (and the module
  // registry that observed it) never leaks into the other describe blocks.
  const notInstalled = () => {
    jest.doMock(
      SUMSUB_NATIVE_MODULE,
      () => {
        throw new Error(`Cannot find module '${SUMSUB_NATIVE_MODULE}'`);
      },
      { virtual: true },
    );
    return (
      require('../source') as typeof import('../source')
    ).createSumsubNativeSource({
      getAccessToken: jest.fn().mockResolvedValue('tok-1'),
    });
  };

  it('fails start() before any UI is shown', async () => {
    await jest.isolateModulesAsync(async () => {
      await expect(notInstalled().start()).rejects.toEqual({
        code: ClientErrorCodes.SDK_UNAVAILABLE,
        message: expect.stringContaining('Sumsub'),
      });
    });
  });

  it('fails launch() the same way when it is called directly', async () => {
    await jest.isolateModulesAsync(async () => {
      await expect(notInstalled().launch(session, jest.fn())).rejects.toEqual({
        code: ClientErrorCodes.SDK_UNAVAILABLE,
        message: expect.stringContaining('Sumsub'),
      });
    });
  });
});

describe('createSumsubNativeSource - launch wiring', () => {
  it('hands the SDK the session token and the host refresh callback', async () => {
    const getAccessToken = jest.fn().mockResolvedValue('fresh-token');
    await makeSource({ getAccessToken }).launch(session, jest.fn());

    expect(sumsubMockState.accessToken).toBe('tok-1');
    expect(sumsubMockState.built).toBe(1);
    expect(sumsubMockState.launched).toBe(1);
    await expect(sumsubMockState.tokenExpirationHandler?.()).resolves.toBe(
      'fresh-token',
    );
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('refuses to launch a session that carries no access token', async () => {
    await expect(
      makeSource().launch({ provider: 'sumsub' }, jest.fn()),
    ).rejects.toEqual({
      code: SUMSUB_LAUNCH_FAILED,
      message: 'session carries no access token',
    });
    // Rejected before the SDK was touched at all.
    expect(sumsubMockState.accessToken).toBeUndefined();
    expect(sumsubMockState.built).toBe(0);
  });

  it('rejects a second launch while one is still in progress', async () => {
    const source = makeSource();
    const first = source.launch(session, jest.fn());

    await expect(source.launch(session, jest.fn())).rejects.toEqual({
      code: ClientErrorCodes.SDK_UNAVAILABLE,
      message: 'launch already in progress',
    });
    // The first launch is untouched, and the flag clears when it settles.
    await expect(first).resolves.toEqual({ status: 'approved' });
    await expect(source.launch(session, jest.fn())).resolves.toEqual({
      status: 'approved',
    });
  });

  it('passes the locale only when one is given, and debug defaults to false', async () => {
    await makeSource().launch(session, jest.fn());
    expect(sumsubMockState.locale).toBeUndefined();
    expect(sumsubMockState.debug).toBe(false);

    resetSumsubMock();
    await makeSource({ locale: 'es', debug: true }).launch(session, jest.fn());
    expect(sumsubMockState.locale).toBe('es');
    expect(sumsubMockState.debug).toBe(true);
  });

  it('logs SDK log lines only in debug mode', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    await makeSource().launch(session, jest.fn());
    emitSumsubLog('quiet');
    expect(log).not.toHaveBeenCalled();

    await makeSource({ debug: true }).launch(session, jest.fn());
    emitSumsubLog('loud');
    expect(log).toHaveBeenCalledWith('[kyc-sumsub] loud');
  });
});

describe('createSumsubNativeSource - events during the flow', () => {
  it('normalizes status changes and ignores the ones with no meaning', async () => {
    const { events, onEvent } = collect();
    const pending = makeSource().launch(session, onEvent);
    emitSumsubStatus('Initial', 'Pending');
    emitSumsubStatus('Pending', 'ActionCompleted');
    await pending;

    expect(events).toEqual([
      { type: 'statusChanged', status: 'pending' },
      { type: 'complete', status: 'approved' },
    ]);
  });

  it('emits applicantLoaded and carries the id into the result', async () => {
    const { events, onEvent } = collect();
    const pending = makeSource().launch(session, onEvent);
    emitSumsubEvent('ApplicantLoaded', { applicantId: 'a-1' });
    emitSumsubEvent('StepCompleted', { idDocSetType: 'IDENTITY' });
    emitSumsubEvent('ApplicantLoaded', { applicantId: 42 });

    await expect(pending).resolves.toEqual({
      status: 'approved',
      applicantId: 'a-1',
    });
    expect(events).toEqual([
      { type: 'applicantLoaded', applicantId: 'a-1' },
      { type: 'complete', status: 'approved', applicantId: 'a-1' },
    ]);
  });

  it('ignores an SDK event that carries no payload', async () => {
    const { events, onEvent } = collect();
    const pending = makeSource().launch(session, onEvent);
    emitSumsubEvent('ApplicantLoaded');

    await expect(pending).resolves.toEqual({ status: 'approved' });
    expect(events).toEqual([{ type: 'complete', status: 'approved' }]);
  });

  it('resolves without an applicant id when the SDK never reported one', async () => {
    const { events, onEvent } = collect();
    setSumsubMockResult({ success: true, status: 'Pending' });

    await expect(makeSource().launch(session, onEvent)).resolves.toEqual({
      status: 'pending',
    });
    expect(events).toEqual([{ type: 'complete', status: 'pending' }]);
  });
});

describe('createSumsubNativeSource - the user closed the SDK', () => {
  // A successful launch that reports no verdict means the applicant left the
  // flow: core's LaunchableSource contract says that is a cancel event plus
  // an advisory resolution, never a `complete`.
  it.each([
    ['Initial', 'initial'],
    ['Incomplete', 'incomplete'],
  ])('turns a %s result into a cancellation', async (sdkStatus, status) => {
    const { events, onEvent } = collect();
    setSumsubMockResult({ success: true, status: sdkStatus as 'Initial' });

    await expect(makeSource().launch(session, onEvent)).resolves.toEqual({
      status,
    });
    expect(events).toEqual([{ type: 'cancel' }]);
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'complete' }),
    );
  });

  it('still reports the applicant it learned about before the cancel', async () => {
    const { events, onEvent } = collect();
    setSumsubMockResult({ success: true, status: 'Incomplete' });
    const pending = makeSource().launch(session, onEvent);
    emitSumsubEvent('ApplicantLoaded', { applicantId: 'a-2' });

    await expect(pending).resolves.toEqual({
      status: 'incomplete',
      applicantId: 'a-2',
    });
    expect(events).toEqual([
      { type: 'applicantLoaded', applicantId: 'a-2' },
      { type: 'cancel' },
    ]);
  });

  it.each(['Pending', 'Approved', 'TemporarilyDeclined', 'FinallyRejected'])(
    'still completes on a %s result',
    async sdkStatus => {
      const { events, onEvent } = collect();
      setSumsubMockResult({ success: true, status: sdkStatus as 'Pending' });

      await makeSource().launch(session, onEvent);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'complete' });
    },
  );
});

describe('createSumsubNativeSource - failures', () => {
  it('emits the error event and rejects with the mapped code', async () => {
    const { events, onEvent } = collect();
    setSumsubMockResult({
      success: false,
      status: 'Failed',
      errorType: 'Unauthorized',
      errorMsg: 'token expired',
    });

    await expect(makeSource().launch(session, onEvent)).rejects.toEqual({
      code: ClientErrorCodes.TOKEN_EXPIRED,
      message: 'token expired',
    });
    expect(events).toEqual([
      {
        type: 'error',
        code: ClientErrorCodes.TOKEN_EXPIRED,
        message: 'token expired',
      },
    ]);
  });

  it('wraps a thrown Error from launch()', async () => {
    setSumsubMockLaunchError(new Error('init failed'));
    await expect(makeSource().launch(session, jest.fn())).rejects.toEqual({
      code: SUMSUB_LAUNCH_FAILED,
      message: 'init failed',
    });
  });

  it('wraps a non-Error throwable without inventing a message', async () => {
    setSumsubMockLaunchError('boom');
    await expect(makeSource().launch(session, jest.fn())).rejects.toEqual({
      code: SUMSUB_LAUNCH_FAILED,
    });
  });

  it('passes a VerificationSourceError from the SDK through unchanged', async () => {
    setSumsubMockLaunchError({ code: 'CUSTOM', message: 'as thrown' });
    await expect(makeSource().launch(session, jest.fn())).rejects.toEqual({
      code: 'CUSTOM',
      message: 'as thrown',
    });
  });
});
