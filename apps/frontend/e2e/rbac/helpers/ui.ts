import { expect, type Locator, type Page } from '@playwright/test';
import { can, type DbBackedRole } from './permissions';

export async function signInViaUi(
  page: Page,
  user: { email: string; password: string },
) {
  await page.goto('/auth');
  await page.getByPlaceholder('Email address').fill(user.email);
  await page.getByPlaceholder('Password').fill(user.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 20_000 });
  await expect(appNav(page)).toBeVisible();
}

export async function expectRouteAccess(
  page: Page,
  path: string,
  shouldAllow: boolean,
) {
  await page.goto(path);
  const denied = page.getByText('Access Restricted');

  if (shouldAllow) {
    await expect(denied).toHaveCount(0);
  } else {
    await expect(denied).toBeVisible();
  }
}

export async function expectPrimaryNavForRole(page: Page, role: DbBackedRole) {
  await page.goto('/overview');
  const nav = appNav(page);
  await expect(nav).toBeVisible();

  await expect(nav.getByRole('button', { name: /^Home$/ })).toBeVisible();
  await expect(nav.getByRole('button', { name: /^3D Twin$/ })).toBeVisible();
  await expect(nav.getByRole('button', { name: /^BDT$/ })).toBeVisible();

  await expectOptionalNavButton(nav, /^Team(?:\s+\d+)?$/, can(role, 'team', 'read'));
  await expectOptionalNavButton(nav, /^Data$/, can(role, 'data', 'write'));
  await expectOptionalNavButton(nav, /^Settings$/, can(role, 'settings', 'read'));
}

function appNav(page: Page): Locator {
  return page
    .locator('nav')
    .filter({ has: page.getByRole('button', { name: /^Home$/ }) })
    .last();
}

async function expectOptionalNavButton(
  nav: Locator,
  name: RegExp,
  shouldExist: boolean,
) {
  const button = nav.getByRole('button', { name });
  if (shouldExist) {
    await expect(button).toBeVisible();
  } else {
    await expect(button).toHaveCount(0);
  }
}
