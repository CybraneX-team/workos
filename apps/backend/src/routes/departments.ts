import { Router } from 'express';
import { pool, supabaseAdmin } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { requirePermission } from '../rbac.js';
import {
  accessAllows,
  getActiveMemberId,
  getDepartmentAccess,
  getDepartmentAccessMap,
  getNodeDepartmentId,
  isGlobalDepartmentActor,
  requireDepartmentAccess,
  requireTwinAndTeamWrite,
  type DepartmentAccess,
  type DepartmentActor,
} from '../departmentAccess.js';
import {
  DOMAINS,
  NODE_TYPES,
  BRANCH_KINDS,
  NODE_LEVELS,
  type Domain,
  type NodeType,
  type BranchKind,
  type NodeLevel,
} from '../data/bdtCatalog.js';
import { syncErpNextRolesForMember } from '../lib/erpnextRoleSync.js';

export const departmentsRouter = Router();
departmentsRouter.use(authJwt);

type TeamNodeMember = {
  assignmentId: string;
  companyMemberId: string;
  userId: string;
  name: string;
  role: string;
  avatarUrl: string | null;
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'department';
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrDefault(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, Math.min(100, Math.round(next))) : fallback;
}

function metricsOrDefault(value: any, fallback = 75) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    performance: numberOrDefault(source.performance, fallback),
    efficiency: numberOrDefault(source.efficiency, fallback),
    capacity: numberOrDefault(source.capacity, fallback),
    alignment: numberOrDefault(source.alignment, fallback),
    risk: numberOrDefault(source.risk, Math.max(0, 100 - fallback)),
  };
}

function toArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function formatRoleLabel(role: string | null | undefined) {
  if (!role) return 'Member';
  return role
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildMemberName(profile: { first_name?: string | null; last_name?: string | null }, fallbackRole: string) {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  return name || fallbackRole;
}

function normalizeDepartmentInput(body: any) {
  const label = stringOrNull(body?.label);
  if (!label) throw new Error('label_required');
  const requestedDomain = stringOrNull(body?.domain) as Domain | null;
  const domain = requestedDomain && DOMAINS.has(requestedDomain) ? requestedDomain : 'build';
  const score = numberOrDefault(body?.score, 75);
  return {
    label,
    slug: slugify(label),
    domain,
    cluster: stringOrNull(body?.cluster) ?? domain[0].toUpperCase() + domain.slice(1),
    score,
    metrics: metricsOrDefault(body?.metrics, score),
  };
}

function normalizeNodeInput(body: any) {
  const label = stringOrNull(body?.label);
  if (!label) throw new Error('label_required');
  const requestedType = stringOrNull(body?.type) as NodeType | null;
  const type = requestedType && NODE_TYPES.has(requestedType) ? requestedType : 'team';
  const requestedBranchKind = stringOrNull(body?.branchKind) as BranchKind | null;
  const branchKind = requestedBranchKind && BRANCH_KINDS.has(requestedBranchKind) ? requestedBranchKind : null;
  const requestedNodeLevel = stringOrNull(body?.nodeLevel) as NodeLevel | null;
  const nodeLevel = requestedNodeLevel && NODE_LEVELS.has(requestedNodeLevel) ? requestedNodeLevel : null;
  const requestedMappedCategory = stringOrNull(body?.mappedUniversalCategory) as BranchKind | null;
  const mappedUniversalCategory = requestedMappedCategory && BRANCH_KINDS.has(requestedMappedCategory) ? requestedMappedCategory : null;
  const actionDetails = type === 'action' && body?.actionDetails && typeof body.actionDetails === 'object'
    ? body.actionDetails
    : null;
  const owner = stringOrNull(body?.owner);
  const dueDate = stringOrNull(body?.dueDate);
  const metricImpact = stringOrNull(body?.metricImpact);
  const output = stringOrNull(body?.output);
  const memberCount = Math.max(0, Math.round(Number(body?.memberCount ?? 0) || 0));
  const members = toArray(body?.members);
  const projectDetails = body?.projectDetails && typeof body.projectDetails === 'object' ? body.projectDetails : {};
  // Type-specific fields are folded into the node's metadata jsonb (the per-type
  // detail tables were collapsed in migration 034). department_metric_links is the
  // only kept side table — its metricKey still rides in metadata for the upsert.
  const baseMetadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  let metadata: Record<string, any> = { ...baseMetadata };
  if (type === 'action') metadata = { ...metadata, actionDetails, owner, dueDate, metricImpact, output };
  else if (type === 'team') metadata = { ...metadata, members, memberCount };
  else if (type === 'project') metadata = { ...metadata, projectDetails };
  return {
    label,
    type,
    branchKind,
    nodeLevel,
    mappedUniversalCategory,
    score: numberOrDefault(body?.score, 75),
    memberCount,
    members,
    projectDetails,
    metadata,
    actionDetails,
    owner,
    dueDate,
    metricImpact,
    output,
  };
}

function validateActionFields(body: any): string[] {
  const missing: string[] = [];
  const ad = body?.actionDetails;
  if (!stringOrNull(ad?.verb))        missing.push('actionDetails.verb');
  if (!stringOrNull(ad?.stateChange)) missing.push('actionDetails.stateChange');
  if (!stringOrNull(body?.owner))     missing.push('owner');
  if (!stringOrNull(body?.dueDate))   missing.push('dueDate');
  if (!stringOrNull(body?.metricImpact)) missing.push('metricImpact');
  if (!stringOrNull(body?.output))    missing.push('output');
  return missing;
}

async function assertDepartment(companyId: string, departmentId: string) {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM public.departments WHERE id = $1 AND company_id = $2`,
    [departmentId, companyId],
  );
  return rows[0] ?? null;
}

async function assertNode(companyId: string, nodeId: string) {
  const { rows } = await pool.query<{ id: string; department_id: string; node_type: NodeType }>(
    `SELECT id, department_id, node_type FROM public.department_bdt_nodes WHERE id = $1 AND company_id = $2`,
    [nodeId, companyId],
  );
  return rows[0] ?? null;
}

// Only metric nodes keep a side table (department_metric_links → company_metric_definitions FK).
// All other type-specific detail now lives in department_bdt_nodes.metadata (migration 034).
async function upsertNodeDetail(client: any, nodeId: string, data: ReturnType<typeof normalizeNodeInput>) {
  if (data.type === 'metric') {
    await client.query(
      `INSERT INTO public.department_metric_links (node_id, metric_key, metadata)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (node_id) DO UPDATE SET metric_key = EXCLUDED.metric_key, metadata = EXCLUDED.metadata`,
      [nodeId, stringOrNull(data.metadata.metricKey), JSON.stringify(data.metadata)],
    );
  }
}

async function grantCreatorAccess(client: any, actor: DepartmentActor, departmentId: string) {
  if (isGlobalDepartmentActor(actor.role)) return;
  const memberId = await getActiveMemberId(actor.companyId, actor.userId);
  if (!memberId) return;
  await client.query(
    `INSERT INTO public.department_member_grants
       (company_id, department_id, member_id, read, write, "delete", manage, created_by, updated_by)
     VALUES ($1, $2, $3, true, true, true, true, $4, $4)
     ON CONFLICT (company_id, department_id, member_id) DO UPDATE
       SET read = true,
           write = true,
           "delete" = true,
           manage = true,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
    [actor.companyId, departmentId, memberId, actor.userId],
  );
}

async function listDepartments(companyId: string, accessMap?: Map<string, DepartmentAccess>) {
  const { rows: departmentRows } = await pool.query(
    `SELECT id, source_key, label, domain, cluster, score, metrics, sort_order
       FROM public.departments
      WHERE company_id = $1
      ORDER BY sort_order ASC, label ASC`,
    [companyId],
  );

  const { rows: nodeRows } = await pool.query(
    `SELECT n.id, n.department_id, n.parent_node_id, n.source_key, n.label, n.node_type, n.score, n.sort_order, n.metadata,
            n.branch_kind, n.node_level, n.mapped_universal_category,
            ml.metric_key
       FROM public.department_bdt_nodes n
       LEFT JOIN public.department_metric_links ml ON ml.node_id = n.id
      WHERE n.company_id = $1
      ORDER BY n.department_id, n.parent_node_id NULLS FIRST, n.sort_order ASC, n.label ASC`,
    [companyId],
  );

  const { rows: rollupRows } = await pool.query<{
    target_type: 'department' | 'bdt_node'; target_id: string; health_score: number;
    metric_count: number; covered_node_count: number; eligible_node_count: number; calculated_at: string;
  }>(
    `SELECT target_type, target_id, health_score, metric_count, covered_node_count, eligible_node_count, calculated_at
       FROM public.metric_rollups
      WHERE company_id=$1 AND target_type IN ('department','bdt_node')`,
    [companyId],
  );
  const nodeRollups = new Map(rollupRows.filter(row => row.target_type === 'bdt_node').map(row => [row.target_id, row]));
  const departmentRollups = new Map(rollupRows.filter(row => row.target_type === 'department').map(row => [row.target_id, row]));

  const { rows: memberRows } = await pool.query(
    `SELECT cm.department_id, COUNT(*)::int AS member_count
       FROM public.company_members cm
      WHERE cm.company_id = $1 AND cm.status = 'active' AND cm.department_id IS NOT NULL
      GROUP BY cm.department_id`,
    [companyId],
  );
  const memberCounts = new Map(memberRows.map((row: any) => [row.department_id, Number(row.member_count) || 0]));

  const { rows: nodeMemberRows } = await pool.query<{
    node_id: string;
    assignment_id: string;
    company_member_id: string;
    user_id: string;
    role: string;
    first_name: string | null;
    last_name: string | null;
    title: string | null;
    avatar_url: string | null;
  }>(
    `SELECT dnm.node_id,
            dnm.id AS assignment_id,
            cm.id AS company_member_id,
            cm.user_id,
            cm.role,
            up.first_name,
            up.last_name,
            up.title,
            up.avatar_url
       FROM public.department_node_members dnm
       JOIN public.company_members cm
         ON cm.id = dnm.company_member_id
        AND cm.company_id = dnm.company_id
       LEFT JOIN public.user_profiles up
         ON up.id = cm.user_id
      WHERE dnm.company_id = $1
        AND cm.status = 'active'
      ORDER BY dnm.created_at ASC`,
    [companyId],
  );
  const nodeMembers = new Map<string, TeamNodeMember[]>();
  for (const row of nodeMemberRows) {
    if (!nodeMembers.has(row.node_id)) nodeMembers.set(row.node_id, []);
    const fallbackRole = formatRoleLabel(row.role);
    nodeMembers.get(row.node_id)!.push({
      assignmentId: row.assignment_id,
      companyMemberId: row.company_member_id,
      userId: row.user_id,
      name: buildMemberName(row, fallbackRole),
      role: row.title?.trim() || fallbackRole,
      avatarUrl: row.avatar_url,
    });
  }

  const nodesByDepartment = new Map<string, any[]>();
  const nodeMap = new Map<string, any>();
  for (const row of nodeRows as any[]) {
    const assignedMembers = nodeMembers.get(row.id) ?? [];
    const fallbackMembers = row.node_type === 'team' ? toArray(row.metadata?.members) : undefined;
    const projectMeta = row.node_type === 'project' ? (row.metadata?.projectDetails ?? {}) : undefined;
    const rollup = nodeRollups.get(row.id);
    const node = {
      id: row.id,
      sourceKey: row.source_key ?? undefined,
      // Content-derived (see bdtSeed.ts's branchMetadata), unlike sourceKey above which is
      // positional and shifts if the tree is reordered — prefer this for any matching that
      // needs to survive a future restructure (e.g. Meta panel routing).
      stableSourceKey: (row.metadata?.sourceKey as string | undefined) ?? undefined,
      taxonomyVersion: (row.metadata?.taxonomyVersion as string | undefined) ?? undefined,
      presentation: (row.metadata?.presentation as string | undefined) ?? undefined,
      availability: row.metadata?.availability === 'planned' ? 'planned' : 'active',
      label: row.label,
      type: row.node_type,
      manualScore: row.score,
      computedScore: rollup?.health_score ?? null,
      score: rollup?.health_score ?? row.score,
      scoreSource: rollup ? 'computed' : 'manual',
      metricCoverage: rollup ? {
        metricCount: rollup.metric_count,
        coveredNodeCount: rollup.covered_node_count,
        eligibleNodeCount: rollup.eligible_node_count,
        calculatedAt: rollup.calculated_at,
      } : null,
      children: [],
      memberCount: row.node_type === 'team'
        ? (assignedMembers.length > 0 ? assignedMembers.length : Number(row.metadata?.memberCount ?? fallbackMembers?.length ?? 0))
        : undefined,
      members: row.node_type === 'team'
        ? (assignedMembers.length > 0 ? assignedMembers : fallbackMembers)
        : undefined,
      projectDetails: projectMeta
        ? {
            description: projectMeta.description ?? undefined,
            status: projectMeta.status ?? undefined,
            deadline: projectMeta.deadline ?? undefined,
            budget: projectMeta.budget ?? undefined,
          }
        : undefined,
      actionDetails: row.node_type === 'action' ? (row.metadata?.actionDetails ?? undefined) : undefined,
      owner: row.node_type === 'action' ? (row.metadata?.owner ?? undefined) : undefined,
      dueDate: row.node_type === 'action' ? (row.metadata?.dueDate ?? undefined) : undefined,
      metricImpact: row.node_type === 'action' ? (row.metadata?.metricImpact ?? undefined) : undefined,
      output: row.node_type === 'action' ? (row.metadata?.output ?? undefined) : undefined,
      metricKey: row.metric_key ?? undefined,
      branchKind: row.branch_kind ?? undefined,
      nodeLevel: row.node_level ?? undefined,
      mappedUniversalCategory: row.mapped_universal_category ?? undefined,
      _parentId: row.parent_node_id,
      _departmentId: row.department_id,
    };
    nodeMap.set(row.id, node);
    if (!nodesByDepartment.has(row.department_id)) nodesByDepartment.set(row.department_id, []);
    nodesByDepartment.get(row.department_id)!.push(node);
  }

  for (const node of nodeMap.values()) {
    if (node._parentId && nodeMap.has(node._parentId)) {
      nodeMap.get(node._parentId).children.push(node);
    }
  }

  return departmentRows
    .filter((department: any) => accessMap ? accessAllows(accessMap.get(department.id) ?? { read: false, write: false, delete: false, manage: false }, 'read') : true)
    .map((department: any) => {
    const access = accessMap?.get(department.id) ?? { read: true, write: true, delete: true, manage: true };
    const allNodes = nodesByDepartment.get(department.id) ?? [];
    const rollup = departmentRollups.get(department.id);
    return {
      id: department.id,
      sourceKey: department.source_key ?? undefined,
      label: department.label,
      domain: department.domain,
      cluster: department.cluster,
      manualScore: department.score,
      computedScore: rollup?.health_score ?? null,
      score: rollup?.health_score ?? department.score,
      scoreSource: rollup ? 'computed' : 'manual',
      metricCoverage: rollup ? {
        metricCount: rollup.metric_count,
        coveredNodeCount: rollup.covered_node_count,
        eligibleNodeCount: rollup.eligible_node_count,
        calculatedAt: rollup.calculated_at,
      } : null,
      metrics: metricsOrDefault(department.metrics, department.score),
      memberCount: memberCounts.get(department.id) ?? 0,
      access,
      internalNodes: allNodes
        .filter((node) => !node._parentId)
        .map(({ _parentId, _departmentId, ...node }) => node),
    };
  });
}

departmentsRouter.get('/', requirePermission('twin', 'read'), async (req: any, res) => {
  if (!req.auth.companyId) return res.status(403).json({ error: 'no_company' });
  try {
    const accessMap = await getDepartmentAccessMap(req.auth);
    return res.json({ departments: await listDepartments(req.auth.companyId, accessMap) });
  } catch (err: any) {
    console.error('[departments] list failed', err);
    return res.status(500).json({ error: 'departments_list_failed', details: err.message });
  }
});

departmentsRouter.get('/:departmentId', requirePermission('twin', 'read'), requireDepartmentAccess('read', (req) => req.params.departmentId), async (req: any, res) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    const dept = await assertDepartment(companyId, req.params.departmentId);
    if (!dept) return res.status(404).json({ error: 'department_not_found' });
    const accessMap = await getDepartmentAccessMap(req.auth);
    const all = await listDepartments(companyId, accessMap);
    const found = all.find((d: any) => d.id === req.params.departmentId);
    if (!found) return res.status(404).json({ error: 'department_not_found' });
    return res.json({ department: found });
  } catch (err: any) {
    console.error('[departments] get failed', err);
    return res.status(500).json({ error: 'department_get_failed', details: err.message });
  }
});

departmentsRouter.post('/', requireTwinAndTeamWrite(), async (req: any, res) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  const client = await pool.connect();
  let began = false;
  try {
    const input = normalizeDepartmentInput(req.body);
    await client.query('BEGIN');
    began = true;
    const { rows } = await client.query(
      `INSERT INTO public.departments (company_id, label, slug, domain, cluster, score, metrics, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb,
         COALESCE((SELECT MAX(sort_order) + 1 FROM public.departments WHERE company_id = $1), 0))
       RETURNING id`,
      [companyId, input.label, input.slug, input.domain, input.cluster, input.score, JSON.stringify(input.metrics)],
    );
    await grantCreatorAccess(client, req.auth, rows[0].id);
    await client.query('COMMIT');
    const accessMap = await getDepartmentAccessMap(req.auth);
    const departments = await listDepartments(companyId, accessMap);
    return res.status(201).json({ department: departments.find((d: any) => d.id === rows[0].id) });
  } catch (err: any) {
    await client.query('ROLLBACK');
    const status = err.message === 'label_required' ? 400 : 500;
    console.error('[departments] create failed', err);
    return res.status(status).json({ error: 'department_create_failed', details: err.message });
  } finally {
    client.release();
  }
});

departmentsRouter.post('/nodes/:nodeId/members', requirePermission('team', 'write'), requireDepartmentAccess('write', (req) => getNodeDepartmentId(req.auth.companyId, req.params.nodeId)), async (req: any, res) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const companyMemberId = stringOrNull(req.body?.memberId);
  if (!companyMemberId) return res.status(400).json({ error: 'member_id_required' });

  const client = await pool.connect();
  let began = false;
  try {
    const node = await assertNode(companyId, req.params.nodeId);
    if (!node) return res.status(404).json({ error: 'node_not_found' });
    if (node.node_type !== 'team') return res.status(400).json({ error: 'node_not_team' });

    const { rows: memberRows } = await client.query<{ id: string; department_id: string | null }>(
      `SELECT id, department_id
         FROM public.company_members
        WHERE id = $1
          AND company_id = $2
          AND status = 'active'`,
      [companyMemberId, companyId],
    );
    const member = memberRows[0];
    if (!member) return res.status(404).json({ error: 'member_not_found' });

    await client.query('BEGIN');
    began = true;
    await client.query(
      `INSERT INTO public.department_node_members
         (company_id, department_id, node_id, company_member_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (node_id, company_member_id) DO NOTHING`,
      [companyId, node.department_id, node.id, member.id, req.auth.userId],
    );
    await client.query('COMMIT');

    const accessMap = await getDepartmentAccessMap(req.auth);
    return res.status(201).json({ success: true, departments: await listDepartments(companyId, accessMap) });
  } catch (err: any) {
    if (began) await client.query('ROLLBACK');
    console.error('[departments] node member assign failed', err);
    return res.status(500).json({ error: 'node_member_assign_failed', details: err.message });
  } finally {
    client.release();
  }
});

departmentsRouter.delete('/nodes/:nodeId/members/:memberId', requirePermission('team', 'write'), requireDepartmentAccess('write', (req) => getNodeDepartmentId(req.auth.companyId, req.params.nodeId)), async (req: any, res) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const client = await pool.connect();
  let began = false;
  try {
    const node = await assertNode(companyId, req.params.nodeId);
    if (!node) return res.status(404).json({ error: 'node_not_found' });
    if (node.node_type !== 'team') return res.status(400).json({ error: 'node_not_team' });

    await client.query('BEGIN');
    began = true;
    await client.query(
      `DELETE FROM public.department_node_members
        WHERE company_id = $1
          AND node_id = $2
          AND company_member_id = $3`,
      [companyId, node.id, req.params.memberId],
    );
    await client.query('COMMIT');

    const accessMap = await getDepartmentAccessMap(req.auth);
    return res.json({ success: true, departments: await listDepartments(companyId, accessMap) });
  } catch (err: any) {
    if (began) await client.query('ROLLBACK');
    console.error('[departments] node member remove failed', err);
    return res.status(500).json({ error: 'node_member_remove_failed', details: err.message });
  } finally {
    client.release();
  }
});

departmentsRouter.patch('/:departmentId', requirePermission('twin', 'write'), requireDepartmentAccess('write', (req) => req.params.departmentId), async (req: any, res) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    if (!(await assertDepartment(companyId, req.params.departmentId))) {
      return res.status(404).json({ error: 'department_not_found' });
    }
    const input = normalizeDepartmentInput(req.body);
    await pool.query(
      `UPDATE public.departments
          SET label = $3, slug = $4, domain = $5, cluster = $6, score = $7, metrics = $8::jsonb, updated_at = now()
        WHERE id = $1 AND company_id = $2`,
      [req.params.departmentId, companyId, input.label, input.slug, input.domain, input.cluster, input.score, JSON.stringify(input.metrics)],
    );
    const accessMap = await getDepartmentAccessMap(req.auth);
    const departments = await listDepartments(companyId, accessMap);
    return res.json({ department: departments.find((d: any) => d.id === req.params.departmentId) });
  } catch (err: any) {
    console.error('[departments] update failed', err);
    return res.status(500).json({ error: 'department_update_failed', details: err.message });
  }
});

departmentsRouter.delete('/:departmentId', requirePermission('twin', 'write'), requireDepartmentAccess('delete', (req) => req.params.departmentId), async (req: any, res) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    await pool.query(`DELETE FROM public.departments WHERE id = $1 AND company_id = $2`, [req.params.departmentId, companyId]);
    const accessMap = await getDepartmentAccessMap(req.auth);
    return res.json({ success: true, departments: await listDepartments(companyId, accessMap) });
  } catch (err: any) {
    console.error('[departments] delete failed', err);
    return res.status(500).json({ error: 'department_delete_failed', details: err.message });
  }
});

departmentsRouter.post('/:departmentId/nodes', requirePermission('twin', 'write'), requireDepartmentAccess('write', (req) => req.params.departmentId), async (req: any, res) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  const client = await pool.connect();
  try {
    if (!(await assertDepartment(companyId, req.params.departmentId))) {
      return res.status(404).json({ error: 'department_not_found' });
    }
    const input = normalizeNodeInput(req.body);
    if (input.type === 'action') {
      const missing = validateActionFields(req.body);
      if (missing.length) return res.status(400).json({ error: 'action_node_incomplete', missing });
    }
    if (input.nodeLevel === 'level1') {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM public.department_bdt_nodes WHERE department_id = $1 AND node_level = 'level1'`,
        [req.params.departmentId],
      );
      if ((rowCount ?? 0) >= 6) {
        return res.status(400).json({ error: 'level1_node_limit', message: 'Department cannot have more than 6 Level-1 nodes' });
      }
    }
    const parentId = stringOrNull(req.body?.parentNodeId);
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO public.department_bdt_nodes (company_id, department_id, parent_node_id, label, node_type, branch_kind, node_level, mapped_universal_category, score, sort_order, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
         COALESCE((SELECT MAX(sort_order) + 1 FROM public.department_bdt_nodes WHERE department_id = $2 AND parent_node_id IS NOT DISTINCT FROM $3::uuid), 0),
         $10::jsonb)
       RETURNING id`,
      [companyId, req.params.departmentId, parentId, input.label, input.type, input.branchKind, input.nodeLevel, input.mappedUniversalCategory, input.score, JSON.stringify(input.metadata)],
    );
    await upsertNodeDetail(client, rows[0].id, input);
    await client.query('COMMIT');
    const accessMap = await getDepartmentAccessMap(req.auth);
    return res.status(201).json({ nodeId: rows[0].id, departments: await listDepartments(companyId, accessMap) });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[departments] node create failed', err);
    return res.status(500).json({ error: 'node_create_failed', details: err.message });
  } finally {
    client.release();
  }
});

departmentsRouter.patch('/nodes/:nodeId', requirePermission('twin', 'write'), requireDepartmentAccess('write', (req) => getNodeDepartmentId(req.auth.companyId, req.params.nodeId)), async (req: any, res) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  const client = await pool.connect();
  try {
    const existing = await assertNode(companyId, req.params.nodeId);
    if (!existing) return res.status(404).json({ error: 'node_not_found' });
    const input = normalizeNodeInput(req.body);
    const effectiveType = input.type ?? existing.node_type;
    if (effectiveType === 'action') {
      const missing = validateActionFields(req.body);
      if (missing.length) return res.status(400).json({ error: 'action_node_incomplete', missing });
    }
    await client.query('BEGIN');
    await client.query(
      `UPDATE public.department_bdt_nodes
          SET label = $3, node_type = $4, branch_kind = $5, node_level = $6, mapped_universal_category = $7, score = $8, metadata = $9::jsonb, updated_at = now()
        WHERE id = $1 AND company_id = $2`,
      [req.params.nodeId, companyId, input.label, input.type, input.branchKind, input.nodeLevel, input.mappedUniversalCategory, input.score, JSON.stringify(input.metadata)],
    );
    await upsertNodeDetail(client, req.params.nodeId, input);
    await client.query('COMMIT');
    const accessMap = await getDepartmentAccessMap(req.auth);
    return res.json({ success: true, departments: await listDepartments(companyId, accessMap) });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[departments] node update failed', err);
    return res.status(500).json({ error: 'node_update_failed', details: err.message });
  } finally {
    client.release();
  }
});

departmentsRouter.delete('/nodes/:nodeId', requirePermission('twin', 'write'), requireDepartmentAccess('delete', (req) => getNodeDepartmentId(req.auth.companyId, req.params.nodeId)), async (req: any, res) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    await pool.query(`DELETE FROM public.department_bdt_nodes WHERE id = $1 AND company_id = $2`, [req.params.nodeId, companyId]);
    const accessMap = await getDepartmentAccessMap(req.auth);
    return res.json({ success: true, departments: await listDepartments(companyId, accessMap) });
  } catch (err: any) {
    console.error('[departments] node delete failed', err);
    return res.status(500).json({ error: 'node_delete_failed', details: err.message });
  }
});

departmentsRouter.patch('/team-members/:memberId', requirePermission('team', 'write'), async (req: any, res) => {
  const companyId = req.auth.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  const departmentId = stringOrNull(req.body?.departmentId);
  try {
    if (departmentId && !(await assertDepartment(companyId, departmentId))) {
      return res.status(404).json({ error: 'department_not_found' });
    }
    if (departmentId) {
      const access = await getDepartmentAccess(req.auth, departmentId);
      if (!access.manage) return res.status(403).json({ error: 'department_forbidden' });
    }
    const { data: updated, error } = await supabaseAdmin
      .from('company_members')
      .update({ department_id: departmentId })
      .eq('id', req.params.memberId)
      .eq('company_id', companyId)
      .select('user_id, role')
      .maybeSingle();
    if (error) {
      return res.status(500).json({ error: 'member_department_update_failed', details: error.message });
    }
    if (updated) await syncErpNextRolesForMember(companyId, updated.user_id, updated.role);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[departments] member assignment failed', err);
    return res.status(500).json({ error: 'member_department_update_failed', details: err.message });
  }
});
