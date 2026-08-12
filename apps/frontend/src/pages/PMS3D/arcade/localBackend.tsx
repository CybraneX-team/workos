import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CatalogueItemRow, MemberRole, SprintRow, TaskRow, TeamMemberRow } from "./lemma";

// ---------------------------------------------------------------------------
// Drop-in local replacement for lemma-sdk/react's useAuth/useRecords/useFunctionRun,
// matching their call signatures exactly so App.tsx (and its animation/interaction
// code) didn't need to change at all — only the import line did. State lives in
// one React Context, persisted to localStorage, and every mutation is synchronous
// in-memory, so calls that used to be network round-trips now resolve instantly.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "task-arcade-local-backend-v1";

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const PALETTE = ["#2f8d4d", "#42be65", "#4f90df", "#a878e4", "#efad32", "#e9627a", "#5bb0a6", "#d98a5b"];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

type BackendState = {
  currentUserEmail: string | null;
  teamMembers: TeamMemberRow[];
  sprints: SprintRow[];
  catalogueItems: CatalogueItemRow[];
  tasks: TaskRow[];
};

const EMPTY_STATE: BackendState = {
  currentUserEmail: null,
  teamMembers: [],
  sprints: [],
  catalogueItems: [],
  tasks: [],
};

function loadState(): BackendState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    return { ...EMPTY_STATE, ...JSON.parse(raw) };
  } catch {
    return EMPTY_STATE;
  }
}

function saveState(state: BackendState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort local persistence only
  }
}

type BackendContextValue = {
  state: BackendState;
  setState: (updater: BackendState | ((prev: BackendState) => BackendState)) => void;
};

const BackendContext = createContext<BackendContextValue | null>(null);

export function LocalBackendProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BackendState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  return <BackendContext.Provider value={{ state, setState }}>{children}</BackendContext.Provider>;
}

function useBackend(): BackendContextValue {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error("useBackend must be used within LocalBackendProvider");
  return ctx;
}

// ── Account creation / reset — used by AccountGate, not part of the SDK shim ──

const SEED_BOTS: { name: string; role: MemberRole; }[] = [
  { name: "Riya", role: "manager" },
  { name: "Asha", role: "member" },
  { name: "Rohan", role: "member" },
  { name: "Maya", role: "member" },
];

export function useCreateAccount() {
  const { setState } = useBackend();
  return useCallback(
    (name: string, role: MemberRole) => {
      const trimmed = name.trim() || "You";
      const email = `${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@local.test`;
      const now = new Date().toISOString();
      const me: TeamMemberRow = { id: uid("member"), name: trimmed, email, role, color: colorFor(trimmed), created_at: now };
      const bots: TeamMemberRow[] = SEED_BOTS.filter((b) => b.name !== trimmed).map((b) => ({
        id: uid("member"),
        name: b.name,
        email: `${b.name.toLowerCase()}@local.test`,
        role: b.role,
        color: colorFor(b.name),
        created_at: now,
      }));
      const sprint: SprintRow = {
        id: uid("sprint"),
        name: "First Sprint",
        goal: 300,
        status: "active",
        starts_at: now,
        created_at: now,
      };
      setState({
        currentUserEmail: email,
        teamMembers: [me, ...bots],
        sprints: [sprint],
        catalogueItems: [],
        tasks: [],
      });
    },
    [setState],
  );
}

export function useResetAccount() {
  const { setState } = useBackend();
  return useCallback(() => setState(EMPTY_STATE), [setState]);
}

export function useHasAccount(): boolean {
  const { state } = useBackend();
  return state.currentUserEmail != null;
}

// Lets the demo "act as" any seeded team member (manager or bot) without
// creating a separate account, so one person can try the whole assign →
// clear → place → review loop solo.
export function useTeamRoster(): { members: TeamMemberRow[]; currentEmail: string | null } {
  const { state } = useBackend();
  return { members: state.teamMembers, currentEmail: state.currentUserEmail };
}

export function useSwitchActingAs() {
  const { setState } = useBackend();
  return useCallback((email: string) => setState((s) => ({ ...s, currentUserEmail: email })), [setState]);
}

// ── lemma-sdk/react-compatible shims ────────────────────────────────────────

export function useAuth(_client?: unknown) {
  const { state } = useBackend();
  const user = useMemo(() => {
    if (!state.currentUserEmail) return null;
    const row = state.teamMembers.find((m) => m.email === state.currentUserEmail);
    return { email: state.currentUserEmail, name: row?.name ?? state.currentUserEmail.split("@")[0] };
  }, [state.currentUserEmail, state.teamMembers]);
  return { user };
}

type TableKey = "team_members" | "sprints" | "catalogue_items" | "tasks";

function tableRows(state: BackendState, tableName: string): unknown[] {
  switch (tableName as TableKey) {
    case "team_members": return state.teamMembers;
    case "sprints": return state.sprints;
    case "catalogue_items": return state.catalogueItems;
    case "tasks": return state.tasks;
    default: return [];
  }
}

export function useRecords<T>({
  tableName,
  sort,
  limit,
}: {
  client?: unknown;
  tableName: string;
  sort?: { field: string; direction: "asc" | "desc" }[];
  limit?: number;
}) {
  const { state } = useBackend();
  const raw = tableRows(state, tableName) as T[];

  const records = useMemo(() => {
    let list = raw.slice();
    const primarySort = sort?.[0];
    if (primarySort) {
      const { field, direction } = primarySort;
      list = list.slice().sort((a, b) => {
        const av = (a as Record<string, unknown>)[field] ?? "";
        const bv = (b as Record<string, unknown>)[field] ?? "";
        if (av < bv) return direction === "asc" ? -1 : 1;
        if (av > bv) return direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    if (limit != null) list = list.slice(0, limit);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, sort?.[0]?.field, sort?.[0]?.direction, limit]);

  // State is already reactive (it's the source of truth), so there's nothing
  // to re-fetch — refresh is a no-op kept only so call sites don't need to change.
  const refresh = useCallback(async () => {}, []);

  return { records, refresh, isLoading: false, error: null as unknown };
}

type AssignTaskPayload = {
  title: string;
  assignee_email: string;
  points: number;
  sprint_id: string;
  source?: string;
  due?: string;
};
type ClearTaskPayload = { task_id: string };
type PlaceComponentPayload = { task_id: string; component: string; world_x: number; world_z: number };
type ReviewTaskPayload = { task_id: string; decision: "approve" | "reject" };

const VALID_POINTS = new Set([15, 30, 45, 60]);

export function useFunctionRun({
  functionName,
}: {
  client?: unknown;
  functionName: "assign_task" | "clear_task" | "place_component" | "review_task" | string;
}) {
  const { state, setState } = useBackend();

  const start = useCallback(
    async (payload: unknown): Promise<unknown> => {
      const callerEmail = state.currentUserEmail;
      if (!callerEmail) throw new Error("You are not signed in.");
      const caller = state.teamMembers.find((m) => m.email === callerEmail);
      if (!caller) throw new Error("You are not a team member. Ask a manager to add you.");

      switch (functionName) {
        case "assign_task": {
          const data = payload as AssignTaskPayload;
          if (caller.role === "viewer") throw new Error("Viewers cannot assign tasks.");
          if (caller.role === "member" && data.assignee_email !== callerEmail) {
            throw new Error("Members can only assign tasks to themselves. Only managers can assign to others.");
          }
          if (!VALID_POINTS.has(data.points)) throw new Error(`points must be one of 15/30/45/60, got ${data.points}`);
          const id = uid("task");
          const row: TaskRow = {
            id,
            title: data.title,
            assignee: data.assignee_email,
            assigner: callerEmail,
            points: data.points,
            source: (data.source as TaskRow["source"]) ?? "slack",
            sprint_id: data.sprint_id,
            due: data.due ?? "",
            status: "assigned",
            created_at: new Date().toISOString(),
          };
          setState((s) => ({ ...s, tasks: [...s.tasks, row] }));
          return { task_id: id, status: "assigned" };
        }
        case "clear_task": {
          const data = payload as ClearTaskPayload;
          if (caller.role === "viewer") throw new Error("Viewers cannot clear tasks.");
          const task = state.tasks.find((t) => t.id === data.task_id);
          if (!task) throw new Error("Task not found.");
          if (task.assignee !== callerEmail) throw new Error("You can only clear tasks assigned to you.");
          if (task.status !== "assigned") throw new Error(`Task is already ${task.status}, cannot clear.`);
          setState((s) => ({
            ...s,
            tasks: s.tasks.map((t) => (t.id === data.task_id ? { ...t, status: "cleared" } : t)),
          }));
          return { task_id: task.id, status: "cleared", points: task.points };
        }
        case "place_component": {
          const data = payload as PlaceComponentPayload;
          if (caller.role === "viewer") throw new Error("Viewers cannot place builds.");
          const task = state.tasks.find((t) => t.id === data.task_id);
          if (!task) throw new Error("Task not found.");
          if (task.assignee !== callerEmail) throw new Error("You can only place builds for your own tasks.");
          if (task.status !== "cleared") throw new Error(`Task must be cleared before placing. Current status: ${task.status}.`);
          setState((s) => ({
            ...s,
            tasks: s.tasks.map((t) =>
              t.id === data.task_id
                ? { ...t, component: data.component, world_x: data.world_x, world_z: data.world_z, status: "under_review" }
                : t,
            ),
          }));
          return { task_id: task.id, status: "under_review", component: data.component };
        }
        case "review_task": {
          const data = payload as ReviewTaskPayload;
          if (caller.role !== "manager") throw new Error("Only managers can review and approve/reject builds.");
          const task = state.tasks.find((t) => t.id === data.task_id);
          if (!task) throw new Error("Task not found.");
          if (task.status !== "under_review") throw new Error(`Task is not pending review. Current status: ${task.status}.`);
          const nextStatus = data.decision === "approve" ? "established" : "demolished";
          setState((s) => ({
            ...s,
            tasks: s.tasks.map((t) => (t.id === data.task_id ? { ...t, status: nextStatus, reviewer: callerEmail } : t)),
          }));
          return { task_id: task.id, status: nextStatus, reviewer: callerEmail };
        }
        default:
          throw new Error(`Unknown function: ${functionName}`);
      }
    },
    [functionName, state, setState],
  );

  return { start };
}
