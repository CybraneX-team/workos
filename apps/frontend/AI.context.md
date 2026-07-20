Project Context: FounderOS — 3D Universe Integration
What is this project?
FounderOS is a SaaS platform for startup founders. It lives at /Users/saiyam0211/Documents/Work_Codes/Startup_Digital_Twin/ (GitHub: CybraneX-team/Startup_Digital_Twin). The stack is React 19 + TypeScript + Vite + Tailwind CSS + Supabase (auth + Postgres DB).

We are integrating a 3D universe visualization at the /3d route — a Three.js-powered view where:

Industries = galaxies (15 from Supabase industries table)
Subdomains = planets orbiting each galaxy (96 total, new subdomains table)
Companies = moons orbiting subdomain planets (from Supabase companies table)
The original /twin page (React Three Fiber) is untouched. The new /3d uses vanilla Three.js mounted imperatively into React.

Reference folder
A copy of the original standalone startup-twin repo is included for reference. It was the source material — a vanilla Three.js app with hardcoded 12 industries and 96 subdomains. We ported and refactored it into the FounderOS codebase.

Architecture
src/
├── three-universe/              ← Ported 3D engine (vanilla Three.js)
│   ├── UniverseController.ts    ← Main mountable class (entry point)
│   ├── UniverseCanvas.tsx       ← React wrapper (useEffect mount/dispose)
│   ├── main.ts                  ← Barrel re-export
│   ├── engine/
│   │   ├── Engine.ts            ← Renderer, camera, scene, ResizeObserver
│   │   ├── CameraController.ts  ← Orbit controls + GSAP transitions
│   │   ├── PostProcessing.ts    ← Bloom, vignette effects
│   │   ├── TextureGenerator.ts  ← Procedural textures
│   │   └── TextTextureGenerator.ts
│   ├── particles/
│   │   ├── GalaxyParticles.ts   ← Galaxy rendering (dynamic for 15 industries)
│   │   ├── SystemParticles.ts   ← Star field background
│   │   ├── IconParticles.ts     ← Industry icon billboards
│   │   └── PolytopeRenderer.ts  ← Geometric shapes
│   ├── navigation/
│   │   ├── NavigationManager.ts ← Click/hover, zoom levels, fade transitions
│   │   └── SubdomainSolarSystem.ts ← Subdomain planet orbits
│   ├── ui/
│   │   └── Labels.ts            ← CSS2DRenderer labels
│   ├── shaders/                 ← GLSL shaders (galaxy, star, planet, atmosphere)
│   ├── assets/icons/            ← 12 industry icon PNGs
│   └── styles/universe.css      ← Label styling
│
├── pages/Universe3D.tsx          ← React page with HUD overlays
├── data/universeGraph.ts         ← Supabase → UniverseData hook
├── lib/db/subdomains.ts          ← Supabase subdomain queries
│
├── pages/Twin.tsx                ← OLD twin page (React Three Fiber) — DO NOT TOUCH
├── App.tsx                       ← Router — /3d renders Universe3D with TopBar overlay
├── components/TopBar.tsx         ← Fixed h-14 z-50 nav bar (links to /3d)
├── components/Sidebar.tsx        ← Side nav (links to /3d)
├── pages/LandingPage.tsx         ← CTAs point to /3d
├── pages/Onboarding.tsx          ← Includes subdomain picker after industry selection
├── lib/db/companies.ts           ← CreateCompanyInput includes subdomain_id
└── lib/supabase.ts               ← Supabase client
Key files modified (from git diff)
File	What changed
src/App.tsx
Added /3d route with <TopBar /> overlay + <AuthGuard><Universe3D /></AuthGuard>
src/components/TopBar.tsx
"Twin" nav tab → /3d, back button → /3d
src/components/Sidebar.tsx
"Twin" nav link → /3d
src/pages/LandingPage.tsx
4 CTAs changed from /twin to /3d
src/pages/Onboarding.tsx
Added subdomain picker UI + subdomain_id in form data
src/lib/db/companies.ts
CreateCompanyInput includes optional subdomain_id
vite.config.ts
Added vite-plugin-glsl, manual chunk for three-universe
package.json
Added gsap, postprocessing, vite-plugin-glsl
Key files created (new)
File	Purpose
src/three-universe/**
Entire ported 3D engine (~30 files)
src/three-universe/UniverseController.ts
Central class — takes container, data, callbacks
src/three-universe/UniverseCanvas.tsx
React wrapper with useEffect mount/dispose
src/pages/Universe3D.tsx
Page with loading, error, breadcrumbs, hover panel, legend
src/data/universeGraph.ts
useUniverseGraph() hook — fetches industries/subdomains/companies from Supabase
src/lib/db/subdomains.ts
getAllSubdomains(), useSubdomains()
supabase/migrations/20260628210000_baseline_schema.sql
Squashed baseline schema for the linked Supabase project
supabase/migrations/20260628210100_baseline_reference_seed.sql
Seeds system/global reference data after the baseline schema
Supabase Config
URL:  https://wcovyctzfgpqifelefum.supabase.co
ANON: see VITE_SUPABASE_ANON_KEY in apps/frontend/.env.example / Vercel project env
Database schema (relevant tables)
industries — baseline-seeded reference table
subdomains — baseline-seeded reference table
companies — live tenant table in the baseline schema
Pending / Known Issues
Supabase migration history was squashed on 2026-06-28. Use the two active files in `supabase/migrations/` for fresh environments; the prior numbered chain is archived under `supabase/migrations_archive/pre_2026-06-28/`.
Industry icon coverage — 12 PNG icons exist for 15 industries; 3 industries fall back to a default.
The /twin page must not be modified — it's the old React Three Fiber twin, kept for backward compatibility.
How the 3D mount works
UniverseCanvas.tsx (React)
  └── useEffect → new UniverseController(containerDiv, data, callbacks)
        ├── Engine.ts (renderer, camera, scene, ResizeObserver on container)
        ├── GalaxyParticles.ts (industry galaxies — dynamic count)
        ├── NavigationManager.ts (click → zoom into galaxy/subdomain/company)
        ├── Labels.ts (CSS2DRenderer attached to container)
        ├── IconParticles.ts (billboard icons per industry)
        └── SubdomainSolarSystem.ts (planet orbits when zoomed into a galaxy)
  └── cleanup → ctrl.dispose() (GPU cleanup, observer disconnect, event removal)
How to run
cd /Users/saiyam0211/Documents/Work_Codes/Startup_Digital_Twin
npm run dev          # Vite dev server at localhost:5173
npm run build        # Production build (tsc + vite)
The /3d route is auth-guarded — you'll be redirected to /auth if not logged in.

