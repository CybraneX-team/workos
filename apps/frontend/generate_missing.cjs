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
const allCompaniesFiles = ['companies_finance.ts', 'companies_manufacturing.ts', 'companies_healthcare.ts', 'companies_education.ts', 'companies_media.ts', 'companies_commerce.ts', 'companies_rest.ts', 'companies.ts'];

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
  '[2, 8, -4]', '[-8, -2, 3]', '[0, -9, 4]', '[-5, 7, 3]',
  '[6, -4, 5]', '[-3, -8, 2]', '[9, 0, -3]', '[-2, 6, 8]'
];

let out = `import type { CompanyRecord } from './schema';\n\nexport const AUTO_COMPANIES: Partial<CompanyRecord>[] = [\n`;
let generatedCount = 0;

for (const ind of industries) {
  for (const sub of ind.subdomains) {
    const key = `${ind.id}::${sub}`;
    const count = subdomainCounts[key] || 0;
    const target = 7; // User wants "Around 6-7 companies should be there in each and every subdomain"
    
    if (count < target) {
      out += `  /* ── AUTO: ${ind.id} -> ${sub} ── */\n`;
      for (let i = count + 1; i <= target; i++) {
        let r = offsets[generatedCount % offsets.length];
        // Hash for deterministic but pseudo-random stats
        const hashStr = ind.id + sub + i;
        let hash = 0;
        for (let j = 0; j < hashStr.length; j++) hash = (hash << 5) - hash + hashStr.charCodeAt(j);
        hash = Math.abs(hash);

        const cid = `${ind.id.substring(4,8)}-${sub.substring(0,3).toLowerCase().replace(/\\s/g,'')}-${i}`;
        
        // Generate a somewhat realistic name instead of AutoCorp
        const prefixes = ['Global', 'Nova', 'Apex', 'Pinnacle', 'Quantum', 'Nexus', 'Vertex', 'Zephyr', 'Aero', 'Lumina', 'Omni', 'Synapse'];
        const suffixes = ['Systems', 'Technologies', 'Solutions', 'Corp', 'Group', 'Dynamics', 'Networks', 'Industries', 'Enterprises'];
        const cname = `${prefixes[hash % prefixes.length]} ${sub.split(' ')[0]} ${suffixes[(hash >> 2) % suffixes.length]}`;
        
        const mrr = 500000 + (hash % 15000000);
        const emp = 50 + (hash % 2000);

        out += `  {
    id: '${cid}', name: '${cname}', industryId: '${ind.id}', subdomain: '${sub}',
    country: 'Global', founded: ${2005 + (hash % 18)}, stage: 'Series C', isPublic: false, valuation: '${100 + (hash % 900)}M',
    mrrUSD: ${mrr}, employees: ${emp}, investors: [],
    description: 'Specialized enterprise focused on ${sub}.', status: 'healthy', offset3D: ${r}
  },\n`;
        generatedCount++;
      }
    }
  }
}

out = out.slice(0, -2) + '\n];\n';
fs.writeFileSync('src/db/companies_auto.ts', out);
console.log(`Generated ${generatedCount} companies to reach 7 per subdomain.`);
