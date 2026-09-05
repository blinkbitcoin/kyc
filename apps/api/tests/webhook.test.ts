import { vi } from 'vitest';
import { handleWebhookEvent } from '../src/webhook';

vi.mock('../src/session');
vi.mock('../src/audit');

const session = await import('../src/session');
const audit = await import('../src/audit');
const { knex } = await import('../src/db');

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

beforeEach(() => {
  vi.clearAllMocks();
  // The real canTransition is the rule under test; only I/O is mocked.
  (session.canTransition as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (current: string, next: string) =>
      current !== next && current !== 'approved' && current !== 'finallyRejected'
  );
  vi.spyOn(knex, 'transaction').mockImplementation(
    // biome-ignore lint/suspicious/noExplicitAny: knex's transaction overloads
    (async (fn: any) => fn(knex)) as any
  );
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

  it('updates the session and audits the change', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(row() as never);

    await expect(handleWebhookEvent(event(), 'mock')).resolves.toBe('updated');

    expect(session.updateSessionStatus).toHaveBeenCalledWith('session-1', 'approved', knex);
    expect(audit.logAuditEvent).toHaveBeenCalledWith(
      'session-1',
      'status_updated',
      { status: 'approved', previousStatus: 'pending', source: 'webhook' },
      knex
    );
  });

  it('binds the applicant id on the first webhook of a session that had none', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(null);
    vi.mocked(session.getLatestSessionForUser).mockResolvedValue(
      row({ providerApplicantId: null, status: 'initial' }) as never
    );

    await expect(handleWebhookEvent(event({ status: 'pending' }), 'sumsub')).resolves.toBe(
      'updated'
    );

    expect(session.getLatestSessionForUser).toHaveBeenCalledWith('user-1', 'sumsub');
    expect(session.bindApplicantId).toHaveBeenCalledWith('session-1', 'a1', knex);
    expect(session.updateSessionStatus).toHaveBeenCalledWith('session-1', 'pending', knex);
  });

  it('ignores a webhook for an unknown applicant with no external user id', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(null);
    await expect(handleWebhookEvent(event({ externalUserId: undefined }), 'sumsub')).resolves.toBe(
      'unknown_session'
    );
    expect(session.getLatestSessionForUser).not.toHaveBeenCalled();
  });

  it('ignores a webhook whose external user id has no session', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(null);
    vi.mocked(session.getLatestSessionForUser).mockResolvedValue(null);
    await expect(handleWebhookEvent(event(), 'sumsub')).resolves.toBe('unknown_session');
    expect(session.bindApplicantId).not.toHaveBeenCalled();
  });

  it('is idempotent when the status has not changed', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(
      row({ status: 'approved' }) as never
    );
    await expect(handleWebhookEvent(event(), 'mock')).resolves.toBe('unchanged');
    expect(session.updateSessionStatus).not.toHaveBeenCalled();
    expect(audit.logAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses to downgrade a terminal session and audits the rejection', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(
      row({ status: 'approved' }) as never
    );

    await expect(handleWebhookEvent(event({ status: 'declined' }), 'mock')).resolves.toBe(
      'rejected_terminal'
    );

    expect(session.updateSessionStatus).not.toHaveBeenCalled();
    expect(audit.logAuditEvent).toHaveBeenCalledWith('session-1', 'webhook_rejected', {
      status: 'declined',
      previousStatus: 'approved',
      source: 'webhook',
      reason: 'terminal_status',
    });
  });

  it('lets a declined applicant resubmit', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(
      row({ status: 'declined' }) as never
    );
    await expect(handleWebhookEvent(event({ status: 'pending' }), 'sumsub')).resolves.toBe(
      'updated'
    );
  });

  it('does not re-bind an applicant id the session already has', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(row() as never);
    await handleWebhookEvent(event(), 'mock');
    expect(session.bindApplicantId).not.toHaveBeenCalled();
  });

  it('binds the applicant id even when the resolved session already matches the status', async () => {
    vi.mocked(session.getSessionByProviderApplicantId).mockResolvedValue(null);
    vi.mocked(session.getLatestSessionForUser).mockResolvedValue(
      row({ providerApplicantId: null, status: 'approved' }) as never
    );

    await expect(handleWebhookEvent(event(), 'sumsub')).resolves.toBe('unchanged');

    expect(session.bindApplicantId).toHaveBeenCalledWith('session-1', 'a1');
    expect(session.updateSessionStatus).not.toHaveBeenCalled();
  });

  it('sanitizes the raw status it logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleWebhookEvent(event({ status: null, rawStatus: 'bad\nstatus' }), 'sumsub');
    expect(warn).toHaveBeenCalledWith(expect.not.stringContaining('\n'));
  });
});
