// Browser E2E, proxy mode (VITE_KYC_MODE=proxy, :5174). The backend owns the
// session lifecycle: verificationSessionStart returns the page url plus the
// allowedOrigin, the page's Approve posts the SIGNED mock webhook, and the
// backend's terminal-state machine records the result. Two journeys are
// enough here - the embedding mechanism itself is covered by hosted.spec.ts.

import { expect, test, type FrameLocator, type Page } from '@playwright/test';

const verificationFrame = (page: Page): FrameLocator =>
  page.frameLocator('[data-testid="verification-iframe"]');

const startVerification = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('mode-label')).toHaveText('mode: proxy');
  await page.getByTestId('verification-start-button').click();
  await expect(page.getByTestId('verification-iframe')).toBeVisible();
  await expect(
    verificationFrame(page).getByRole('button', { name: 'Approve' }),
  ).toBeVisible();
};

test('launch smoke: the proxy build boots to the idle screen', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('mode-label')).toHaveText('mode: proxy');
  await expect(page.getByTestId('verification-start-button')).toBeVisible();
});

test('happy path: the backend mints the session and records the approval', async ({
  page,
}) => {
  await startVerification(page);

  await verificationFrame(page)
    .getByRole('button', { name: 'Approve' })
    .click();

  await expect(page.getByTestId('success-screen')).toBeVisible();
  await expect(page.getByTestId('outcome')).toHaveText('completed: approved', {
    timeout: 10_000,
  });
});

test('cancel from inside the page returns to idle', async ({ page }) => {
  await startVerification(page);

  await verificationFrame(page).getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByTestId('outcome')).toHaveText('cancelled');
  await expect(page.getByTestId('verification-start-button')).toBeVisible();
});
