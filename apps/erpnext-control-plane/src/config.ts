import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8090),
  DATABASE_URL: z.string().min(1),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  ERPNEXT_ENV: z.enum(['local', 'remote']).default('local'),
  ERPNEXT_CREDENTIALS_KEY: z.string().length(64),
  WORKER_ID: z.string().default(`erp-${process.pid}`),
  RUN_PROVISION_WORKER: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  ERPNEXT_NGINX_URL: z.string().url().default('http://localhost:8081'),
  FRAPPE_DOCKER_DIR: z.string().optional(),
  FRAPPE_DB_ROOT_PASSWORD: z.string().optional(),
  FRAPPE_SITE_ADMIN_PASSWORD: z.string().optional(),
  ERPNEXT_PROVISION_URL: z.string().url().optional(),
  ERPNEXT_PROVISION_SECRET: z.string().optional(),
  ERPNEXT_SUBDOMAIN_BASE: z.string().default('erp.os.cybranex.com'),
});

export const env = EnvSchema.parse(process.env);
