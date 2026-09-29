import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { requirePermission } from '../rbac.js';
import {
  ensureCompanySkeleton,
  ensureCompanyDefaults,
  readCompanySkeletons,
  readNodeDetail,
  readSubNodeDetail,
  readStageDetail,
  type CompanySkeletons,
} from '../pmsSkeleton.js';

// Company-scoped persistence for the Supercycle screen (Item 1.1).
// Replaces the browser-only localStorage key `workos_pms_v1:<companyId>` for the
// supercycle slice: selected archetype + value cycles + department sub-cycles +
// live instances. PMS projects/tasks (Item 1.2) are NOT handled here.
//
// The store is agnostic to the archetype catalogue — it round-trips whatever the
// client sends. Defaults are generated client-side, so the client self-seeds the
// server on first save. company_id always comes from the verified JWT.

export const pmsSupercycleRouter = Router();
pmsSupercycleRouter.use(authJwt);

function companyId(req: Request): string | null {
  return req.auth?.companyId ?? null;
}
function noCompany(res: Response) {
  return res.status(400).json({ error: 'no_active_company' });
}

const ARCHETYPES = ['b2b_saas', 'deep_tech', 'd2c', 'manufacturing', 'consulting', 'education'] as const;
const archetype = z.enum(ARCHETYPES);
const hex = /^#[0-9A-Fa-f]{6}$/;

const cycleSchema = z.object({
  id: z.string().trim().min(1).max(120),
  archetypeId: archetype,
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(hex),
  departmentIds: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  subNodeIds: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
});
const departmentCycleSchema = z.object({
  id: z.string().trim().min(1).max(120),
  archetypeId: archetype,
  departmentId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(hex),
  stageIds: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
});
const instanceSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  departmentNodeId: z.string().trim().min(1).max(120),
  subNodeId: z.string().trim().min(1).max(120).optional(),
  templateId: z.string().trim().min(1).max(120),
  stageIndex: z.number().int().min(0).max(10000),
  status: z.enum(['active', 'paused', 'completed']),
  objectType: z.enum(['customer', 'opportunity', 'product', 'programme', 'contract', 'campaign']).optional(),
  objectId: z.string().trim().min(1).max(200).optional(),
});
// ── Phase 4: execution-layer collections (mirrored as JSONB) ─────────────────
const s = (max = 200) => z.string().trim().min(1).max(max);
const iso = z.string().trim().min(1).max(40);
const projectSchema = z.object({
  id: s(120),
  name: s(200),
  description: z.string().max(4000).default(''),
  departmentId: s(120),
  ownerId: s(200),
  memberIds: z.array(s(200)).max(200).default([]),
  status: z.enum(['on_track', 'at_risk', 'delayed', 'done']),
  liveInstanceId: s(120).optional(),
  createdAt: iso,
});
const taskSchema = z.object({
  id: s(120),
  projectId: s(120),
  title: s(400),
  status: z.enum(['todo', 'in_progress', 'review', 'done']),
  assigneeId: s(200).optional(),
  dueDate: iso.optional(),
  blockedByTaskId: s(120).optional(),
  createdAt: iso,
});
const milestoneSchema = z.object({
  id: s(120),
  projectId: s(120),
  title: s(400),
  dueDate: iso.optional(),
  done: z.boolean(),
  dependsOnMilestoneId: s(120).optional(),
});
const riskSchema = z.object({
  id: s(120),
  projectId: s(120),
  title: s(400),
  severity: z.enum(['low', 'medium', 'high']),
  mitigated: z.boolean(),
});
const decisionSchema = z.object({
  id: s(120),
  projectId: s(120),
  title: s(400),
  status: z.enum(['open', 'approved', 'rejected']),
  createdAt: iso,
});
const fileSchema = z.object({
  id: s(120),
  projectId: s(120),
  label: s(200),
  url: z.string().trim().min(1).max(2000),
  createdAt: iso,
});
const messageSchema = z.object({
  id: s(120),
  projectId: s(120),
  authorId: s(200),
  body: z.string().trim().min(1).max(8000),
  createdAt: iso,
});

const putSchema = z.object({
  archetypeId: archetype,
  cycles: z.array(cycleSchema).max(200),
  departmentCycles: z.array(departmentCycleSchema).max(1000),
  instances: z.array(instanceSchema).max(1000),
  // Execution layer — optional so older clients that don't send it still work.
  projects: z.array(projectSchema).max(2000).optional(),
  tasks: z.array(taskSchema).max(10000).optional(),
  milestones: z.array(milestoneSchema).max(10000).optional(),
  risks: z.array(riskSchema).max(10000).optional(),
  decisions: z.array(decisionSchema).max(10000).optional(),
  files: z.array(fileSchema).max(10000).optional(),
  messages: z.array(messageSchema).max(20000).optional(),
});

type Slice = z.infer<typeof putSchema>;
type SliceResponse = Slice & { archetypes: CompanySkeletons };

async function readSlice(company: string): Promise<SliceResponse> {
  // Make sure this company owns a skeleton AND its default cycles (both seeded
  // from the templates) before we read it back. Idempotent: seeds only once.
  await ensureCompanyDefaults(company);
  const [settings, cycles, deptCycles, instances, execution, archetypes] = await Promise.all([
    pool.query<{ archetype_id: string }>(
      `select archetype_id from public.pms_supercycle_settings where company_id=$1`, [company]),
    pool.query<any>(
      `select client_id,archetype_id,name,color,department_ids,sub_node_ids
         from public.pms_supercycle_cycles where company_id=$1 order by created_at`, [company]),
    pool.query<any>(
      `select client_id,archetype_id,department_id,name,color,stage_ids
         from public.pms_supercycle_department_cycles where company_id=$1 order by created_at`, [company]),
    pool.query<any>(
      `select client_id,name,department_node_id,sub_node_id,template_id,stage_index,status,object_type,object_id
         from public.pms_supercycle_instances where company_id=$1 order by created_at`, [company]),
    pool.query<any>(
      `select projects,tasks,milestones,risks,decisions,files,messages
         from public.pms_execution where company_id=$1`, [company]),
    readCompanySkeletons(company),
  ]);
  const exec = execution.rows[0] ?? {};
  return {
    archetypes,
    projects: exec.projects ?? [],
    tasks: exec.tasks ?? [],
    milestones: exec.milestones ?? [],
    risks: exec.risks ?? [],
    decisions: exec.decisions ?? [],
    files: exec.files ?? [],
    messages: exec.messages ?? [],
    archetypeId: (settings.rows[0]?.archetype_id ?? 'b2b_saas') as Slice['archetypeId'],
    cycles: cycles.rows.map((r) => ({
      id: r.client_id,
      archetypeId: r.archetype_id,
      name: r.name,
      color: r.color,
      departmentIds: r.department_ids ?? [],
      ...(r.sub_node_ids?.length ? { subNodeIds: r.sub_node_ids } : {}),
    })),
    departmentCycles: deptCycles.rows.map((r) => ({
      id: r.client_id,
      archetypeId: r.archetype_id,
      departmentId: r.department_id,
      name: r.name,
      color: r.color,
      stageIds: r.stage_ids ?? [],
    })),
    instances: instances.rows.map((r) => ({
      id: r.client_id,
      name: r.name,
      departmentNodeId: r.department_node_id,
      ...(r.sub_node_id ? { subNodeId: r.sub_node_id } : {}),
      templateId: r.template_id,
      stageIndex: r.stage_index,
      status: r.status,
      ...(r.object_type ? { objectType: r.object_type } : {}),
      ...(r.object_id ? { objectId: r.object_id } : {}),
    })),
  };
}

pmsSupercycleRouter.get('/', requirePermission('twin', 'read'), async (req, res) => {
  const company = companyId(req);
  if (!company) return noCompany(res);
  try {
    return res.json(await readSlice(company));
  } catch (err) {
    console.error('[pms-supercycle] get', err);
    return res.status(500).json({ error: 'pms_supercycle_failed' });
  }
});

// ── Phase 3: per-level (lazy) drill-down reads ───────────────────────────────
// The client fetches only the level it opened. Params are the same client ids
// the ring already uses: archetype id + node id (+ sub-node / stage id).
const isArchetype = (v: string): v is (typeof ARCHETYPES)[number] =>
  (ARCHETYPES as readonly string[]).includes(v);

// GET /api/pms/supercycle/nodes/:archetypeId/:nodeId  → one planet's detail
pmsSupercycleRouter.get('/nodes/:archetypeId/:nodeId', requirePermission('twin', 'read'), async (req, res) => {
  const company = companyId(req);
  if (!company) return noCompany(res);
  const { archetypeId, nodeId } = req.params;
  if (!isArchetype(archetypeId)) return res.status(400).json({ error: 'invalid_archetype' });
  try {
    await ensureCompanySkeleton(company);
    const detail = await readNodeDetail(company, archetypeId, nodeId);
    if (!detail) return res.status(404).json({ error: 'node_not_found' });
    return res.json(detail);
  } catch (err) {
    console.error('[pms-supercycle] node detail', err);
    return res.status(500).json({ error: 'pms_supercycle_failed' });
  }
});

// GET /api/pms/supercycle/nodes/:archetypeId/:nodeId/subnodes/:subNodeId
pmsSupercycleRouter.get('/nodes/:archetypeId/:nodeId/subnodes/:subNodeId', requirePermission('twin', 'read'), async (req, res) => {
  const company = companyId(req);
  if (!company) return noCompany(res);
  const { archetypeId, nodeId, subNodeId } = req.params;
  if (!isArchetype(archetypeId)) return res.status(400).json({ error: 'invalid_archetype' });
  try {
    await ensureCompanySkeleton(company);
    const detail = await readSubNodeDetail(company, archetypeId, nodeId, subNodeId);
    if (!detail) return res.status(404).json({ error: 'sub_node_not_found' });
    return res.json(detail);
  } catch (err) {
    console.error('[pms-supercycle] subnode detail', err);
    return res.status(500).json({ error: 'pms_supercycle_failed' });
  }
});

// GET /api/pms/supercycle/nodes/:archetypeId/:nodeId/stages/:stageId
pmsSupercycleRouter.get('/nodes/:archetypeId/:nodeId/stages/:stageId', requirePermission('twin', 'read'), async (req, res) => {
  const company = companyId(req);
  if (!company) return noCompany(res);
  const { archetypeId, nodeId, stageId } = req.params;
  if (!isArchetype(archetypeId)) return res.status(400).json({ error: 'invalid_archetype' });
  try {
    await ensureCompanySkeleton(company);
    const detail = await readStageDetail(company, archetypeId, nodeId, stageId);
    if (!detail) return res.status(404).json({ error: 'stage_not_found' });
    return res.json(detail);
  } catch (err) {
    console.error('[pms-supercycle] stage detail', err);
    return res.status(500).json({ error: 'pms_supercycle_failed' });
  }
});

pmsSupercycleRouter.put('/', requirePermission('twin', 'write'), async (req, res) => {
  const company = companyId(req);
  if (!company) return noCompany(res);
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  const slice = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into public.pms_supercycle_settings(company_id,archetype_id)
         values($1,$2)
       on conflict(company_id) do update set archetype_id=excluded.archetype_id,updated_at=now()`,
      [company, slice.archetypeId],
    );
    // Full replace keeps the server an exact mirror of the client slice.
    await client.query(`delete from public.pms_supercycle_cycles where company_id=$1`, [company]);
    await client.query(`delete from public.pms_supercycle_department_cycles where company_id=$1`, [company]);
    await client.query(`delete from public.pms_supercycle_instances where company_id=$1`, [company]);

    for (const c of slice.cycles) {
      await client.query(
        `insert into public.pms_supercycle_cycles
           (company_id,client_id,archetype_id,name,color,department_ids,sub_node_ids)
         values($1,$2,$3,$4,$5,$6,$7)`,
        [company, c.id, c.archetypeId, c.name, c.color, c.departmentIds, c.subNodeIds ?? []],
      );
    }
    for (const d of slice.departmentCycles) {
      await client.query(
        `insert into public.pms_supercycle_department_cycles
           (company_id,client_id,archetype_id,department_id,name,color,stage_ids)
         values($1,$2,$3,$4,$5,$6,$7)`,
        [company, d.id, d.archetypeId, d.departmentId, d.name, d.color, d.stageIds],
      );
    }
    for (const i of slice.instances) {
      await client.query(
        `insert into public.pms_supercycle_instances
           (company_id,client_id,name,department_node_id,sub_node_id,template_id,stage_index,status,object_type,object_id)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [company, i.id, i.name, i.departmentNodeId, i.subNodeId ?? null, i.templateId, i.stageIndex, i.status, i.objectType ?? null, i.objectId ?? null],
      );
    }

    // Execution layer (Phase 4): mirror the JSONB collections as a single row.
    // Optional on the wire — only touch the row when the client actually sent
    // execution data, so an older client never wipes it.
    const hasExecution = [slice.projects, slice.tasks, slice.milestones, slice.risks,
      slice.decisions, slice.files, slice.messages].some((v) => v !== undefined);
    if (hasExecution) {
      await client.query(
        `insert into public.pms_execution
           (company_id,projects,tasks,milestones,risks,decisions,files,messages)
         values($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb)
         on conflict(company_id) do update set
           projects=excluded.projects, tasks=excluded.tasks, milestones=excluded.milestones,
           risks=excluded.risks, decisions=excluded.decisions, files=excluded.files,
           messages=excluded.messages, updated_at=now()`,
        [company,
          JSON.stringify(slice.projects ?? []), JSON.stringify(slice.tasks ?? []),
          JSON.stringify(slice.milestones ?? []), JSON.stringify(slice.risks ?? []),
          JSON.stringify(slice.decisions ?? []), JSON.stringify(slice.files ?? []),
          JSON.stringify(slice.messages ?? [])],
      );
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    console.error('[pms-supercycle] put', err);
    return res.status(500).json({ error: 'pms_supercycle_failed' });
  } finally {
    client.release();
  }

  try {
    return res.json(await readSlice(company));
  } catch (err) {
    console.error('[pms-supercycle] put/read-back', err);
    return res.status(500).json({ error: 'pms_supercycle_failed' });
  }
});
