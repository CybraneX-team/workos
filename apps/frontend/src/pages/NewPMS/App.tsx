import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Cloud, Clouds, OrbitControls, OrthographicCamera, Text, useGLTF } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  Building2,
  Car,
  Castle,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  ClipboardList,
  Clock,
  Crown,
  Droplets,
  Film,
  Gem,
  Hammer,
  Layers,
  Play,
  Plus,
  Boxes,
  Send,
  Share2,
  Ship,
  Sparkles,
  Store,
  Trees,
  Trophy,
  Users,
  Wind,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useAuth, useFunctionRun, useRecords } from "./localBackend";
import VisualProductDoc from "../PMS3D/arcade/VisualProductDoc";
import {
  client,
  gravatarUrl,
  type TaskRow,
  type SprintRow,
  type TeamMemberRow,
  type CatalogueItemRow,
  type MemberRole,
} from "./lemma";
import { CinematicDirector, type CineControls, type CineScript } from "../PMS3D/arcade/cinematic";
import { QuartermasterPage } from "../PMS3D/arcade/QuartermasterPage";
import { DEMOS } from "../PMS3D/arcade/demos";

// ---------------------------------------------------------------------------
// MODEL
// ---------------------------------------------------------------------------

type Tier = 15 | 30 | 45 | 60;
type ComponentKind =
  | "sapling" | "mushrooms" | "crystals" | "lantern"
  | "tree" | "stall" | "fountain" | "cart"
  | "cottage" | "watermill" | "taco_stand" | "watchtower"
  | "ship" | "castle_gate" | "windmill" | "manor" | "grand_fountain";
type PlacementState = "under_review" | "established" | "demolished";
type AppTab = "world" | "tasks" | "review" | "gallery" | "all" | "catalog" | "kits" | "stats" | "roadmap" | "demos" | "quartermaster";
type TaskSource = "slack" | "email" | "telegram";
type TaskStatus = "assigned" | "cleared" | "building" | "under_review" | "established" | "demolished";
type Subtask = { id: string; title: string; done: boolean };

type Member = { name: string; email: string; color: string; points: number };
type CatalogueItem = { kind: ComponentKind; label: string; tier: Tier };
type Placement = {
  id: string;
  task: string;
  builder: string;
  builderEmail: string;
  item: CatalogueItem;
  x: number;
  z: number;
  state: PlacementState;
  submitted: string;
  // 0-100, from the task's subtask checklist — decides which of the 10
  // stages of the structure is standing on this tile.
  progress: number;
  // Which entry in STRUCTURES this placement renders.
  structureId: string;
};
type Role = "manager" | "member" | "viewer";
type MockTask = {
  id: string;
  title: string;
  assignee: string;
  assigner: string;
  tier: Tier;
  source: TaskSource;
  sprintId: string;
  status: TaskStatus;
  due: string;
  component?: string | null;
  worldX?: number | null;
  worldZ?: number | null;
  subtasks: Subtask[];
  structure?: string | null;
};

const TIER_COLOR: Record<Tier, string> = { 15: "#7fc26b", 30: "#3fa3df", 45: "#f0a92e", 60: "#8e6fd6" };
const TIER_LABEL: Record<Tier, string> = { 15: "Quick win", 30: "Half-day", 45: "Deliverable", 60: "Milestone" };

const CATALOGUE: CatalogueItem[] = [
  { kind: "sapling", label: "Sapling", tier: 15 },
  { kind: "mushrooms", label: "Mushroom patch", tier: 15 },
  { kind: "crystals", label: "Crystal rocks", tier: 15 },
  { kind: "lantern", label: "Lantern", tier: 15 },
  { kind: "tree", label: "Canopy tree", tier: 30 },
  { kind: "stall", label: "Market stall", tier: 30 },
  { kind: "fountain", label: "Fountain", tier: 30 },
  { kind: "cart", label: "Cart", tier: 30 },
  { kind: "cottage", label: "Cottage", tier: 45 },
  { kind: "watermill", label: "Watermill", tier: 45 },
  { kind: "taco_stand", label: "Taco stand", tier: 45 },
  { kind: "watchtower", label: "Watchtower", tier: 45 },
  { kind: "ship", label: "Large ship", tier: 60 },
  { kind: "castle_gate", label: "Castle gate", tier: 60 },
  { kind: "windmill", label: "Castle tower", tier: 60 },
  { kind: "manor", label: "Manor", tier: 60 },
  { kind: "grand_fountain", label: "Grand fountain", tier: 60 },
];

const COMPONENT_BY_KIND: Record<string, CatalogueItem> = Object.fromEntries(CATALOGUE.map((c) => [c.kind, c]));
const itemForKind = (kind: string): CatalogueItem => COMPONENT_BY_KIND[kind] ?? CATALOGUE.find((c) => c.kind === "tree")!;

const ROSTER_FALLBACK: { name: string; email: string; color: string; role: Role }[] = [
  { name: "Manager", email: "manager@example.com", color: "#2f8d4d", role: "manager" },
  { name: "Asha", email: "asha@example.com", color: "#42be65", role: "member" },
  { name: "Rohan", email: "rohan@example.com", color: "#4f90df", role: "member" },
  { name: "Maya", email: "maya@example.com", color: "#a878e4", role: "member" },
  { name: "Kabir", email: "kabir@example.com", color: "#efad32", role: "member" },
  { name: "Neha", email: "neha@example.com", color: "#e9627a", role: "member" },
];

const FALLBACK_COLORS = ["#5bb0a6", "#d98a5b", "#c75b7a", "#7c9a3e", "#3f9ec0"];

function colorForBuilder(email: string, teamMembers?: TeamMemberRow[]): string {
  const known = teamMembers?.find((m) => m.email === email);
  if (known?.color) return known.color;
  const fb = ROSTER_FALLBACK.find((m) => m.email === email);
  if (fb) return fb.color;
  let h = 0;
  for (let i = 0; i < email.length; i += 1) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

function nameForEmail(email: string, teamMembers?: TeamMemberRow[]): string {
  const known = teamMembers?.find((m) => m.email === email);
  if (known?.name) return known.name;
  const fb = ROSTER_FALLBACK.find((m) => m.email === email);
  if (fb) return fb.name;
  return email.split("@")[0];
}

const initialOf = (name: string): string => (name.trim()[0] ?? "?").toUpperCase();

function submittedLabel(iso?: string): string {
  if (!iso) return "just now";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

function taskToPlacement(t: MockTask, teamMembers?: TeamMemberRow[]): Placement {
  return {
    id: t.id,
    task: t.title,
    builder: nameForEmail(t.assignee, teamMembers),
    builderEmail: t.assignee,
    item: itemForKind(t.component ?? "tree"),
    x: t.worldX ?? 0,
    z: t.worldZ ?? 0,
    state: t.status as PlacementState,
    submitted: submittedLabel(undefined),
    progress: taskProgress(t),
    structureId: t.structure ?? STRUCTURE_BUILDING,
  };
}

function rowToTask(r: TaskRow): MockTask {
  return {
    id: r.id,
    title: r.title,
    assignee: r.assignee,
    assigner: r.assigner,
    tier: r.points as Tier,
    source: (r.source ?? "slack") as TaskSource,
    sprintId: r.sprint_id,
    status: r.status as TaskStatus,
    due: r.due ?? "",
    component: r.component,
    worldX: r.world_x,
    worldZ: r.world_z,
    subtasks: r.subtasks ?? [],
    structure: r.structure,
  };
}

// ---------------------------------------------------------------------------
// Task progress → building stage
// ---------------------------------------------------------------------------

// Percentage of the task's subtasks that are ticked off. A task with no
// subtasks has no meaningful checklist progress, so it reports 0 until it's
// approved (at which point it's simply finished).
function taskProgress(task: { subtasks: Subtask[]; status: TaskStatus }): number {
  if (task.status === "established") return 100;
  if (task.subtasks.length === 0) return 0;
  const done = task.subtasks.filter((s) => s.done).length;
  return Math.round((done / task.subtasks.length) * 100);
}

// The building has 10 stages and gains one every 10%: placed at 0% it starts
// on stage 1, and it reaches stage 10 at 90% — so the last stage is the one
// standing when the task completes rather than something you only glimpse
// exactly at 100%.
const BUILDING_STAGE_COUNT = 10;

// Only one structure exists so far. Stored on the task so more can be added
// later without a migration — the id is what picks the model set.
const STRUCTURE_BUILDING = "building_01";

function stageForProgress(progress: number): number {
  const stage = 1 + Math.floor(progress / 10);
  return Math.min(BUILDING_STAGE_COUNT, Math.max(1, stage));
}

// Deterministic placements for the GSAP cinematic (no pod writes; replays identically).
function cineSeed(): Placement[] {
  return [
    { id: "c-est-1", task: "Ship the onboarding flow", builder: "Asha", builderEmail: "asha@example.com", item: itemForKind("cottage"), x: -1, z: 0, state: "established", submitted: "2h ago", progress: 100, structureId: STRUCTURE_BUILDING },
    { id: "c-est-2", task: "Polish the review queue", builder: "Kabir", builderEmail: "kabir@example.com", item: itemForKind("crystals"), x: 1, z: 1, state: "established", submitted: "1h ago", progress: 100, structureId: STRUCTURE_BUILDING },
    { id: "c-est-3", task: "Design the recap screen", builder: "Neha", builderEmail: "neha@example.com", item: itemForKind("fountain"), x: 0, z: 2, state: "established", submitted: "3h ago", progress: 100, structureId: STRUCTURE_BUILDING },
    { id: "c-rej", task: "Out-of-scope experiment", builder: "Rohan", builderEmail: "rohan@example.com", item: itemForKind("castle_gate"), x: 2, z: -1, state: "under_review", submitted: "just now", progress: 60, structureId: STRUCTURE_BUILDING },
  ];
}
const CINE_HERO: Placement = {
  id: "c-hero", task: "Prototype the next screen", builder: "Manager", builderEmail: "manager@example.com",
  item: itemForKind("watermill"), x: 0, z: -1, state: "under_review", submitted: "just now", progress: 60, structureId: STRUCTURE_BUILDING,
};

// ---------------------------------------------------------------------------
// 3D primitives + kit loader
// ---------------------------------------------------------------------------

const TILE_GAP = 1.72;
function tilePosition(x: number, z: number, y = 0.32): [number, number, number] {
  return [x * TILE_GAP, y, z * TILE_GAP];
}

const ASSET_BASE = import.meta.env.BASE_URL;

// Sound bank for cinematic SFX cues, keyed by the `sfx` name used in demos.ts.
const SFX_URLS: Record<string, string> = {
  click: `${ASSET_BASE}sounds/click.mp3`,
  shimmer: `${ASSET_BASE}sounds/shimmer.mp3`,
  // Bright chime on approve — reuses the existing sparkle until a dedicated file lands.
  chime: `${ASSET_BASE}sounds/shimmer.mp3`,
  // The cues below point at files not yet in public/sounds/ — they no-op silently
  // (Audio load fails, play() rejects) until you drop the mp3s in.
  whoosh: `${ASSET_BASE}sounds/whoosh.mp3`,
  crumble: `${ASSET_BASE}sounds/crumble.mp3`,
  swell: `${ASSET_BASE}sounds/swell.mp3`,
};
// ---------------------------------------------------------------------------
// World — placeholder canvas. Everything above this point (assign / clear /
// place / review, sprint panel, catalog, tasks, review queue, etc.) is fully
// wired to the real backend and works exactly as it does on /3d-pms. This
// scene is intentionally empty for now — just a camera, controls, and
// lights, no terrain/scenery/placement rendering — so the 3D build can start
// from a clean slate instead of inheriting the old geometry. `placements` /
// `selectedId` / `pickingOccupied` / `onPickTile` are still accepted (and
// the app-level state feeding them still works) so wiring in real geometry
// later doesn't require touching the call site in App().
// ---------------------------------------------------------------------------

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

const LAND_TILE_COUNT = 110;
// Shared backdrop for every view. Declared up here rather than beside the
// glow kit because the gallery palette below is derived from it, and a const
// can't be referenced before its declaration.
const SPACE_BG = "#05070f";
const SPACE_FOG = "#080d1a";

const LAND_TILE_GAP = 1.1;
const LAND_SEED = 20260722;

// Deterministic PRNG (mulberry32) so the land layout below is picked with
// the same sequence of "random" numbers every time — same shape on every
// refresh — instead̃ of Math.random(), which reseeds itself each page load.
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Organic-blob layout: grows outward from the origin tile (0,0) in roughly
// even rings — each step picks from every open edge cell, weighted toward
// whichever is closest to the origin — rather than a plain random walk
// (which can wander off to one side and leave the origin near an edge).
// This keeps (0,0) as the actual visual center of the land, matching the
// OrbitControls `target` fixed there, so the camera always pivots on that
// center tile and never drifts toward whichever tile the walk happened to
// grow into.
function generateLandTiles(count: number, seed: number = LAND_SEED): [number, number][] {
  const random = createSeededRandom(seed);
  const key = (x: number, z: number) => `${x},${z}`;
  const tiles: [number, number][] = [[0, 0]];
  const present = new Set([key(0, 0)]);
  const frontier = new Map<string, [number, number]>();

  const addFrontier = (x: number, z: number) => {
    ([[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]] as [number, number][]).forEach(([nx, nz]) => {
      const k = key(nx, nz);
      if (!present.has(k)) frontier.set(k, [nx, nz]);
    });
  };
  addFrontier(0, 0);

  while (tiles.length < count && frontier.size > 0) {
    const candidates = Array.from(frontier.entries());
    const weights = candidates.map(([, [x, z]]) => 1 / (1 + Math.hypot(x, z)));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = random() * totalWeight;
    let pickIndex = candidates.length - 1;
    for (let i = 0; i < weights.length; i += 1) {
      r -= weights[i];
      if (r <= 0) { pickIndex = i; break; }
    }
    const [pickKey, [nx, nz]] = candidates[pickIndex];
    present.add(pickKey);
    tiles.push([nx, nz]);
    frontier.delete(pickKey);
    addFrontier(nx, nz);
  }
  return tiles;
}

const LAND_TILE_COLOR = "#545457";

function LandTiles({ tiles }: { tiles: [number, number][] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    tiles.forEach(([x, z], i) => {
      dummy.position.set(x * LAND_TILE_GAP, 0, z * LAND_TILE_GAP);
      dummy.scale.set(1, 0.1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [tiles]);

  return (
    <instancedMesh ref={meshRef} args={[UNIT_BOX, undefined, tiles.length]}>
      <meshStandardMaterial color={LAND_TILE_COLOR} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------
// Road — asphalt strip connecting two tiles on the land. The path between
// them is found with a BFS over the land's own tile graph, so the road only
// ever runs across tiles that actually exist and are connected to each
// other — never floating over a gap.
// ---------------------------------------------------------------------------

const ROAD_WIDTH = 0.95;
const ROAD_HEIGHT = 0.01;
const ROAD_COLOR = "#3a3a3d";
const LANE_COLOR = "#f0c94c";
const ROAD_Y = 0.05 + ROAD_HEIGHT / 2; // sits just above the flattened land tiles


function findTilePath(
  tiles: [number, number][],
  start: [number, number],
  end: [number, number],
): [number, number][] {
  const key = (x: number, z: number) => `${x},${z}`;
  const present = new Set(tiles.map(([x, z]) => key(x, z)));
  const startKey = key(start[0], start[1]);
  const endKey = key(end[0], end[1]);
  const cameFrom = new Map<string, string>();
  const visited = new Set([startKey]);
  const queue: [number, number][] = [start];

  let qi = 0;
  while (qi < queue.length) {
    const [cx, cz] = queue[qi];
    qi += 1;
    const ck = key(cx, cz);
    if (ck === endKey) break;
    const neighbors: [number, number][] = [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]];
    for (const [nx, nz] of neighbors) {
      const nk = key(nx, nz);
      if (present.has(nk) && !visited.has(nk)) {
        visited.add(nk);
        cameFrom.set(nk, ck);
        queue.push([nx, nz]);
      }
    }
  }

  if (!visited.has(endKey)) return [start];
  const path: [number, number][] = [end];
  let cur = endKey;
  while (cur !== startKey) {
    const prev = cameFrom.get(cur)!;
    const [px, pz] = prev.split(",").map(Number);
    path.push([px, pz]);
    cur = prev;
  }
  path.reverse();
  return path;
}

// Generic kit-model loader — reused for cars AND trees (public/kits/*.glb),
// same technique /3d-pms uses. Clones both the object hierarchy AND every
// mesh's material: scene.clone(true) alone only deep-clones the hierarchy,
// so without also cloning materials, every placement of the same model
// would share one material instance — a real problem here since
// GalleryIsland fades each island's whole group toward its own target
// opacity; two placements sharing a material means one island's fade-out
// fights the other's fade-in on the same material, leaving it stuck
// semi-transparent.
function KitModel({ url, scale = 1 }: { url: string; scale?: number }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        object.material = Array.isArray(object.material)
          ? object.material.map((m) => m.clone())
          : object.material.clone();
      }
    });
    return cloned;
  }, [scene]);
  return <primitive object={clone} scale={scale} />;
}

// ---------------------------------------------------------------------------
// Staged building — the structure an employee plants on the island for a
// task. It has 10 GLB stages under public/models, and climbs one stage per
// 10% of the task's subtask progress.
// ---------------------------------------------------------------------------

// Where a structure is allowed to stand. Buildings take a plot of land;
// vehicles belong on the tarmac and nowhere else.
type StructureTerrain = "land" | "road";

type StructureDef = {
  id: string;
  label: string;
  blurb: string;
  terrain: StructureTerrain;
  icon: React.ReactNode;
  stageUrls: string[];
  // Target width of the LARGEST stage, in world units. Sized against
  // LAND_TILE_GAP (1.1) rather than the 1-unit tile because the gap is the
  // real ceiling — neighbouring tiles are that far apart, so going much past
  // it means structures on adjacent tiles intersect each other.
  footprint: number;
};

// Every kit was exported with its own filename convention — "stage 1.glb",
// "Stage1.glb", "CafeStage 1.glb", "Model_ Stage 01 .glb" (that one is
// zero-padded AND has a space before the extension) — so each supplies its
// own name builder. All four folder names contain a space too, hence the
// encodeURI: without it the dev server 404s on the raw URL.
const structureStageUrls = (folder: string, file: (stage: number) => string): string[] =>
  Array.from({ length: BUILDING_STAGE_COUNT }, (_, i) =>
    encodeURI(`${ASSET_BASE}models/${folder}/${file(i + 1)}`),
  );

const STRUCTURES: Record<string, StructureDef> = {
  building_01: {
    id: "building_01",
    label: "Building 01",
    blurb: "10 stages · rises as you tick off subtasks",
    terrain: "land",
    icon: <Building2 size={18} />,
    stageUrls: structureStageUrls("Building 01V1", (s) => `stage ${s}.glb`),
    // 1.05 lets a finished tower slightly overhang its own tile, which reads
    // as a city block rather than a model marooned on a plinth.
    footprint: LAND_TILE_GAP * 1.05,
  },
  building_02: {
    id: "building_02",
    label: "Building 02",
    blurb: "10 stages · a broad tower, rises to 78 units",
    terrain: "land",
    icon: <Building2 size={18} />,
    stageUrls: structureStageUrls("Building 01V2", (s) => `Model_ Stage ${String(s).padStart(2, "0")} .glb`),
    footprint: LAND_TILE_GAP * 1.05,
  },
  cafe_01: {
    id: "cafe_01",
    label: "Cafe 01",
    blurb: "10 stages · low-rise, fills out rather than up",
    terrain: "land",
    icon: <Store size={18} />,
    // NOTE: the kit ships 9 files — "CafeStage 2.glb" does not exist — so
    // stage 2 reuses stage 1's model. The cafe therefore looks unchanged
    // between 0% and 19%; drop the real file in and this mapping can go.
    stageUrls: structureStageUrls("Cafe 01V1", (s) => `CafeStage ${s === 2 ? 1 : s}.glb`),
    // Squatter than the towers, so it can sit a little tighter to its tile.
    footprint: LAND_TILE_GAP * 0.95,
  },
  car_01: {
    id: "car_01",
    label: "Car 01",
    blurb: "10 stages · road only, upgrades as you go",
    terrain: "road",
    icon: <Car size={18} />,
    stageUrls: structureStageUrls("Cars 01V1", (s) => `Stage${s}.glb`),
    // Kept under one tile pitch so a car sits within its stretch of road
    // instead of running into the vehicle on the next tile.
    footprint: LAND_TILE_GAP * 0.92,
  },
};

Object.values(STRUCTURES).forEach((def) => def.stageUrls.forEach((url) => useGLTF.preload(url)));

const structureDef = (id: string | null | undefined): StructureDef =>
  (id && STRUCTURES[id]) || STRUCTURES.building_01;

// Bounding box of a stage's ACTUAL building, ignoring stray geometry.
//
// The 10 stages were exported from a single master scene in which they stand
// side by side 60 units apart along X (stage 4 at x=60, stage 7 at x=120,
// stage 10 at x=180), and every file also carries a leftover "beacon" object
// still sitting at another stage's coordinates. A plain
// Box3.setFromObject(scene) therefore measures stage 7 as 125 units wide
// instead of 11.5 — and since the fit below takes the widest stage, that one
// stray object shrank every building to a speck.
//
// So parts are grouped around their median centre and anything stranded far
// outside that cluster is discarded, from both the scale and the centring.
function measureBuildingBox(root: THREE.Object3D, hideStrays = false): THREE.Box3 {
  root.updateMatrixWorld(true);

  const parts: { object: THREE.Mesh; box: THREE.Box3; center: THREE.Vector3; size: THREE.Vector3 }[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    parts.push({ object, box, center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) });
  });

  const result = new THREE.Box3().makeEmpty();
  if (parts.length === 0) return result;

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const medianX = median(parts.map((p) => p.center.x));
  const medianZ = median(parts.map((p) => p.center.z));

  // Radius is derived from the widest single part (horizontally only —
  // these towers are far taller than they are wide, so including height
  // would make the tolerance big enough to swallow the strays again), so
  // this keeps working if the assets are re-exported at another scale.
  let widestPart = 0;
  parts.forEach((p) => { widestPart = Math.max(widestPart, p.size.x, p.size.z); });
  const radius = Math.max(widestPart * 1.5, 1);

  parts.forEach((p) => {
    const belongs = Math.abs(p.center.x - medianX) <= radius && Math.abs(p.center.z - medianZ) <= radius;
    if (belongs) result.union(p.box);
    // Strays aren't just excluded from the measurement — they'd otherwise
    // still render, leaving a speck floating several tiles from its building.
    else if (hideStrays) p.object.visible = false;
  });
  return result;
}

// ONE scale factor shared by all 10 stages, derived from the widest stage.
// Normalising each stage against its own bounding box instead would squash
// the tall late stages down to stage 1's footprint and destroy the whole
// sense of the building growing.
function useStructureFit(def: StructureDef): number {
  const gltfs = useGLTF(def.stageUrls) as unknown as { scene: THREE.Object3D }[];
  return useMemo(() => {
    const size = new THREE.Vector3();
    let widest = 0;
    gltfs.forEach((gltf) => {
      measureBuildingBox(gltf.scene).getSize(size);
      widest = Math.max(widest, size.x, size.z);
    });
    return widest > 0 ? def.footprint / widest : 1;
  }, [gltfs, def.footprint]);
}
const BUILDING_TRANSITION_MS = 780;

function setSubtreeOpacity(root: THREE.Object3D, opacity: number) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!(mesh instanceof THREE.Mesh)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      material.transparent = opacity < 0.99;
      material.opacity = opacity;
      material.depthWrite = opacity > 0.9;
    });
  });
}

function StructureStageModel({ url, fitScale }: { url: string; fitScale: number }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        // Per-instance materials: several buildings share one loaded GLB, and
        // the transition below animates opacity, so without cloning one
        // building's fade would bleed onto every other building at that stage.
        object.material = Array.isArray(object.material)
          ? object.material.map((m) => m.clone())
          : object.material.clone();
      }
    });
    return cloned;
  }, [scene]);

  // Recentre on the tile and drop the model onto the ground. This has to use
  // the same stray-filtered box as the scale does: measured raw, stage 7's
  // centre lands at x=63 (midway between its tower and a leftover object at
  // the origin) and the building would sit far off its own tile.
  const offset = useMemo(() => {
    const box = measureBuildingBox(clone, true);
    const center = box.getCenter(new THREE.Vector3());
    return new THREE.Vector3(-center.x, -box.min.y, -center.z);
  }, [clone]);

  return (
    <group scale={fitScale}>
      <primitive object={clone} position={offset} />
    </group>
  );
}

// Renders the current stage and, for the length of a transition, the stage it
// just replaced: the outgoing one shrinks and fades upward while the incoming
// one springs up from nothing, so a subtask being ticked reads as the
// structure visibly growing rather than one model snapping into another.
function StagedStructure({ def, stage }: { def: StructureDef; stage: number }) {
  const fitScale = useStructureFit(def);
  const [current, setCurrent] = useState(stage);
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const progressRef = useRef(1);
  const incomingRef = useRef<THREE.Group>(null);
  const outgoingRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (stage === current) return;
    setOutgoing(current);
    setCurrent(stage);
    progressRef.current = 0;
  }, [stage, current]);

  useFrame((_, delta) => {
    if (progressRef.current >= 1) return;
    progressRef.current = Math.min(1, progressRef.current + (delta * 1000) / BUILDING_TRANSITION_MS);
    const k = progressRef.current;

    // easeOutBack: 0 at k=0, 1 at k=1, overshooting past 1 near the end so
    // the new stage lands with a bit of weight instead of easing flat in.
    const back = 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;

    if (incomingRef.current) {
      incomingRef.current.scale.setScalar(Math.max(0.02, back));
      setSubtreeOpacity(incomingRef.current, Math.min(1, k * 1.7));
    }
    if (outgoingRef.current) {
      outgoingRef.current.scale.setScalar(Math.max(0.02, 1 - 0.3 * k));
      outgoingRef.current.position.y = k * 0.4;
      setSubtreeOpacity(outgoingRef.current, Math.max(0, 1 - k * 1.9));
    }

    if (k >= 1) {
      if (incomingRef.current) {
        incomingRef.current.scale.setScalar(1);
        setSubtreeOpacity(incomingRef.current, 1);
      }
      setOutgoing(null);
    }
  });

  return (
    <Suspense fallback={null}>
      <group ref={incomingRef}>
        <StructureStageModel url={def.stageUrls[current - 1]} fitScale={fitScale} />
      </group>
      {outgoing !== null && (
        <group ref={outgoingRef}>
          <StructureStageModel url={def.stageUrls[outgoing - 1]} fitScale={fitScale} />
        </group>
      )}
    </Suspense>
  );
}

// Tiles that have land on all four sides — i.e. everything except the
// island's outer ring. Roads are laid only on these so they never run
// along a border tile and hang off the edge of the island.
function interiorTiles(tiles: [number, number][]): [number, number][] {
  const key = (x: number, z: number) => `${x},${z}`;
  const present = new Set(tiles.map(([x, z]) => key(x, z)));
  return tiles.filter(([x, z]) =>
    present.has(key(x + 1, z)) &&
    present.has(key(x - 1, z)) &&
    present.has(key(x, z + 1)) &&
    present.has(key(x, z - 1)),
  );
}

// Road route, shared by Road (to draw the asphalt) and ScatteredTrees (to
// avoid dropping a tree on top of it) — both must be given the same seed to
// agree on where the road is.
//
// The seed picks a random interior start tile; the end is then the interior
// tile farthest from it (so the road always spans the island rather than
// being a stub), routed via a random interior waypoint so it bends
// differently on every island instead of every road looking alike.
function computeRoadPath(tiles: [number, number][], seed: number): [number, number][] {
  const interior = interiorTiles(tiles);
  if (interior.length < 2) return [];

  const random = createSeededRandom(seed);
  const start = interior[Math.floor(random() * interior.length)];

  let end = interior[0];
  let bestDist = -1;
  for (const t of interior) {
    const d = Math.hypot(t[0] - start[0], t[1] - start[1]);
    if (d > bestDist) { bestDist = d; end = t; }
  }

  const waypoint = interior[Math.floor(random() * interior.length)];
  const legA = findTilePath(interior, start, waypoint);
  const legB = findTilePath(interior, waypoint, end);
  return [...legA, ...legB.slice(1)];
}

function Road({ tiles, seed }: { tiles: [number, number][]; seed: number }) {
  const path = useMemo(() => computeRoadPath(tiles, seed), [tiles, seed]);

  if (path.length < 2) return null;

  return (
    <>
      {path.slice(0, -1).map(([x0, z0], i) => {
        const [x1, z1] = path[i + 1];
        const p0x = x0 * LAND_TILE_GAP, p0z = z0 * LAND_TILE_GAP;
        const p1x = x1 * LAND_TILE_GAP, p1z = z1 * LAND_TILE_GAP;
        const midX = (p0x + p1x) / 2, midZ = (p0z + p1z) / 2;
        const horizontal = z0 === z1;
        const length = LAND_TILE_GAP + ROAD_WIDTH * 0.4;
        return (
          <group key={`road-seg-${i}`}>
            <mesh position={[midX, ROAD_Y, midZ]} rotation={[0, horizontal ? 0 : Math.PI / 2, 0]}>
              <boxGeometry args={[length, ROAD_HEIGHT, ROAD_WIDTH]} />
              <meshStandardMaterial color={ROAD_COLOR} roughness={0.9} />
            </mesh>
            <mesh position={[midX, ROAD_Y + ROAD_HEIGHT / 2 + 0.003, midZ]} rotation={[0, horizontal ? 0 : Math.PI / 2, 0]}>
              <boxGeometry args={[length * 0.5, 0.005, 0.07]} />
              <meshStandardMaterial color={LANE_COLOR} />
            </mesh>
          </group>
        );
      })}
      {/* Deduped: the route is two BFS legs joined at a waypoint, so a tile
          can appear twice where the legs overlap. */}
      {Array.from(new Map(path.map((t) => [`${t[0]},${t[1]}`, t])).values()).map(([x, z]) => (
        <mesh key={`road-node-${x}-${z}`} position={[x * LAND_TILE_GAP, ROAD_Y, z * LAND_TILE_GAP]}>
          <boxGeometry args={[ROAD_WIDTH, ROAD_HEIGHT, ROAD_WIDTH]} />
          <meshStandardMaterial color={ROAD_COLOR} roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// ScatteredTrees — a handful of kit tree models scattered on random
// (non-road) tiles. Named to avoid colliding with the `Trees` lucide icon
// already imported above.
// ---------------------------------------------------------------------------

const TREE_MODEL_URLS = [
  `${ASSET_BASE}kits/fantasy-town/tree.glb`,
  `${ASSET_BASE}kits/fantasy-town/tree-high.glb`,
  `${ASSET_BASE}kits/urban-city/tree-small.glb`,
];
const CENTERED_ISLAND_TREE_MODEL_URLS = TREE_MODEL_URLS.slice(0, 2);
TREE_MODEL_URLS.forEach((url) => useGLTF.preload(url));

const TREES_PER_ISLAND = 3;

// `roadSeed` must match the seed given to Road on the same island, or the
// trees will dodge a road that isn't where they think it is.
function ScatteredTrees({ tiles, seed, roadSeed, modelUrls = TREE_MODEL_URLS }: {
  tiles: [number, number][];
  seed: number;
  roadSeed: number;
  modelUrls?: string[];
}) {
  const placements = useMemo(() => {
    const road = new Set(computeRoadPath(tiles, roadSeed).map(([x, z]) => `${x},${z}`));
    const candidates = tiles.filter(([x, z]) => !road.has(`${x},${z}`));
    const random = createSeededRandom(seed);
    const picked: { x: number; z: number; url: string; rotationY: number }[] = [];
    const usedIndices = new Set<number>();
    const count = Math.min(TREES_PER_ISLAND, candidates.length);
    while (picked.length < count) {
      const idx = Math.floor(random() * candidates.length);
      if (usedIndices.has(idx)) continue;
      usedIndices.add(idx);
      const [x, z] = candidates[idx];
      picked.push({
        x, z,
        url: modelUrls[Math.floor(random() * modelUrls.length)],
        rotationY: random() * Math.PI * 2,
      });
    }
    return picked;
  }, [tiles, seed, roadSeed, modelUrls]);

  return (
    <Suspense fallback={null}>
      {placements.map((p, i) => (
        <group key={i} position={[p.x * LAND_TILE_GAP, 0.05, p.z * LAND_TILE_GAP]} rotation={[0, p.rotationY, 0]}>
          <KitModel url={p.url} scale={0.5} />
        </group>
      ))}
    </Suspense>
  );
}

// Which way the road runs at each of its tiles, so a vehicle placed there
// can be turned to face along it instead of sitting across the lane. Taken
// from the neighbouring path tile (the previous one at the very end).
function roadOrientations(tiles: [number, number][], seed: number): Map<string, "x" | "z"> {
  const path = computeRoadPath(tiles, seed);
  const map = new Map<string, "x" | "z">();
  path.forEach(([x, z], i) => {
    const neighbour = path[i + 1] ?? path[i - 1];
    if (!neighbour) return;
    map.set(`${x},${z}`, neighbour[1] === z ? "x" : "z");
  });
  return map;
}

// Highlighted, clickable pads over every tile the pending structure may
// legally occupy — shown only while one is waiting to be placed.
function TilePicker({
  tiles,
  occupied,
  roadSeed,
  terrain,
  onPick,
}: {
  tiles: [number, number][];
  occupied: Set<string>;
  roadSeed: number;
  terrain: StructureTerrain;
  onPick: (x: number, z: number) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Land structures get interior, non-road, unoccupied tiles; road
  // structures get exactly the road tiles and nothing else. Either way a
  // tile already carrying a structure is never offered twice.
  const free = useMemo(() => {
    const road = new Set(computeRoadPath(tiles, roadSeed).map(([x, z]) => `${x},${z}`));
    const candidates =
      terrain === "road"
        ? interiorTiles(tiles).filter(([x, z]) => road.has(`${x},${z}`))
        : interiorTiles(tiles).filter(([x, z]) => !road.has(`${x},${z}`));
    return candidates.filter(([x, z]) => !occupied.has(`${x},${z}`));
  }, [tiles, occupied, roadSeed, terrain]);

  return (
    <>
      {free.map(([x, z]) => {
        const key = `${x},${z}`;
        const isHovered = hovered === key;
        return (
          <mesh
            key={key}
            position={[x * LAND_TILE_GAP, 0.075, z * LAND_TILE_GAP]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(key);
              document.body.style.cursor = "cell";
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              setHovered((prev) => (prev === key ? null : prev));
              document.body.style.cursor = "auto";
            }}
            onClick={(e) => {
              e.stopPropagation();
              document.body.style.cursor = "auto";
              onPick(x, z);
            }}
          >
            <planeGeometry args={[0.92, 0.92]} />
            <meshBasicMaterial
              color={isHovered ? "#ffe066" : "#8fe36b"}
              transparent
              opacity={isHovered ? 0.85 : 0.45}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

// Every structure standing on the island, each at the stage its task's
// progress has reached.
function PlacedStructures({
  placements,
  onHover,
  selectedId,
  roadFacing,
}: {
  placements: Placement[];
  onHover: (id: string | null, sx?: number, sy?: number) => void;
  selectedId: string | null;
  roadFacing: Map<string, "x" | "z">;
}) {
  return (
    <>
      {placements.map((placement) => {
        const def = structureDef(placement.structureId);
        // Vehicles turn to follow the lane. The models are authored long on
        // X, so a road running along X needs no rotation and one running
        // along Z needs a quarter turn.
        const facing = roadFacing.get(`${placement.x},${placement.z}`);
        const rotationY = def.terrain === "road" && facing === "z" ? Math.PI / 2 : 0;
        return (
          <group
            key={placement.id}
            position={[placement.x * LAND_TILE_GAP, 0.05, placement.z * LAND_TILE_GAP]}
            rotation={[0, rotationY, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover(placement.id, e.clientX, e.clientY);
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              onHover(null);
              document.body.style.cursor = "auto";
            }}
          >
            <StagedStructure def={def} stage={stageForProgress(placement.progress)} />
            {selectedId === placement.id && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
                <ringGeometry args={[0.55, 0.72, 32]} />
                <meshBasicMaterial color="#ffd23f" transparent opacity={0.9} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

function World({
  zoom,
  placements,
  onHover,
  selectedId,
  selectedPos: _selectedPos,
  pickingOccupied,
  pickingTerrain,
  onPickTile,
}: {
  zoom: number;
  placements: Placement[];
  onHover: (id: string | null, sx?: number, sy?: number) => void;
  selectedId: string | null;
  selectedPos: THREE.Vector3 | null;
  pickingOccupied?: Set<string> | null;
  pickingTerrain?: StructureTerrain;
  onPickTile?: (x: number, z: number) => void;
}) {
  const tiles = useMemo(() => generateLandTiles(LAND_TILE_COUNT), []);
  const picking = pickingOccupied != null && onPickTile != null;
  // Computed once for the island and shared: the picker uses it to decide
  // which tiles a vehicle may take, and placed vehicles use it to face along
  // the lane. Both must read the same road, hence the single LAND_SEED.
  const roadFacing = useMemo(() => roadOrientations(tiles, LAND_SEED), [tiles]);

  return (
    <>
      <color attach="background" args={[SPACE_BG]} />
      <Starfield spread={140} seed={6607} />
      <OrthographicCamera makeDefault position={[10, 10, 10]} zoom={zoom} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        target={[0, 0, 0]}
        minZoom={75}
        maxZoom={200}
        minPolarAngle={0.2}
        maxPolarAngle={1.25}
        // Auto-rotate would fight the user while they're trying to click a
        // specific tile, so it pauses for the duration of the placement.
        autoRotate={!picking}
        autoRotateSpeed={0.22}
      />
      <ambientLight intensity={1} />
      <directionalLight position={[5, 8, 5]} intensity={1.5} />
      <LandTiles tiles={tiles} />
      <Road tiles={tiles} seed={LAND_SEED} />
      <PlacedStructures
        placements={placements}
        onHover={onHover}
        selectedId={selectedId}
        roadFacing={roadFacing}
      />
      {picking && (
        <TilePicker
          tiles={tiles}
          occupied={pickingOccupied}
          roadSeed={LAND_SEED}
          terrain={pickingTerrain ?? "land"}
          onPick={onPickTile}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Gallery — a vertical stack of identical square islands the user scrolls
// through. Clicking one focuses it (the rest fade away) and hands the camera
// over to OrbitControls so it behaves exactly like the World view.
// ---------------------------------------------------------------------------

// Every gallery island is the SAME perfect square — no random blob shapes —
// so the stack reads as a uniform list rather than a pile of odd landmasses.
const GALLERY_ISLAND_SIDE = 9; // 9 x 9 = 81 tiles per island
const GALLERY_ISLAND_COUNT = 4;

function squareLandTiles(side: number): [number, number][] {
  const half = Math.floor(side / 2);
  const tiles: [number, number][] = [];
  for (let x = -half; x <= half; x += 1) {
    for (let z = -half; z <= half; z += 1) tiles.push([x, z]);
  }
  return tiles;
}

// One shared tile array — identical geometry for every island in the stack.
const GALLERY_TILES = squareLandTiles(GALLERY_ISLAND_SIDE);

// Y of the bottom-most island, and the constant vertical clearance between
// each island's top surface and the next island's underside (land tiles are
// 0.1 units thick — see LandTiles' scale.set).
const GALLERY_ISLAND_BASE_Y = -5;
const GALLERY_ISLAND_GAP = 3;
const GALLERY_ISLAND_STEP = 0.1 + GALLERY_ISLAND_GAP;

function galleryIslandY(index: number): number {
  return GALLERY_ISLAND_BASE_Y + index * GALLERY_ISLAND_STEP;
}

// Camera offset from whatever it's looking at, while scrolling the stack.
// Only the *offset* matters now — the absolute height comes from the scroll
// position — so this no longer has to be wide enough to frame every island
// at once, which is why the overview zoom can stay close in.
const GALLERY_OVERVIEW_OFFSET = new THREE.Vector3(10, 2, 10);
const GALLERY_OVERVIEW_ZOOM = 46;
const GALLERY_FOCUS_ZOOM = 75; // matches World's settled zoom
const GALLERY_CAMERA_SPEED = 2.6; // zoom/target convergence rate
const GALLERY_FADE_SPEED = 6; // fast, decisive disappearance for the other islands

// Department view shows the whole stack at once — no scrolling — so it
// needs a wider offset/zoom than the gallery's scroll-following camera,
// wide enough to fit every island plus the cuboid walls around them.
const GALLERY_DEPARTMENT_OFFSET = new THREE.Vector3(15, 4, 15);
const GALLERY_DEPARTMENT_ZOOM = 20;

function galleryStackCenterY(): number {
  return (galleryIslandY(0) + galleryIslandY(GALLERY_ISLAND_COUNT - 1)) / 2;
}

// How many viewport-heights of scrolling it takes to travel the whole stack
// (gallery mode only — department mode doesn't scroll at all).
const GALLERY_SCROLL_SCREENS = GALLERY_ISLAND_COUNT / 2;

// At scroll progress 0, the target used to be the top island's own Y — which
// centers it in frame, leaving as much empty space above it as below. This
// pulls the target down a bit so the top island sits near the top of the
// frame instead, with no space above it — it's the first thing you see when
// you land on the page, no scrolling required to reach it.
const GALLERY_SCROLL_TOP_BIAS = GALLERY_ISLAND_STEP * 0.9;

// Gallery and World share the same near-black backdrop as the org-level
// views, so switching between tabs no longer flips the whole page from white
// to black. The fade-to-background dissolve (galleryHazeOpacity) works
// unchanged — it fades toward whatever is behind, which is now dark.
const GALLERY_SKY_COLOR = SPACE_BG;
const GALLERY_HAZE_COLOR = SPACE_FOG;

// /3d-pms fades purely on camera distance, which works there because its
// islands sit side by side. Here they're stacked vertically and viewed at a
// shallow angle, so an island 4 units higher is barely any farther from the
// camera than the one in front of it — distance alone can't separate them.
// The same dissolve is therefore driven by how far an island has risen
// ABOVE the height currently being looked at, which is what makes the top
// of the stack melt into the cloud band while the rest stays crisp. Fog is
// still applied on top for the subtle depth haze it gives the far corners.
const GALLERY_HAZE_START = GALLERY_ISLAND_STEP * 0.4; // rise before fading begins
const GALLERY_HAZE_FULL = GALLERY_ISLAND_STEP * 2.0; // rise at which it's fully gone

function galleryHazeOpacity(islandY: number, focusY: number): number {
  const rise = islandY - focusY;
  if (rise <= GALLERY_HAZE_START) return 1;
  const t = (rise - GALLERY_HAZE_START) / (GALLERY_HAZE_FULL - GALLERY_HAZE_START);
  return Math.max(0, 1 - t);
}

// ---------------------------------------------------------------------------
// Cloud band — real volumetric puffs (drei <Clouds>) sitting over the top of
// the stack, so the highest island is physically buried in cloud rather than
// just faded out against a flat colour.
// ---------------------------------------------------------------------------

// drei's <Clouds> pulls its default puff texture from a CDN. Generating an
// equivalent soft radial puff on a canvas keeps the whole thing local — no
// network request, and it still works offline.
let cloudPuffTextureUrl: string | null = null;
function galleryCloudTexture(): string {
  if (cloudPuffTextureUrl) return cloudPuffTextureUrl;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.75, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  cloudPuffTextureUrl = canvas.toDataURL();
  return cloudPuffTextureUrl;
}

// Positions are relative to the TOP island's height. The low, wide puff sits
// just above it so the island's edges disappear into cloud; the rest build a
// deeper bank above that, so scrolling up reads as climbing out of view
// through weather rather than hitting an empty ceiling.
const GALLERY_CLOUD_PUFFS: {
  seed: number;
  pos: [number, number, number];
  bounds: [number, number, number];
  volume: number;
  opacity: number;
  segments: number;
}[] = [
  { seed: 11, pos: [-6, 0, -4], bounds: [11, 1.1, 8], volume: 4.5, opacity: 0.16, segments: 18 },
  { seed: 22, pos: [6, 0.8, 5], bounds: [11, 1.2, 8], volume: 5, opacity: 0.17, segments: 20 },
  { seed: 33, pos: [0, 1.7, 0], bounds: [15, 1.4, 12], volume: 5.5, opacity: 0.12, segments: 22 },
];

// How far above the height the camera is looking at the cloud band sits.
// Roughly the top edge of the frame at the gallery's overview zoom.
const GALLERY_CLOUD_RISE = 7.5;

// `anchorY` is the world height the camera is currently looking at, so the
// band rides the scroll and stays pinned to the top of the frame. Anchoring
// it to the top island's fixed world position instead — which is what it
// used to do — meant the clouds scrolled away with everything else and were
// only visible at the very top of the list.
function GalleryClouds({ anchorY }: { anchorY: number }) {
  const texture = useMemo(() => galleryCloudTexture(), []);
  const topY = anchorY + GALLERY_CLOUD_RISE;

  return (
    // material overrides drei's default MeshLambertMaterial with an unlit
    // one. Lambert shades each puff facing away from the directional light
    // dark grey — which is why they were reading as dirty/black blobs
    // instead of white — since Cloud's puffs are randomly rotated, that
    // "facing away" side is different for every puff, so it read as a
    // patchwork of grey rather than a lighting direction you could fix by
    // moving the light. An unlit material ignores lighting entirely and
    // renders flat, so every puff is genuinely white regardless of angle.
    <Clouds texture={texture} limit={600} material={THREE.MeshBasicMaterial} frustumCulled={false}>
      {GALLERY_CLOUD_PUFFS.map((puff) => (
        <Cloud
          key={puff.seed}
          seed={puff.seed}
          position={[puff.pos[0], topY + puff.pos[1], puff.pos[2]]}
          bounds={puff.bounds}
          volume={puff.volume}
          opacity={puff.opacity}
          segments={puff.segments}
          // Dim blue-grey, not white: these were tuned to melt into a white
          // sky, and pure white against the near-black backdrop reads as a
          // glaring blob rather than haze.
          color="#7d90b8"
          growth={5}
          speed={0.09}
          fade={60}
        />
      ))}
    </Clouds>
  );
}

// ---------------------------------------------------------------------------
// Department view — the same island stack, enclosed in a translucent cuboid
// whose surface is drawn as a field of particles, so the whole department
// reads as one container rather than a loose pile of floating islands.
// ---------------------------------------------------------------------------

const DEPARTMENT_COLOR = "#2fb6e8";
const DEPARTMENT_PARTICLE_COUNT = 1600;
const DEPARTMENT_PAD_XZ = 2.4; // clearance between the island edge and the wall
const DEPARTMENT_PAD_Y = 3.6; // clearance below the first / above the last island
const DEPARTMENT_VERTEX_SHARE = 0.3; // fraction of particles bunched at the 8 corners
const DEPARTMENT_VERTEX_SPREAD = 1.1; // how far inward a corner cluster reaches
const DEPARTMENT_EDGE_JITTER = 0.13; // perpendicular scatter either side of an edge


// Nothing in the cuboid should ever swallow a click meant for an island
// underneath it.
const NO_RAYCAST: THREE.Object3D["raycast"] = () => {};

const clampMagnitude = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));

// Generalized so the same shell can wrap the full gallery stack OR a small
// org-admin pod with fewer islands — `islandStep`/`islandCount` describe
// whatever stack it's enclosing, in coordinates local to that stack's own
// origin (island 0 at local Y 0).
function departmentCubeBounds(islandCount: number = GALLERY_ISLAND_COUNT, islandStep: number = GALLERY_ISLAND_STEP) {
  const halfTiles = Math.floor(GALLERY_ISLAND_SIDE / 2);
  const half = halfTiles * LAND_TILE_GAP + 0.5 + DEPARTMENT_PAD_XZ;
  const bottom = -DEPARTMENT_PAD_Y;
  const top = (islandCount - 1) * islandStep + DEPARTMENT_PAD_Y;
  return { half, bottom, top, height: top - bottom, centerY: (top + bottom) / 2 };
}

// The 12 edges of the cuboid, each described by its axis plus the two fixed
// coordinates that pin it to one corner of the cross-section.
type CubeEdge = { axis: 0 | 1 | 2; a: number; b: number; length: number };

function departmentCubeEdges(hx: number, hy: number, hz: number): CubeEdge[] {
  const signs = [-1, 1];
  const edges: CubeEdge[] = [];
  for (const sy of signs) for (const sz of signs) edges.push({ axis: 0, a: sy * hy, b: sz * hz, length: hx * 2 });
  for (const sx of signs) for (const sz of signs) edges.push({ axis: 1, a: sx * hx, b: sz * hz, length: hy * 2 });
  for (const sx of signs) for (const sy of signs) edges.push({ axis: 2, a: sx * hx, b: sy * hy, length: hz * 2 });
  return edges;
}

// Particles hug the wireframe only — the 12 edges and, more densely, the 8
// vertices — leaving the faces clear so the shell reads as a glowing frame
// around the stack rather than a fogged-up box you can't see into.
//
// Edges are chosen in proportion to their length, not uniformly: a tall
// shell's vertical edges span the whole stack while the horizontal ones are
// much shorter, so picking evenly would leave the tall edges looking
// sparser than the short ones.
function departmentParticlePositions(
  bounds: { half: number; height: number },
  count: number,
  seed: number,
): Float32Array {
  const { half, height } = bounds;
  const hx = half;
  const hy = height / 2;
  const hz = half;

  const edges = departmentCubeEdges(hx, hy, hz);
  const totalLength = edges.reduce((sum, edge) => sum + edge.length, 0);
  const random = createSeededRandom(seed);
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    let x = 0;
    let y = 0;
    let z = 0;

    if (random() < DEPARTMENT_VERTEX_SHARE) {
      // Corner cluster. Squaring the random keeps most of the offset near
      // zero, so the cloud bunches tightly on the vertex and thins out as it
      // reaches back along the three edges meeting there.
      const bias = () => random() ** 2 * DEPARTMENT_VERTEX_SPREAD;
      x = (random() < 0.5 ? -1 : 1) * (hx - bias());
      y = (random() < 0.5 ? -1 : 1) * (hy - bias());
      z = (random() < 0.5 ? -1 : 1) * (hz - bias());
    } else {
      let pick = random() * totalLength;
      let edge = edges[edges.length - 1];
      for (const candidate of edges) {
        pick -= candidate.length;
        if (pick <= 0) { edge = candidate; break; }
      }

      const t = random() * 2 - 1;
      // Jitter is INWARD ONLY. A symmetric ±jitter would push half the
      // particles on every edge just past the wall — a fixed coordinate of
      // +hy becomes hy + jitter — which is what left stray dots floating
      // outside the frame. Pulling toward zero instead keeps every particle
      // on or inside the surface.
      const inward = (fixed: number) => fixed - Math.sign(fixed) * random() * DEPARTMENT_EDGE_JITTER;
      if (edge.axis === 0) { x = t * hx; y = inward(edge.a); z = inward(edge.b); }
      else if (edge.axis === 1) { x = inward(edge.a); y = t * hy; z = inward(edge.b); }
      else { x = inward(edge.a); y = inward(edge.b); z = t * hz; }
    }

    // Belt and braces: nothing may sit outside the cuboid, whatever the
    // maths above does.
    positions[i * 3] = clampMagnitude(x, hx);
    positions[i * 3 + 1] = clampMagnitude(y, hy);
    positions[i * 3 + 2] = clampMagnitude(z, hz);
  }
  return positions;
}

// The glowing wireframe/particle shell on its own — no islands inside, just
// the container. Reused for both the single big Department view and each
// small pod in Org Admin view, which is why color/particle density/breathing
// are all parameters rather than the DEPARTMENT_* constants directly.
// The big shell around the full gallery stack, in absolute world space.
function DepartmentCube() {
  const bounds = departmentCubeBounds();
  const worldBounds = useMemo(
    () => ({ ...bounds, centerY: bounds.centerY + galleryIslandY(0) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bounds.centerY],
  );
  return (
    <>
      <GlowFrame
        bounds={worldBounds}
        color={DEPARTMENT_COLOR}
        particleCount={DEPARTMENT_PARTICLE_COUNT}
        particleSeed={43117}
      />
      {/* This is the only container with anything inside it, so it's the one
          place a light actually falls on something — it tints the islands
          with the department's colour. */}
      <pointLight
        position={[0, worldBounds.centerY, 0]}
        color={DEPARTMENT_COLOR}
        intensity={40}
        distance={worldBounds.height * 1.6}
        decay={1.5}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Org Admin view — 6 small department pods (each its own mini island stack
// inside its own glowing shell) arranged in a ring around a glowing core,
// with light spokes connecting the core to each pod. A completely separate
// scene from the gallery/department stack above: no scrolling, no per-
// island focus/select, just the whole org at a glance.
// ---------------------------------------------------------------------------

const ORG_PODS: { label: string; color: string; seed: number }[] = [
  { label: "Engineering", color: "#3fa8f0", seed: 91001 },
  { label: "Product", color: "#6d6bf0", seed: 91002 },
  { label: "Marketing", color: "#a855f7", seed: 91003 },
  { label: "Sales", color: "#22c55e", seed: 91004 },
  { label: "Operations", color: "#f0a83f", seed: 91005 },
  { label: "HR", color: "#3fc7c9", seed: 91006 },
];

// ---------------------------------------------------------------------------
// Neon glow kit — the technique the org-level views use.
//
// A radial-gradient canvas texture on a sprite, blended ADDITIVELY so
// overlapping glows accumulate into a real bloom. It replaced an earlier
// attempt that faked the effect with layered translucent shells, which was
// only ever needed because these views used to sit on white: additive
// blending adds *toward white*, so on a white background it contributes
// nothing at all. Every view using this kit renders on a near-black
// backdrop, which is what makes the technique work.
// ---------------------------------------------------------------------------


const glowTextureCache = new Map<string, THREE.CanvasTexture>();

function glowTexture(color: string): THREE.CanvasTexture {
  const cached = glowTextureCache.get(color);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rgb = new THREE.Color(color);
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((v) => Math.floor(v * 255));
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
  gradient.addColorStop(0.4, `rgba(${r},${g},${b},0.35)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  glowTextureCache.set(color, texture);
  return texture;
}

function GlowSprite({ color, scale, opacity = 1 }: { color: string; scale: number; opacity?: number }) {
  const texture = useMemo(() => glowTexture(color), [color]);
  return (
    <sprite scale={[scale, scale, scale]}>
      <spriteMaterial
        map={texture}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        transparent
        opacity={opacity}
        toneMapped={false}
      />
    </sprite>
  );
}

// A solid, lit-looking node: an almost-opaque coloured box, edges pulled
// toward white so they read as hot, and an additive halo around it. Nothing
// like the translucent glass shell — on a dark backdrop a solid block with a
// bloom is what actually looks like it's emitting light.
function GlowCube({
  size,
  color,
  glowScale = 2.6,
  opacity = 0.88,
  edgeOpacity = 1,
  glowOpacity = 1,
}: {
  size: number;
  color: string;
  glowScale?: number;
  opacity?: number;
  edgeOpacity?: number;
  glowOpacity?: number;
}) {
  const geometry = useMemo(() => new THREE.BoxGeometry(size, size, size), [size]);
  const edgeGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  const edgeColor = useMemo(
    () => new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.45),
    [color],
  );

  return (
    <group>
      <mesh geometry={geometry} raycast={NO_RAYCAST}>
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
      </mesh>
      <lineSegments geometry={edgeGeometry} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={edgeColor} transparent opacity={edgeOpacity} toneMapped={false} />
      </lineSegments>
      <GlowSprite color={color} scale={size * glowScale} opacity={glowOpacity} />
    </group>
  );
}

// Wireframe boundary with a glow accent burning at each of its 8 corners.
// Wireframe boundary with a glow accent burning at each of its 8 corners,
// and optionally a field of particles clinging to its edges and vertices.
// Takes bounds rather than a single size so it works for the department's
// tall cuboid as well as the hypercube's actual cube.
function GlowFrame({
  bounds,
  color,
  particleCount = 0,
  particleSeed = 0,
  particleSize = 2.4,
}: {
  bounds: { half: number; height: number; centerY: number };
  color: string;
  particleCount?: number;
  particleSeed?: number;
  particleSize?: number;
}) {
  const { half, height, centerY } = bounds;

  const edgeGeometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(half * 2, height, half * 2)),
    [half, height],
  );

  const corners = useMemo(() => {
    const out: [number, number, number][] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      out.push([sx * half, (sy * height) / 2, sz * half]);
    }
    return out;
  }, [half, height]);

  const particleGeometry = useMemo(() => {
    if (particleCount <= 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(departmentParticlePositions({ half, height }, particleCount, particleSeed), 3),
    );
    return geometry;
  }, [half, height, particleCount, particleSeed]);

  return (
    <group position={[0, centerY, 0]}>
      <lineSegments geometry={edgeGeometry} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={color} transparent opacity={0.32} toneMapped={false} />
      </lineSegments>

      {corners.map((position) => (
        <group key={position.join(",")} position={position}>
          {/* Scaled off `half`, not height: on a tall cuboid a height-based
              accent would swell into a blob taller than the frame itself. */}
          <GlowSprite color={color} scale={half * 0.24} />
        </group>
      ))}

      {particleGeometry && (
        <points geometry={particleGeometry} raycast={NO_RAYCAST}>
          <pointsMaterial
            color={color}
            size={particleSize}
            sizeAttenuation={false}
            transparent
            opacity={0.9}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </points>
      )}
    </group>
  );
}

function Starfield({ count = 1400, spread = 90, seed = 5150 }: { count?: number; spread?: number; seed?: number }) {
  const geometry = useMemo(() => {
    const random = createSeededRandom(seed);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 1) positions[i] = (random() - 0.5) * spread;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count, spread, seed]);

  return (
    <points geometry={geometry} raycast={NO_RAYCAST}>
      <pointsMaterial color="#bfe0ff" size={1.6} sizeAttenuation={false} transparent opacity={0.75} depthWrite={false} toneMapped={false} />
    </points>
  );
}

// Each pod is a single glowing node in the org ring.
const ORG_POD_SIZE = 7;
const ORG_POD_RADIUS = 30;

function OrgAdminPod({
  position,
  rotationY,
  color,
  label,
}: {
  position: [number, number, number];
  rotationY: number;
  color: string;
  label: string;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <GlowCube size={ORG_POD_SIZE} color={color} />
      <Text
        position={[0, ORG_POD_SIZE * 0.86, 0]}
        fontSize={1.7}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#05070f"
      >
        {label}
      </Text>
    </group>
  );
}

const ORG_SPOKE_WAVES = 2.5; // full sine cycles along the beam's length
const ORG_SPOKE_AMPLITUDE = 1.8;
const ORG_SPOKE_RADIUS = 0.09;
const ORG_SPOKE_SEGMENTS = 64;

// A glowing beam from the org core to one pod that snakes along a sine wave
// rather than going straight — the wave's amplitude tapers to zero at both
// ends (the `envelope` term) so it meets the core and the pod cleanly
// instead of arriving at an angle. It bends in TWO directions at once — in
// the horizontal plane (perpendicular to the straight-line direction) and
// vertically, offset a third of a cycle apart — which is what keeps it
// reading as a flowing 3D current rather than a wave confined to one flat
// plane.
function sinusoidalTube(to: THREE.Vector3, color: string) {
  const start = new THREE.Vector3(0, 0, 0);
  const end = to;
  const direction = end.clone().sub(start);
  direction.normalize();

  const up = new THREE.Vector3(0, 1, 0);
  const perpendicular = new THREE.Vector3().crossVectors(direction, up);
  if (perpendicular.lengthSq() < 1e-6) perpendicular.set(1, 0, 0);
  perpendicular.normalize();

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= ORG_SPOKE_SEGMENTS; i += 1) {
    const t = i / ORG_SPOKE_SEGMENTS;
    const point = start.clone().lerp(end, t);
    const envelope = Math.sin(t * Math.PI); // 0 at both ends, 1 at the middle
    const phase = t * Math.PI * 2 * ORG_SPOKE_WAVES;
    point.addScaledVector(perpendicular, Math.sin(phase) * ORG_SPOKE_AMPLITUDE * envelope);
    point.y += Math.sin(phase + Math.PI / 3) * ORG_SPOKE_AMPLITUDE * 0.5 * envelope;
    points.push(point);
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, ORG_SPOKE_SEGMENTS, ORG_SPOKE_RADIUS, 6, false);
  return { geometry, color };
}

function OrgAdminSpoke({ to, color }: { to: [number, number, number]; color: string }) {
  const { geometry } = useMemo(
    () => sinusoidalTube(new THREE.Vector3(...to), color),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [to[0], to[1], to[2], color],
  );

  return (
    <mesh geometry={geometry} raycast={NO_RAYCAST}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.7}
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

// Three faux-glow halo layers (increasing size, decreasing opacity) plus the
// solid center — there's no bloom postprocessing pass in this scene, so this
// is the standard cheat for a soft glow: several transparent, depthWrite-off
// spheres stacked around the actual light source.
// The org core. On the dark backdrop the stacked translucent spheres that
// faked its glow are redundant — one additive sprite does it properly.
function OrgAdminCore() {
  return (
    <group>
      <GlowSprite color="#8ecfff" scale={16} />
      <mesh raycast={NO_RAYCAST}>
        <sphereGeometry args={[1.4, 32, 32]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2.3, 0, 0]} raycast={NO_RAYCAST}>
        <torusGeometry args={[3.2, 0.06, 16, 64]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight color="#8ecfff" intensity={90} distance={45} />
    </group>
  );
}

function OrgAdminScene({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  return (
    <>
      {/* Near-black backdrop: the additive glow in GlowCube/GlowSprite adds
          toward white, so on the old white background it produced nothing. */}
      <color attach="background" args={[SPACE_BG]} />
      <fog attach="fog" args={[SPACE_FOG, 55, 130]} />
      <Starfield />
      <OrthographicCamera makeDefault position={[0, 34, 46]} zoom={13} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.05}
        target={[0, 0, 0]}
        minPolarAngle={0.3}
        maxPolarAngle={1.2}
        minZoom={8}
        maxZoom={30}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.35}
      />
      <ambientLight intensity={0.6} />
      <OrgAdminCore />
      {ORG_PODS.map((pod, i) => {
        const angle = (i / ORG_PODS.length) * Math.PI * 2;
        const position: [number, number, number] = [
          Math.cos(angle) * ORG_POD_RADIUS,
          0,
          Math.sin(angle) * ORG_POD_RADIUS,
        ];
        return (
          <group key={pod.label}>
            <OrgAdminSpoke to={position} color={pod.color} />
            <Suspense fallback={null}>
              <OrgAdminPod
                position={position}
                rotationY={-angle}
                color={pod.color}
                label={pod.label}
              />
            </Suspense>
          </group>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Hypercube view — one large gridded container cube holding 13 small glowing
// department cubes suspended in a lattice inside it.
// ---------------------------------------------------------------------------

const HYPERCUBE_DEPARTMENTS: { label: string; color: string }[] = [
  { label: "Engineering", color: "#3fa8f0" },
  { label: "Product", color: "#6d6bf0" },
  { label: "Design", color: "#c05cf5" },
  { label: "Marketing", color: "#f05ca8" },
  { label: "Sales", color: "#22c55e" },
  { label: "Customer Success", color: "#3fc7c9" },
  { label: "Operations", color: "#f0a83f" },
  { label: "People", color: "#f0d23f" },
  { label: "Finance", color: "#5cf0c0" },
  { label: "Legal", color: "#8f9bf0" },
  { label: "Data", color: "#4fd9f0" },
  { label: "Support", color: "#f07a5c" },
  { label: "Security", color: "#e0484f" },
];

// Spacing must stay above 2 x CELL_HALF or neighbouring cells intersect —
// the three y layers are only one spacing apart, so that's the binding
// constraint (x and z have just two positions, hence 2 x spacing apart).
const HYPERCUBE_OUTER_HALF = 20;
const HYPERCUBE_CELL_SPACING = 12;
const HYPERCUBE_CELL_HALF = 5.2;
const HYPERCUBE_GRID_DIVISIONS = 6;
const HYPERCUBE_SHELL_COLOR = "#2fb6e8";

// 13 cells: a regular 2 x 3 x 2 lattice (x and z at +/-1, stacked across
// three y layers) plus one cube at the exact centre, sitting in the hollow
// middle of that lattice. Mirror-symmetric on all three axes and unchanged
// by a quarter turn about y, so it stays balanced as the view auto-rotates.
//
// This replaced an even-parity lattice (centre + the 12 edge midpoints of a
// cube — a cuboctahedron). That is symmetric in the strict sense, but its
// cells sit on edge midpoints rather than lattice points, so from any angle
// except straight down an axis it reads as staggered and scattered. Lining
// the cells up on an axis-aligned grid is what actually makes the symmetry
// visible from the angles this view is seen from.
function hypercubeCellPositions(): [number, number, number][] {
  const s = HYPERCUBE_CELL_SPACING;
  const positions: [number, number, number][] = [[0, 0, 0]];
  for (const y of [-1, 0, 1]) {
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        positions.push([x * s, y * s, z * s]);
      }
    }
  }
  return positions;
}

// Line segments ruling a grid across all six faces of the container, which is
// what gives the shell its "hypercube" read rather than a plain glass box.
function hypercubeFaceGrid(half: number, divisions: number): Float32Array {
  const points: number[] = [];
  const step = (half * 2) / divisions;

  for (let axis = 0; axis < 3; axis += 1) {
    const a = (axis + 1) % 3;
    const b = (axis + 2) % 3;
    for (const sign of [-1, 1]) {
      for (let i = 0; i <= divisions; i += 1) {
        const v = -half + i * step;
        // One line spanning b at a = v, and one spanning a at b = v.
        for (const [along, fixedInPlane] of [[b, a], [a, b]] as const) {
          const start = [0, 0, 0];
          const end = [0, 0, 0];
          start[axis] = sign * half;
          end[axis] = sign * half;
          start[fixedInPlane] = v;
          end[fixedInPlane] = v;
          start[along] = -half;
          end[along] = half;
          points.push(...start, ...end);
        }
      }
    }
  }
  return new Float32Array(points);
}

function HypercubeCell({ position, color, label, onOpen, interactive = true, muted = false }: { position: [number, number, number]; color: string; label: string; onOpen: () => void; interactive?: boolean; muted?: boolean }) {
  return (
    <group
      position={position}
      onClick={interactive ? (event) => { event.stopPropagation(); onOpen(); } : undefined}
      onPointerOver={interactive ? (event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={interactive ? (event) => { event.stopPropagation(); document.body.style.cursor = "auto"; } : undefined}
    >
      <GlowCube size={HYPERCUBE_CELL_HALF * 2} color={color} opacity={muted ? 0.12 : 0.88} edgeOpacity={muted ? 0.16 : 1} glowOpacity={muted ? 0.08 : 1} />
      {!muted && <Text position={[0, HYPERCUBE_CELL_HALF + 1.2, 0]} fontSize={1.1} color="#ffffff" anchorX="center">{label}</Text>}
    </group>
  );
}

export function NewPmsHypercubeModel({ onOpenDepartment = () => {}, interactive = true, overviewMuted = false }: { onOpenDepartment?: () => void; interactive?: boolean; overviewMuted?: boolean }) {
  const cells = useMemo(() => hypercubeCellPositions(), []);
  const gridGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(hypercubeFaceGrid(HYPERCUBE_OUTER_HALF, HYPERCUBE_GRID_DIVISIONS), 3),
    );
    return geometry;
  }, []);

  return (
    <>
      {overviewMuted && (
        <mesh renderOrder={20} raycast={NO_RAYCAST}>
          <boxGeometry args={[HYPERCUBE_OUTER_HALF * 2, HYPERCUBE_OUTER_HALF * 2, HYPERCUBE_OUTER_HALF * 2]} />
          <meshBasicMaterial color="#01040a" transparent opacity={0.76} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <lineSegments geometry={gridGeometry} raycast={NO_RAYCAST}>
        <lineBasicMaterial
          color={HYPERCUBE_SHELL_COLOR}
          transparent
          opacity={0.14}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      <GlowFrame
        bounds={{ half: HYPERCUBE_OUTER_HALF, height: HYPERCUBE_OUTER_HALF * 2, centerY: 0 }}
        color={HYPERCUBE_SHELL_COLOR}
        particleCount={DEPARTMENT_PARTICLE_COUNT}
        particleSeed={77021}
      />

      {cells.map((position, index) => {
        const department = HYPERCUBE_DEPARTMENTS[index % HYPERCUBE_DEPARTMENTS.length];
        return <HypercubeCell key={department.label} position={position} color={department.color} label={department.label} onOpen={onOpenDepartment} interactive={interactive} muted={overviewMuted} />;
      })}
    </>
  );
}

function HypercubeScene({ controlsRef, onOpenDepartment }: { controlsRef: React.RefObject<OrbitControlsImpl | null>; onOpenDepartment: () => void }) {
  return (
    <>
      <color attach="background" args={[SPACE_BG]} />
      <fog attach="fog" args={[SPACE_FOG, 45, 120]} />
      <Starfield spread={110} seed={9021} />
      <OrthographicCamera makeDefault position={[34, 26, 34]} zoom={12} />
      <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.05} target={[0, 0, 0]} minPolarAngle={0.25} maxPolarAngle={1.35} minZoom={7} maxZoom={28} enablePan={false} autoRotate autoRotateSpeed={0.3} />
      <ambientLight intensity={0.6} />
      <NewPmsHypercubeModel onOpenDepartment={onOpenDepartment} />
    </>
  );
}

// Islands are identified by their index in the stack, so adding more is just
// bumping GALLERY_ISLAND_COUNT. NOTE: index 0 is a valid id and is falsy —
// every check against it must be `!== null`, never a truthiness test.
type IslandId = number;

type GalleryViewMode = "gallery" | "department" | "orgAdmin" | "hypercube";

// Scroll progress (0 = top of the list) mapped to the world height the
// camera looks at. Progress 0 shows the TOP island (highest Y, the one
// fading into the clouds) pinned near the top of the frame — see
// GALLERY_SCROLL_TOP_BIAS; scrolling down descends the stack.
function galleryScrollWorldY(progress: number): number {
  const topY = galleryIslandY(GALLERY_ISLAND_COUNT - 1) - GALLERY_SCROLL_TOP_BIAS;
  const bottomY = galleryIslandY(0);
  return topY + (bottomY - topY) * progress;
}

// Three distinct camera modes:
//
// OVERVIEW (nothing selected, gallery mode) — the camera rides the scroll
// position. Both position and target are written every frame from
// `scrollProgress` so scrolling tracks 1:1 with no lag.
//
// DEPARTMENT (nothing selected, department mode) — no scrolling at all: a
// single fixed framing wide enough to show every island inside the cuboid
// at once, eased into like any other mode change.
//
// FOCUSED (an island selected) — position is snapped ONCE (in the effect
// below), then never touched again, and zoom eases to the focus value and
// then stops. Both handoffs matter: OrbitControls recomputes its spherical
// angle from camera.position relative to target on every update(), so
// re-forcing position every frame would cancel out autoRotate before the
// spin is ever visible; and re-forcing zoom every frame would snap the
// user's own scroll-to-zoom straight back. After the transition settles,
// OrbitControls owns the camera completely, exactly like World.
//
// Any transition INTO an unselected mode (overview or department, whether
// from a focused island or from each other) can't snap position — the jump
// is too large — so it eases in until it converges and only then starts
// tracking exactly. That's `overviewSynced`.
function GalleryCameraRig({
  selected,
  scrollProgress,
  departmentView,
  controlsRef,
}: {
  selected: IslandId | null;
  scrollProgress: number;
  departmentView: boolean; // true whenever viewMode === "department" (org admin bypasses this rig entirely)
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const desiredPos = useRef(new THREE.Vector3());
  const desiredTarget = useRef(new THREE.Vector3());
  const settled = useRef(false);
  const overviewSynced = useRef(true);
  const prevSelected = useRef(selected);
  const prevDepartmentView = useRef(departmentView);

  useEffect(() => {
    if (selected === null) return;
    camera.position.set(
      GALLERY_OVERVIEW_OFFSET.x,
      galleryIslandY(selected) + 10,
      GALLERY_OVERVIEW_OFFSET.z,
    );
  }, [selected, camera]);

  useFrame((_, delta) => {
    if (prevSelected.current !== selected || prevDepartmentView.current !== departmentView) {
      if (selected === null) overviewSynced.current = false;
      prevSelected.current = selected;
      prevDepartmentView.current = departmentView;
      settled.current = false;
    }

    const ortho = camera as THREE.OrthographicCamera;
    const controls = controlsRef.current;
    const t = 1 - Math.exp(-GALLERY_CAMERA_SPEED * delta);

    if (selected === null) {
      const offset = departmentView ? GALLERY_DEPARTMENT_OFFSET : GALLERY_OVERVIEW_OFFSET;
      const worldY = departmentView ? galleryStackCenterY() : galleryScrollWorldY(scrollProgress);
      const desiredZoom = departmentView ? GALLERY_DEPARTMENT_ZOOM : GALLERY_OVERVIEW_ZOOM;
      desiredPos.current.set(offset.x, worldY + offset.y, offset.z);
      desiredTarget.current.set(0, worldY, 0);

      if (overviewSynced.current) {
        camera.position.copy(desiredPos.current);
        if (controls) controls.target.copy(desiredTarget.current);
      } else {
        camera.position.lerp(desiredPos.current, t);
        if (controls) controls.target.lerp(desiredTarget.current, t);
        if (camera.position.distanceTo(desiredPos.current) < 0.05) overviewSynced.current = true;
      }

      ortho.zoom += (desiredZoom - ortho.zoom) * t;
      ortho.updateProjectionMatrix();
      controls?.update();
      return;
    }

    if (settled.current) return;

    desiredTarget.current.set(0, galleryIslandY(selected), 0);
    ortho.zoom += (GALLERY_FOCUS_ZOOM - ortho.zoom) * t;
    ortho.updateProjectionMatrix();
    if (controls) {
      controls.target.lerp(desiredTarget.current, t);
      controls.update();
    }

    const zoomDiff = Math.abs(ortho.zoom - GALLERY_FOCUS_ZOOM);
    const targetDist = controls ? controls.target.distanceTo(desiredTarget.current) : 0;
    if (zoomDiff < 0.5 && targetDist < 0.05) settled.current = true;
  });

  return null;
}

// One stacked island. Two things drive its opacity, multiplied together:
// the selection state (a non-selected island fades right out) and the haze
// (it dissolves into the sky as it rises above the height being viewed).
// The haze part is applied instantly rather than eased, since it tracks the
// scroll position and must not lag behind it.
function GalleryIsland({
  id,
  y,
  seed,
  selected,
  hazeFocusY,
  onSelect,
}: {
  id: IslandId;
  y: number;
  seed: number;
  selected: IslandId | null;
  hazeFocusY: number;
  onSelect: (id: IslandId) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const selectionOpacity = useRef(1);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const active = selected === null || selected === id;
    const targetScale = active ? 1 : 0.82;
    const t = 1 - Math.exp(-GALLERY_FADE_SPEED * delta);

    const scale = group.scale.x + (targetScale - group.scale.x) * t;
    group.scale.setScalar(scale);

    selectionOpacity.current += ((active ? 1 : 0) - selectionOpacity.current) * t;
    const opacity = selectionOpacity.current * galleryHazeOpacity(y, hazeFocusY);

    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (material) {
        material.transparent = true;
        material.opacity = opacity;
      }
    });
    group.visible = opacity > 0.01;
  });

  return (
    <group
      ref={groupRef}
      position={[0, y, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (selected === null) onSelect(id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (selected === null) document.body.style.cursor = "pointer";
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "auto";
      }}
    >
      <LandTiles tiles={GALLERY_TILES} />
      <Road tiles={GALLERY_TILES} seed={seed} />
      <ScatteredTrees tiles={GALLERY_TILES} seed={seed + 7} roadSeed={seed} />
    </group>
  );
}

// Every island shares the same square land and gap; only the scenery seed
// and which car model sits on the road vary, so the stack stays uniform.
const GALLERY_ISLANDS: { id: IslandId; y: number; seed: number }[] =
  Array.from({ length: GALLERY_ISLAND_COUNT }, (_, index) => ({
    id: index,
    y: galleryIslandY(index),
    seed: LAND_SEED + index * 9173,
  }));

export function NewPmsDepartmentModel() {
  return (
    <group position={[0, -galleryStackCenterY(), 0]}>
      {GALLERY_ISLANDS.map((island) => (
        <group key={island.id} position={[0, island.y, 0]} raycast={NO_RAYCAST}>
          <LandTiles tiles={GALLERY_TILES} />
          <Road tiles={GALLERY_TILES} seed={island.seed} />
          <ScatteredTrees tiles={GALLERY_TILES} seed={island.seed + 7} roadSeed={island.seed} />
        </group>
      ))}
      <DepartmentCube />
    </group>
  );
}

export function NewPmsIslandModel({ islandId = 0 }: { islandId?: number }) {
  const island = GALLERY_ISLANDS[Math.max(0, Math.min(GALLERY_ISLANDS.length - 1, islandId))];
  return (
    <group>
      <LandTiles tiles={GALLERY_TILES} />
      <Road tiles={GALLERY_TILES} seed={island.seed} />
      <ScatteredTrees
        tiles={GALLERY_TILES}
        seed={island.seed + 7}
        roadSeed={island.seed}
        modelUrls={CENTERED_ISLAND_TREE_MODEL_URLS}
      />
    </group>
  );
}

function GalleryWorld({
  selected,
  onSelect,
  scrollProgress,
  viewMode,
  controlsRef,
  onOpenDepartment,
}: {
  selected: IslandId | null;
  onSelect: (id: IslandId) => void;
  scrollProgress: number;
  viewMode: GalleryViewMode;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onOpenDepartment: () => void;
}) {
  // Org Admin is a completely separate scene (a ring of small pods, not the
  // vertical stack) — bypass the stack/camera-rig machinery below entirely.
  if (viewMode === "orgAdmin") return <OrgAdminScene controlsRef={controlsRef} />;
  if (viewMode === "hypercube") return <HypercubeScene controlsRef={controlsRef} onOpenDepartment={onOpenDepartment} />;

  const departmentView = viewMode === "department";
  const focused = selected !== null;
  // What the haze fades relative to: the island under focus, or the height
  // the scroll position is currently looking at.
  //
  // Department view opts out entirely (Infinity puts every island below the
  // focus, so none of them fade). It frames the whole stack at once, and the
  // scroll position it would otherwise inherit is wherever gallery mode was
  // left — switch across after scrolling to the bottom and the upper islands
  // would dissolve inside their own container.
  const hazeFocusY = departmentView
    ? Number.POSITIVE_INFINITY
    : focused
      ? galleryIslandY(selected)
      : galleryScrollWorldY(scrollProgress);
  return (
    <>
      <color attach="background" args={[GALLERY_SKY_COLOR]} />
      {/* Department frames the whole stack from further out, so its fog has
          to start later or the far islands wash out. */}
      <fog
        attach="fog"
        args={departmentView ? [SPACE_FOG, 40, 120] : [GALLERY_HAZE_COLOR, 18, 44]}
      />
      {departmentView && <Starfield spread={120} seed={3312} />}
      <OrthographicCamera
        makeDefault
        position={[
          GALLERY_OVERVIEW_OFFSET.x,
          galleryScrollWorldY(0) + GALLERY_OVERVIEW_OFFSET.y,
          GALLERY_OVERVIEW_OFFSET.z,
        ]}
        zoom={GALLERY_OVERVIEW_ZOOM}
      />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.05}
        target={[0, galleryScrollWorldY(0), 0]}
        minZoom={focused ? 75 : 0}
        maxZoom={focused ? 200 : Infinity}
        minPolarAngle={focused ? 0.2 : 0}
        maxPolarAngle={focused ? 1.25 : Math.PI}
        enableRotate={focused}
        enableZoom={focused}
        enablePan={false}
        autoRotate={focused}
        autoRotateSpeed={0.22}
      />
      <GalleryCameraRig
        selected={selected}
        scrollProgress={scrollProgress}
        departmentView={departmentView}
        controlsRef={controlsRef}
      />
      <ambientLight intensity={1} />
      <directionalLight position={[5, 8, 5]} intensity={1.5} />
      {GALLERY_ISLANDS.map((cfg) => (
        <GalleryIsland
          key={cfg.id}
          id={cfg.id}
          y={cfg.y}
          seed={cfg.seed}
          selected={selected}
          hazeFocusY={hazeFocusY}
          onSelect={onSelect}
        />
      ))}
      {/* The cloud bank and the containment cuboid are mutually exclusive —
          a weather system inside a sealed glass box reads as a mistake, so
          department view swaps the clouds out for the shell. */}
      {departmentView ? (
        <DepartmentCube />
      ) : (
        <Suspense fallback={null}>
          <GalleryClouds anchorY={galleryScrollWorldY(scrollProgress)} />
        </Suspense>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function KindIcon({ kind }: { kind: ComponentKind }) {
  if (kind === "ship") return <Ship size={18} />;
  if (kind === "windmill" || kind === "watermill") return <Wind size={18} />;
  if (kind === "fountain" || kind === "grand_fountain") return <Droplets size={18} />;
  if (kind === "manor") return <Building2 size={18} />;
  if (kind === "cottage" || kind === "castle_gate" || kind === "watchtower") return <Castle size={18} />;
  if (kind === "stall" || kind === "taco_stand" || kind === "cart") return <Store size={18} />;
  if (kind === "crystals") return <Gem size={18} />;
  return <Trees size={18} />;
}

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className="tier-badge" style={{ background: TIER_COLOR[tier] }}>
      {tier}
    </span>
  );
}

function Avatar({ name, color, email, size = 34 }: { name: string; color: string; email?: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  if (email && !imgError) {
    return (
      <span className="avatar avatar--gravatar" style={{ width: size, height: size }}>
        <img
          src={gravatarUrl(email, size * 2)}
          alt={name}
          width={size}
          height={size}
          onError={() => setImgError(true)}
          style={{ borderRadius: "50%", objectFit: "cover", display: "block" }}
        />
      </span>
    );
  }
  return (
    <span className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.41 }}>
      {initialOf(name)}
    </span>
  );
}

function TaskStatusDot({ status }: { status: TaskStatus }) {
  if (status === "cleared") return <span className="task-dot task-dot--cleared"><Check size={10} /></span>;
  if (status === "under_review") return <span className="task-dot task-dot--pending" />;
  if (status === "established") return <span className="task-dot task-dot--cleared"><Check size={10} /></span>;
  if (status === "demolished") return <span className="task-dot task-dot--demolished" />;
  return <span className="task-dot task-dot--assigned"><Circle size={10} /></span>;
}


// Floating receipt overlay — DOM element outside the Canvas, pointer-events:none
// so it can never steal canvas hover events (avoids drei <Html> flicker bug).
function HoverReceipt({ placement, x, y }: { placement: Placement; x: number; y: number }) {
  const pending = placement.state === "under_review";
  return (
    <div
      className={`receipt receipt--floating ${pending ? "is-pending" : "is-built"}`}
      style={{ left: x + 16, top: y - 12 }}
    >
      <div className="receipt-head">
        <span className="receipt-av" style={{ background: colorForBuilder(placement.builderEmail) }}>
          {initialOf(placement.builder)}
        </span>
        <div>
          <strong>{placement.builder}</strong>
          <small>{placement.submitted}</small>
        </div>
        <span className="receipt-tier" style={{ background: TIER_COLOR[placement.item.tier] }}>
          {placement.item.tier}
        </span>
      </div>
      <p className="receipt-task">{placement.task}</p>
      <div className="receipt-foot">
        <span>{placement.item.label}</span>
        <span className={pending ? "rev-pending" : "rev-built"}>
          {pending ? "● Pending review" : "✓ Established"}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Build picker modal — opens when a member clears a task. Shows the catalogue
// filtered to the cleared task's point tier; picking one places it (under review).
// ---------------------------------------------------------------------------

function StructurePickerModal({
  title,
  onPick,
  onClose,
}: {
  title: string;
  onPick: (structureId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="build-modal-overlay" onClick={onClose}>
      <div className="build-modal" role="dialog" aria-label="Choose your structure" onClick={(e) => e.stopPropagation()}>
        <button className="build-modal-close" type="button" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="build-modal-eyebrow">
          <Hammer size={15} /> Start building
        </div>
        <h2 className="build-modal-title">Pick your structure</h2>
        <p className="build-modal-sub">
          “{title}” gets a spot on the island. Whichever you pick goes down at
          stage 1 and climbs a stage for every 10% of its subtasks you tick
          off — buildings take a plot of land, vehicles go on the road.
        </p>
        <div className="build-modal-grid">
          {Object.values(STRUCTURES).map((option) => {
            const onRoad = option.terrain === "road";
            return (
              <button key={option.id} className="build-option" type="button" onClick={() => onPick(option.id)}>
                <span
                  className="build-option-icon"
                  style={{
                    background: onRoad ? "#f0a92e20" : "#3fa3df20",
                    color: onRoad ? "#c9871d" : "#3fa3df",
                  }}
                >
                  {option.icon}
                </span>
                <strong>{option.label}</strong>
                <span style={{ fontSize: 11, color: "#66806d" }}>{option.blurb}</span>
              </button>
            );
          })}
        </div>
        <p className="build-modal-foot">
          <Sparkles size={13} /> Next you'll pick the tile it stands on.
        </p>
      </div>
    </div>
  );
}

function AssignTaskModal({ teamMembers, onSubmit, onClose }: {
  teamMembers: TeamMemberRow[];
  activeSprintId: string;
  onSubmit: (title: string, assigneeEmail: string, points: Tier, due: string, subtasks: string[]) => void;
  onClose: () => void;
}) {
  const members = teamMembers.filter((m) => m.role === "member" || m.role === "manager");
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(members[0]?.email ?? "");
  const [points, setPoints] = useState<Tier>(30);
  const [due, setDue] = useState("");
  // Starts at three blank rows because most tasks want a couple of steps;
  // "Add step" grows it and empty rows are dropped on submit.
  const [subtasks, setSubtasks] = useState<string[]>(["", "", ""]);

  const setSubtaskAt = (index: number, value: string) =>
    setSubtasks((prev) => prev.map((s, i) => (i === index ? value : s)));
  const filledSubtasks = subtasks.map((s) => s.trim()).filter(Boolean);
  return (
    <div className="build-modal-overlay" onClick={onClose}>
      <div className="build-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <button className="build-modal-close" type="button" onClick={onClose}><X size={18} /></button>
        <div className="build-modal-eyebrow"><Plus size={15} /> Manager · assign task</div>
        <h2 className="build-modal-title">New task</h2>
        <div className="assign-form">
          <label className="assign-label">
            Task
            <input
              className="assign-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
            />
          </label>
          <label className="assign-label">
            Assignee
            <select className="assign-select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {members.map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}
            </select>
          </label>
          <label className="assign-label">
            Points
            <div className="tier-picker">
              {([15, 30, 45, 60] as Tier[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`tier-btn${points === t ? " active" : ""}`}
                  style={points === t ? { background: TIER_COLOR[t], color: "#fff" } : {}}
                  onClick={() => setPoints(t)}
                >
                  {t} pts
                </button>
              ))}
            </div>
          </label>
          <label className="assign-label">
            Due
            <input
              className="assign-input"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              placeholder="e.g. Tomorrow, Jun 30"
            />
          </label>
          <label className="assign-label">
            Subtasks
            <span style={{ display: "block", fontWeight: 400, fontSize: 12, color: "#66806d", marginBottom: 6 }}>
              Each one ticked off pushes the build toward 100% — the structure
              grows a stage every 10%.
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {subtasks.map((value, index) => (
                <input
                  key={index}
                  className="assign-input"
                  value={value}
                  onChange={(e) => setSubtaskAt(index, e.target.value)}
                  placeholder={`Step ${index + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSubtasks((prev) => [...prev, ""])}
              style={{
                marginTop: 8, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6,
                background: "transparent", border: "none", color: "#2f8d4d", fontWeight: 700,
                fontSize: 13, cursor: "pointer", padding: 0,
              }}
            >
              <Plus size={14} /> Add step
            </button>
          </label>
        </div>
        <button
          className="place-button"
          type="button"
          disabled={!title.trim() || filledSubtasks.length === 0}
          onClick={() => onSubmit(title.trim(), assignee, points, due, filledSubtasks)}
        >
          <Send size={16} /> Assign task{filledSubtasks.length > 0 ? ` · ${filledSubtasks.length} steps` : ""}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  const [qmRoute, setQmRoute] = useState(() =>
    typeof window !== "undefined" && window.location.hash.replace(/^#\/?/, "") === "quartermaster",
  );
  useEffect(() => {
    const onHash = () => {
      setQmRoute(window.location.hash.replace(/^#\/?/, "") === "quartermaster");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const initialPmsView = new URLSearchParams(window.location.search).get("view");
  const initialIslandParam = Number.parseInt(new URLSearchParams(window.location.search).get("island") ?? "", 10);
  const initialIslandId = Number.isFinite(initialIslandParam)
    ? Math.max(0, Math.min(GALLERY_ISLAND_COUNT - 1, initialIslandParam))
    : null;
  const [activeTab, setActiveTab] = useState<AppTab>(() =>
    ["gallery", "island", "department", "org", "orgAdmin", "hypercube"].includes(initialPmsView ?? "") ? "gallery" : "world",
  );

  // The gallery tab's <Canvas> mounts fresh each time it's switched to,
  // inside a conditionally-rendered section — react-three-fiber's resize
  // observer sometimes misses that first real layout pass and gets stuck at
  // the browser's default 300x150 canvas size. A window "resize" event on
  // the next frame nudges it to re-measure and pick up the real container
  // size, same effect as manually resizing the window once.
  useEffect(() => {
    if (activeTab !== "gallery") return;
    const raf = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(raf);
  }, [activeTab]);

  const [gallerySelected, setGallerySelected] = useState<IslandId | null>(initialIslandId);
  const [galleryScrollProgress, setGalleryScrollProgress] = useState(0);
  const [galleryViewMode, setGalleryViewMode] = useState<GalleryViewMode>(() => {
    if (initialPmsView === "org") return "orgAdmin";
    if (initialPmsView === "department" || initialPmsView === "hypercube") return initialPmsView;
    return "gallery";
  });
  const galleryControlsRef = useRef<OrbitControlsImpl>(null);
  // Land back on the top of the stack, unfocused, next time the gallery tab
  // is opened, rather than resuming mid-focus from last time.
  useEffect(() => {
    if (activeTab !== "gallery") {
      setGallerySelected(null);
      setGalleryScrollProgress(0);
    }
  }, [activeTab]);

  const [worldZoom, setWorldZoom] = useState(30);

  // Zoom-in intro: land on refresh at 30, then ease up to 75 over ~1.1s.
  // OrbitControls clamps camera.zoom to [minZoom, maxZoom] every frame, so
  // minZoom has to allow the 30 starting point (see minZoom={30} below).
  useEffect(() => {
    const START_ZOOM = 10;
    const END_ZOOM = 75;
    const DURATION_MS = 1100;
    let startTime: number | null = null;
    let frame: number;
    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const t = Math.min(1, (now - startTime) / DURATION_MS);
      const eased = 1 - (1 - t) ** 3;
      setWorldZoom(START_ZOOM + (END_ZOOM - START_ZOOM) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  const [hovered, setHovered] = useState<{ id: string; x: number; y: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; tone: "good" | "bad" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [taskView, setTaskView] = useState<"my" | "team">("my");
  // Optimistic overrides: show approve/reject result immediately before API confirms
  const [localStates, setLocalStates] = useState<Record<string, PlacementState>>({});
  const [cinematic, setCinematic] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("cinematic"),
  );
  const [scripted, setScripted] = useState<Placement[]>(() => cineSeed());
  // The cinematic walkthrough currently playing (chosen from the Demos tab).
  const [activeScript, setActiveScript] = useState<CineScript | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const [placingShimmer, setPlacingShimmer] = useState(false);
  const [optimisticPlacements, setOptimisticPlacements] = useState<Placement[]>([]);
  // Build picker: set when a task is cleared; carries the task title + its point tier.
  const [buildModal, setBuildModal] = useState<{ title: string; tier: Tier } | null>(null);
  // Tasks the member has marked done this session (drives the cleared check + hides "Mark done").

  // Audio — Web Audio API for zero-latency, overlappable SFX. HTML5 <audio>.play()
  // has decode/dispatch lag and can't retrigger instantly; decoding each clip into
  // an AudioBuffer once and firing a fresh BufferSource per trigger removes the lag.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferCacheRef = useRef<Record<string, AudioBuffer>>({});
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  }, []);
  // Decode every known clip up front so the very first play has no decode latency.
  useEffect(() => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    Object.entries(SFX_URLS).forEach(([name, url]) => {
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => { bufferCacheRef.current[name] = buf; })
        .catch(() => { });
    });
  }, [getAudioCtx]);
  const playBuffer = useCallback(
    (name: string, volume: number) => {
      const ctx = audioCtxRef.current;
      const buf = bufferCacheRef.current[name];
      if (!ctx || !buf) return;
      // Browsers start the context suspended until a user gesture; resume on demand.
      if (ctx.state === "suspended") ctx.resume().catch(() => { });
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(ctx.destination);
      src.start(0);
    },
    [],
  );
  const playClick = useCallback(() => playBuffer("click", 0.5), [playBuffer]);
  const playShimmer = useCallback(() => playBuffer("shimmer", 0.85), [playBuffer]);
  // Cinematic SFX cues: beats reference a clip by name (add to SFX_URLS + a `sfx`
  // beat in demos.ts to wire a new cue). Unknown names no-op.
  const playSfx = useCallback((name: string) => playBuffer(name, 0.82), [playBuffer]);

  // ── Auth: current user ──
  const { user: authUser } = useAuth(client);
  const currentUserEmail = authUser?.email ?? "";

  // ── Team members from pod ──
  const { records: teamMemberRecords } = useRecords<TeamMemberRow>({
    client,
    tableName: "team_members",
    limit: 100,
  });
  const teamMembers = useMemo(() => teamMemberRecords, [teamMemberRecords]);

  // Derive current user's role + display name from team_members
  const myMemberRow = useMemo(
    () => teamMembers.find((m) => m.email === currentUserEmail),
    [teamMembers, currentUserEmail],
  );
  const currentUser = useMemo(() => {
    const role: Role = myMemberRow?.role ?? "viewer";
    const name: string = myMemberRow?.name ?? authUser?.name ?? (currentUserEmail ? currentUserEmail.split("@")[0] : "Guest");
    return { email: currentUserEmail, name, role };
  }, [myMemberRow, authUser, currentUserEmail]);
  const isManager = currentUser.role === "manager";
  const isViewer = currentUser.role === "viewer";

  // ── Sprints from pod ──
  const { records: sprintRecords } = useRecords<SprintRow>({
    client,
    tableName: "sprints",
    sort: [{ field: "starts_at", direction: "desc" }],
    limit: 50,
  });
  const sprints = useMemo(() => sprintRecords, [sprintRecords]);
  const activeSprint = useMemo(() => sprints.find((s) => s.status === "active") ?? sprints[0] ?? null, [sprints]);
  const currentSprint = activeSprint;

  // ── Catalogue from pod (with hardcoded fallback) ──
  const { records: catalogueRecords } = useRecords<CatalogueItemRow>({
    client,
    tableName: "catalogue_items",
    limit: 100,
  });
  const catalogue = useMemo(() => {
    if (catalogueRecords.length > 0) {
      return catalogueRecords.map((r) => ({ kind: r.kind as ComponentKind, label: r.label, tier: r.tier as Tier }));
    }
    return CATALOGUE;
  }, [catalogueRecords]);
  const catalogueByTier = useMemo(() => {
    const tiers: Tier[] = [15, 30, 45, 60];
    return tiers.map((tier) => ({ tier, items: catalogue.filter((c) => c.tier === tier) }));
  }, [catalogue]);

  // ── Live task data from the pod ──
  const { records: taskRecords, refresh: refreshTasks, isLoading, error } = useRecords<TaskRow>({
    client,
    tableName: "tasks",
    sort: [{ field: "created_at", direction: "asc" }],
    limit: 500,
  });
  const allTasks = useMemo(() => taskRecords.map(rowToTask), [taskRecords]);

  // Tasks for the currently selected sprint
  const sprintTasks = useMemo(
    () => currentSprint ? allTasks.filter((t) => t.sprintId === currentSprint.id) : [],
    [allTasks, currentSprint],
  );

  // Every task whose structure has been planted on the island — from the
  // moment it's placed (status "building") right through review.
  const placementsRaw = useMemo(
    () =>
      sprintTasks
        .filter((t) => t.structure && t.worldX != null && t.worldZ != null)
        .map((t) => taskToPlacement(t, teamMembers)),
    [sprintTasks, teamMembers],
  );

  // Merge optimistic overrides so clicks feel instant
  const placements = useMemo(
    () =>
      placementsRaw.map((p) => ({
        ...p,
        state: (localStates[p.id] ?? p.state) as PlacementState,
      })),
    [placementsRaw, localStates],
  );
  // In cinematic mode the world reads from the deterministic scripted set instead of the pod.
  const view = useMemo(() => {
    if (cinematic) return scripted;
    const realIds = new Set(placements.map((p) => p.id));
    return [...placements, ...optimisticPlacements.filter((p) => !realIds.has(p.id))];
  }, [cinematic, scripted, placements, optimisticPlacements]);
  const sprintGoal = cinematic ? 180 : (currentSprint?.goal ?? 1490);
  const cine: CineControls = useMemo(
    () => ({
      reset: () => { setScripted(cineSeed()); setSelectedId(null); setActiveTab("world"); },
      world: () => setActiveTab("world"),
      review: () => setActiveTab("review"),
      spotlightFeature: () => setSelectedId("c-est-1"),
      spotlightHero: () => setSelectedId("c-hero"),
      spotlightReject: () => setSelectedId("c-rej"),
      unspotlight: () => setSelectedId(null),
      placeHero: () => setScripted((s) => (s.some((p) => p.id === "c-hero") ? s : [...s, CINE_HERO])),
      approveHero: () => setScripted((s) => s.map((p) => (p.id === "c-hero" ? { ...p, state: "established" } : p))),
      demolishReject: () => setScripted((s) => s.map((p) => (p.id === "c-rej" ? { ...p, state: "demolished" } : p))),
    }),
    [],
  );

  const reviewFn = useFunctionRun({ client, functionName: "review_task" });
  const placeStructureFn = useFunctionRun({ client, functionName: "place_structure" });
  const toggleSubtaskFn = useFunctionRun({ client, functionName: "toggle_subtask" });
  const assignTaskFn = useFunctionRun({ client, functionName: "assign_task" });

  // Derived task lists (filtered by current sprint + current user's email)
  const myTasks = useMemo(
    () => sprintTasks.filter((t) => t.assignee === currentUser.email),
    [sprintTasks, currentUser.email],
  );
  const teamTasks = useMemo(
    () => sprintTasks.filter((t) => t.assignee !== currentUser.email),
    [sprintTasks, currentUser.email],
  );
  // World card hero: the current user's first assigned task
  const myHeroTask = useMemo(
    () => myTasks.find((t) => t.status === "assigned") ?? null,
    [myTasks],
  );

  const [assignModalOpen, setAssignModalOpen] = useState(false);

  const placed = view.filter((p) => p.state !== "demolished").length;
  const pending = view.filter((p) => p.state === "under_review");
  const pendingCount = pending.length;
  const established = view.filter((p) => p.state === "established");
  const demolished = view.filter((p) => p.state === "demolished");
  const myPendingBuild = view.find((p) => p.builderEmail === currentUser.email && p.state === "under_review") ?? null;

  const members: Member[] = useMemo(() => {
    const pts: Record<string, number> = {};
    view.filter((p) => p.state === "established").forEach((p) => {
      pts[p.builderEmail] = (pts[p.builderEmail] ?? 0) + p.item.tier;
    });
    const assignees = new Set<string>([
      ...sprintTasks.map((t) => t.assignee),
      ...view.map((p) => p.builderEmail),
    ]);
    const allMembers = teamMembers.length > 0 ? teamMembers : ROSTER_FALLBACK.map((r) => ({ id: r.email, name: r.name, email: r.email, role: r.role as MemberRole, color: r.color, created_at: "" }));
    return allMembers
      .filter((m) => assignees.has(m.email))
      .map((m) => ({
        name: m.name,
        email: m.email,
        color: m.color ?? colorForBuilder(m.email, teamMembers),
        points: pts[m.email] ?? 0,
      }));
  }, [view, teamMembers, sprintTasks]);
  const ranked = [...members].sort((a, b) => b.points - a.points);
  const done = members.reduce((sum, m) => sum + m.points, 0);
  const pct = Math.min(100, Math.round((done / sprintGoal) * 100));

  const selectedPos = useMemo(() => {
    if (!selectedId) return null;
    const p = view.find((x) => x.id === selectedId);
    if (!p) return null;
    const [x, y, z] = tilePosition(p.x, p.z, 0.7);
    return new THREE.Vector3(x, y, z);
  }, [selectedId, view]);

  const hoveredPlacement = hovered ? (view.find((p) => p.id === hovered.id) ?? null) : null;

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast((t) => (t && t.id === toast.id ? null : t)), 3400);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (error) setToast({ id: Date.now(), text: "Couldn't load the world from the pod", tone: "bad" });
  }, [error]);

  const flash = useCallback((text: string, tone: "good" | "bad") => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  const handleHover = useCallback((id: string | null, sx?: number, sy?: number) => {
    if (id === null || sx === undefined || sy === undefined) {
      setHovered(null);
    } else {
      setHovered({ id, x: sx, y: sy });
    }
  }, []);

  const decide = useCallback(
    async (placementId: string, decision: "approve" | "reject") => {
      const p = placementsRaw.find((x) => x.id === placementId);
      if (!p || busy) return;
      setSelectedId(null);
      const nextState: PlacementState = decision === "approve" ? "established" : "demolished";
      setLocalStates((prev) => ({ ...prev, [placementId]: nextState }));
      setBusy(true);
      try {
        await reviewFn.start({ task_id: placementId, decision });
        await refreshTasks();
        setLocalStates((prev) => {
          const n = { ...prev };
          delete n[placementId];
          return n;
        });
        flash(
          decision === "approve"
            ? `Approved — ${p.builder}'s ${p.item.label.toLowerCase()} is now part of the world`
            : `Demolished — ${p.builder}'s ${p.item.label.toLowerCase()} sent to rubble`,
          decision === "approve" ? "good" : "bad",
        );
      } catch {
        setLocalStates((prev) => {
          const n = { ...prev };
          delete n[placementId];
          return n;
        });
        flash("Couldn't save the review — try again", "bad");
      } finally {
        setBusy(false);
      }
    },
    [placementsRaw, busy, reviewFn, refreshTasks, flash],
  );

  // Structure flow: an assignee picks a structure, which arms a placement and
  // lights up every tile that structure is allowed to stand on in the World
  // tab. It lands as stage 1 and grows from there.
  const [pendingStructure, setPendingStructure] = useState<
    { taskId: string; taskTitle: string; structureId: string } | null
  >(null);

  const beginPlaceStructure = useCallback((task: MockTask, structureId: string) => {
    setPendingStructure({ taskId: task.id, taskTitle: task.title, structureId });
    setActiveTab("world");
  }, []);

  const cancelPendingStructure = useCallback(() => setPendingStructure(null), []);

  const pickingOccupied = useMemo(
    () => (pendingStructure ? new Set(placements.map((p) => `${p.x},${p.z}`)) : null),
    [pendingStructure, placements],
  );
  const pickingTerrain = pendingStructure
    ? structureDef(pendingStructure.structureId).terrain
    : undefined;

  const confirmPlacement = useCallback(
    async (x: number, z: number) => {
      if (busy || !pendingStructure) return;
      const { taskId, taskTitle, structureId } = pendingStructure;
      setPendingStructure(null);

      const optId = `opt-${taskId}`;
      const optPlacement: Placement = {
        id: optId,
        task: taskTitle,
        builder: currentUser.name,
        builderEmail: currentUser.email,
        item: itemForKind("cottage"),
        x,
        z,
        state: "under_review",
        submitted: new Date().toISOString(),
        progress: 0,
        structureId,
      };
      setOptimisticPlacements((prev) => [...prev.filter((p) => p.id !== optId), optPlacement]);
      playShimmer();
      setPlacingShimmer(true);
      setTimeout(() => setPlacingShimmer(false), 1600);

      setBusy(true);
      try {
        await placeStructureFn.start({
          task_id: taskId,
          structure: structureId,
          world_x: x,
          world_z: z,
        });
        await refreshTasks();
        flash(`${structureDef(structureId).label} placed — tick subtasks to grow it`, "good");
      } catch {
        flash("Couldn't place the structure — try again", "bad");
      } finally {
        setOptimisticPlacements((prev) => prev.filter((p) => p.id !== optId));
        setBusy(false);
      }
    },
    [busy, pendingStructure, placeStructureFn, refreshTasks, flash, playShimmer, currentUser],
  );

  // Ticking a subtask moves the task's progress, which is what drives the
  // building's stage. The backend flips the task to under_review once every
  // subtask is done.
  const toggleSubtask = useCallback(
    async (task: MockTask, subtask: Subtask) => {
      if (busy) return;
      setBusy(true);
      try {
        await toggleSubtaskFn.start({ task_id: task.id, subtask_id: subtask.id, done: !subtask.done });
        await refreshTasks();
        if (!subtask.done && task.subtasks.filter((s) => !s.done).length === 1) {
          playShimmer();
          flash("All subtasks done — sent for review", "good");
        }
      } catch {
        flash("Couldn't update that subtask", "bad");
      } finally {
        setBusy(false);
      }
    },
    [busy, toggleSubtaskFn, refreshTasks, flash, playShimmer],
  );

  // Open the build picker for a task (from the World card's CTA).
  const openBuildPicker = useCallback((task: { title: string; tier: Tier }) => {
    setBuildModal({ title: task.title, tier: task.tier });
  }, []);


  // Manager assigns a new task via the modal.
  const handleAssignTask = useCallback(async (
    title: string, assigneeEmail: string, points: Tier, due: string, subtasks: string[],
  ) => {
    setAssignModalOpen(false);
    if (!activeSprint) {
      flash("No active sprint — can't assign task", "bad");
      return;
    }
    try {
      await assignTaskFn.start({
        title,
        assignee_email: assigneeEmail,
        points,
        source: "slack",
        sprint_id: activeSprint.id,
        due,
        subtasks,
      });
      await refreshTasks();
      const memberName = nameForEmail(assigneeEmail, teamMembers);
      flash(`Assigned to ${memberName}`, "good");
    } catch {
      flash("Couldn't assign task — try again", "bad");
    }
  }, [assignTaskFn, refreshTasks, flash, activeSprint, teamMembers]);

  const NAV_TABS: AppTab[] = ["world", "tasks", "review", "gallery"];
  const tabLabel: Record<AppTab, string> = {
    world: "World", tasks: "Tasks", review: "Review", gallery: "Gallery", all: "All",
    catalog: "Catalog", kits: "Kits", stats: "Stats",
    roadmap: "Roadmap", demos: "Demos", quartermaster: "QM",
  };

  if (qmRoute) return <QuartermasterPage />;

  return (
    <main className={cinematic ? "app-shell cinematic-on" : "app-shell"} onClick={playClick}>
      <CinematicDirector
        active={cinematic}
        script={activeScript}
        stageRef={stageRef}
        controls={cine}
        playSfx={playSfx}
        onExit={() => {
          setCinematic(false);
          setSelectedId(null);
          setActiveTab("demos");
        }}
      />

      {activeTab === "roadmap" && <VisualProductDoc />}

      {/* ── DEMOS ─────────────────────────────────────── */}
      {activeTab === "demos" && (
        <section className="demo-library" aria-label="Cinematic walkthroughs">
          <div className="demo-lib-head">
            <div>
              <h2>Cinematic walkthroughs</h2>
              <p>Scripted tours of the real UI — captions, camera, and sound. Pick one to play.</p>
            </div>
            <span className="demo-lib-count">{DEMOS.length} demo{DEMOS.length === 1 ? "" : "s"}</span>
          </div>
          <div className="demo-grid">
            {DEMOS.map((demo) => (
              <button
                key={demo.id}
                type="button"
                className="demo-card"
                onClick={() => {
                  setActiveScript(demo);
                  setSelectedId(null);
                  setActiveTab("world");
                  setCinematic(true);
                }}
              >
                <div className="demo-card-icon">
                  <Film size={22} />
                </div>
                <div className="demo-card-body">
                  <div className="demo-card-top">
                    {demo.tag && <span className="demo-card-tag">{demo.tag}</span>}
                    <span className="demo-card-dur">
                      <Clock size={13} /> {Math.round(demo.duration)}s
                    </span>
                  </div>
                  <strong>{demo.title}</strong>
                  <p>{demo.blurb}</p>
                </div>
                <span className="demo-card-play">
                  <Play size={16} /> Play
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── GALLERY ───────────────────────────────────── */}
      {activeTab === "gallery" && (
        <>
          {/* Native vertical scrolling: a tall spacer gives the container
              something to scroll, while the canvas sticks to the top of the
              viewport. Scroll progress drives the camera down the island
              stack (see GalleryCameraRig). Scrolling is disabled while an
              island is focused so the wheel zooms that island instead, and
              disabled entirely in department view — that mode frames the
              whole stack in one fixed shot, nothing to scroll to. */}
          <section
            aria-label="Island gallery"
            onScroll={(e) => {
              const el = e.currentTarget;
              const max = el.scrollHeight - el.clientHeight;
              setGalleryScrollProgress(max > 0 ? el.scrollTop / max : 0);
            }}
            style={{
              position: "absolute",
              // Full-bleed and BELOW the header (z-index 30) rather than an
              // 80px-inset overlay at z-index 40. Inset left a strip at the
              // top showing whatever was behind it, and sitting above the
              // world made this read as a panel floating over that view
              // instead of a view in its own right.
              inset: 0,
              zIndex: 20,
              background: SPACE_BG,
              overflowY: gallerySelected === null && galleryViewMode === "gallery" ? "auto" : "hidden",
              overflowX: "hidden",
            }}
          >
            <div style={{ height: galleryViewMode === "gallery" ? `calc(100vh * ${GALLERY_SCROLL_SCREENS})` : "100%" }}>
              <div style={{ position: "sticky", top: 0, height: "100vh" }}>
                <Canvas gl={{ antialias: true }}>
                  <GalleryWorld
                    selected={gallerySelected}
                    onSelect={setGallerySelected}
                    scrollProgress={galleryScrollProgress}
                    viewMode={galleryViewMode}
                    controlsRef={galleryControlsRef}
                    onOpenDepartment={() => setGalleryViewMode("department")}
                  />
                </Canvas>
              </div>
            </div>
          </section>

          {/* Thin haze wash where the scene meets the header. The real cloud
              bank (GalleryClouds) and the 3D dissolve (galleryHazeOpacity) do
              the disappearing act now, so this is only here to stop the very
              top row of pixels cutting off against a hard line — keep it
              short and mostly transparent or it flattens the clouds behind
              it back into a solid slab. Gallery mode only — department and
              org admin have their own plain white backdrop, nothing to
              soften into. */}
          {gallerySelected === null && galleryViewMode === "gallery" && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "14vh",
                zIndex: 21,
                pointerEvents: "none",
                background: `linear-gradient(rgba(5,7,15,0.85) 0%, rgba(5,7,15,0.45) 45%, rgba(5,7,15,0) 100%)`,
              }}
            />
          )}

          {/* Gallery / Department / Org Admin switch. Hidden while an island
              is focused — the containment shell and the org ring are both
              properties of the whole stack, so they have nothing to say
              once you're inside a single island. */}
          {gallerySelected === null && (
            <div
              role="group"
              aria-label="Gallery view mode"
              style={{
                position: "absolute", top: 20, right: 20, zIndex: 42,
                display: "flex", gap: 4, padding: 4, borderRadius: 999,
                background: "rgba(255,255,255,0.92)",
                boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
              }}
            >
              {([
                { mode: "gallery", label: "Gallery", icon: <Castle size={14} /> },
                { mode: "department", label: "Department", icon: <Layers size={14} /> },
                { mode: "orgAdmin", label: "Org Admin", icon: <Share2 size={14} /> },
                { mode: "hypercube", label: "Hypercube", icon: <Boxes size={14} /> },
              ] as const).map(({ mode, label, icon }) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={galleryViewMode === mode}
                  onClick={() => setGalleryViewMode(mode)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 999, border: "none",
                    cursor: "pointer", fontWeight: 700, fontSize: 13,
                    background: galleryViewMode === mode ? "#20362a" : "transparent",
                    color: galleryViewMode === mode ? "#ffffff" : "#5a6b62",
                  }}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          )}

          {gallerySelected !== null && (
            <div style={{ position: "absolute", top: 100, left: 20, zIndex: 42, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setGallerySelected(null)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, border: "none", background: "rgba(255,255,255,0.92)", color: "#20362a", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
                <ChevronLeft size={16} /> Back to gallery
              </button>
              <button type="button" onClick={() => { setGallerySelected(null); setActiveTab("world"); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 999, border: "none", background: "#20362a", color: "#ffffff", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.18)" }}>
                Open island workspace <ChevronLeft size={16} style={{ transform: "rotate(180deg)" }} />
              </button>
            </div>
          )}
        </>
      )}

      <section
        className={`world-stage${placingShimmer ? " world-stage--shimmer" : ""}`}
        aria-label="3D task arcade world"
        ref={stageRef}
        style={{
          visibility: activeTab === "gallery" ? "hidden" : "visible",
          pointerEvents: activeTab === "gallery" ? "none" : undefined,
        }}
      >
        <Canvas gl={{ antialias: true }}>
          <World
            zoom={worldZoom}
            placements={view}
            onHover={handleHover}
            selectedId={selectedId}
            selectedPos={selectedPos}
            pickingOccupied={pickingOccupied}
            pickingTerrain={pickingTerrain}
            onPickTile={confirmPlacement}
          />
        </Canvas>
      </section>

      {pendingStructure && (
        <div className="toast toast--good" role="status" style={{ cursor: "default" }}>
          <Sparkles size={17} />
          <span>Choose a glowing tile for “{pendingStructure.taskTitle}”</span>
          <button
            type="button"
            onClick={cancelPendingStructure}
            style={{ marginLeft: 10, background: "transparent", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline" }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Floating hover receipt (DOM overlay — pointer-events:none, never steals canvas events) */}
      {hoveredPlacement && hovered && (
        <HoverReceipt placement={hoveredPlacement} x={hovered.x} y={hovered.y} />
      )}

      {toast && (
        <div className={`toast toast--${toast.tone}`} role="status">
          {toast.tone === "good" ? <Sparkles size={17} /> : <X size={17} />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Structure picker — choosing one arms tile placement for it. */}
      {buildModal && (
        <StructurePickerModal
          title={buildModal.title}
          onPick={(structureId) => {
            const task = myTasks.find((t) => t.title === buildModal.title);
            setBuildModal(null);
            if (task) beginPlaceStructure(task, structureId);
          }}
          onClose={() => setBuildModal(null)}
        />
      )}
      {assignModalOpen && (
        <AssignTaskModal
          teamMembers={teamMembers}
          activeSprintId={activeSprint?.id ?? ""}
          onSubmit={handleAssignTask}
          onClose={() => setAssignModalOpen(false)}
        />
      )}

      <header className="app-header">
        <button className="brand-pill" type="button" onClick={() => setActiveTab("world")}>
          <Castle size={22} />
          Task Arcade
        </button>
        <nav className="app-tabs" aria-label="Desk sections">
          {NAV_TABS.map((tab) => (
            <button
              key={tab}
              className={activeTab === tab ? "tab active" : "tab"}
              type="button"
              onClick={() => setActiveTab(tab)}
            >
              {tabLabel[tab]}
              {tab === "review" && pendingCount > 0 && <i className="tab-badge">{pendingCount}</i>}
            </button>
          ))}
          <a href="#/quartermaster" className="tab tab--qm-link" type="button">
            <Sparkles size={12} /> QM
          </a>
        </nav>
        <div className="header-right">
          <div className="user-pill">
            <Avatar name={currentUser.name} color={colorForBuilder(currentUser.email, teamMembers)} email={currentUser.email} size={24} />
            <span className="user-pill-name">{currentUser.name}</span>
            <span className={`role-chip role-chip--${currentUser.role}`}>
              {currentUser.role === "manager" ? "Manager" : currentUser.role === "viewer" ? "Viewer" : "Member"}
            </span>
          </div>
          <button
            className="cine-launch"
            type="button"
            title="Browse cinematic walkthroughs"
            onClick={() => setActiveTab("demos")}
          >
            <Film size={16} /> Demos
          </button>
          <div className="world-count">
            <Layers size={16} />
            <span>{isLoading && view.length === 0 ? "Loading…" : `${placed} placed`}</span>
          </div>
        </div>
      </header>

      {/* ── WORLD ─────────────────────────────────────── */}
      {activeTab === "world" && (
        <>
          <aside className="sprint-panel" aria-label="Team sprint">
            <div className="sprint-head">
              <span className="sprint-eyebrow">Current sprint</span>
              <h1>{currentSprint?.name ?? "Loading…"}</h1>
            </div>
            <div className="sprint-goal">
              <strong>{done.toLocaleString()}</strong>
              <span> / {sprintGoal.toLocaleString()} pts goal</span>
            </div>
            <div className="sprint-bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="sprint-bar-foot">
              <span>{pct}% to goal</span>
              <span>{pendingCount} pending review</span>
            </div>
            <div className="roster-head">
              <Users size={15} /> Team progress
            </div>
            <ul className="roster">
              {ranked.map((m, i) => {
                const memberRole = teamMembers.find((r) => r.email === m.email)?.role ?? "member";
                return (
                  <li key={m.email} className="roster-row">
                    <Avatar name={m.name} color={m.color} email={m.email} />
                    <span className="roster-name">{m.name}</span>
                    {memberRole === "manager" && (
                      <span className="role-chip role-chip--manager role-chip--xs">Mgr</span>
                    )}
                    {i === 0 && m.points > 0 && <Crown size={15} className="roster-crown" />}
                    <span className="roster-points">{m.points} pts</span>
                  </li>
                );
              })}
            </ul>
            <button className="leaderboard-link" type="button" onClick={() => setActiveTab("stats")}>
              <Trophy size={15} /> View full leaderboard
            </button>
          </aside>

          <aside className="task-card" aria-label="Your task">
            {myPendingBuild ? (
              <>
                <div className="task-card__eyebrow"><ClipboardList size={16} /> Your build · pending review</div>
                <h2>{myPendingBuild.task}</h2>
                <div className="task-pick">
                  <span className="task-pick__icon" style={{ background: `${TIER_COLOR[myPendingBuild.item.tier]}22`, color: TIER_COLOR[myPendingBuild.item.tier] }}>
                    <KindIcon kind={myPendingBuild.item.kind} />
                  </span>
                  <div>
                    <strong>{myPendingBuild.item.label}</strong>
                    <em>Build component · {TIER_LABEL[myPendingBuild.item.tier]}</em>
                  </div>
                  <TierBadge tier={myPendingBuild.item.tier} />
                </div>
                <div className="task-meta"><span><Clock size={15} /> Awaiting manager approval</span></div>
              </>
            ) : myHeroTask ? (
              <>
                <div className="task-card__eyebrow"><ClipboardList size={16} /> Your task · ready to build</div>
                <h2>{myHeroTask.title}</h2>
                <div className="task-pick">
                  <span className="task-pick__icon" style={{ background: `${TIER_COLOR[myHeroTask.tier]}22`, color: TIER_COLOR[myHeroTask.tier] }}>
                    <Trophy size={18} />
                  </span>
                  <div>
                    <strong>{myHeroTask.tier}-pt milestone</strong>
                    <em>{myHeroTask.subtasks.length} subtasks · place a structure to start</em>
                  </div>
                  <TierBadge tier={myHeroTask.tier} />
                </div>
                <div className="task-meta"><span><Clock size={15} /> {myHeroTask.due || "No due date"}</span></div>
                {!isViewer && (
                  <button className="place-button" type="button" onClick={() => openBuildPicker(myHeroTask)} disabled={busy}>
                    <Hammer size={18} /> Place your structure
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="task-card__eyebrow"><ClipboardList size={16} /> No tasks assigned</div>
                <h2>Nothing to build yet</h2>
                <div className="task-meta"><span><Clock size={15} /> Ask your manager to assign a task</span></div>
              </>
            )}
          </aside>

          <div className="zoom-controls" aria-label="Camera controls">
            <button type="button" aria-label="Zoom out" onClick={() => setWorldZoom((z) => Math.max(38, z - 10))}>
              <ZoomOut size={22} />
            </button>
            <span>3D</span>
            <button type="button" aria-label="Zoom in" onClick={() => setWorldZoom((z) => Math.min(110, z + 10))}>
              <ZoomIn size={22} />
            </button>
          </div>
          <div className="hint">Hover a build to see its receipt · drag to orbit</div>
        </>
      )}

      {/* ── TASKS (Todoist-style) ────────────────────── */}
      {activeTab === "tasks" && (
        <aside className="tab-panel tasks-panel" aria-label="Task list">
          <div className="tasks-header">
            <div className="panel-header" style={{ paddingBottom: 0 }}>
              <span>Tasks</span>
              <span className={`role-chip role-chip--${currentUser.role}`}>
                {currentUser.role === "manager" ? "Manager view" : currentUser.role === "viewer" ? "Viewer" : "Member view"}
              </span>
            </div>
            <div className="tasks-toggle">
              <button className={taskView === "my" ? "active" : ""} onClick={() => setTaskView("my")}>
                My tasks
              </button>
              <button className={taskView === "team" ? "active" : ""} onClick={() => setTaskView("team")}>
                Team
              </button>
            </div>
          </div>

          {/* Manager-only: assign new task CTA */}
          {isManager && taskView === "team" && (
            <button className="assign-task-btn" type="button" onClick={() => setAssignModalOpen(true)}>
              <Plus size={14} /> Assign task to teammate
            </button>
          )}

          <ul className="task-list">
            {(taskView === "my" ? myTasks : teamTasks).map((t) => {
              const progress = taskProgress(t);
              const stage = stageForProgress(progress);
              const isMine = taskView === "my" && !isViewer;
              const canPlace = isMine && t.status === "assigned";
              const canTick = isMine && (t.status === "assigned" || t.status === "building");
              const assigneeName = nameForEmail(t.assignee, teamMembers);
              const doneCount = t.subtasks.filter((s) => s.done).length;
              return (
                <li key={t.id} className="task-row" style={{ alignItems: "flex-start" }}>
                  <TaskStatusDot status={t.status} />
                  <div className="task-row-body">
                    <div className="task-row-top">
                      <span className={`task-row-title ${t.status === "established" ? "is-cleared" : ""}`}>{t.title}</span>
                      <TierBadge tier={t.tier} />
                    </div>
                    <div className="task-row-meta">
                      {taskView === "team" && (
                        <span className="task-assignee">
                          <Avatar name={assigneeName} color={colorForBuilder(t.assignee, teamMembers)} email={t.assignee} size={18} />
                          {assigneeName}
                        </span>
                      )}
                      <span className="task-due">{t.due}</span>
                    </div>

                    {t.subtasks.length > 0 && (
                      <>
                        {/* Progress + which building stage it maps to */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "rgba(32,54,42,0.12)", overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${progress}%`,
                                height: "100%",
                                borderRadius: 999,
                                background: progress === 100 ? "#2f8d4d" : "#3fa3df",
                                transition: "width 320ms ease",
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#66806d", whiteSpace: "nowrap" }}>
                            {progress}% · {doneCount}/{t.subtasks.length}
                          </span>
                          {t.structure && (
                            <span
                              style={{
                                fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
                                padding: "2px 7px", borderRadius: 999,
                                background: "#3fa3df1f", color: "#2b7fb5", whiteSpace: "nowrap",
                              }}
                            >
                              STAGE {stage}/{BUILDING_STAGE_COUNT}
                            </span>
                          )}
                        </div>

                        <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                          {t.subtasks.map((sub) => (
                            <li key={sub.id}>
                              <label
                                style={{
                                  display: "flex", alignItems: "center", gap: 7,
                                  fontSize: 12.5,
                                  color: sub.done ? "#8aa093" : "#20362a",
                                  textDecoration: sub.done ? "line-through" : "none",
                                  cursor: canTick ? "pointer" : "default",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={sub.done}
                                  disabled={!canTick || busy}
                                  onChange={() => toggleSubtask(t, sub)}
                                  style={{ accentColor: "#2f8d4d", cursor: canTick ? "pointer" : "default" }}
                                />
                                {sub.title}
                              </label>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>

                  {canPlace && (
                    <button
                      className="task-done-btn"
                      type="button"
                      onClick={() => setBuildModal({ title: t.title, tier: t.tier })}
                    >
                      <Hammer size={14} /> Place structure
                    </button>
                  )}
                  {t.status === "building" && (
                    <span className="task-done-chip">
                      <Hammer size={13} /> Building
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {/* View all — opens the full task list (wired later) */}
          <button
            className="view-all-link"
            type="button"
            onClick={() => flash("Full task list — coming soon", "good")}
          >
            View all tasks →
          </button>

          {(taskView === "my" ? myTasks : teamTasks).length === 0 && (
            <div className="review-empty">
              <CheckCircle2 size={28} />
              <strong>All done</strong>
              <span>No tasks in this view.</span>
            </div>
          )}
        </aside>
      )}

      {/* ── REVIEW (manager view) ────────────────────── */}
      {activeTab === "review" && (
        <aside className="tab-panel review-panel" aria-label="Review queue">
          <div className="panel-header">
            <span>Pending review</span>
            <strong>Counts toward streak</strong>
          </div>
          {pendingCount === 0 ? (
            <div className="review-empty">
              <CheckCircle2 size={30} />
              <strong>All caught up</strong>
              <span>Every build has been reviewed.</span>
            </div>
          ) : (
            <ul className="review-list">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className={selectedId === p.id ? "review-row is-selected" : "review-row"}
                  onMouseEnter={() => setSelectedId(p.id)}
                  onMouseLeave={() => setSelectedId((s) => (s === p.id ? null : s))}
                >
                  <Avatar name={p.builder} color={colorForBuilder(p.builderEmail, teamMembers)} email={p.builderEmail} />
                  <div className="review-meta">
                    <strong>{p.builder}</strong>
                    <small>
                      {p.task} · {p.item.label}
                    </small>
                  </div>
                  <TierBadge tier={p.item.tier} />
                  <div className="review-actions">
                    {isManager ? (
                      <>
                        <button
                          className="rev-approve"
                          type="button"
                          disabled={busy}
                          onClick={() => decide(p.id, "approve")}
                          aria-label="Approve"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          className="rev-reject"
                          type="button"
                          disabled={busy}
                          onClick={() => decide(p.id, "reject")}
                          aria-label="Reject"
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <span className="review-viewer-note">Manager reviews</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="phase-note">
            <Sparkles size={14} /> Hover to spotlight · approve grows it, reject demolishes it.
          </p>
          <button className="view-all-link" type="button" onClick={() => setActiveTab("all")}>
            View all activity →
          </button>
        </aside>
      )}

      {/* ── ALL ACTIVITY ─────────────────────────────── */}
      {activeTab === "all" && (
        <aside className="tab-panel all-panel" aria-label="All activity">
          <div className="all-panel-header">
            <button className="back-btn" type="button" onClick={() => setActiveTab("review")}>
              <ChevronLeft size={16} /> Review
            </button>
            <div className="panel-header" style={{ flex: 1, paddingBottom: 0 }}>
              <span>All activity</span>
              <strong>{view.length} total</strong>
            </div>
          </div>

          {pending.length > 0 && (
            <section className="all-group">
              <div className="all-group-head">
                <span className="all-dot all-dot--pending" />
                Pending review <em>{pending.length}</em>
              </div>
              <ul className="task-list">
                {pending.map((p) => (
                  <li key={p.id} className="task-row task-row--review">
                    <span className="task-dot task-dot--pending" />
                    <div className="task-row-body">
                      <div className="task-row-top">
                        <span className="task-row-title">{p.task}</span>
                        <TierBadge tier={p.item.tier} />
                      </div>
                      <div className="task-row-meta">
                        <span className="task-assignee">
                          <Avatar name={p.builder} color={colorForBuilder(p.builderEmail, teamMembers)} email={p.builderEmail} size={18} />
                          {p.builder} · {p.item.label}
                        </span>
                        <span className="task-due">{p.submitted}</span>
                      </div>
                    </div>
                    <div className="review-actions">
                      {isManager ? (
                        <>
                          <button
                            className="rev-approve"
                            type="button"
                            disabled={busy}
                            onClick={() => decide(p.id, "approve")}
                            aria-label="Approve"
                          >
                            <Check size={15} />
                          </button>
                          <button
                            className="rev-reject"
                            type="button"
                            disabled={busy}
                            onClick={() => decide(p.id, "reject")}
                            aria-label="Reject"
                          >
                            <X size={15} />
                          </button>
                        </>
                      ) : (
                        <span className="review-viewer-note">Manager reviews</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {established.length > 0 && (
            <section className="all-group">
              <div className="all-group-head">
                <span className="all-dot all-dot--established" />
                Established <em>{established.length}</em>
              </div>
              <ul className="task-list">
                {established.map((p) => (
                  <li key={p.id} className="task-row">
                    <span className="task-dot task-dot--cleared">
                      <Check size={10} />
                    </span>
                    <div className="task-row-body">
                      <div className="task-row-top">
                        <span className="task-row-title is-cleared">{p.task}</span>
                        <TierBadge tier={p.item.tier} />
                      </div>
                      <div className="task-row-meta">
                        <span className="task-assignee">
                          <Avatar name={p.builder} color={colorForBuilder(p.builderEmail, teamMembers)} email={p.builderEmail} size={18} />
                          {p.builder} · {p.item.label}
                        </span>
                        <span className="task-due">{p.submitted}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {demolished.length > 0 && (
            <section className="all-group">
              <div className="all-group-head">
                <span className="all-dot all-dot--demolished" />
                Demolished <em>{demolished.length}</em>
              </div>
              <ul className="task-list">
                {demolished.map((p) => (
                  <li key={p.id} className="task-row task-row--demolished">
                    <span className="task-dot task-dot--demolished" />
                    <div className="task-row-body">
                      <div className="task-row-top">
                        <span className="task-row-title">{p.task}</span>
                        <TierBadge tier={p.item.tier} />
                      </div>
                      <div className="task-row-meta">
                        <span className="task-assignee">
                          <Avatar name={p.builder} color={colorForBuilder(p.builderEmail, teamMembers)} email={p.builderEmail} size={18} />
                          {p.builder} · {p.item.label}
                        </span>
                        <span className="task-due">{p.submitted}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {view.length === 0 && (
            <div className="review-empty" style={{ marginTop: 24 }}>
              <CheckCircle2 size={28} />
              <strong>Nothing yet</strong>
              <span>Place your first build to see activity here.</span>
            </div>
          )}
        </aside>
      )}

      {/* ── CATALOG ───────────────────────────────────── */}
      {activeTab === "catalog" && (
        <aside className="tab-panel" aria-label="Build catalogue">
          <div className="panel-header">
            <span>Build catalogue</span>
            <strong>By point tier</strong>
          </div>
          <div className="catalog-tiers">
            {catalogueByTier.map(({ tier, items }) => (
              <section className="catalog-tier" key={tier}>
                <header>
                  <TierBadge tier={tier} />
                  <strong>{tier} pts</strong>
                  <span>{TIER_LABEL[tier]}</span>
                </header>
                <div className="catalog-items">
                  {items.map((c) => (
                    <div className="catalog-chip" key={c.kind}>
                      <KindIcon kind={c.kind} />
                      {c.label}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>
      )}

      {/* ── STATS ─────────────────────────────────────── */}
      {activeTab === "stats" && (
        <aside className="tab-panel" aria-label="Team stats">
          <div className="panel-header">
            <span>Team stats</span>
            <strong>{done.toLocaleString()} pts</strong>
          </div>
          <div className="stat-grid">
            <div>
              <strong>{placed}</strong>
              <span>placed</span>
            </div>
            <div>
              <strong>{pendingCount}</strong>
              <span>pending</span>
            </div>
            <div>
              <strong>{members.length}</strong>
              <span>builders</span>
            </div>
          </div>
          <div className="roster-head">
            <Trophy size={15} /> Leaderboard
          </div>
          <ul className="roster">
            {ranked.map((m, i) => (
              <li key={m.email} className="roster-row">
                <span className="roster-rank">{i + 1}</span>
                <Avatar name={m.name} color={m.color} email={m.email} />
                <span className="roster-name">{m.name}</span>
                <span className="roster-points">{m.points} pts</span>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {/* ── KITS ──────────────────────────────────────── */}
      {activeTab === "kits" && (
        <aside className="tab-panel" aria-label="World kits">
          <div className="panel-header">
            <span>World kits</span>
            <strong>Art themes</strong>
          </div>
          <div className="kit-list">
            {[
              { name: "Fantasy town", note: "Cottages, mills, stalls", swatch: "#8fcf72" },
              { name: "Urban city", note: "Manors, towers, planters", swatch: "#9bb7d8" },
              { name: "Pirate bay", note: "Ships, gates, watchtowers", swatch: "#e0b070" },
              { name: "Motor pool", note: "Carts, vans, delivery", swatch: "#d68b9a" },
            ].map((k) => (
              <section className="kit-row" key={k.name}>
                <div>
                  <strong>{k.name}</strong>
                  <span>{k.note}</span>
                </div>
                <span className="kit-swatch" style={{ background: k.swatch }} />
              </section>
            ))}
          </div>
        </aside>
      )}

    </main>
  );
}

export default App;
