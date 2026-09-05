import { createFakeLaunchableSource } from '../fakeSource';
import { isLaunchable } from '../types';

import type { VerificationEvent } from '../types';

const collect = () => {
  const events: VerificationEvent[] = [];
  return { events, onEvent: (event: VerificationEvent) => events.push(event) };
};

const session = { provider: 'fake' };

describe('createFakeLaunchableSource - defaults', () => {
  it('is launchable and starts a fake session', async () => {
    const source = createFakeLaunchableSource();

    expect(isLaunchable(source)).toBe(true);
    await expect(source.start()).resolves.toEqual({
      provider: 'fake',
      sessionId: 'fake-session',
      accessToken: 'fake-access-token',
      applicantId: 'fake-applicant',
    });
  });

  it('interprets bridge messages like every other source', () => {
    const source = createFakeLaunchableSource();

    expect(
      source.interpret({ source: 'kyc-bridge', v: 1, type: 'cancel' }),
    ).toEqual({
      type: 'cancel',
    });
    expect(source.interpret('nope')).toBeNull();
  });

  it('approves by default, emitting the full event sequence', async () => {
    const { events, onEvent } = collect();
    const source = createFakeLaunchableSource();

    await expect(source.launch(session, onEvent)).resolves.toEqual({
      status: 'approved',
      applicantId: 'fake-applicant',
    });
    expect(events).toEqual([
      { type: 'applicantLoaded', applicantId: 'fake-applicant' },
      { type: 'submitted' },
      { type: 'statusChanged', status: 'approved' },
      { type: 'complete', status: 'approved', applicantId: 'fake-applicant' },
    ]);
  });
});

describe('createFakeLaunchableSource - scripted outcomes', () => {
  it('uses the configured applicant id and provider', async () => {
    const source = createFakeLaunchableSource({
      applicantId: 'a-9',
      provider: 'sumsub',
    });

    await expect(source.start()).resolves.toMatchObject({
      provider: 'sumsub',
      applicantId: 'a-9',
    });
  });

  it('declines', async () => {
    const { events, onEvent } = collect();
    const source = createFakeLaunchableSource({ outcome: 'declined' });

    await expect(source.launch(session, onEvent)).resolves.toEqual({
      status: 'declined',
      applicantId: 'fake-applicant',
    });
    expect(events).toContainEqual({
      type: 'statusChanged',
      status: 'declined',
    });
  });

  it('cancels: emits cancel and resolves incomplete', async () => {
    const { events, onEvent } = collect();
    const source = createFakeLaunchableSource({ outcome: 'cancel' });

    await expect(source.launch(session, onEvent)).resolves.toEqual({
      status: 'incomplete',
      applicantId: 'fake-applicant',
    });
    expect(events).toEqual([
      { type: 'applicantLoaded', applicantId: 'fake-applicant' },
      { type: 'submitted' },
      { type: 'cancel' },
    ]);
  });

  it('fails: emits error and rejects with the code', async () => {
    const { events, onEvent } = collect();
    const source = createFakeLaunchableSource({ outcome: 'error' });

    await expect(source.launch(session, onEvent)).rejects.toEqual({
      code: 'SDK_UNAVAILABLE',
      message: 'scripted fake failure',
    });
    expect(events).toContainEqual({
      type: 'error',
      code: 'SDK_UNAVAILABLE',
      message: 'scripted fake failure',
    });
  });

  it('honours delayMs before settling', async () => {
    const { events, onEvent } = collect();
    const source = createFakeLaunchableSource({ delayMs: 5 });
    const pending = source.launch(session, onEvent);

    expect(events).toEqual([
      { type: 'applicantLoaded', applicantId: 'fake-applicant' },
      { type: 'submitted' },
    ]);
    await expect(pending).resolves.toMatchObject({ status: 'approved' });
  });
});

describe('createFakeLaunchableSource - concurrent launch', () => {
  it('rejects a second launch while one is pending, leaving the first intact', async () => {
    const { events, onEvent } = collect();
    const source = createFakeLaunchableSource({ outcome: 'manual' });
    const first = source.launch(session, onEvent);

    await expect(source.launch(session, onEvent)).rejects.toEqual({
      code: 'SDK_UNAVAILABLE',
      message: 'launch already in progress',
    });

    source.controller.approve();
    await expect(first).resolves.toMatchObject({ status: 'approved' });
    expect(events).toEqual([
      { type: 'applicantLoaded', applicantId: 'fake-applicant' },
      { type: 'submitted' },
      { type: 'statusChanged', status: 'approved' },
      { type: 'complete', status: 'approved', applicantId: 'fake-applicant' },
    ]);
  });
});

describe('createFakeLaunchableSource - manual control', () => {
  it('waits for the controller and approves on demand', async () => {
    const { events, onEvent } = collect();
    const source = createFakeLaunchableSource({ outcome: 'manual' });
    const pending = source.launch(session, onEvent);

    expect(events).toEqual([
      { type: 'applicantLoaded', applicantId: 'fake-applicant' },
      { type: 'submitted' },
    ]);
    source.controller.approve();
    await expect(pending).resolves.toEqual({
      status: 'approved',
      applicantId: 'fake-applicant',
    });
  });

  it('declines on demand', async () => {
    const { onEvent } = collect();
    const source = createFakeLaunchableSource({ outcome: 'manual' });
    const pending = source.launch(session, onEvent);

    source.controller.decline();
    await expect(pending).resolves.toMatchObject({ status: 'declined' });
  });

  it('cancels on demand', async () => {
    const { onEvent } = collect();
    const source = createFakeLaunchableSource({ outcome: 'manual' });
    const pending = source.launch(session, onEvent);

    source.controller.cancel();
    await expect(pending).resolves.toMatchObject({ status: 'incomplete' });
  });

  it('fails on demand, with and without a message', async () => {
    const { onEvent } = collect();
    const withMessage = createFakeLaunchableSource({ outcome: 'manual' });
    const first = withMessage.launch(session, onEvent);
    withMessage.controller.fail('PERMISSION_DENIED', 'no camera');
    await expect(first).rejects.toEqual({
      code: 'PERMISSION_DENIED',
      message: 'no camera',
    });

    const bare = createFakeLaunchableSource({ outcome: 'manual' });
    const second = bare.launch(session, onEvent);
    bare.controller.fail('NETWORK_ERROR');
    await expect(second).rejects.toEqual({
      code: 'NETWORK_ERROR',
      message: undefined,
    });
  });

  it('ignores controller calls before launch and after the first settle', async () => {
    const { events, onEvent } = collect();
    const source = createFakeLaunchableSource({ outcome: 'manual' });

    // before launch: nothing to settle
    expect(() => source.controller.approve()).not.toThrow();
    expect(() => source.controller.cancel()).not.toThrow();
    expect(() => source.controller.fail('NETWORK_ERROR')).not.toThrow();
    expect(events).toEqual([]);

    const pending = source.launch(session, onEvent);
    source.controller.approve();
    await expect(pending).resolves.toMatchObject({ status: 'approved' });

    const settledCount = events.length;
    source.controller.decline();
    source.controller.cancel();
    source.controller.fail('NETWORK_ERROR');
    expect(events).toHaveLength(settledCount);
  });
});
