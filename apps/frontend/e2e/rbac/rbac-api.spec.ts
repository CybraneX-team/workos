import { expect, test } from '@playwright/test';
import {
  addMembership,
  cleanupAuthUsersByEmailFragment,
  cleanupRbacFixture,
  createRbacFixture,
  removeCompany,
  seedCompany,
  signInUser,
  withRbacFixture,
  type RbacFixture,
} from './helpers/fixture';
import {
  DB_BACKED_ROLES,
  READ_ONLY_TEAM_ROLES,
  ROLE_PERMISSIONS,
  TEAM_WRITE_ROLES,
  type DbBackedRole,
  type ExpandedPermissions,
} from './helpers/permissions';

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

function clonePermissions(permissions: ExpandedPermissions): ExpandedPermissions {
  return JSON.parse(JSON.stringify(permissions)) as ExpandedPermissions;
}

async function getMemberId(fixture: RbacFixture, role: DbBackedRole) {
  const { data, error } = await fixture.admin
    .from('company_members')
    .select('id')
    .eq('company_id', fixture.companyId)
    .eq('user_id', fixture.users[role].id)
    .single();

  if (error || !data) {
    throw new Error(`Failed to load ${role} member id: ${error?.message ?? 'no row returned'}`);
  }

  return data.id as string;
}

test.describe('RBAC backend API contract', () => {
  // These contracts only read state, so they share one fixture instead of
  // building (and tearing down) a fresh company + user set per test.
  test.describe('read-only contracts', () => {
    let fixture: RbacFixture;

    test.beforeAll(async () => {
      fixture = await createRbacFixture();
    });

    test.afterAll(async () => {
      await cleanupRbacFixture(fixture);
    });

    test('protected RBAC endpoints reject missing and invalid JWTs', async ({ request }) => {
      const missing = await request.get(`${fixture.env.backendUrl}/api/join-requests`);
      expect(missing.status()).toBe(401);

      const invalid = await request.get(`${fixture.env.backendUrl}/api/join-requests`, {
        headers: { Authorization: 'Bearer not-a-real-token' },
      });
      expect(invalid.status()).toBe(401);
    });

    test('/api/me returns expanded DB-backed permissions for each system role', async ({ request }) => {
      for (const role of DB_BACKED_ROLES) {
        const { accessToken } = await signInUser(fixture.users[role]);
        const response = await request.get(`${fixture.env.backendUrl}/api/me`, {
          headers: authHeaders(accessToken),
        });

        expect(response.status(), `${role} /api/me should succeed`).toBe(200);
        const body = await response.json();
        expect(body.role).toBe(role);
        expect(body.isSystemRole).toBe(true);
        expect(body.roleName).toEqual(expect.any(String));
        expect(body.permissions).toEqual(ROLE_PERMISSIONS[role]);
      }
    });

    test('/api/rbac/roles exposes expanded role matrices to team-read users', async ({ request }) => {
      for (const role of DB_BACKED_ROLES) {
        const { accessToken } = await signInUser(fixture.users[role]);
        const response = await request.get(`${fixture.env.backendUrl}/api/rbac/roles`, {
          headers: authHeaders(accessToken),
        });

        expect(response.status(), `${role} should read role matrix`).toBe(200);
        const body = await response.json();
        const systemRoles = Object.fromEntries(body.roles.map((entry: any) => [entry.id, entry]));

        for (const systemRole of DB_BACKED_ROLES) {
          expect(systemRoles[systemRole]?.isSystem).toBe(true);
          expect(systemRoles[systemRole]?.permissions).toEqual(ROLE_PERMISSIONS[systemRole]);
        }
      }
    });
  });

  test('team-write roles can create email invites and read-only roles cannot', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      try {
        for (const role of TEAM_WRITE_ROLES) {
          const { accessToken } = await signInUser(fixture.users[role]);
          const response = await request.post(`${fixture.env.backendUrl}/api/company-invites`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: {
              email: `rbac-e2e+${fixture.runId}-invite-${role}@example.com`,
            },
          });

          expect(response.status(), `${role} should be allowed to invite`).toBe(200);
        }

        for (const role of READ_ONLY_TEAM_ROLES) {
          const { accessToken } = await signInUser(fixture.users[role]);
          const response = await request.post(`${fixture.env.backendUrl}/api/company-invites`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: {
              email: `rbac-e2e+${fixture.runId}-blocked-invite-${role}@example.com`,
            },
          });

          expect(response.status(), `${role} should not be allowed to invite`).toBe(403);
        }
      } finally {
        await cleanupAuthUsersByEmailFragment(fixture.admin, `rbac-e2e+${fixture.runId}-invite`);
        await cleanupAuthUsersByEmailFragment(fixture.admin, `rbac-e2e+${fixture.runId}-blocked-invite`);
      }
    });
  });

  test('team managers can create, assign, enforce, and archive custom roles', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      const { accessToken: founderToken } = await signInUser(fixture.users.founder);
      const permissions = clonePermissions(ROLE_PERMISSIONS.viewer);
      permissions.data.write = true;

      const create = await request.post(`${fixture.env.backendUrl}/api/rbac/roles`, {
        headers: authHeaders(founderToken),
        data: {
          name: `Data Operator ${fixture.runId}`,
          description: 'RBAC E2E custom data writer',
          sourceRoleId: 'viewer',
          permissions,
        },
      });

      expect(create.status()).toBe(201);
      const { role: customRole } = await create.json();
      expect(customRole.id).toMatch(/^custom_/);
      expect(customRole.isSystem).toBe(false);
      expect(customRole.permissions.data.write).toBe(true);

      const viewerMemberId = await getMemberId(fixture, 'viewer');
      const assign = await request.patch(`${fixture.env.backendUrl}/api/team/members/${viewerMemberId}/role`, {
        headers: authHeaders(founderToken),
        data: { role: customRole.id },
      });
      expect(assign.status()).toBe(200);

      const inUseArchive = await request.post(`${fixture.env.backendUrl}/api/rbac/roles/${customRole.id}/archive`, {
        headers: authHeaders(founderToken),
      });
      expect(inUseArchive.status()).toBe(409);

      const { accessToken: customUserToken } = await signInUser(fixture.users.viewer);
      const me = await request.get(`${fixture.env.backendUrl}/api/me`, {
        headers: authHeaders(customUserToken),
      });
      expect(me.status()).toBe(200);
      const meBody = await me.json();
      expect(meBody.role).toBe(customRole.id);
      expect(meBody.roleName).toBe(customRole.name);
      expect(meBody.isSystemRole).toBe(false);
      expect(meBody.permissions.data.write).toBe(true);

      const dataWrite = await request.post(`${fixture.env.backendUrl}/api/metrics-onboarding/${fixture.companyId}/initial`, {
        headers: authHeaders(customUserToken),
        data: { mrr: 123, burn: 45, headcount: 3 },
      });
      expect(dataWrite.status()).toBe(200);

      const reset = await request.patch(`${fixture.env.backendUrl}/api/team/members/${viewerMemberId}/role`, {
        headers: authHeaders(founderToken),
        data: { role: 'viewer' },
      });
      expect(reset.status()).toBe(200);

      const archive = await request.post(`${fixture.env.backendUrl}/api/rbac/roles/${customRole.id}/archive`, {
        headers: authHeaders(founderToken),
      });
      expect(archive.status()).toBe(200);

      const assignArchived = await request.patch(`${fixture.env.backendUrl}/api/team/members/${viewerMemberId}/role`, {
        headers: authHeaders(founderToken),
        data: { role: customRole.id },
      });
      expect(assignArchived.status()).toBe(400);
    });
  });

  test('custom role APIs reject read-only users, system role edits, and permission escalation', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      const { accessToken: founderToken } = await signInUser(fixture.users.founder);
      const { accessToken: adminToken } = await signInUser(fixture.users.admin);
      const { accessToken: viewerToken } = await signInUser(fixture.users.viewer);

      const viewerCreate = await request.post(`${fixture.env.backendUrl}/api/rbac/roles`, {
        headers: authHeaders(viewerToken),
        data: {
          name: `Viewer attempt ${fixture.runId}`,
          sourceRoleId: 'viewer',
          permissions: ROLE_PERMISSIONS.viewer,
        },
      });
      expect(viewerCreate.status()).toBe(403);

      const editSystem = await request.patch(`${fixture.env.backendUrl}/api/rbac/roles/viewer`, {
        headers: authHeaders(founderToken),
        data: { name: 'Renamed Viewer' },
      });
      expect(editSystem.status()).toBe(403);

      const archiveSystem = await request.post(`${fixture.env.backendUrl}/api/rbac/roles/viewer/archive`, {
        headers: authHeaders(founderToken),
      });
      expect(archiveSystem.status()).toBe(403);

      const adminFounderCopy = await request.post(`${fixture.env.backendUrl}/api/rbac/roles`, {
        headers: authHeaders(adminToken),
        data: {
          name: `Escalated copy ${fixture.runId}`,
          sourceRoleId: 'founder',
        },
      });
      expect(adminFounderCopy.status()).toBe(403);

      const privilegedCopy = await request.post(`${fixture.env.backendUrl}/api/rbac/roles`, {
        headers: authHeaders(founderToken),
        data: {
          name: `Privileged custom ${fixture.runId}`,
          sourceRoleId: 'founder',
        },
      });
      expect(privilegedCopy.status()).toBe(201);
      const { role: privilegedRole } = await privilegedCopy.json();

      const adminRename = await request.patch(`${fixture.env.backendUrl}/api/rbac/roles/${privilegedRole.id}`, {
        headers: authHeaders(adminToken),
        data: { name: `Admin renamed ${fixture.runId}` },
      });
      expect(adminRename.status()).toBe(403);
    });
  });

  test('data.write endpoints allow engineers and reject viewer/investor roles', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      const { accessToken: engineerToken } = await signInUser(fixture.users.engineer);
      const engineer = await request.post(`${fixture.env.backendUrl}/api/metrics-onboarding/${fixture.companyId}/initial`, {
        headers: authHeaders(engineerToken),
        data: { mrr: 1000, burn: 500, headcount: 2 },
      });
      expect(engineer.status()).toBe(200);

      for (const role of ['viewer', 'investor'] as const) {
        const { accessToken } = await signInUser(fixture.users[role]);
        const response = await request.post(`${fixture.env.backendUrl}/api/metrics-onboarding/${fixture.companyId}/initial`, {
          headers: authHeaders(accessToken),
          data: { mrr: 9999 },
        });
        expect(response.status(), `${role} should not write metrics`).toBe(403);
      }
    });
  });

  test('member removal requires team.delete', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      const analystMemberId = await getMemberId(fixture, 'analyst');

      for (const role of ['co_founder', 'admin'] as const) {
        const { accessToken } = await signInUser(fixture.users[role]);
        const response = await request.delete(`${fixture.env.backendUrl}/api/team/members/${analystMemberId}`, {
          headers: authHeaders(accessToken),
        });
        expect(response.status(), `${role} should not remove members`).toBe(403);
      }

      const { accessToken: founderToken } = await signInUser(fixture.users.founder);
      const founder = await request.delete(`${fixture.env.backendUrl}/api/team/members/${analystMemberId}`, {
        headers: authHeaders(founderToken),
      });
      expect(founder.status()).toBe(200);

      const { data: member } = await fixture.admin
        .from('company_members')
        .select('status')
        .eq('id', analystMemberId)
        .single();
      expect(member?.status).toBe('removed');
    });
  });

  test('read-only team roles cannot list pending join requests through the backend', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      for (const role of READ_ONLY_TEAM_ROLES) {
        const { accessToken } = await signInUser(fixture.users[role]);
        const response = await request.get(`${fixture.env.backendUrl}/api/join-requests`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        expect(response.status(), `${role} should not list pending join requests`).toBe(403);
      }
    });
  });

  test('team manager can approve a pending join request through the backend', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      const { accessToken } = await signInUser(fixture.users.founder);
      const response = await request.post(`${fixture.env.backendUrl}/api/join-requests/${fixture.pendingRequestId}/approve`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { assignedRole: 'viewer' },
      });

      expect(response.status()).toBe(200);

      const { data: requestRow } = await fixture.admin
        .from('join_requests')
        .select('status, reviewed_by, assigned_role')
        .eq('id', fixture.pendingRequestId)
        .single();
      expect(requestRow?.status).toBe('approved');
      expect(requestRow?.reviewed_by).toBe(fixture.users.founder.id);
      expect(requestRow?.assigned_role).toBe('viewer');

      const { data: memberRow } = await fixture.admin
        .from('company_members')
        .select('role, status')
        .eq('company_id', fixture.companyId)
        .eq('user_id', fixture.pendingUser.id)
        .single();
      expect(memberRow?.role).toBe('viewer');
      expect(memberRow?.status).toBe('active');
    });
  });

  test('separate join-request notification endpoint is removed', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      const { accessToken } = await signInUser(fixture.users.viewer);
      const response = await request.post(
        `${fixture.env.backendUrl}/api/join-requests/${fixture.pendingRequestId}/notify`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      expect(response.status()).toBe(404);
    });
  });

  // ---- P0: founder / self / protected-role guards (team.ts) ----

  test('cannot demote or remove the last founder', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      const { accessToken: superToken } = await signInUser(fixture.users.super_admin);
      const founderMemberId = await getMemberId(fixture, 'founder');

      const demote = await request.patch(
        `${fixture.env.backendUrl}/api/team/members/${founderMemberId}/role`,
        { headers: authHeaders(superToken), data: { role: 'viewer' } },
      );
      expect(demote.status()).toBe(409);
      expect((await demote.json()).error).toBe('last_founder');

      const remove = await request.delete(
        `${fixture.env.backendUrl}/api/team/members/${founderMemberId}`,
        { headers: authHeaders(superToken) },
      );
      expect(remove.status()).toBe(409);
      expect((await remove.json()).error).toBe('last_founder');

      // The founder must still be active and unchanged.
      const { data: member } = await fixture.admin
        .from('company_members')
        .select('role, status')
        .eq('id', founderMemberId)
        .single();
      expect(member?.role).toBe('founder');
      expect(member?.status).toBe('active');
    });
  });

  test('actors cannot change their own role or remove themselves', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      const { accessToken: founderToken } = await signInUser(fixture.users.founder);
      const founderMemberId = await getMemberId(fixture, 'founder');

      const changeSelf = await request.patch(
        `${fixture.env.backendUrl}/api/team/members/${founderMemberId}/role`,
        { headers: authHeaders(founderToken), data: { role: 'co_founder' } },
      );
      expect(changeSelf.status()).toBe(403);
      expect((await changeSelf.json()).error).toBe('cannot_change_self');

      const removeSelf = await request.delete(
        `${fixture.env.backendUrl}/api/team/members/${founderMemberId}`,
        { headers: authHeaders(founderToken) },
      );
      expect(removeSelf.status()).toBe(403);
      expect((await removeSelf.json()).error).toBe('cannot_remove_self');
    });
  });

  test('protected targets can only be modified by sufficiently privileged actors', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      // admin (team.write) cannot touch a founder.
      const { accessToken: adminToken } = await signInUser(fixture.users.admin);
      const founderMemberId = await getMemberId(fixture, 'founder');
      const adminVsFounder = await request.patch(
        `${fixture.env.backendUrl}/api/team/members/${founderMemberId}/role`,
        { headers: authHeaders(adminToken), data: { role: 'viewer' } },
      );
      expect(adminVsFounder.status()).toBe(403);
      expect((await adminVsFounder.json()).error).toBe('protected_role');

      // founder (team.delete) still cannot remove a super_admin.
      const { accessToken: founderToken } = await signInUser(fixture.users.founder);
      const superMemberId = await getMemberId(fixture, 'super_admin');
      const founderVsSuper = await request.delete(
        `${fixture.env.backendUrl}/api/team/members/${superMemberId}`,
        { headers: authHeaders(founderToken) },
      );
      expect(founderVsSuper.status()).toBe(403);
      expect((await founderVsSuper.json()).error).toBe('protected_role');
    });
  });

  test('protected roles cannot be assigned via member role change', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      const { accessToken: founderToken } = await signInUser(fixture.users.founder);
      const viewerMemberId = await getMemberId(fixture, 'viewer');

      for (const role of ['founder', 'super_admin'] as const) {
        const response = await request.patch(
          `${fixture.env.backendUrl}/api/team/members/${viewerMemberId}/role`,
          { headers: authHeaders(founderToken), data: { role } },
        );
        expect(response.status(), `assigning ${role} should be rejected`).toBe(400);
        expect((await response.json()).error).toBe('invalid_role');
      }
    });
  });

  test('actors cannot assign a role whose permissions exceed their own', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      const { accessToken: founderToken } = await signInUser(fixture.users.founder);

      // Founder creates a custom role with team.delete — a permission admin lacks.
      const permissions = clonePermissions(ROLE_PERMISSIONS.admin);
      permissions.team.delete = true;
      const create = await request.post(`${fixture.env.backendUrl}/api/rbac/roles`, {
        headers: authHeaders(founderToken),
        data: {
          name: `Team Deleter ${fixture.runId}`,
          sourceRoleId: 'admin',
          permissions,
        },
      });
      expect(create.status()).toBe(201);
      const { role: customRole } = await create.json();

      // Admin (no team.delete) must not be able to hand out that role.
      const { accessToken: adminToken } = await signInUser(fixture.users.admin);
      const analystMemberId = await getMemberId(fixture, 'analyst');
      const assign = await request.patch(
        `${fixture.env.backendUrl}/api/team/members/${analystMemberId}/role`,
        { headers: authHeaders(adminToken), data: { role: customRole.id } },
      );
      expect(assign.status()).toBe(400);
      expect((await assign.json()).error).toBe('invalid_role');
    });
  });

  // ---- P1: regression coverage for the simplified authJwt / profile defaults ----

  test('authJwt resolves the profile-selected company and self-heals drift', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      const user = fixture.users.engineer; // engineer in company A
      const companyB = await seedCompany(fixture.admin, fixture.runId, 'authjwt-b');

      try {
        await addMembership(fixture.admin, companyB, user.id, 'admin');
        const { accessToken } = await signInUser(user);

        const meAt = async () => {
          const res = await request.get(`${fixture.env.backendUrl}/api/me`, {
            headers: authHeaders(accessToken),
          });
          expect(res.status()).toBe(200);
          return res.json();
        };

        // Profile points at company B → resolve the B membership.
        await fixture.admin
          .from('user_profiles')
          .update({ company_id: companyB, role: 'admin' })
          .eq('id', user.id);
        let body = await meAt();
        expect(body.company_id).toBe(companyB);
        expect(body.role).toBe('admin');

        // Profile points at company A → resolve the A membership.
        await fixture.admin
          .from('user_profiles')
          .update({ company_id: fixture.companyId, role: 'engineer' })
          .eq('id', user.id);
        body = await meAt();
        expect(body.company_id).toBe(fixture.companyId);
        expect(body.role).toBe('engineer');

        // Drift: profile points at B but the B membership is gone → fall back to
        // the only remaining active membership (A) and self-heal the profile.
        await fixture.admin
          .from('company_members')
          .delete()
          .eq('company_id', companyB)
          .eq('user_id', user.id);
        await fixture.admin
          .from('user_profiles')
          .update({ company_id: companyB, role: 'admin' })
          .eq('id', user.id);

        body = await meAt();
        expect(body.company_id).toBe(fixture.companyId);
        expect(body.role).toBe('engineer');

        const { data: healed } = await fixture.admin
          .from('user_profiles')
          .select('company_id, role')
          .eq('id', user.id)
          .single();
        expect(healed?.company_id).toBe(fixture.companyId);
        expect(healed?.role).toBe('engineer');
      } finally {
        await removeCompany(fixture.admin, companyB);
      }
    });
  });

  test('/api/me returns safe viewer defaults for a user with no company', async ({ request }) => {
    await withRbacFixture(test.info(), async (fixture) => {
      const { accessToken } = await signInUser(fixture.pendingUser);
      const response = await request.get(`${fixture.env.backendUrl}/api/me`, {
        headers: authHeaders(accessToken),
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.company_id).toBeNull();
      expect(body.role).toBe('viewer');
      expect(body.isSystemRole).toBe(true);
      expect(body.permissions).toEqual(ROLE_PERMISSIONS.viewer);
    });
  });
});
