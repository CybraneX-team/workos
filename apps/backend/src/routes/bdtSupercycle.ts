import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { can, requirePermission } from '../rbac.js';
import { getActiveMemberId, getDepartmentAccess } from '../departmentAccess.js';

export const bdtSupercycleRouter = Router();
bdtSupercycleRouter.use(authJwt);

const uuid = z.string().uuid();
const departmentSchema = z.object({ departmentId: uuid, nodeIds: z.array(uuid).min(1).max(100) });
const routeSchema = z.object({
  label: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  departmentIds: z.array(uuid).min(2).max(100),
});
const inputSchema = z.object({ departments: z.array(departmentSchema).min(1).max(100), routes: z.array(routeSchema).min(1).max(20) });
const editorRoles = new Set(['super_admin', 'founder', 'co_founder', 'admin']);

async function memberId(companyId: string, userId: string) { return getActiveMemberId(companyId, userId); }
async function departmentInCompany(companyId: string, departmentId: string) {
  const { rows } = await pool.query(`select 1 from public.departments where company_id=$1 and id=$2`, [companyId, departmentId]);
  return Boolean(rows[0]);
}
async function readable(req: any, departmentId: string) {
  return Boolean(await departmentInCompany(req.auth.companyId, departmentId) && await memberId(req.auth.companyId, req.auth.userId)
    && (await getDepartmentAccess(req.auth, departmentId)).read);
}
async function editor(req: any) {
  const actor = req.auth;
  return Boolean(actor?.companyId && actor?.userId && editorRoles.has(actor.role)
    && can(actor.role, actor.companyId, 'twin', 'write') && await memberId(actor.companyId, actor.userId));
}

async function availableDepartments(req: any) {
  const companyId = req.auth.companyId;
  const { rows } = await pool.query<any>(
    `select d.id department_id,d.label department_label,d.sort_order department_sort_order,
            n.id node_id,n.label node_label,n.node_type,n.node_level,n.metadata
       from public.departments d
       join public.department_bdt_nodes n on n.company_id=d.company_id and n.department_id=d.id
      where d.company_id=$1 and n.node_level='level1' and n.metadata->>'workspaceKind' is not null
      order by d.sort_order,n.sort_order`, [companyId],
  );
  const result: any[] = []; const byId = new Map<string, any>();
  for (const row of rows) {
    if (!await readable(req, row.department_id)) continue;
    let department = byId.get(row.department_id);
    if (!department) {
      department = { id: row.department_id, label: row.department_label, nodes: [] };
      byId.set(row.department_id, department); result.push(department);
    }
    department.nodes.push({ id: row.node_id, label: row.node_label, nodeType: row.node_type, nodeLevel: row.node_level, workspaceKind: row.metadata?.workspaceKind ?? null });
  }
  return result;
}

/** Fetch a caller-filtered shared representation. Hidden departments never leak through a route. */
async function configuredRepresentation(req: any) {
  const companyId = req.auth.companyId;
  const { rows: nodeRows } = await pool.query<any>(
    `select c.id config_id,sd.id member_id,sd.department_id,sd.sort_order,
            d.label department_label,n.id node_id,n.label node_label,n.node_type,n.node_level,n.metadata,sn.sort_order node_sort_order
       from public.bdt_supercycle_configs c
       join public.bdt_supercycle_departments sd on sd.company_id=c.company_id and sd.config_id=c.id
       join public.departments d on d.company_id=sd.company_id and d.id=sd.department_id
       join public.bdt_supercycle_nodes sn on sn.company_id=sd.company_id and sn.supercycle_department_id=sd.id
       join public.department_bdt_nodes n on n.company_id=sn.company_id and n.department_id=sn.department_id and n.id=sn.node_id
      where c.company_id=$1 order by sd.sort_order,sn.sort_order`, [companyId],
  );
  const departments: any[] = []; const memberById = new Map<string, any>();
  for (const row of nodeRows) {
    if (!await readable(req, row.department_id)) continue;
    let department = memberById.get(row.member_id);
    if (!department) {
      department = { id: row.department_id, label: row.department_label, order: row.sort_order, nodes: [] };
      memberById.set(row.member_id, department); departments.push(department);
    }
    department.nodes.push({ id: row.node_id, label: row.node_label, nodeType: row.node_type, nodeLevel: row.node_level, workspaceKind: row.metadata?.workspaceKind ?? null, order: row.node_sort_order });
  }

  const { rows: routeRows } = await pool.query<any>(
    `select route.id route_id,route.label route_label,route.color route_color,route.sort_order route_sort_order,
            member.id member_id,member.department_id,route_member.sort_order member_sort_order
       from public.bdt_supercycle_routes route
       join public.bdt_supercycle_route_departments route_member on route_member.company_id=route.company_id and route_member.route_id=route.id
       join public.bdt_supercycle_departments member on member.company_id=route_member.company_id and member.id=route_member.supercycle_department_id
      where route.company_id=$1 order by route.sort_order,route_member.sort_order`, [companyId],
  );
  const routes: any[] = []; const routeById = new Map<string, any>();
  for (const row of routeRows) {
    const department = memberById.get(row.member_id);
    if (!department) continue;
    let route = routeById.get(row.route_id);
    if (!route) {
      route = { id: row.route_id, label: row.route_label, color: row.route_color, order: row.route_sort_order, departmentIds: [] };
      routeById.set(row.route_id, route); routes.push(route);
    }
    route.departmentIds.push(department.id);
  }
  // A partial route would disclose hidden topology and is not useful visually.
  const visibleRoutes = routes.filter((route) => route.departmentIds.length >= 2);
  return { configured: visibleRoutes.length > 0, departments, routes: visibleRoutes };
}

function fail(res: any, error: any) {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'invalid_request', details: error.flatten() });
  if (error?.message === 'duplicate_department') return res.status(409).json({ error: 'duplicate_department' });
  if (error?.message === 'duplicate_node') return res.status(409).json({ error: 'duplicate_node' });
  if (error?.message === 'duplicate_route') return res.status(409).json({ error: 'duplicate_route' });
  if (error?.message === 'duplicate_route_department') return res.status(409).json({ error: 'duplicate_route_department' });
  if (error?.message === 'unknown_route_department') return res.status(409).json({ error: 'unknown_route_department' });
  if (error?.message === 'unreadable_department') return res.status(403).json({ error: 'department_forbidden' });
  if (error?.message === 'invalid_node') return res.status(409).json({ error: 'invalid_workspace_node' });
  if (error?.code === '23503') return res.status(409).json({ error: 'invalid_reference' });
  console.error('[bdt-supercycle]', error); return res.status(500).json({ error: 'bdt_supercycle_failed' });
}

bdtSupercycleRouter.get('/', requirePermission('twin', 'read'), async (req: any, res) => {
  const canEdit = await editor(req);
  res.json({ ...(await configuredRepresentation(req)), canEdit, availableDepartments: canEdit ? await availableDepartments(req) : [] });
});

bdtSupercycleRouter.put('/', requirePermission('twin', 'write'), async (req: any, res) => {
  try {
    if (!await editor(req)) return res.status(403).json({ error: 'supercycle_editor_required' });
    const input = inputSchema.parse(req.body);
    const companyId = req.auth.companyId; const actorMember = await memberId(companyId, req.auth.userId);
    const departmentIds = new Set<string>();
    for (const department of input.departments) {
      if (departmentIds.has(department.departmentId)) throw new Error('duplicate_department');
      departmentIds.add(department.departmentId);
      if (!await readable(req, department.departmentId)) throw new Error('unreadable_department');
      const seenNodes = new Set<string>();
      for (const nodeId of department.nodeIds) {
        if (seenNodes.has(nodeId)) throw new Error('duplicate_node');
        seenNodes.add(nodeId);
        const { rows } = await pool.query<any>(
          `select 1 from public.department_bdt_nodes where company_id=$1 and department_id=$2 and id=$3 and node_level='level1' and metadata->>'workspaceKind' is not null`,
          [companyId, department.departmentId, nodeId],
        );
        if (!rows[0]) throw new Error('invalid_node');
      }
    }
    const labels = new Set<string>();
    for (const route of input.routes) {
      const normalisedLabel = route.label.toLocaleLowerCase();
      if (labels.has(normalisedLabel)) throw new Error('duplicate_route');
      labels.add(normalisedLabel);
      const routeDepartments = new Set<string>();
      for (const departmentId of route.departmentIds) {
        if (!departmentIds.has(departmentId)) throw new Error('unknown_route_department');
        if (routeDepartments.has(departmentId)) throw new Error('duplicate_route_department');
        routeDepartments.add(departmentId);
      }
    }
    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows: configs } = await client.query<any>(
        `insert into public.bdt_supercycle_configs(company_id,created_by_member_id,updated_by_member_id)
         values($1,$2,$2) on conflict(company_id) do update set updated_by_member_id=excluded.updated_by_member_id,updated_at=now() returning id`,
        [companyId, actorMember],
      );
      const configId = configs[0].id;
      await client.query(`delete from public.bdt_supercycle_routes where company_id=$1 and config_id=$2`, [companyId, configId]);
      await client.query(`delete from public.bdt_supercycle_departments where company_id=$1 and config_id=$2`, [companyId, configId]);
      const memberIds = new Map<string, string>();
      for (const [departmentOrder, department] of input.departments.entries()) {
        const { rows: memberships } = await client.query<any>(
          `insert into public.bdt_supercycle_departments(company_id,config_id,department_id,sort_order) values($1,$2,$3,$4) returning id`,
          [companyId, configId, department.departmentId, departmentOrder],
        );
        memberIds.set(department.departmentId, memberships[0].id);
        for (const [nodeOrder, nodeId] of department.nodeIds.entries()) {
          await client.query(`insert into public.bdt_supercycle_nodes(company_id,supercycle_department_id,department_id,node_id,sort_order) values($1,$2,$3,$4,$5)`, [companyId, memberships[0].id, department.departmentId, nodeId, nodeOrder]);
        }
      }
      for (const [routeOrder, route] of input.routes.entries()) {
        const { rows: routeRows } = await client.query<any>(
          `insert into public.bdt_supercycle_routes(company_id,config_id,label,color,sort_order) values($1,$2,$3,$4,$5) returning id`,
          [companyId, configId, route.label, route.color, routeOrder],
        );
        for (const [departmentOrder, departmentId] of route.departmentIds.entries()) {
          await client.query(`insert into public.bdt_supercycle_route_departments(company_id,config_id,route_id,supercycle_department_id,sort_order) values($1,$2,$3,$4,$5)`, [companyId, configId, routeRows[0].id, memberIds.get(departmentId), departmentOrder]);
        }
      }
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
    res.json({ ...(await configuredRepresentation(req)), canEdit: true, availableDepartments: await availableDepartments(req) });
  } catch (error) { fail(res, error); }
});

bdtSupercycleRouter.delete('/', requirePermission('twin', 'write'), async (req: any, res) => {
  if (!await editor(req)) return res.status(403).json({ error: 'supercycle_editor_required' });
  await pool.query(`delete from public.bdt_supercycle_configs where company_id=$1`, [req.auth.companyId]);
  res.status(204).send();
});
