const fs = require('fs');
const industriesContent = fs.readFileSync('src/db/industries.ts', 'utf-8');

// Parse industries and subdomains
const industries = [];
const industryMatches = [...industriesContent.matchAll(/id:\s*'([^']+)',\s*label:\s*'([^']+)'[\s\S]*?subdomains:\s*\[([^\]]+)\]/g)];

for (const match of industryMatches) {
  const id = match[1];
  const label = match[2];
  const subdomainsRaw = match[3];
  const subdomains = subdomainsRaw.split(',').map(s => s.replace(/['"\n\r\t]/g, '').trim()).filter(Boolean);
  industries.push({ id, label, subdomains });
}

// Parse existing companies
const allCompaniesFiles = ['companies_finance.ts', 'companies_manufacturing.ts', 'companies_healthcare.ts', 'companies_education.ts', 'companies_media.ts', 'companies_commerce.ts', 'companies_rest.ts'];

const subdomainCounts = {};

for (const file of allCompaniesFiles) {
  try {
    const content = fs.readFileSync('src/db/' + file, 'utf-8');
    const companyMatches = [...content.matchAll(/industryId:\s*'([^']+)'\s*,\s*subdomain:\s*'([^']+)'/g)];
    for (const match of companyMatches) {
      const indId = match[1];
      const sub = match[2];
      const key = `${indId}::${sub}`;
      subdomainCounts[key] = (subdomainCounts[key] || 0) + 1;
    }
  } catch(e) {}
}

const offsets = [
  '[8, 2, 2]', '[-7, 4, -5]', '[7, -3, -6]', '[4, 7, -8]',
  '[-5, -6, 5]', '[6, 5, 4]', '[-4, 6, -3]', '[3, -5, 7]',
  '[2, 8, -4]', '[-8, -2, 3]', '[0, -9, 4]', '[-5, 7, 3]'
];

let out = `import type { CompanyRecord } from './schema';\n\nexport const AUTO_COMPANIES: Partial<CompanyRecord>[] = [\n`;
let generatedCount = 0;

for (const ind of industries) {
  for (const sub of ind.subdomains) {
    const key = `${ind.id}::${sub}`;
    const count = subdomainCounts[key] || 0;
    const target = 6;
    
    if (count < target) {
      out += `  /* ── AUTO: ${ind.id} -> ${sub} ── */\n`;
      for (let i = count + 1; i <= target; i++) {
        let r = offsets[generatedCount % offsets.length];
        const cid = `${ind.id.substring(4,7)}-${sub.substring(0,3).toLowerCase().replace(/\s/g,'')}-${i}`;
        const cname = `${sub} AutoCorp ${i}`;
        out += `  {
    id: '${cid}', name: '${cname}', industryId: '${ind.id}', subdomain: '${sub}',
    country: 'Global', founded: ${2000 + (generatedCount % 20)}, stage: 'Series B', isPublic: false, valuation: '${100 + (generatedCount % 900)}M',
    mrrUSD: ${1000000 + (generatedCount % 5000000)}, employees: ${50 + (generatedCount % 500)}, investors: [],
    description: 'Automated entity for ${sub}.', status: 'healthy', offset3D: ${r}
  },\n`;
        generatedCount++;
      }
    }
  }
}

out = out.slice(0, -2) + '\n];\n';
fs.writeFileSync('src/db/companies_auto.ts', out);
console.log(`Generated ${generatedCount} companies.`);
