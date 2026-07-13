import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.string().default('8080'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  WORKER_ID: z.string().default(`w-${process.pid}`),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  ERPNEXT_CONTROL_PLANE_URL: z.string().url().default('http://localhost:8090'),
  ERPNEXT_CONTROL_PLANE_TOKEN: z.string().min(16),
  ERPNEXT_TARGET_ENV: z.enum(['local', 'remote']).default('local'),
  RUN_ERPNEXT_OUTBOX_WORKER: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  OIDC_BROWSER_AUTHORIZE_URL: z.string().url().default('http://localhost:5173/oauth/authorize'),
  OIDC_INTERNAL_BASE_URL: z.string().url().default('http://host.docker.internal:8080/api/oidc'),
  ERPNEXT_SUBDOMAIN_BASE: z.string().default('erp.os.cybranex.com'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_RESPONSES_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_RESPONSES_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(12000),
  OPENAI_RESPONSES_MAX_RESEARCH_TOKENS: z.coerce.number().int().positive().default(16000),
  RUN_WORKER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Encryption key for storing OAuth tokens: 64 hex chars (32 bytes)
  // Generate with: openssl rand -hex 32
  ENCRYPTION_KEY: z.string().length(64).optional(),
  // Google OAuth — required for live Google Analytics connections
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  // Meta (Facebook) OAuth — required for live Meta Ads connections
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_REDIRECT_URI: z.string().optional(),
  // Frontend URL — used for CORS and OAuth redirect back
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  // Secret shared with Unicorn Simulator backend to authenticate provision calls
  SIMULATOR_SECRET: z.string().default('change-me-in-production'),
  // SMTP — used for join-request and invite-credential emails
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Startup Digital Twin <no-reply@startup-digital-twin.com>'),
});

export const env = EnvSchema.parse(process.env);

export const provisionEnv = env.ERPNEXT_TARGET_ENV;
