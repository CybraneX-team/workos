# FounderOS — Internal Team Doc

---

## The Big Idea First

We're building a 3D intelligence platform for startup founders. The core experience is the Twin — a living galaxy of companies you can scroll into, zoom into your own startup, and see everything: your departments, your metrics, how you compare to peers, what moves to make next.

Under the hood we made a deliberate choice to use **two databases** and they each have a clear job:

**Supabase handles who you are.**
Your login, your company, your team, your role, where your company sits in the 3D graph. All the structural, relational stuff. Supabase's Row Level Security means each company can only see their own data automatically — we don't have to write that logic ourselves.

**MongoDB handles what's happening.**
Metrics, predictions, simulation history, how the AI learns from founder behavior. This data is flexible — every industry has different metric shapes, and the Bayesian engine needs to do heavy aggregations over time-series data. Postgres would fight us on this. Mongo doesn't.

The two databases share one thing: the Supabase `company_id` UUID. We pass that into every MongoDB call as the company identifier. No sync, no foreign key, no migration. Just a shared UUID that links a founder's Supabase identity to their MongoDB history.

---

## Running the Project

```bash
# Frontend
cd digital-idea-twin
npm install
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_OUTCOME_API_URL
npm run dev

# Metrics + AI backend (separate terminal)
cd dynamic-tasks-metrics
npm install
cp .env.example .env
# Fill in MONGO_URI, OPENAI_API_KEY (optional)
npm run seed    # loads demo tasks and benchmark data
npm run dev     # port 3001
```

Without `.env.local` in the frontend, everything falls back to mock data and auth is bypassed. Good for pure UI work.

---

## What We've Built So Far

### The Two Repos

We have two codebases that are meant to work together but aren't fully connected yet:

| | `digital-idea-twin` | `dynamic-tasks-metrics` |
|---|---|---|
| What it is | React frontend | Node.js backend |
| Database | Supabase (Postgres) | MongoDB |
| What it does | UI, 3D graph, auth, all pages | AI prediction engine, metrics intelligence |
| Status | UI fully built, most pages still on mock data | Engine fully built, no UI yet |

---

### What's Fully Working

**Auth** — complete. Supabase handles sign in, sign up, sessions, and we wrap everything in `AuthProvider`. The `useAuth()` hook gives you user, profile, role, and permission checks from anywhere in the app.

```ts
const { profile, role, canRead, canWrite, signOut } = useAuth();
```

**Routing** — complete. If you're not logged in, you go to `/auth`. If you're logged in but haven't onboarded, you go to `/onboarding`. Otherwise you get into the app. All routes behind `<AuthGuard>`.

**Onboarding wizard** — complete. 5 steps, collects company info, at the end we compute a 3D position using Fibonacci sphere math and write the company to Supabase. That company then automatically shows up in the Twin for every logged-in user.

**RBAC** — complete. We have 8 roles (founder, analyst, viewer, investor, etc.) and 8 modules (twin, strategy, analytics, etc.). Each role/module combination has read/write/delete flags. Defined in `src/lib/db/rbac.ts`, checked with `canWrite('strategy')` etc.

**The 3D Twin graph** — the most complex thing we've built. Fully working. See the section below.

---

### The 3D Twin — How It Works

Everything lives in `src/components/Graph3D.tsx`, roughly 1000 lines. It's driven by camera distance, updated 60 times per second using refs so we never trigger React re-renders.

There are three zoom levels and they each show a completely different view of the world:

**Galaxy View** — when you're far out, you see 7 industry bubble clusters (transparent icosahedron spheres) and some signal nodes. No companies visible — they're tucked inside their industry bubbles.

**Cluster View** — scroll into one industry bubble and it fades away. Every company in that cluster emerges as a colored dot. All other clusters disappear. Your company (comp-you) is always highlighted in cyan.

**Company View** — scroll into your company and everything else dissolves. Your departments and feature tab nodes emerge from the company origin. The camera automatically repositions to frame all of them. Feature nodes (Strategy, Analytics, Data, Benchmarks, Team) are clickable octahedrons that navigate to their actual pages.

The zoom level is computed from a `ScopeState` ref that gets updated every frame:

```ts
// CameraWatcher runs every frame and writes these values
scopeRef.current.clusterFocus  // 0 = far from cluster, 1 = deep inside
scopeRef.current.companyFocus  // 0 = cluster level, 1 = inside company

// getScopeLevel reads them to decide what label the HUD shows
if (companyFocus > 0.15) return 'company'
if (clusterFocus > 0.15) return 'cluster'
return 'galaxy'
```

Every node calls `getNodeScope()` each frame to get its `opacity`, `emergeFactor`, and `revealFactor` (all 0–1). We lerp toward those values using animation refs. Companies go from dark dots to colored spheres as you zoom in. Departments emerge from their parent company's position and fly out to their own positions.

A subtle thing: drei's `Html` component (what we use for labels) renders to the DOM, not to the Three.js scene. So setting `group.visible = false` doesn't hide it. We explicitly set `labelRef.current.style.opacity = '0'` when a node should be invisible. This tripped us up before.

When a user onboards their company through Supabase, `twinGraph.ts` reads it from the DB and injects it into the graph alongside the static mock nodes. Live companies appear automatically.

---

### The Outcome Engine — What's In `dynamic-tasks-metrics`

This is our AI brain for metrics and simulation. Given a task (like "Run Paid Acquisition Campaign") and a founder's current state, it predicts realistic metric changes.

The prediction runs through several layers:

**Base Impact** — every task has a hardcoded baseline. "Social Media Campaign" → +50 user acquisitions. This is the starting point.

**Bayesian Adjustment** — we pull historical data from MongoDB. What did this task actually achieve for other founders? For this founder specifically? For founders at the same stage? We weight these four evidence sources differently (founder's own history gets 0.9 weight, global average gets 0.4) and compute a posterior mean. The more history we have, the tighter the prediction.

**Trajectory Adjustment** — if your userAcquisition is already accelerating, doing a marketing task has diminishing returns. If it's declining, same task matters more. We read the last N turns from session history and apply an exponential recency weighting.

**Synergy Multiplier** — if you ran Content Marketing last turn and now you're running Paid Ads, that's a coherent sequence. Up to +30% bonus. If you're context switching randomly, small penalty.

**Skill Multiplier** — founders accumulate an Elo-like skill score. New founder starts at 50 (1.0x). Experienced founder might reach 80 (1.2x). This is updated after each real outcome is recorded.

**LLM Blend** — optional OpenAI call. If we have an API key it returns metric deltas + confidence + suggested next tasks. Blended at 30% (base model) or 60% (fine-tuned). Falls back silently if no key.

**Benchmark Grounding** — we cap predictions at 2× the stage benchmark max. The benchmarks come from real S-1 filings: Dropbox, Slack, Zoom, Shopify, HubSpot. No made-up numbers.

The engine currently runs in `dynamic-tasks-metrics` on port 3001. We call it from the frontend via fetch. Eventually we might port it to a Supabase Edge Function, but for now the microservice approach is fine.

---

## What's Still Mock Data

Most pages have complete UI but pull from `src/data/mockData.ts` instead of real data. Here's the honest status:

| Page | What's Missing |
|---|---|
| Metrics | Needs `GET /api/metrics/:companyId` from our microservice |
| Analytics | Same as Metrics — same data source |
| Simulation | Needs to call `calculateOutcome()` instead of fake sliders |
| Benchmarks | Needs `GET /api/benchmarks` from microservice (data exists in `realCompanyData.ts`) |
| Team / RBAC | Table exists in Supabase, just needs read/write hooks |
| Strategy | Needs `goals` and `decisions` tables in Supabase |
| Data Ingestion | Needs `integrations` table in Supabase |

---

## How We Connect the Two Databases

The pattern is simple. When a founder is logged in, Supabase gives us their `profile.company_id`. We pass that UUID as the identifier in every MongoDB/microservice call.

```
Supabase:  companies.id = "abc-123-uuid"
                ↓ we pass this everywhere
MongoDB:   PlayerProfile.userId = "abc-123-uuid"
           GameSession.userId   = "abc-123-uuid"
```

So when we call the outcome engine:

```ts
await calculateOutcome({
  taskId: 'task_paid_ads',
  companyId: profile.company_id,   // ← Supabase UUID, used as MongoDB userId
  stage: company.stage,
  budget: company.burn_rate_usd,
})
```

MongoDB looks up the `PlayerProfile` for that UUID, reads the `GameSession` history, computes the Bayesian posterior, and returns a prediction personalized to that specific company.

No sync job, no foreign key, no migration. Just one UUID shared between both systems.

---

## What We Need to Build Next

### Step 1 — The API client (a few hours)

We need `src/lib/outcomeApi.ts` — a clean fetch wrapper for everything we call from `dynamic-tasks-metrics`:

```ts
const BASE = import.meta.env.VITE_OUTCOME_API_URL ?? 'http://localhost:3001';

export async function getMetrics(companyId: string) {
  const res = await fetch(`${BASE}/api/metrics/${companyId}`);
  return res.json();
}

export async function calculateOutcome(params: {
  taskId: string;
  companyId: string;
  stage: string;
  budget: number;
  turnNumber: number;
}) {
  const res = await fetch(`${BASE}/api/dynamic-outcome/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskId: params.taskId,
      userId: params.companyId,
      gameState: {
        stage: params.stage,
        budget: params.budget,
        turnNumber: params.turnNumber,
        activeTeam: { ceo: 1, developer: 3 },
      }
    })
  });
  return res.json();
}

export async function recordOutcome(params: {
  companyId: string;
  taskId: string;
  metricsBefore: Record<string, number>;
  metricsAfter: Record<string, number>;
  predictedImpact: Record<string, number>;
}) {
  await fetch(`${BASE}/api/dynamic-outcome/record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: params.companyId, ...params }),
  });
}
```

We also need two new routes on the microservice side:
- `GET /api/metrics/:companyId` — reads latest `GameSession` and returns metrics in our `TrackedMetric` shape
- `GET /api/benchmarks?stage=Seed&industry=SaaS` — returns `STAGE_BENCHMARKS` data from `realCompanyData.ts`

### Step 2 — Metrics + Analytics pages (quick wins)

Once the API client exists, these are one-liner swaps. In both `Metrics.tsx` and `Analytics.tsx`:

```tsx
// Before
import { trackedMetrics } from '../data/mockData';

// After
const { profile } = useAuth();
const [trackedMetrics, setTrackedMetrics] = useState(mockFallback);

useEffect(() => {
  if (!profile?.company_id) return;
  getMetrics(profile.company_id).then(({ metrics }) => {
    if (metrics.length > 0) setTrackedMetrics(metrics);
  });
}, [profile?.company_id]);
```

Everything else in those pages stays the same. They already use `trackedMetrics` correctly.

### Step 3 — Simulation page

This is where it gets interesting. Right now the "Simulate" button just does a fake 1.5 second delay. We wire it to the real engine:

```tsx
const handleSimulate = async () => {
  setSimulating(true);
  const result = await calculateOutcome({
    taskId: 'scenario_custom',
    companyId: profile.company_id,
    stage: company.stage,
    budget: company.burn_rate_usd,
    turnNumber: currentMonth,
  });

  // result.dynamicOutcome.impact           → predicted metric deltas
  // result.dynamicOutcome.credibleIntervals → [P10, P90] per metric → feeds Monte Carlo chart
  // result.dynamicOutcome.explanation       → shows in the breakdown panel
  // result.dynamicOutcome.suggestedTasks    → LLM task recommendations

  setSimulationResult(result.dynamicOutcome);
  setSimulating(false);
};
```

The Monte Carlo chart currently uses fake `path1`–`path5` data. We replace that with real credible intervals from the Bayesian engine. Much more honest.

### Step 4 — Close the learning loop

Every time a founder executes a real decision, we should call `recordOutcome()`. This writes to MongoDB's `GameSession` and updates the Bayesian priors. The next prediction for that same task type gets more accurate. After enough founders use this, predictions compound.

The ideal moment to call it: when a founder marks a Strategy decision as "executed", or when an integration syncs real metric data. We don't need to make this complex — even a manual "record this month's actuals" button on the Simulation page would start the flywheel.

### Step 5 — The remaining tables in Supabase

For Strategy, Data Ingestion, and Team pages we need a few more tables. These are straightforward:

```sql
-- Goals for Strategy page
CREATE TABLE goals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  title      TEXT NOT NULL,
  category   TEXT,
  status     TEXT DEFAULT 'active',
  target     NUMERIC,
  current    NUMERIC,
  due_date   DATE
);

-- Decisions for Strategy page
CREATE TABLE decisions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  title      TEXT NOT NULL,
  status     TEXT DEFAULT 'pending',
  created_by UUID REFERENCES auth.users(id)
);

-- Connected tools for Data Ingestion page
CREATE TABLE integrations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  tool_name      TEXT NOT NULL,
  status         TEXT DEFAULT 'pending',
  last_synced_at TIMESTAMPTZ,
  metric_count   INTEGER DEFAULT 0
);
```

Team / RBAC is even simpler — `company_members` already exists. We just need to write `useTeamMembers(companyId)` and the invite/remove functions in `src/lib/db/team.ts`.

---

## The Learning Flywheel

This is worth understanding because it's what makes our simulation actually valuable over time.

Right now, if a founder runs a simulation, we make a prediction based on global benchmark data and whatever we know about their stage. The more they use the platform — running decisions, recording what actually happened, letting integrations sync — the more we learn about them specifically. Their Bayesian priors become tighter. Their predictions become more accurate.

And because we cluster founders by behavior patterns, even a new founder benefits from what similar founders have done before. A first-time SaaS founder at Seed stage gets predictions informed by every other SaaS Seed founder in our system who ran similar tasks.

This only works if we close the loop. Predictions without recording outcomes is just a one-time guess. Every `recordOutcome()` call makes the next prediction better.

---

## File Reference

```
digital-idea-twin/src/
  lib/
    supabase.ts         Supabase client + TypeScript types for all DB tables
    auth.tsx            AuthProvider, useAuth, RBAC helpers
    outcomeApi.ts       [TO BUILD] fetch wrapper for dynamic-tasks-metrics
    db/
      companies.ts      getCompanyById, createCompany, useCompany, companyToTwinNodeData
      rbac.ts           permission matrix — 8 roles × 8 modules
      team.ts           [TO BUILD] useTeamMembers, inviteMember, changeMemberRole
      onboarding.ts     onboarding progress read/write

  components/
    Graph3D.tsx         the entire 3D twin — scope system, all node types, camera logic
    AuthGuard.tsx       redirects unauthenticated users
    TopBar.tsx          nav bar + auth state display
    Sidebar.tsx         page navigation

  pages/
    Twin.tsx            full-viewport 3D graph
    Metrics.tsx         metric grid with sparklines [mock → needs outcomeApi]
    Analytics.tsx       combined metrics + simulation [mock → needs outcomeApi]
    Simulation.tsx      scenario engine + Monte Carlo [mock → needs calculateOutcome]
    Strategy.tsx        goals, decisions [mock → needs goals/decisions tables]
    DataIngestion.tsx   integrations manager [mock → needs integrations table]
    Benchmarks.tsx      peer percentile charts [mock → needs /api/benchmarks route]
    RBAC.tsx            team members + roles [mock → needs useTeamMembers]
    Onboarding.tsx      5-step wizard [done]
    AuthPage.tsx        sign in / sign up [done]

  data/
    mockData.ts         all fallback data — metrics, scenarios, benchmarks
    twinGraph.ts        builds live TwinNode[] from Supabase companies + static mock nodes

  types/index.ts        all shared TypeScript interfaces

supabase/migrations/
  20260628210000_baseline_schema.sql         squashed schema baseline
  20260628210100_baseline_reference_seed.sql global reference/system seed data

dynamic-tasks-metrics/src/
  services/outcome/
    OutcomeEngine.ts        main orchestrator — calculateOutcome()
    BayesianPredictor.ts    Gaussian conjugate prior updating
    TrajectoryPredictor.ts  weighted regression with recency bias
    SynergyCalculator.ts    task sequence bonus detection
  services/llm/
    llmPredictor.ts         OpenAI call + response parsing + in-memory cache
    fineTuner.ts            fine-tune job management
  data/
    realCompanyData.ts      S-1 filing benchmarks — Dropbox, Slack, Zoom, Shopify, HubSpot
  models/
    gameSession.model.ts        turn-by-turn history per company
    playerProfile.model.ts      founder skill estimate + behavior clusters
    taskOutcomeHistory.model.ts Bayesian priors per task type
    demoTask.model.ts           task library
  routes/
    dynamicOutcome.routes.ts    /api/dynamic-outcome/*
    gameplay.routes.ts          /api/gameplay/*
    metrics.routes.ts           [TO BUILD] /api/metrics/:companyId
    benchmarks.routes.ts        [TO BUILD] /api/benchmarks
```

---

## Environment Variables

```bash
# digital-idea-twin/.env.local
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_OUTCOME_API_URL=http://localhost:3001

# dynamic-tasks-metrics/.env
MONGO_URI=mongodb://localhost:27017/founderos
OPENAI_API_KEY=sk-...    # optional, LLM blending won't run without it
PORT=3001
```
