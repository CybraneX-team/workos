import { pool } from './db.js';
import type { PoolClient } from 'pg';

// Phase 1 — the per-company supercycle skeleton.
//
// `ensureCompanySkeleton` lazily copies the global catalogue
// (pms_archetype_templates) into the company-owned pms_sc_* tables the first
// time a company touches the supercycle. `readCompanySkeletons` returns the
// skeleton shaped exactly like the frontend's SUPERCYCLE_ARCHETYPES map, so the
// UI can later drop the hardcoded catalogue and read this instead.

type TemplateSubNode = { id: string; label: string };
type TemplateNode = {
  id: string;
  label: string;
  color: string;
  slot: number;
  subNodes: TemplateSubNode[];
  subCycle: { id: string; label: string; stages: string[] };
};
type TemplateRow = {
  archetype_id: string;
  label: string;
  revenue_model: string;
  slot_colors: string[];
  optional_nodes: string[];
  nodes: TemplateNode[];
};

export type SkeletonNode = {
  id: string;
  label: string;
  color: string;
  slot: number;
  subNodes: TemplateSubNode[];
  subCycle: { id: string; label: string; stages: string[] };
};
export type SkeletonArchetype = {
  id: string;
  label: string;
  revenueModel: string;
  optionalNodes: string[];
  slotColors: string[];
  nodes: SkeletonNode[];
};
export type CompanySkeletons = Record<string, SkeletonArchetype>;

async function seedArchetype(client: PoolClient, company: string, t: TemplateRow) {
  for (let ni = 0; ni < t.nodes.length; ni += 1) {
    const n = t.nodes[ni];
    const inserted = await client.query<{ id: string }>(
      `insert into public.pms_sc_nodes
         (company_id,archetype_id,client_id,label,color,slot,sub_cycle_label,position)
       values($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict(company_id,archetype_id,client_id) do nothing
       returning id`,
      [company, t.archetype_id, n.id, n.label, n.color, n.slot ?? ni, n.subCycle?.label ?? '', ni],
    );
    let nodeId = inserted.rows[0]?.id;
    if (!nodeId) {
      // Lost a race to a concurrent seeder — adopt the existing row.
      const existing = await client.query<{ id: string }>(
        `select id from public.pms_sc_nodes where company_id=$1 and archetype_id=$2 and client_id=$3`,
        [company, t.archetype_id, n.id],
      );
      nodeId = existing.rows[0]?.id;
    }
    if (!nodeId) continue;

    for (let si = 0; si < (n.subNodes?.length ?? 0); si += 1) {
      const s = n.subNodes[si];
      await client.query(
        `insert into public.pms_sc_subnodes(company_id,node_id,client_id,label,position)
         values($1,$2,$3,$4,$5) on conflict(node_id,client_id) do nothing`,
        [company, nodeId, s.id, s.label, si],
      );
    }
    const stages = n.subCycle?.stages ?? [];
    for (let sti = 0; sti < stages.length; sti += 1) {
      const label = stages[sti];
      await client.query(
        `insert into public.pms_sc_stages(company_id,node_id,client_id,label,position)
         values($1,$2,$3,$4,$5) on conflict(node_id,client_id) do nothing`,
        [company, nodeId, label, label, sti],
      );
    }
  }
}

/** Copy every archetype template into this company's own skeleton, once. */
export async function ensureCompanySkeleton(company: string): Promise<void> {
  const seeded = await pool.query(
    `select 1 from public.pms_sc_nodes where company_id=$1 limit 1`, [company],
  );
  if (seeded.rows.length) return;

  const templates = await pool.query<TemplateRow>(
    `select archetype_id,label,revenue_model,slot_colors,optional_nodes,nodes
       from public.pms_archetype_templates order by archetype_id`,
  );
  if (templates.rows.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const t of templates.rows) {
      await seedArchetype(client, company, t);
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

// Default value cycle + department cycles, ported from the old client-side
// generators (usePmsStore.defaultCycle / defaultDepartmentCycles) so the client
// no longer needs the hardcoded catalogue to bootstrap a new company.
const DEFAULT_CYCLE_COLOR = '#4fd8ff';
const DEPARTMENT_CYCLE_COLORS = ['#4fd8ff', '#c1aeff', '#22c55e', '#f0a83f'];

/** Seed the default cycles for every archetype, once, if the company has none. */
export async function ensureCompanyDefaultCycles(company: string): Promise<void> {
  const existing = await pool.query(
    `select 1 from public.pms_supercycle_cycles where company_id=$1 limit 1`, [company],
  );
  if (existing.rows.length) return;
  const alsoDept = await pool.query(
    `select 1 from public.pms_supercycle_department_cycles where company_id=$1 limit 1`, [company],
  );
  if (alsoDept.rows.length) return;

  const skeletons = await readCompanySkeletons(company);
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const [archetypeId, arch] of Object.entries(skeletons)) {
      if (arch.nodes.length === 0) continue;

      // Default value cycle: every department + each node's first sub-node.
      const departmentIds = arch.nodes.map((n) => n.id);
      const subNodeIds = arch.nodes.map((n) => n.subNodes[0]?.id).filter((id): id is string => Boolean(id));
      await client.query(
        `insert into public.pms_supercycle_cycles
           (company_id,client_id,archetype_id,name,color,department_ids,sub_node_ids)
         values($1,$2,$3,$4,$5,$6,$7)
         on conflict(company_id,client_id) do nothing`,
        [company, `cycle_default_${archetypeId}`, archetypeId, 'Revenue & Growth',
          DEFAULT_CYCLE_COLOR, departmentIds, subNodeIds],
      );

      // Default department (sub-)cycles: four loops per node.
      for (const node of arch.nodes) {
        const stages = node.subCycle.stages;
        const middle = stages.slice(1, Math.min(stages.length, 4));
        const closing = [...stages.slice(Math.max(0, stages.length - 3)), stages[0]]
          .filter((stage, index, all) => all.indexOf(stage) === index);
        const memberships = [
          stages,
          stages.slice(0, Math.max(2, Math.ceil(stages.length * 0.6))),
          middle.length >= 2 ? middle : stages.slice(0, 2),
          closing.length >= 2 ? closing : stages.slice(-2),
        ];
        const names = [
          node.subCycle.label,
          `${node.subNodes[0]?.label ?? 'Planning'} loop`,
          `${node.subNodes[1]?.label ?? 'Delivery'} loop`,
          `${node.label} optimisation`,
        ];
        for (let index = 0; index < 4; index += 1) {
          await client.query(
            `insert into public.pms_supercycle_department_cycles
               (company_id,client_id,archetype_id,department_id,name,color,stage_ids)
             values($1,$2,$3,$4,$5,$6,$7)
             on conflict(company_id,client_id) do nothing`,
            [company, `department_cycle_${archetypeId}_${node.id}_${index + 1}`, archetypeId,
              node.id, names[index], DEPARTMENT_CYCLE_COLORS[index], memberships[index]],
          );
        }
      }
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

/** Ensure both the skeleton and the default cycles exist (idempotent). */
export async function ensureCompanyDefaults(company: string): Promise<void> {
  await ensureCompanySkeleton(company);
  await ensureCompanyDefaultCycles(company);
}

/**
 * Read this company's skeleton, shaped like the frontend SUPERCYCLE_ARCHETYPES
 * map. Archetype-level meta (label / revenue model / optional / slot colours)
 * comes from the global template; the node/sub-node/stage structure comes from
 * the company's own (editable) rows.
 */
export async function readCompanySkeletons(company: string): Promise<CompanySkeletons> {
  const [meta, nodes, subnodes, stages] = await Promise.all([
    pool.query<{ archetype_id: string; label: string; revenue_model: string; slot_colors: string[]; optional_nodes: string[] }>(
      `select archetype_id,label,revenue_model,slot_colors,optional_nodes from public.pms_archetype_templates`),
    pool.query<{ id: string; archetype_id: string; client_id: string; label: string; color: string; slot: number; sub_cycle_label: string }>(
      `select id,archetype_id,client_id,label,color,slot,sub_cycle_label
         from public.pms_sc_nodes where company_id=$1 order by archetype_id,position`, [company]),
    pool.query<{ node_id: string; client_id: string; label: string }>(
      `select node_id,client_id,label from public.pms_sc_subnodes where company_id=$1 order by position`, [company]),
    pool.query<{ node_id: string; client_id: string; label: string }>(
      `select node_id,client_id,label from public.pms_sc_stages where company_id=$1 order by position`, [company]),
  ]);

  const subByNode = new Map<string, TemplateSubNode[]>();
  for (const r of subnodes.rows) {
    if (!subByNode.has(r.node_id)) subByNode.set(r.node_id, []);
    subByNode.get(r.node_id)!.push({ id: r.client_id, label: r.label });
  }
  const stagesByNode = new Map<string, string[]>();
  for (const r of stages.rows) {
    if (!stagesByNode.has(r.node_id)) stagesByNode.set(r.node_id, []);
    stagesByNode.get(r.node_id)!.push(r.label);
  }

  const out: CompanySkeletons = {};
  for (const m of meta.rows) {
    out[m.archetype_id] = {
      id: m.archetype_id,
      label: m.label,
      revenueModel: m.revenue_model,
      optionalNodes: m.optional_nodes ?? [],
      slotColors: m.slot_colors ?? [],
      nodes: [],
    };
  }
  for (const n of nodes.rows) {
    const arch = out[n.archetype_id];
    if (!arch) continue;
    arch.nodes.push({
      id: n.client_id,
      label: n.label,
      color: n.color,
      slot: n.slot,
      subNodes: subByNode.get(n.id) ?? [],
      subCycle: {
        id: `${n.client_id}_cycle`,
        label: n.sub_cycle_label,
        stages: stagesByNode.get(n.id) ?? [],
      },
    });
  }
  return out;
}

// ── Phase 3: per-level (lazy) detail reads ───────────────────────────────────
// Each drill level has its own reader (and route), so the client can fetch just
// the level it opened: node → sub-node → stage. All are company-scoped and keyed
// by the same client ids the frontend already uses (archetype id + node id).

type NodeRow = {
  id: string; client_id: string; label: string; color: string; slot: number; sub_cycle_label: string;
};

async function findNode(company: string, archetypeId: string, nodeClientId: string): Promise<NodeRow | null> {
  const { rows } = await pool.query<NodeRow>(
    `select id,client_id,label,color,slot,sub_cycle_label
       from public.pms_sc_nodes
      where company_id=$1 and archetype_id=$2 and client_id=$3`,
    [company, archetypeId, nodeClientId],
  );
  return rows[0] ?? null;
}

/** One department node with everything hanging off it (planet detail). */
export async function readNodeDetail(company: string, archetypeId: string, nodeClientId: string) {
  const node = await findNode(company, archetypeId, nodeClientId);
  if (!node) return null;

  const [subnodes, stages, departmentCycles, instances, valueCycles, execution] = await Promise.all([
    pool.query<{ client_id: string; label: string }>(
      `select client_id,label from public.pms_sc_subnodes where node_id=$1 order by position`, [node.id]),
    pool.query<{ client_id: string; label: string; position: number }>(
      `select client_id,label,position from public.pms_sc_stages where node_id=$1 order by position`, [node.id]),
    pool.query<any>(
      `select client_id,archetype_id,department_id,name,color,stage_ids
         from public.pms_supercycle_department_cycles
        where company_id=$1 and archetype_id=$2 and department_id=$3 order by created_at`,
      [company, archetypeId, nodeClientId]),
    pool.query<any>(
      `select client_id,name,department_node_id,sub_node_id,template_id,stage_index,status,object_type,object_id
         from public.pms_supercycle_instances
        where company_id=$1 and department_node_id=$2 order by created_at`,
      [company, nodeClientId]),
    pool.query<any>(
      `select client_id,archetype_id,name,color,department_ids,sub_node_ids
         from public.pms_supercycle_cycles
        where company_id=$1 and archetype_id=$2 and $3 = ANY(department_ids) order by created_at`,
      [company, archetypeId, nodeClientId]),
    pool.query<{ projects: any[] }>(
      `select projects from public.pms_execution where company_id=$1`, [company]),
  ]);
  const nodeProjects: any[] = (execution.rows[0]?.projects ?? []).filter((p: any) => p.departmentId === nodeClientId);

  return {
    archetypeId,
    node: {
      id: node.client_id,
      label: node.label,
      color: node.color,
      slot: node.slot,
      subCycleLabel: node.sub_cycle_label,
    },
    subNodes: subnodes.rows.map((s) => ({ id: s.client_id, label: s.label })),
    stages: stages.rows.map((s) => ({ id: s.client_id, label: s.label, index: s.position })),
    departmentCycles: departmentCycles.rows.map((r) => ({
      id: r.client_id, archetypeId: r.archetype_id, departmentId: r.department_id,
      name: r.name, color: r.color, stageIds: r.stage_ids ?? [],
    })),
    instances: instances.rows.map((r) => ({
      id: r.client_id, name: r.name, departmentNodeId: r.department_node_id,
      ...(r.sub_node_id ? { subNodeId: r.sub_node_id } : {}),
      templateId: r.template_id, stageIndex: r.stage_index, status: r.status,
      ...(r.object_type ? { objectType: r.object_type } : {}),
      ...(r.object_id ? { objectId: r.object_id } : {}),
    })),
    cycles: valueCycles.rows.map((r) => ({
      id: r.client_id, archetypeId: r.archetype_id, name: r.name, color: r.color,
      departmentIds: r.department_ids ?? [], ...(r.sub_node_ids?.length ? { subNodeIds: r.sub_node_ids } : {}),
    })),
    projects: nodeProjects,
  };
}

/** One sub-node inside a node (its stages + the instances scoped to it). */
export async function readSubNodeDetail(company: string, archetypeId: string, nodeClientId: string, subNodeClientId: string) {
  const node = await findNode(company, archetypeId, nodeClientId);
  if (!node) return null;
  const sub = await pool.query<{ client_id: string; label: string }>(
    `select client_id,label from public.pms_sc_subnodes where node_id=$1 and client_id=$2`,
    [node.id, subNodeClientId],
  );
  if (sub.rows.length === 0) return null;

  const [stages, instances] = await Promise.all([
    pool.query<{ client_id: string; label: string; position: number }>(
      `select client_id,label,position from public.pms_sc_stages where node_id=$1 order by position`, [node.id]),
    pool.query<any>(
      `select client_id,name,department_node_id,sub_node_id,template_id,stage_index,status,object_type,object_id
         from public.pms_supercycle_instances
        where company_id=$1 and department_node_id=$2 and sub_node_id=$3 order by created_at`,
      [company, nodeClientId, subNodeClientId]),
  ]);

  return {
    archetypeId,
    nodeId: nodeClientId,
    subNode: { id: sub.rows[0].client_id, label: sub.rows[0].label },
    stages: stages.rows.map((s) => ({ id: s.client_id, label: s.label, index: s.position })),
    instances: instances.rows.map((r) => ({
      id: r.client_id, name: r.name, departmentNodeId: r.department_node_id,
      ...(r.sub_node_id ? { subNodeId: r.sub_node_id } : {}),
      templateId: r.template_id, stageIndex: r.stage_index, status: r.status,
      ...(r.object_type ? { objectType: r.object_type } : {}),
      ...(r.object_id ? { objectId: r.object_id } : {}),
    })),
  };
}

/** One stage inside a node's loop (e.g. "Build") — the execution entry point.
 *  `projects` is a placeholder until the execution layer lands (Phase 4). */
export async function readStageDetail(company: string, archetypeId: string, nodeClientId: string, stageClientId: string) {
  const node = await findNode(company, archetypeId, nodeClientId);
  if (!node) return null;
  const stage = await pool.query<{ client_id: string; label: string; position: number }>(
    `select client_id,label,position from public.pms_sc_stages where node_id=$1 and client_id=$2`,
    [node.id, stageClientId],
  );
  if (stage.rows.length === 0) return null;
  const index = stage.rows[0].position;

  const [instances, execution] = await Promise.all([
    pool.query<any>(
      `select client_id,name,department_node_id,sub_node_id,template_id,stage_index,status,object_type,object_id
         from public.pms_supercycle_instances
        where company_id=$1 and department_node_id=$2 and stage_index=$3 order by created_at`,
      [company, nodeClientId, index]),
    pool.query<{ projects: any[] }>(
      `select projects from public.pms_execution where company_id=$1`, [company]),
  ]);

  // Projects at this stage = those linked to an instance sitting here. (Unlinked
  // projects belong to the node as a whole; they show in the node detail.)
  const instanceIdsHere = new Set(instances.rows.map((r) => r.client_id));
  const allProjects: any[] = execution.rows[0]?.projects ?? [];
  const projects = allProjects.filter((p) => p.liveInstanceId && instanceIdsHere.has(p.liveInstanceId));

  return {
    archetypeId,
    nodeId: nodeClientId,
    stage: { id: stage.rows[0].client_id, label: stage.rows[0].label, index },
    instances: instances.rows.map((r) => ({
      id: r.client_id, name: r.name, departmentNodeId: r.department_node_id,
      ...(r.sub_node_id ? { subNodeId: r.sub_node_id } : {}),
      templateId: r.template_id, stageIndex: r.stage_index, status: r.status,
      ...(r.object_type ? { objectType: r.object_type } : {}),
      ...(r.object_id ? { objectId: r.object_id } : {}),
    })),
    projects,
  };
}
