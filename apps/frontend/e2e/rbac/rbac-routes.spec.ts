import { test } from '@playwright/test';
import { cleanupRbacFixture, createRbacFixture, type RbacFixture } from './helpers/fixture';
import { can, DB_BACKED_ROLES, ROUTE_CONTRACTS } from './helpers/permissions';
import { expectPrimaryNavForRole, expectRouteAccess, signInViaUi } from './helpers/ui';

test.describe('RBAC browser route and navigation contract', () => {
  let fixture: RbacFixture;

  test.beforeAll(async () => {
    fixture = await createRbacFixture();
  });

  test.afterAll(async () => {
    await cleanupRbacFixture(fixture);
  });

  for (const role of DB_BACKED_ROLES) {
    test(`${role} sees only allowed navigation and routes`, async ({ page }) => {
      await signInViaUi(page, fixture.users[role]);
      await expectPrimaryNavForRole(page, role);

      for (const route of ROUTE_CONTRACTS) {
        await expectRouteAccess(
          page,
          route.path,
          can(role, route.module, route.action),
        );
      }
    });
  }
});
