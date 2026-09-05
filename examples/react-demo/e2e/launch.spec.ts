// Browser E2E smoke: Vite serves the demo, the workspace package resolves,
// and the backend (mock provider) answers /health behind it.

import { test, expect } from '@playwright/test';

test('launch smoke: demo boots and the backend is healthy', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('app-ready')).toHaveText('KYC demo');
  await expect(page.getByTestId('package-name')).toContainText(
    '@blinkbitcoin/kyc-react',
  );
  const health = await request.get('http://localhost:4000/health');
  expect(health.ok()).toBe(true);
  expect((await health.json()).status).toBe('ok');
});
