import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TestInfo } from '@playwright/test';
import { getRbacE2EEnv, type RbacE2EEnv } from './env';
import { DB_BACKED_ROLES, type DbBackedRole } from './permissions';

export interface SeededUser {
  id: string;
  email: string;
  password: string;
  role: DbBackedRole;
  firstName: string;
  lastName: string;
}

export interface PendingUser {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface RbacFixture {
  env: RbacE2EEnv;
  admin: SupabaseClient;
  runId: string;
  companyId: string;
  companySlug: string;
  users: Record<DbBackedRole, SeededUser>;
  pendingUser: PendingUser;
  pendingRequestId: string;
}

export interface SignedInUserClient {
  client: SupabaseClient;
  accessToken: string;
}

const PASSWORD = 'Rbac-e2e-123456!';

function slugPart(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

function makeRunId(testInfo?: TestInfo): string {
  const titlePart = testInfo ? slugPart(testInfo.title) : 'run';
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${titlePart}-${timePart}-${randomPart}`;
}

export function createAdminClient(env = getRbacE2EEnv()): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createAnonClient(env = getRbacE2EEnv()): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function createAuthUser(admin: SupabaseClient, opts: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
    user_metadata: {
      first_name: opts.firstName,
      last_name: opts.lastName,
    },
  });

  if (error || !data.user) {
    throw new Error(`Failed to create test auth user ${opts.email}: ${error?.message ?? 'no user returned'}`);
  }

  return data.user.id;
}

async function createRoleUser(
  admin: SupabaseClient,
  runId: string,
  role: DbBackedRole,
  companyId: string,
  invitedBy: string | null,
): Promise<SeededUser> {
  const firstName = `RBAC ${role.replace('_', ' ')}`;
  const lastName = 'E2E';
  const email = `rbac-e2e+${runId}-${role}@example.com`;
  const id = await createAuthUser(admin, { email, password: PASSWORD, firstName, lastName });

  const { error: profileError } = await admin.from('user_profiles').upsert(
    {
      id,
      company_id: companyId,
      role,
      first_name: firstName,
      last_name: lastName,
      title: `E2E ${role}`,
      onboarding_completed: true,
    },
    { onConflict: 'id' },
  );
  if (profileError) throw new Error(`Failed to seed profile for ${role}: ${profileError.message}`);

  const { error: memberError } = await admin.from('company_members').insert({
    company_id: companyId,
    user_id: id,
    role,
    status: 'active',
    invited_by: invitedBy,
    approved_at: new Date().toISOString(),
  });
  if (memberError) throw new Error(`Failed to seed company member for ${role}: ${memberError.message}`);

  return { id, email, password: PASSWORD, role, firstName, lastName };
}

async function createPendingJoinUser(
  admin: SupabaseClient,
  runId: string,
  companyId: string,
): Promise<{ user: PendingUser; requestId: string }> {
  const firstName = 'RBAC Pending';
  const lastName = 'E2E';
  const email = `rbac-e2e+${runId}-pending@example.com`;
  const id = await createAuthUser(admin, { email, password: PASSWORD, firstName, lastName });

  const { error: profileError } = await admin.from('user_profiles').upsert(
    {
      id,
      company_id: null,
      role: 'viewer',
      first_name: firstName,
      last_name: lastName,
      title: 'Pending join requester',
      onboarding_completed: true,
    },
    { onConflict: 'id' },
  );
  if (profileError) throw new Error(`Failed to seed pending profile: ${profileError.message}`);

  const { data: joinRequest, error: requestError } = await admin
    .from('join_requests')
    .insert({
      company_id: companyId,
      user_id: id,
      requested_role: 'viewer',
      message: `RBAC E2E request ${runId}`,
      status: 'pending',
    })
    .select('id')
    .single();
  if (requestError || !joinRequest) {
    throw new Error(`Failed to seed pending join request: ${requestError?.message ?? 'no request returned'}`);
  }

  return {
    user: { id, email, password: PASSWORD, firstName, lastName },
    requestId: joinRequest.id,
  };
}

export async function createRbacFixture(testInfo?: TestInfo): Promise<RbacFixture> {
  const env = getRbacE2EEnv();
  const admin = createAdminClient(env);
  const runId = makeRunId(testInfo);
  const companySlug = `rbac-e2e-${runId}`;

  const { data: company, error: companyError } = await admin
    .from('companies')
    .insert({
      name: `RBAC E2E ${runId}`,
      slug: companySlug,
      stage: 'Seed',
      country: 'India',
      description: 'Disposable RBAC E2E company',
      status: 'active',
      is_public: false,
      offset_3d: { x: 0, y: 0, z: 0 },
    })
    .select('id')
    .single();

  if (companyError || !company) {
    throw new Error(`Failed to seed RBAC company: ${companyError?.message ?? 'no company returned'}`);
  }

  const users = {} as Record<DbBackedRole, SeededUser>;

  for (const role of DB_BACKED_ROLES) {
    const invitedBy = users.founder?.id ?? null;
    users[role] = await createRoleUser(admin, runId, role, company.id, invitedBy);
  }

  const pending = await createPendingJoinUser(admin, runId, company.id);

  return {
    env,
    admin,
    runId,
    companyId: company.id,
    companySlug,
    users,
    pendingUser: pending.user,
    pendingRequestId: pending.requestId,
  };
}

/**
 * Create an extra disposable company (e.g. a secondary org for multi-company
 * authJwt tests). Caller is responsible for cleanup via removeCompany().
 */
export async function seedCompany(
  admin: SupabaseClient,
  runId: string,
  suffix: string,
): Promise<string> {
  const { data, error } = await admin
    .from('companies')
    .insert({
      name: `RBAC E2E ${runId}-${suffix}`,
      slug: `rbac-e2e-${runId}-${suffix}`,
      stage: 'Seed',
      country: 'India',
      description: 'Disposable RBAC E2E secondary company',
      status: 'active',
      is_public: false,
      offset_3d: { x: 0, y: 0, z: 0 },
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to seed secondary company: ${error?.message ?? 'no company returned'}`);
  }
  return data.id as string;
}

/** Add an existing user as an active member of a company. */
export async function addMembership(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  role: DbBackedRole,
): Promise<void> {
  const { error } = await admin.from('company_members').insert({
    company_id: companyId,
    user_id: userId,
    role,
    status: 'active',
    approved_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Failed to add membership (${role}@${companyId}): ${error.message}`);
}

/** Tear down an extra company seeded with seedCompany(). */
export async function removeCompany(admin: SupabaseClient, companyId: string): Promise<void> {
  await deleteFromTable(admin, 'company_members', 'company_id', companyId);
  await deleteFromTable(admin, 'companies', 'id', companyId);
}

async function deleteFromTable(admin: SupabaseClient, table: string, column: string, value: string) {
  const { error } = await admin.from(table).delete().eq(column, value);
  if (error && error.code !== 'PGRST116') {
    console.warn(`[rbac-e2e] cleanup warning for ${table}:`, error.message);
  }
}

export async function cleanupAuthUsersByEmailFragment(admin: SupabaseClient, fragment: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.warn('[rbac-e2e] auth cleanup listUsers warning:', error.message);
      return;
    }

    const users = data.users.filter((user) => user.email?.includes(fragment));
    await Promise.all(
      users.map((user) =>
        admin.auth.admin.deleteUser(user.id).catch((err) =>
          console.warn('[rbac-e2e] auth cleanup deleteUser warning:', err.message),
        ),
      ),
    );

    if (data.users.length < 1000) break;
  }
}

export async function cleanupRbacFixture(fixture: RbacFixture | null | undefined) {
  if (!fixture) return;
  const { admin, companyId, runId } = fixture;

  await deleteFromTable(admin, 'mentor_sessions', 'company_id', companyId);
  await deleteFromTable(admin, 'vc_mentors', 'company_id', companyId);
  await deleteFromTable(admin, 'investor_updates', 'company_id', companyId);
  await deleteFromTable(admin, 'investor_pipeline', 'company_id', companyId);
  await deleteFromTable(admin, 'metric_snapshots', 'company_id', companyId);
  await deleteFromTable(admin, 'join_requests', 'company_id', companyId);
  await deleteFromTable(admin, 'workspace_invites', 'company_id', companyId);
  await deleteFromTable(admin, 'company_members', 'company_id', companyId);
  await deleteFromTable(admin, 'companies', 'id', companyId);
  await cleanupAuthUsersByEmailFragment(admin, `rbac-e2e+${runId}`);
}

export async function withRbacFixture<T>(
  testInfo: TestInfo,
  fn: (fixture: RbacFixture) => Promise<T>,
): Promise<T> {
  let fixture: RbacFixture | null = null;
  try {
    fixture = await createRbacFixture(testInfo);
    return await fn(fixture);
  } finally {
    await cleanupRbacFixture(fixture);
  }
}

export async function signInUser(user: { email: string; password: string }): Promise<SignedInUserClient> {
  const client = createAnonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  if (error || !data.session) {
    throw new Error(`Failed to sign in ${user.email}: ${error?.message ?? 'no session returned'}`);
  }

  return {
    client,
    accessToken: data.session.access_token,
  };
}
