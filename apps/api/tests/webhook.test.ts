import { vi } from 'vitest';
import { handleWebhookEvent } from '../src/webhook';

vi.mock('../src/session');

const session = await import('../src/session');

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'session-1',
  userId: 'user-1',
  provider: 'mock',
  providerApplicantId: 'a1',
  levelName: null,
  platform: 'WEB',
  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const event = (over: Partial<Record<string, unknown>> = {}) => ({
  providerApplicantId: 'a1',
  externalUserId: 'user-1',
  status: 'approved' as const,
  rawStatus: 'applicantReviewed:completed',
  ...over,
});

const transition = (outcome: string, over: Record<string, unknown> = {}) =>
  ({
    outcome,
    previousStatus: 'pending',
    session: row(over),
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(session.applyStatusTransition).mockResolvedValue(transition('updated'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('handleWebhookEvent', () => {
  it('ignores an event with no actionable status', async () => {
    await expect(handleWebhookEvent(event({ status: null }), 'sumsub')).resolves.toBe(
      'ignored_unknown_status'
    );
    expect(session.getSessionByProviderApplicantId).not.toHaveBeenCalled();
  });

  it('applies the event through the shared conditional write', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(row() as never);

    await expect(handleWebhookEvent(event(), 'mock')).resolves.toBe('updated');

    expect(session.applyStatusTransition).toHaveBeenCalledWith(
      'session-1',
      'approved',
      'webhook',
      {}
    );
  });

  it('binds the applicant id in the same write on the first webhook of a session', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(null);
    vi.mocked(session.getLatestSessionForUser).mockResolvedValue(
      row({ providerApplicantId: null, status: 'initial' }) as never
    );

    await expect(handleWebhookEvent(event({ status: 'pending' }), 'sumsub')).resolves.toBe(
      'updated'
    );

    expect(session.getLatestSessionForUser).toHaveBeenCalledWith('user-1', 'sumsub');
    expect(session.applyStatusTransition).toHaveBeenCalledWith('session-1', 'pending', 'webhook', {
      bindApplicantId: 'a1',
    });
  });

  it('ignores a webhook for an unknown applicant with no external user id', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(null);
    await expect(handleWebhookEvent(event({ externalUserId: undefined }), 'sumsub')).resolves.toBe(
      'unknown_session'
    );
    expect(session.getLatestSessionForUser).not.toHaveBeenCalled();
  });

  it('ignores a webhook whose external user id has no unbound session', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(null);
    vi.mocked(session.getLatestSessionForUser).mockResolvedValue(null);
    await expect(handleWebhookEvent(event(), 'sumsub')).resolves.toBe('unknown_session');
    expect(session.applyStatusTransition).not.toHaveBeenCalled();
  });

  it('reports an idempotent redelivery as unchanged', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(
      row({ status: 'approved' }) as never
    );
    vi.mocked(session.applyStatusTransition).mockResolvedValue(transition('unchanged'));
    await expect(handleWebhookEvent(event(), 'mock')).resolves.toBe('unchanged');
  });

  it('reports and logs a refused downgrade of a terminal session', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(
      row({ status: 'approved' }) as never
    );
    vi.mocked(session.applyStatusTransition).mockResolvedValue(transition('rejected_terminal'));

    await expect(handleWebhookEvent(event({ status: 'declined' }), 'mock')).resolves.toBe(
      'rejected_terminal'
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('is terminal'));
  });

  it('reports and logs an event whose session was bound to another applicant meanwhile', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(null);
    vi.mocked(session.getLatestSessionForUser).mockResolvedValue(
      row({ providerApplicantId: null, status: 'initial' }) as never
    );
    vi.mocked(session.applyStatusTransition).mockResolvedValue(transition('rejected_unbound'));

    await expect(handleWebhookEvent(event({ status: 'pending' }), 'sumsub')).resolves.toBe(
      'rejected_unbound'
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('different provider applicant'));
  });

  it('sanitizes the raw status it logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleWebhookEvent(event({ status: null, rawStatus: 'bad\nstatus' }), 'sumsub');
    expect(warn).toHaveBeenCalledWith(expect.not.stringContaining('\n'));
  });
});
