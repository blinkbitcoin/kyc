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

  it('falls back to an empty token when the session carries none', async () => {
    await makeSource().launch({ provider: 'sumsub' }, jest.fn());
    expect(sumsubMockState.accessToken).toBe('');
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

  it('resolves without an applicant id when the SDK never reported one', async () => {
    const { events, onEvent } = collect();
    setSumsubMockResult({ success: true, status: 'Pending' });

    await expect(makeSource().launch(session, onEvent)).resolves.toEqual({
      status: 'pending',
    });
    expect(events).toEqual([{ type: 'complete', status: 'pending' }]);
  });
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
