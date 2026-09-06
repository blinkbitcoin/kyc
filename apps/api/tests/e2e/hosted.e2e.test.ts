// The hosted page against a real session row: it renders, it is embeddable,
// and the webhook body it embeds is one the backend accepts.

import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { cleanTestData, createTestSession } from './factories';
import { knex } from './setup';

describe('hosted page (E2E)', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(async () => {
    await cleanTestData();
  });

  it('renders the mock page for a real session', async () => {
    const session = await createTestSession();
    const res = await request(app).get(`/hosted/${session.id}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('id="mock-approve"');
    expect(res.text).toContain(session.providerApplicantId);
    expect(res.text).toContain("source: 'kyc-bridge'");
    expect(res.headers['x-frame-options']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain('frame-ancestors *');
    expect(res.headers['permissions-policy']).toContain('camera=');
  });

  it('embeds a webhook the backend accepts, closing the loop', async () => {
    const session = await createTestSession({ status: 'pending' });
    const page = await request(app).get(`/hosted/${session.id}`);

    const webhooks = JSON.parse(
      page.text.match(/var WEBHOOKS = (\{.*?\});/s)![1].replace(/\\u003c/g, '<')
    ) as { approve: { url: string; body: string; signature: string } };

    const res = await request(app)
      .post('/webhook/kyc/mock')
      .set('Content-Type', 'application/json')
      .set('X-Mock-Signature', webhooks.approve.signature)
      .send(webhooks.approve.body);

    expect(res.status).toBe(200);
    expect((await knex('VerificationSession').where({ id: session.id }).first()).status).toBe(
      'approved'
    );
  });

  it('404s with the sessionExpired page for an unknown session', async () => {
    const res = await request(app).get('/hosted/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.text).toContain("post('sessionExpired')");
  });
});
