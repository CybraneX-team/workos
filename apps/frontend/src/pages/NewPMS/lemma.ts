// Schema for /new-pms.
//
// The task schema here is a SUPERSET of /3d-pms's: it adds `subtasks` (which
// drive a task's 0-100% progress) and `structure` (which building model was
// placed on the island). It's defined locally rather than by widening the
// /3d-pms module so changes to this page's task model can never affect that
// one — the two pages now own their own backends and their own localStorage.
//
// Everything /new-pms does NOT extend is re-exported from /3d-pms rather than
// copied, so the ~120-line md5/gravatar implementation lives in exactly one
// place.
export { client, gravatarUrl } from "../PMS3D/arcade/lemma";
export type {
  AgentActionRow,
  CatalogueItemRow,
  MemberRole,
  SprintRow,
  TaskSource,
  TeamMemberRow,
} from "../PMS3D/arcade/lemma";

import type { TaskSource } from "../PMS3D/arcade/lemma";

// "building" is the state between placing the structure and finishing every
// subtask: the model is on the island, growing through its 10 stages.
export type TaskStatus =
  | "assigned"
  | "cleared"
  | "building"
  | "under_review"
  | "established"
  | "demolished";

export type SubtaskRow = { id: string; title: string; done: boolean };

export type TaskRow = {
  id: string;
  title: string;
  assignee: string;
  assigner: string;
  points: number;
  source: TaskSource;
  sprint_id: string;
  due?: string;
  status: TaskStatus;
  component?: string | null;
  world_x?: number | null;
  world_z?: number | null;
  reviewer?: string | null;
  created_at?: string;
  updated_at?: string;
  // Optional so rows written before subtasks existed still load.
  subtasks?: SubtaskRow[];
  structure?: string | null;
};
