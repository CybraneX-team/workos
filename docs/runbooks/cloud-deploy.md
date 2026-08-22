# Cloud deployment

Last verified: 2026-08-08.

WorkOS deploys two application tiers: apps/frontend and apps/backend. Postgres/Supabase remains the database and identity provider. The backend process also runs the existing bounded worker when RUN_WORKER=true. There is no business-system control plane or separate CRM/catalogue runtime.

## Required deployment checks

1. Build shared packages, backend, and frontend.
2. Apply numbered backend migrations in order; inspect destructive migrations before execution.
3. Configure backend identity/database, encryption, Gemini, mail, and explicitly enabled provider variables.
4. Deploy backend and verify its health endpoint and worker logs.
5. Deploy frontend with its backend and Supabase public configuration.
6. Smoke-test company creation, native CRM/catalogue reads, and one authenticated workspace.

## Rollback

Roll application tiers to previously recorded immutable image/deployment versions. Database rollback is forward-only: ship a corrective migration rather than editing or reversing historical migration files. Never copy secrets into this public runbook.
