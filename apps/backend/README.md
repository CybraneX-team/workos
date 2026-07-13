# FounderOS Backend (Phase 1)

Express service for Excel ingestion and canonical metric APIs.

## Endpoints

- `GET /healthz`
- `POST /api/ingestion/excel/upload`
- `GET /api/ingestion/jobs/:jobId`
- `GET /api/metrics/:companyId`
- `GET /api/metrics/:companyId/:metricId`
- `POST /api/metrics/:companyId/draft`
- `POST /api/metrics/:companyId`
- `PATCH /api/metrics/:companyId/:metricId`
- `POST /api/metrics/:companyId/:metricId/values`
- `POST /api/metrics/:companyId/:metricId/links`
- `DELETE /api/metrics/:companyId/:metricId/links/:linkId`
- `POST /api/metrics/:companyId/impacts`
- `POST /api/metrics/:companyId/recompute`
- `GET /api/metrics/:companyId/rollups`

## Local setup

1. Copy `.env.example` to `.env` and fill values.
2. Apply the active squashed migrations in `../Startup_Digital_Twin/supabase/migrations/` to your Supabase project before starting the backend.
3. Install dependencies:

```bash
npm install
```

4. Start dev server:

```bash
npm run dev
```

The worker loop starts in-process by default (`RUN_WORKER=true`).

## Build artifacts

`dist/` is a generated build artifact and is intentionally not tracked in git.
Run `npm run build` or `pnpm build` locally when you need the production bundle.

## Optional Gemini fallback

Set `GEMINI_API_KEY` to enable LLM classification for labels that dictionary,
fuzzy matching, and source profiles cannot confidently resolve.

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

If `GEMINI_API_KEY` is omitted, ingestion still works with deterministic
classification and review queue fallback.
