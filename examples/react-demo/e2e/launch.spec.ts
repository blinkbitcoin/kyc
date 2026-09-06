// Browser E2E smoke: Vite serves the demo, the library renders its idle
// screen, and the backend (mock provider) answers /health behind it.

import { expect, test } from '@playwright/test';

test('launch smoke: demo boots to the idle screen and the backend is healthy', async ({
  page,
  request,
}) => {
  await page.goto('/');

  await expect(page.getByTestId('mode-label')).toHaveText('mode: hosted');
  await expect(page.getByTestId('verification-start-button')).toBeVisible();
  await expect(page.getByTestId('reset-button')).toBeVisible();
  await expect(page.getByTestId('outcome')).toHaveText('no outcome yet');

  const health = await request.get('http://localhost:4000/health');
  expect(health.ok()).toBe(true);
  expect((await health.json()).status).toBe('ok');
});
