import { expect, test } from '@playwright/test';
import { cleanupRbacFixture, createRbacFixture, type RbacFixture } from './helpers/fixture';
import { MODULES, READ_ONLY_TEAM_ROLES, TEAM_WRITE_ROLES } from './helpers/permissions';
import { signInViaUi } from './helpers/ui';

test.describe('RBAC team management UI contract', () => {
  let fixture: RbacFixture;

  test.beforeAll(async () => {
    fixture = await createRbacFixture();
  });

  test.afterAll(async () => {
    await cleanupRbacFixture(fixture);
  });

  for (const role of TEAM_WRITE_ROLES) {
    test(`${role} can see team-management controls`, async ({ page }) => {
      await signInViaUi(page, fixture.users[role]);
      await page.goto('/twin/team');

      await expect(page.getByText('Team & Access')).toBeVisible();
      await expect(page.getByRole('button', { name: /Members/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Join Requests/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Invite$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Permissions/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Invite Member/i })).toBeVisible();

      await page.getByRole('button', { name: /Join Requests/i }).click();
      await expect(page.getByText('Pending Join Requests')).toBeVisible();
      await expect(page.getByText(`${fixture.pendingUser.firstName} ${fixture.pendingUser.lastName}`)).toBeVisible();
      await expect(page.getByRole('button', { name: /Approve/i })).toBeVisible();
    });
  }

  for (const role of READ_ONLY_TEAM_ROLES) {
    test(`${role} can read team but cannot see team-management controls`, async ({ page }) => {
      await signInViaUi(page, fixture.users[role]);
      await page.goto('/twin/team');

      await expect(page.getByText('Team & Access')).toBeVisible();
      await expect(page.getByRole('button', { name: /Members/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Permissions/i })).toBeVisible();

      await expect(page.getByRole('button', { name: /Join Requests/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Invite$/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Invite Member/i })).toHaveCount(0);
      await expect(page.getByText('Pending Join Requests')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Approve/i })).toHaveCount(0);
      await expect(page.getByRole('combobox')).toHaveCount(0);
    });
  }

  test('permission display includes every RBAC module and action', async ({ page }) => {
    await signInViaUi(page, fixture.users.founder);
    await page.goto('/twin/team');
    await page.getByRole('button', { name: /Permissions/i }).click();

    await expect(page.getByText('Permission Matrix')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^Read$/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^Write$/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^Delete$/i })).toBeVisible();

    for (const module of MODULES) {
      await expect(page.getByRole('cell', { name: new RegExp(`^${module}$`, 'i') })).toBeVisible();
    }
  });
});
