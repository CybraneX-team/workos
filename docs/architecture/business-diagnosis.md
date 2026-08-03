# Founder/Admin Business Diagnosis

Last verified: 2026-08-03.

## Purpose and boundary

Business Diagnosis is a company-owned current assessment for exactly the system
roles `founder` and `admin`. It is launched from Home and rendered as a native
WorkOS page at `/business-diagnosis`. It is not onboarding completion,
BDT content, an ERPNext projection, or a provider integration.

The source-of-truth questionnaire is
`packages/shared-types/src/businessDiagnosis.ts`. It preserves the India-wide
business and sector questions from the prototype while making the contract
available to both the browser and backend. Update the questionnaire version,
frontend behavior, backend validation, and contract test together when changing
its meaning.

## Lifecycle

1. The browser prefills only the editable business name from the WorkOS company.
2. The user completes fixed profile, sector, and common questions.
3. `POST /api/business-diagnosis/follow-up-questions` validates those answers
   and returns 3–5 targeted questions. Nothing is persisted at this point.
4. `POST /api/business-diagnosis/complete` validates the entire submission,
   asks Gemini for a structured report, then inserts the sole completed row.
5. A Founder/Admin can start a replacement diagnosis from the completed report.
   The browser preloads editable prior fixed answers, requests fresh follow-ups,
   and sends `replaceCurrent` plus the current completion timestamp.
6. The replacement is generated before a timestamp-guarded `UPDATE` overwrites
   the sole row. A stale concurrent submission receives `diagnosis_changed`.
7. `GET /api/business-diagnosis` returns either `not_started` or the current
   completed result for the authenticated company.

Users may restart browser state freely before completion. A unique `company_id`
constraint guarantees one current diagnosis. A replacement never clears the old
report until the newly generated report validates and saves successfully. No
application-level history, archive, comparison, or recovery copy is retained.

## Security and model behavior

Only the backend calls Gemini through `src/lib/gemini.ts`; no provider key or
prompt is sent to the browser. The route derives the company only from the
authenticated membership and rejects all roles except `founder` and `admin`.
Answers are treated as untrusted text and validated against the shared contract.
Gemini receives a constrained JSON schema and its parsed output is validated
again before it is persisted or rendered.

The `public.business_diagnoses` table is RLS-enabled and is backend-managed; the
browser has no direct table access. It stores only the latest normalized answer
set, generated follow-up questions, report, version metadata, model name, and
completion audit data. Do not add BDT node writes, taxonomy links, ERPNext data,
Google Sheets, PDF export, history storage, or a parallel prototype runtime here.

## Excel export

The completed-report page offers Founder/Admin users an **Export to Excel** download.
`GET /api/business-diagnosis/export.xlsx` authorizes through the same exact role and
company policy as the diagnosis routes, reads only the current saved row, and returns a
non-persisted workbook. The workbook has Overview, Root Causes, Priorities,
Recommendations, Roadmap, Measures, and Questionnaire Responses sheets. It includes
the saved fixed and targeted responses for auditability, never calls Gemini, and does
not create a WorkOS file record or external connection. All untrusted answer/model text
is formula-escaped before it enters a worksheet.

## Verification and migration

Run:

```sh
pnpm --filter @cybranex/shared-types build
pnpm --filter backend test:business-diagnosis
pnpm --filter backend typecheck
pnpm --filter frontend build
```

Apply `apps/frontend/supabase/migrations/20260803090000_business_diagnoses.sql`
after checking the actual database state and taking the required shared-environment
backup. Its byte-identical backend mirror is
`apps/backend/db/migrations/041_business_diagnoses.sql`.
