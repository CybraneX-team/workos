# Production PMS and Supercycle Execution Specification

## Objective

Create an authenticated `/pms` application that connects the BDT Revenue & Growth Supercycle to company-scoped execution. `/new-pms` is the visual reference and `/3d-pms` is legacy; neither prototype is an application data source.

The frontend uses a replaceable repository boundary backed by company-scoped `localStorage` for this phase. No demo projects or live instances are seeded. A backend implementation can replace the repository without changing the domain model or views.

## Canonical hierarchy

1. BDT core opens the Revenue & Growth Supercycle.
2. A Supercycle has configurable department nodes for one organisation archetype.
3. A department node exposes sub-nodes and one selected sub-cycle template.
4. A sub-cycle template contains ordered stages.
5. Attaching a real business object creates a live instance.
6. One live instance may own multiple project islands in multiple departments.
7. Project islands live inside their owning department cubes.
8. Department cubes live inside the organisation Hypercube.
9. Tasks and milestones are the atomic execution state inside an island.

## Bidirectional flow

Downward navigation:

`BDT → Supercycle → department → stage/live instance → /pms Hypercube → department cube → island → project work`

Upward telemetry:

`task completion/risk → island health → department health → live-instance health/stage → Supercycle department health → overall Supercycle health`

The Supercycle explains value flow. PMS explains execution.

## Domain entities

### Organisation PMS configuration

- `companyId`
- `archetypeId`: one of B2B SaaS, Deep-tech/Government, D2C, Manufacturing, Consulting, Education
- optional renamed/replaced/additional department definitions

### Live instance

- stable ID
- company ID
- name
- originating Supercycle department node ID
- sub-node ID (optional)
- sub-cycle template ID
- current stage index
- linked business object type and ID (optional until Object Space integration)
- health, derived from linked islands when islands exist
- status: active, paused, completed
- linked project/island IDs
- created/updated timestamps

### Programme

A live instance with projects in multiple departments is presented as one cross-department programme. Programme membership is represented by the projects linked to the same live-instance ID; a separate duplicated project tree is not required.

### Island/project

One project equals one island. It contains:

- name, description, type, owner, members
- owning department source key
- optional live-instance ID
- status and derived health
- milestones
- tasks and task dependencies
- decisions
- risks
- files/links
- project chat/activity
- linked goal and source cards where already supported
- created timestamp

### Department cube

A department cube is derived from the configured BDT department and its projects. It contains no duplicate project records. Its health, capacity, risk, and progress are rollups.

### Hypercube

The Hypercube is the organisation-wide execution topology containing all department cubes, cross-department programme links, shared milestones, blockers, capacity signals, and priorities.

## Views

### Gallery

- Shows all accessible project islands.
- Empty state contains no fake work.
- Search and filters: department, owner, status, health.
- Create island/project.
- Open an island.
- Cards and 3D islands show health, owner, progress, overdue/blocker count, and originating live instance.

### Island detail

- Focuses one project island.
- Shows objective, owner/team, health and status.
- Milestones and dependencies.
- Task workflow: todo, in progress, review, done.
- Risks, decisions, files, and activity/chat.
- Shows owning department and originating Supercycle instance.
- Mutations update rollups immediately.

### Department

- Shows one selected department cube and its islands.
- Department purpose, owner/team, capacity, health, metrics, incoming/outgoing programme links, risks and overdue work.
- Allows switching departments.

### Organisation Admin

- Shows the organisation core linked to every configured department cube.
- Structural/governance focus: department identity, leadership, membership, permissions summary, health, capacity and cross-department ownership.
- Does not duplicate task editing.

### Hypercube

- Shows all department cubes within one outer cube.
- Shows islands within their owning cube.
- Shows cross-department links between projects sharing a live instance.
- Selecting a department focuses its cube; selecting an island opens its detail.

## Navigation and deep links

- `/pms` defaults to Hypercube.
- `/pms?view=gallery`
- `/pms?view=department&department=<sourceKey>`
- `/pms?view=org`
- `/pms?view=hypercube`
- `/pms?project=<projectId>` opens an island.
- `/pms?instance=<instanceId>` opens Hypercube and highlights all linked islands; if exactly one island exists, it may open directly.
- Back navigation preserves the originating view, department, and instance context.

## Supercycle behavior

### Editable value cycles

- A company can configure up to six visible cycles for each Supercycle archetype.
- A cycle stores a name, display colour, and an ordered set of two or more department node IDs.
- Departments are shared topology nodes: one department may participate in many cycles and one cycle may pass through many departments.
- Every cycle renders as its own closed route on the Supercycle sphere through its selected departments.
- Selecting a cycle highlights its route and member departments while dimming every other route and unrelated department.
- Company users with write access can create, edit, and delete cycles from the Supercycle editor; changes persist in the company-scoped frontend repository.

- No sample instances are displayed in authenticated production BDT.
- Users can create a live instance from a selected department/sub-cycle.
- A live instance appears at its current stage.
- Selecting it navigates to `/pms?instance=<id>`.
- Health is derived from linked project islands; instances without islands show “No execution linked,” not 100% health.
- Creating execution from an instance creates one or more department-owned project islands and links them to that instance.

## Roles

- Founder/admin: configure archetype/departments, create and manage all instances/projects.
- Department manager: manage projects and instances owned by their department.
- Contributor/member: update assigned work and view accessible company execution.
- Viewer: read-only.

This phase consumes existing authenticated WorkOS identity and company context. Fine-grained backend enforcement remains the backend developer’s responsibility; the frontend must keep mutation capabilities explicit so they can be policy-gated.

## Persistence boundary

- Storage is scoped by company ID, never by a global demo key.
- No seeded demo data.
- Domain state is versioned and migrated on load.
- Repository operations are expressed as typed methods rather than direct component access to `localStorage`.
- Cross-tab updates use a scoped browser event/storage notification.

## Acceptance criteria

- `/pms` is AuthGuard-protected and company-scoped.
- The four overview modes and island detail are functional and data-driven.
- Projects can be created, edited, and linked to live instances.
- Tasks, milestones, risks, decisions, files and chat remain functional.
- Supercycle displays only company-scoped real instances.
- Selecting a Supercycle instance opens the correct PMS execution context.
- Project/task changes update island, department, instance and Supercycle health without reload.
- No prototype account gate, seeded bots, sample instances, or dummy billing/opportunity labels appear in production routes.
- Production frontend build passes.
