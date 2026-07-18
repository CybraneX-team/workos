import { pool } from '../src/db.js';
import {
  processOneMetaAdsCampaignJob,
  processOneMetaAdsCreativeJob,
} from '../src/domains/meta-ads/authoring.js';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));

const companyId = args.get('company-id') ?? '';
const kind = args.get('kind') ?? '';
const execute = args.get('execute') === 'true';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (process.env.NODE_ENV === 'production') throw new Error('fixture_processing_disabled_in_production');
if (!uuid.test(companyId)) throw new Error('Pass --company-id=<uuid>.');
if (!['creative', 'campaign'].includes(kind)) throw new Error('Pass --kind=creative|campaign.');
if (process.env.META_AUTHORING_MODE !== 'sandbox_only'
  || process.env.META_AUTHORING_FAKE_META !== 'true'
  || process.env.META_AUTHORING_FAKE_GEMINI !== 'true') {
  throw new Error('fixture_processing_requires_fake_sandbox_authoring');
}

console.log(JSON.stringify({
  dryRun: !execute,
  companyId,
  kind,
  boundary: 'company-scoped fake authoring job only',
}, null, 2));

try {
  if (!execute) {
    console.log('Dry run only. Re-run with --execute after verifying the company and job kind.');
  } else {
    const processed = kind === 'creative'
      ? await processOneMetaAdsCreativeJob(companyId)
      : await processOneMetaAdsCampaignJob(companyId);
    if (!processed) throw new Error(`no_pending_${kind}_job_for_company`);
    console.log(JSON.stringify({ processed: true, companyId, kind }));
  }
} finally {
  await pool.end();
}
