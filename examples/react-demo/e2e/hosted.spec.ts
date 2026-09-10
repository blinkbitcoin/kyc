// Browser E2E: the same five journeys the Maestro suite drives on mobile,
// through a real Chromium, a real backend (mock provider), a real Postgres,
// and a real CROSS-ORIGIN iframe (app on the worktree's Vite port, the
// verification page on its backend port - e2e/ports.ts).

import { expect, test, type FrameLocator, type Page } from '@playwright/test';

const verificationFrame = (page: Page): FrameLocator =>
  page.frameLocator('[data-testid="verification-iframe"]');

const startVerification = async (page: Page) => {
  await page.goto('/');
  await page.getByTestId('verification-start-button').click();
  await expect(page.getByTestId('verification-iframe')).toBeVisible();
  await expect(
    verificationFrame(page).getByRole('button', { name: 'Approve' }),
  ).toBeVisible();
};

test('happy path: approve in the embedded page, see success and the outcome', async ({
  page,
}) => {
  await startVerification(page);

  await verificationFrame(page)
    .getByRole('button', { name: 'Approve' })
    .click();

  // The component shows success immediately; onComplete fires after
  // successDelayMs (4s).
  await expect(page.getByTestId('success-screen')).toBeVisible();
  await expect(page.getByTestId('outcome')).toHaveText('completed: approved', {
    timeout: 10_000,
  });
});

test('decline is a terminal outcome, not an error', async ({ page }) => {
  await startVerification(page);

  await verificationFrame(page)
    .getByRole('button', { name: 'Decline' })
    .click();

  await expect(page.getByTestId('pending-screen')).toBeVisible();
  await expect(page.getByTestId('outcome')).toHaveText('completed: declined');
});

test('cancel from inside the page returns to idle', async ({ page }) => {
  await startVerification(page);

  await verificationFrame(page).getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByTestId('outcome')).toHaveText('cancelled');
  await expect(page.getByTestId('verification-start-button')).toBeVisible();
});

test('an expired token is refreshed and re-injected without the user noticing', async ({
  page,
}) => {
  await startVerification(page);
  const frame = verificationFrame(page);

  await frame.getByRole('button', { name: 'Expire the token' }).click();

  // The page only acknowledges a well-formed setToken envelope, and it
  // acknowledges IN THE PAGE (no bridge event): an idempotent
  // #mock-token-refreshed paragraph plus body[data-token-refreshed]. That is
  // the proof of the full page -> app -> backend -> app -> page round trip.
  await expect(frame.locator('#mock-token-refreshed')).toHaveText(
    'Token refreshed',
    { timeout: 15_000 },
  );
  await expect(frame.locator('body')).toHaveAttribute(
    'data-token-refreshed',
    'true',
  );

  // The component never left `verifying`: the frame is still visible and
  // interactive, and the review wait was never entered.
  await expect(page.getByTestId('verification-iframe')).toBeVisible();
  await expect(page.getByTestId('pending-screen')).toHaveCount(0);

  // ...which is what makes the session still finishable with the new token.
  await frame.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByTestId('success-screen')).toBeVisible();
  await expect(page.getByTestId('outcome')).toHaveText('completed: approved', {
    timeout: 10_000,
  });
});

test('a provider error offers Try again, and retrying mints a fresh session', async ({
  page,
}) => {
  await startVerification(page);

  await verificationFrame(page)
    .getByRole('button', { name: 'Simulate an error' })
    .click();

  await expect(page.getByTestId('error-screen')).toBeVisible();
  await expect(page.getByTestId('retry-button')).toBeVisible();
  await expect(page.getByTestId('outcome')).toHaveText('error: MOCK_ERROR');

  await page.getByTestId('retry-button').click();
  await expect(page.getByTestId('verification-iframe')).toBeVisible();
  await expect(
    verificationFrame(page).getByRole('button', { name: 'Approve' }),
  ).toBeVisible();
});
