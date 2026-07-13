/**
 * generate_migrations.ts
 * Run with: npx tsx scripts/generate_migrations.ts
 *
 * Reads all TypeScript DB source files and generates three SQL migration files:
 *   010_seed_industries_full.sql
 *   011_seed_subdomains_full.sql
 *   012_seed_catalog_companies.sql
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

// ─── Import source data ───────────────────────────────────────────────────────
import { INDUSTRIES } from '../src/db/industries';
import { COMPANIES } from '../src/db/companies';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(s: string | undefined | null): string {
  if (!s) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}
function escArr(arr: string[] | undefined): string {
  if (!arr || arr.length === 0) return "'{}'";
  const inner = arr.map(s => `"${s.replace(/"/g, '\\"')}"`).join(',');
  return `'{${inner}}'`;
}
function num(n: number | undefined | null): string {
  if (n == null) return 'NULL';
  return String(n);
}
function bool(b: boolean | undefined): string {
  return b ? 'TRUE' : 'FALSE';
}

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

// ─────────────────────────────────────────────────────────────────────────────
// 010 — INDUSTRIES
// ─────────────────────────────────────────────────────────────────────────────
function gen010(): string {
  const lines: string[] = [
    `-- ================================================================`,
    `-- 010_seed_industries_full.sql`,
    `-- Full upsert of all 12 Work OS Universe industries.`,
    `-- Idempotent: safe to re-run (ON CONFLICT DO UPDATE).`,
    `-- ================================================================`,
    ``,
    `INSERT INTO industries (id, label, description, color, position_3d, bubble_radius, tags)`,
    `VALUES`,
  ];

  const rows = INDUSTRIES.map(ind => {
    const pos = `'{"x":${ind.position3D[0]},"y":${ind.position3D[1]},"z":${ind.position3D[2]}}'`;
    return `  (${esc(ind.id)}, ${esc(ind.label)}, ${esc(ind.description)}, ${esc(ind.color)}, ${pos}::jsonb, ${ind.bubbleRadius}, ${escArr(ind.tags)})`;
  });

  lines.push(rows.join(',\n'));
  lines.push(`ON CONFLICT (id) DO UPDATE SET`);
  lines.push(`  label         = EXCLUDED.label,`);
  lines.push(`  description   = EXCLUDED.description,`);
  lines.push(`  color         = EXCLUDED.color,`);
  lines.push(`  position_3d   = EXCLUDED.position_3d,`);
  lines.push(`  bubble_radius = EXCLUDED.bubble_radius,`);
  lines.push(`  tags          = EXCLUDED.tags;`);
  lines.push(``);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 011 — SUBDOMAINS
// Build subdomain IDs from the industry subdomain arrays + match to existing
// 009 migration IDs using a lookup map.
// ─────────────────────────────────────────────────────────────────────────────

// Map from (industryId, subdomainName) → canonical SD id from migration 009
const SD_ID_MAP: Record<string, string> = {
  // Technology
  'ind-technology|AI':                  'sd-tech-ai',
  'ind-technology|Cloud':               'sd-tech-cloud',
  'ind-technology|Cybersecurity':       'sd-tech-cyber',
  'ind-technology|Hardware':            'sd-tech-hardware',
  'ind-technology|Web3':                'sd-tech-web3',
  'ind-technology|Enterprise Software': 'sd-tech-enterprise',
  'ind-technology|Software':            'sd-tech-software',
  // Finance
  'ind-finance|Fintech':          'sd-fin-fintech',
  'ind-finance|Banking':          'sd-fin-banking',
  'ind-finance|Insurance':        'sd-fin-insurance',
  'ind-finance|Trading':          'sd-fin-trading',
  'ind-finance|Investing':        'sd-fin-investing',
  'ind-finance|Asset Management': 'sd-fin-asset',
  'ind-finance|Lending':          'sd-fin-lending',
  // Manufacturing
  'ind-manufacturing|Automotive':           'sd-mfg-automotive',
  'ind-manufacturing|Electronics':          'sd-mfg-electronics',
  'ind-manufacturing|Industrial Machinery': 'sd-mfg-industrial',
  'ind-manufacturing|Consumer Goods':       'sd-mfg-consumer',
  'ind-manufacturing|Textiles':             'sd-mfg-textiles',
  'ind-manufacturing|Supply Chain Systems': 'sd-mfg-supply',
  'ind-manufacturing|Heavy Industry':       'sd-mfg-heavy',
  // Healthcare
  'ind-healthcare|Pharma':         'sd-health-pharma',
  'ind-healthcare|Hospitals':      'sd-health-hospitals',
  'ind-healthcare|Biotech':        'sd-health-biotech',
  'ind-healthcare|Diagnostics':    'sd-health-diag',
  'ind-healthcare|Medical Devices':'sd-health-devices',
  'ind-healthcare|Healthtech':     'sd-health-digital',
  'ind-healthcare|Preventive Care':'sd-health-preventive',
  'ind-healthcare|Mental Health':  'sd-health-mental',
  // Education
  'ind-education|Schools':              'sd-edu-schools',
  'ind-education|Universities':         'sd-edu-universities',
  'ind-education|Edtech':               'sd-edu-edtech',
  'ind-education|Test Prep':            'sd-edu-testprep',
  'ind-education|Knowledge Publishing': 'sd-edu-publishing',
  'ind-education|Research Institutions':'sd-edu-research',
  'ind-education|Corporate Training':   'sd-edu-corporate',
  'ind-education|Skill Platforms':      'sd-edu-skills',
  // Media & Entertainment
  'ind-media|Film':           'sd-med-film',
  'ind-media|Television':     'sd-med-tv',
  'ind-media|Streaming':      'sd-med-streaming',
  'ind-media|Music':          'sd-med-music',
  'ind-media|Gaming':         'sd-med-gaming',
  'ind-media|Sports Media':   'sd-med-sports-med',
  'ind-media|Sports Economy': 'sd-med-sports-econ',
  'ind-media|Creator Economy':'sd-med-creator',
  // Commerce
  'ind-commerce|Retail':            'sd-com-retail',
  'ind-commerce|E-commerce':        'sd-com-ecommerce',
  'ind-commerce|D2C Brands':        'sd-com-d2c',
  'ind-commerce|Marketplaces':      'sd-com-marketplaces',
  'ind-commerce|Wholesale':         'sd-com-wholesale',
  'ind-commerce|Consumer Platforms':'sd-com-consumer',
  'ind-commerce|CX Systems':        'sd-com-cx',
  // Commerce aliases
  'ind-commerce|Logistics':         'sd-com-cx',
  'ind-commerce|Payments':          'sd-com-cx',
  'ind-commerce|Supply Chain Tech': 'sd-com-cx',
  // Media aliases
  'ind-media|Film & TV':            'sd-med-film',
  'ind-media|Publishing':           'sd-med-creator',
  // Energy & Sustainability
  'ind-energy|Solar':             'sd-en-solar',
  'ind-energy|Wind':              'sd-en-wind',
  'ind-energy|Storage':           'sd-en-storage',
  'ind-energy|EV Infrastructure': 'sd-en-ev',
  'ind-energy|Carbon Management': 'sd-en-carbon',
  'ind-energy|Waste Systems':     'sd-en-waste-sys',
  'ind-energy|Waste Management':  'sd-en-waste',
  'ind-energy|Climate Tech':      'sd-en-climate',
  // Government & Public
  'ind-government|Governance':          'sd-gov-governance',
  'ind-government|Defense':             'sd-gov-defense',
  'ind-government|Public Policy':       'sd-gov-policy',
  'ind-government|Civic Tech':          'sd-gov-civic',
  'ind-government|Social Welfare':      'sd-gov-welfare',
  'ind-government|Public Health Systems':'sd-gov-pubhealth',
  'ind-government|Social Systems':      'sd-gov-social',
  'ind-government|Sust Tech':           'sd-gov-sust',
  // Mobility & Transportation
  'ind-mobility|Aviation':            'sd-mob-aviation',
  'ind-mobility|Rail':                'sd-mob-rail',
  'ind-mobility|Logistics':           'sd-mob-logistics',
  'ind-mobility|Shipping':            'sd-mob-shipping',
  'ind-mobility|Travel Infrastructure':'sd-mob-travel',
  'ind-mobility|Delivery Systems':    'sd-mob-delivery',
  'ind-mobility|Automotive Mobility': 'sd-mob-auto',
  // Real Estate & Infrastructure
  'ind-realestate|Residential':        'sd-re-residential',
  'ind-realestate|Commercial':         'sd-re-commercial',
  'ind-realestate|Construction':       'sd-re-construction',
  'ind-realestate|Facility Management':'sd-re-facility',
  'ind-realestate|Smart Management':   'sd-re-smart',
  'ind-realestate|Proptech':           'sd-re-proptech',
  'ind-realestate|Smart Buildings':    'sd-re-smart',
  'ind-realestate|Infrastructure':     'sd-re-infra',
  // Agriculture & Food
  'ind-agriculture|Farming':           'sd-agri-farming',
  'ind-agriculture|Agri-tech':         'sd-agri-agritech',
  'ind-agriculture|Food Processing':   'sd-agri-food',
  'ind-agriculture|Fisheries':         'sd-agri-fisheries',
  'ind-agriculture|Supply Delivery':   'sd-agri-supply-del',
  'ind-agriculture|Market Discovery':  'sd-agri-market',
  'ind-agriculture|Supply Chain':      'sd-agri-supply',
  'ind-agriculture|Nutrition & Delivery':'sd-agri-nutrition',
};

// Industry color map (subset; use industry color as fallback)
const IND_COLOR: Record<string, string> = {};
for (const ind of INDUSTRIES) IND_COLOR[ind.id] = ind.color;

function getSdId(industryId: string, name: string, idx: number): string | null {
  const key = `${industryId}|${name}`;
  if (SD_ID_MAP[key]) return SD_ID_MAP[key];
  // Return null for unrecognized subdomains — avoids FK violation
  return null;
}

function gen011(): string {
  const lines: string[] = [
    `-- ================================================================`,
    `-- 011_seed_subdomains_full.sql`,
    `-- Full upsert of all subdomains across 12 industries.`,
    `-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING).`,
    `-- ================================================================`,
    ``,
    `INSERT INTO subdomains (id, industry_id, label, description, orbit_index, color)`,
    `VALUES`,
  ];

  const rows: string[] = [];
  for (const ind of INDUSTRIES) {
    for (let i = 0; i < (ind.subdomains ?? []).length; i++) {
      const name = ind.subdomains[i];
      const id = getSdId(ind.id, name, i);
      if (!id) continue; // skip unmapped
      rows.push(`  (${esc(id)}, ${esc(ind.id)}, ${esc(name)}, NULL, ${i}, ${esc(IND_COLOR[ind.id])})`);
    }
  }
  lines.push(rows.join(',\n'));
  lines.push(`ON CONFLICT (id) DO NOTHING;`);
  lines.push(``);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 012 — CATALOG COMPANIES
// Uses a separate catalog_companies table so as NOT to conflict with
// user-onboarded companies (which live in the `companies` table).
// ─────────────────────────────────────────────────────────────────────────────
function gen012(): string {
  const lines: string[] = [
    `-- ================================================================`,
    `-- 012_seed_catalog_companies.sql`,
    `-- Creates the catalog_companies table for pre-seeded universe data`,
    `-- and populates it with all hardcoded companies from the TypeScript DB.`,
    `-- These are read-only reference companies used by the 3D universe viewer.`,
    `-- ================================================================`,
    ``,
    `-- ── 1. Create catalog_companies table ───────────────────────────`,
    `CREATE TABLE IF NOT EXISTS catalog_companies (`,
    `  id              TEXT PRIMARY KEY,`,
    `  name            TEXT NOT NULL,`,
    `  industry_id     TEXT NOT NULL REFERENCES industries(id) ON DELETE CASCADE,`,
    `  subdomain_id    TEXT REFERENCES subdomains(id) ON DELETE SET NULL,`,
    `  subdomain_name  TEXT,`,
    `  country         TEXT,`,
    `  founded_year    INTEGER,`,
    `  stage           TEXT,`,
    `  is_public       BOOLEAN NOT NULL DEFAULT FALSE,`,
    `  stock_symbol    TEXT,`,
    `  valuation       TEXT,`,
    `  mrr_usd         NUMERIC,`,
    `  employees       INTEGER,`,
    `  investors       TEXT[] DEFAULT '{}',`,
    `  description     TEXT,`,
    `  status          TEXT NOT NULL DEFAULT 'healthy',`,
    `  offset_3d       JSONB,`,
    `  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `);`,
    ``,
    `-- ── Indexes ──────────────────────────────────────────────────────`,
    `CREATE INDEX IF NOT EXISTS idx_catalog_companies_industry   ON catalog_companies(industry_id);`,
    `CREATE INDEX IF NOT EXISTS idx_catalog_companies_subdomain  ON catalog_companies(subdomain_id);`,
    `CREATE INDEX IF NOT EXISTS idx_catalog_companies_subdomain_name ON catalog_companies(subdomain_name);`,
    ``,
    `-- ── RLS: public read (same as industries & subdomains) ──────────`,
    `ALTER TABLE catalog_companies ENABLE ROW LEVEL SECURITY;`,
    ``,
    `DROP POLICY IF EXISTS "catalog_companies_public_read" ON catalog_companies;`,
    `CREATE POLICY "catalog_companies_public_read"`,
    `  ON catalog_companies FOR SELECT`,
    `  USING (auth.role() = 'authenticated');`,
    ``,
    `-- ── 2. Upsert all catalog companies ─────────────────────────────`,
    `INSERT INTO catalog_companies`,
    `  (id, name, industry_id, subdomain_id, subdomain_name, country, founded_year, stage,`,
    `   is_public, stock_symbol, valuation, mrr_usd, employees, investors, description, status, offset_3d)`,
    `VALUES`,
  ];

  // Deduplicate by ID — keep first occurrence (auto-generated files may repeat IDs)
  const seenIds = new Set<string>();
  const uniqueCompanies = COMPANIES.filter(c => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });
  console.log(`  Deduped: ${COMPANIES.length} → ${uniqueCompanies.length} companies`);

  const rows: string[] = [];
  for (const c of uniqueCompanies) {
    const sdId = c.subdomain ? getSdId(c.industryId, c.subdomain, 0) : null;
    const sdIdSql = sdId ? esc(sdId) : 'NULL'; // NULL if subdomain not in map — avoids FK violation
    const sdNameSql = c.subdomain ? esc(c.subdomain) : 'NULL';
    const offset = c.offset3D
      ? `'{"x":${c.offset3D[0]},"y":${c.offset3D[1]},"z":${c.offset3D[2]}}'::jsonb`
      : 'NULL';

    // Stage compatibility: map to DB-friendly text
    const stageSql = esc(c.stage);

    rows.push(
      `  (${esc(c.id)}, ${esc(c.name)}, ${esc(c.industryId)}, ${sdIdSql}, ${sdNameSql}, ` +
      `${esc(c.country)}, ${num(c.founded)}, ${stageSql}, ` +
      `${bool(c.isPublic)}, ${c.stockSymbol ? esc(c.stockSymbol) : 'NULL'}, ${esc(c.valuation)}, ` +
      `${num(c.mrrUSD)}, ${num(c.employees)}, ${escArr(c.investors)}, ` +
      `${esc(c.description)}, ${esc(c.status)}, ${offset})`
    );
  }

  lines.push(rows.join(',\n'));
  lines.push(`ON CONFLICT (id) DO UPDATE SET`);
  lines.push(`  name           = EXCLUDED.name,`);
  lines.push(`  industry_id    = EXCLUDED.industry_id,`);
  lines.push(`  subdomain_id   = EXCLUDED.subdomain_id,`);
  lines.push(`  subdomain_name = EXCLUDED.subdomain_name,`);
  lines.push(`  country        = EXCLUDED.country,`);
  lines.push(`  founded_year   = EXCLUDED.founded_year,`);
  lines.push(`  stage          = EXCLUDED.stage,`);
  lines.push(`  is_public      = EXCLUDED.is_public,`);
  lines.push(`  stock_symbol   = EXCLUDED.stock_symbol,`);
  lines.push(`  valuation      = EXCLUDED.valuation,`);
  lines.push(`  mrr_usd        = EXCLUDED.mrr_usd,`);
  lines.push(`  employees      = EXCLUDED.employees,`);
  lines.push(`  investors      = EXCLUDED.investors,`);
  lines.push(`  description    = EXCLUDED.description,`);
  lines.push(`  status         = EXCLUDED.status,`);
  lines.push(`  offset_3d      = EXCLUDED.offset_3d;`);
  lines.push(``);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Write files
// ─────────────────────────────────────────────────────────────────────────────
const files: [string, string][] = [
  ['010_seed_industries_full.sql', gen010()],
  ['011_seed_subdomains_full.sql', gen011()],
  ['012_seed_catalog_companies.sql', gen012()],
];

for (const [filename, content] of files) {
  const dest = join(MIGRATIONS_DIR, filename);
  writeFileSync(dest, content, 'utf8');
  const kb = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(1);
  console.log(`✅  Written ${filename} (${kb} KB)`);
}

console.log('\n🚀  All 3 migration files generated.');
console.log('   Run them against Supabase via:');
console.log('   supabase db push   OR   paste into SQL Editor\n');
