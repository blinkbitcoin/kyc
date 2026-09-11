// The hosted page against a real session row: it renders, it is embeddable,
// and the webhook body it embeds is one the backend accepts.

import { asJson, envApp, get, post } from '../support/app';
import { cleanTestData, createTestSession } from './factories';
import { knex } from './setup';

describe('hosted page (E2E)', () => {
  const app = envApp();

  afterAll(async () => {
    await app.stop();
  });

  beforeEach(async () => {
    await cleanTestData();
  });

  it('renders the mock page for a real session', async () => {
    const session = await createTestSession();
    const res = await get(app, `/hosted/${session.id}`);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain('id="mock-approve"');
    expect(text).toContain(session.providerApplicantId);
    expect(text).toContain("var BRIDGE_SOURCE = 'kyc-bridge';");
    // A refreshed token is acknowledged in the DOM, not over the bridge, so
    // the page stays interactive and a later Approve / Decline still works.
    expect(text).toContain("document.body.dataset.tokenRefreshed = 'true'");
    expect(text).toContain("ack.id = 'mock-token-refreshed'");
    expect(res.headers.get('x-frame-options')).toBeNull();
    expect(res.headers.get('content-security-policy')).toContain('frame-ancestors *');
    expect(res.headers.get('permissions-policy')).toContain('camera=');
  });

  it('embeds a webhook the backend accepts, closing the loop', async () => {
    const session = await createTestSession({ status: 'pending' });
    const page = await (await get(app, `/hosted/${session.id}`)).text();

    const webhooks = JSON.parse(
      page.match(/var WEBHOOKS = (\{.*?\});/s)![1].replace(/\\u003c/g, '<')
    ) as { approve: { url: string; body: string; signature: string } };

    const res = await post(app, '/webhook/kyc/mock', webhooks.approve.body, {
      'x-mock-signature': webhooks.approve.signature,
    });

    expect(res.status).toBe(200);
    expect(await asJson(res)).toMatchObject({ received: true });
    expect((await knex('VerificationSession').where({ id: session.id }).first()).status).toBe(
      'approved'
    );
  });

  it('404s with the sessionExpired page for an unknown session', async () => {
    const res = await get(app, '/hosted/00000000-0000-5100-8000-000000000000');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("post('sessionExpired')");
  });
});
