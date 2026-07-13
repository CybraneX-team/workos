import type { CompanyRecord } from './schema';
import { FINANCE_COMPANIES } from './companies_finance';
import { MANUFACTURING_COMPANIES } from './companies_manufacturing';
import { HEALTHCARE_COMPANIES } from './companies_healthcare';
import { EDUCATION_COMPANIES } from './companies_education';
import { MEDIA_COMPANIES } from './companies_media';
import { COMMERCE_COMPANIES } from './companies_commerce';
import { REST_COMPANIES } from './companies_rest';
import { AUTO_COMPANIES } from './companies_auto';

/* Reusable offset sets — spread companies across a small sphere */
const O = {
  a: [8,  2,  2] as [number,number,number],
  b: [-7, 4, -5] as [number,number,number],
  c: [7, -3, -6] as [number,number,number],
  d: [4,  7, -8] as [number,number,number],
  e: [-5,-6,  5] as [number,number,number],
  f: [6,  5,  4] as [number,number,number],
  g: [-4, 8, -3] as [number,number,number],
  h: [5, -7, -1] as [number,number,number],
  i: [2,  1,  2] as [number,number,number],   // reserved for comp-you (center-ish)
};

export const COMPANIES: CompanyRecord[] = [
  /* ================================================================ */
  /*  INDUSTRY: TECHNOLOGY                                            */
  /* ================================================================ */

  /* ── Subdomain: AI ── */
  {
    id: 'tech-ai-1', name: 'OpenAI', industryId: 'ind-technology', subdomain: 'AI',
    country: 'USA', founded: 2015, stage: 'Series E', isPublic: false, valuation: '157B',
    mrrUSD: 200000000, employees: 1700, investors: ['Microsoft', 'Thrive Capital'],
    description: 'Creator of GPT-4 and ChatGPT.', status: 'healthy', offset3D: O.a,
  },
  {
    id: 'tech-ai-2', name: 'Anthropic', industryId: 'ind-technology', subdomain: 'AI',
    country: 'USA', founded: 2021, stage: 'Series D+', isPublic: false, valuation: '18B',
    mrrUSD: 50000000, employees: 300, investors: ['Google', 'Amazon'],
    description: 'AI safety research company behind Claude.', status: 'healthy', offset3D: O.b,
  },
  {
    id: 'tech-ai-3', name: 'Mistral AI', industryId: 'ind-technology', subdomain: 'AI',
    country: 'France', founded: 2023, stage: 'Series A', isPublic: false, valuation: '6B',
    mrrUSD: 5000000, employees: 50, investors: ['a16z', 'Lightspeed'],
    description: 'Open-weight foundation models.', status: 'healthy', offset3D: O.c,
  },
  {
    id: 'tech-ai-4', name: 'Cohere', industryId: 'ind-technology', subdomain: 'AI',
    country: 'Canada', founded: 2019, stage: 'Series C', isPublic: false, valuation: '5.5B',
    mrrUSD: 10000000, employees: 250, investors: ['Index Ventures', 'NVIDIA'],
    description: 'Enterprise AI for search and language.', status: 'healthy', offset3D: O.d,
  },
  {
    id: 'tech-ai-5', name: 'Perplexity', industryId: 'ind-technology', subdomain: 'AI',
    country: 'USA', founded: 2022, stage: 'Series B', isPublic: false, valuation: '3B',
    mrrUSD: 8000000, employees: 100, investors: ['IVP', 'Jeff Bezos'],
    description: 'Conversational answer engine.', status: 'healthy', offset3D: O.e,
  },

  /* ── Subdomain: Cloud ── */
  {
    id: 'tech-cloud-1', name: 'Vercel', industryId: 'ind-technology', subdomain: 'Cloud',
    country: 'USA', founded: 2015, stage: 'Series D+', isPublic: false, valuation: '3.2B',
    mrrUSD: 15000000, employees: 500, investors: ['GV', 'Accel'],
    description: 'Frontend cloud platform for developers.', status: 'healthy', offset3D: O.f,
  },
  {
    id: 'tech-cloud-2', name: 'Netlify', industryId: 'ind-technology', subdomain: 'Cloud',
    country: 'USA', founded: 2014, stage: 'Series D+', isPublic: false, valuation: '2B',
    mrrUSD: 12000000, employees: 350, investors: ['Andreessen Horowitz', 'EQT'],
    description: 'Platform for modern web development.', status: 'healthy', offset3D: O.g,
  },
  {
    id: 'tech-cloud-3', name: 'DigitalOcean', industryId: 'ind-technology', subdomain: 'Cloud',
    country: 'USA', founded: 2011, stage: 'Public', isPublic: true, stockSymbol: 'DOCN', valuation: '3B',
    mrrUSD: 50000000, employees: 1200, investors: [],
    description: 'Cloud infrastructure for developers and startups.', status: 'healthy', offset3D: O.h,
  },
  {
    id: 'tech-cloud-4', name: 'Supabase', industryId: 'ind-technology', subdomain: 'Cloud',
    country: 'Global', founded: 2020, stage: 'Series B', isPublic: false, valuation: '800M',
    mrrUSD: 3000000, employees: 150, investors: ['Coatue', 'Felicis'],
    description: 'Open source Firebase alternative.', status: 'healthy', offset3D: O.a,
  },
  {
    id: 'tech-cloud-5', name: 'Cloudflare', industryId: 'ind-technology', subdomain: 'Cloud',
    country: 'USA', founded: 2009, stage: 'Public', isPublic: true, stockSymbol: 'NET', valuation: '30B',
    mrrUSD: 100000000, employees: 3000, investors: [],
    description: 'Web performance and security company.', status: 'healthy', offset3D: O.b,
  },

  /* ── Subdomain: Cybersecurity ── */
  {
    id: 'tech-cyber-1', name: 'CrowdStrike', industryId: 'ind-technology', subdomain: 'Cybersecurity',
    country: 'USA', founded: 2011, stage: 'Public', isPublic: true, stockSymbol: 'CRWD', valuation: '60B',
    mrrUSD: 250000000, employees: 7000, investors: [],
    description: 'Endpoint security and threat intelligence.', status: 'healthy', offset3D: O.c,
  },
  {
    id: 'tech-cyber-2', name: 'Wiz', industryId: 'ind-technology', subdomain: 'Cybersecurity',
    country: 'USA', founded: 2020, stage: 'Series E', isPublic: false, valuation: '10B',
    mrrUSD: 30000000, employees: 900, investors: ['Sequoia', 'Index Ventures'],
    description: 'Cloud security posture management.', status: 'healthy', offset3D: O.d,
  },
  {
    id: 'tech-cyber-3', name: 'Snyk', industryId: 'ind-technology', subdomain: 'Cybersecurity',
    country: 'UK', founded: 2015, stage: 'Series G', isPublic: false, valuation: '7.4B',
    mrrUSD: 20000000, employees: 1200, investors: ['Tiger Global', 'Addition'],
    description: 'Developer security platform.', status: 'healthy', offset3D: O.e,
  },
  {
    id: 'tech-cyber-4', name: '1Password', industryId: 'ind-technology', subdomain: 'Cybersecurity',
    country: 'Canada', founded: 2005, stage: 'Series C', isPublic: false, valuation: '6.8B',
    mrrUSD: 25000000, employees: 1000, investors: ['Iconiq', 'Accel'],
    description: 'Enterprise password manager.', status: 'healthy', offset3D: O.f,
  },
  {
    id: 'tech-cyber-5', name: 'Okta', industryId: 'ind-technology', subdomain: 'Cybersecurity',
    country: 'USA', founded: 2009, stage: 'Public', isPublic: true, stockSymbol: 'OKTA', valuation: '15B',
    mrrUSD: 180000000, employees: 5000, investors: [],
    description: 'Identity and access management.', status: 'healthy', offset3D: O.g,
  },

  /* ── Subdomain: Hardware ── */
  {
    id: 'tech-hw-1', name: 'NVIDIA', industryId: 'ind-technology', subdomain: 'Hardware',
    country: 'USA', founded: 1993, stage: 'Public', isPublic: true, stockSymbol: 'NVDA', valuation: '2200B',
    mrrUSD: 5000000000, employees: 26000, investors: [],
    description: 'Accelerated computing and AI chips.', status: 'healthy', offset3D: O.h,
  },
  {
    id: 'tech-hw-2', name: 'ARM', industryId: 'ind-technology', subdomain: 'Hardware',
    country: 'UK', founded: 1990, stage: 'Public', isPublic: true, stockSymbol: 'ARM', valuation: '120B',
    mrrUSD: 250000000, employees: 7000, investors: [],
    description: 'Semiconductor intellectual property.', status: 'healthy', offset3D: O.a,
  },
  {
    id: 'tech-hw-3', name: 'Raspberry Pi', industryId: 'ind-technology', subdomain: 'Hardware',
    country: 'UK', founded: 2008, stage: 'Bootstrapped', isPublic: false, valuation: '500M',
    mrrUSD: 8000000, employees: 200, investors: [],
    description: 'Affordable single-board computers.', status: 'healthy', offset3D: O.b,
  },
  {
    id: 'tech-hw-4', name: 'Nothing', industryId: 'ind-technology', subdomain: 'Hardware',
    country: 'UK', founded: 2020, stage: 'Series C', isPublic: false, valuation: '1B',
    mrrUSD: 10000000, employees: 500, investors: ['GV', 'EQT'],
    description: 'Consumer technology and smartphones.', status: 'healthy', offset3D: O.c,
  },
  {
    id: 'tech-hw-5', name: 'Framework', industryId: 'ind-technology', subdomain: 'Hardware',
    country: 'USA', founded: 2019, stage: 'Series A', isPublic: false, valuation: '300M',
    mrrUSD: 2000000, employees: 100, investors: ['Spark Capital'],
    description: 'Modular and repairable laptops.', status: 'healthy', offset3D: O.d,
  },

  /* ── Subdomain: Web3 ── */
  {
    id: 'tech-web3-1', name: 'Coinbase', industryId: 'ind-technology', subdomain: 'Web3',
    country: 'USA', founded: 2012, stage: 'Public', isPublic: true, stockSymbol: 'COIN', valuation: '40B',
    mrrUSD: 200000000, employees: 4500, investors: [],
    description: 'Cryptocurrency exchange platform.', status: 'healthy', offset3D: O.e,
  },
  {
    id: 'tech-web3-2', name: 'Consensys', industryId: 'ind-technology', subdomain: 'Web3',
    country: 'USA', founded: 2014, stage: 'Series D+', isPublic: false, valuation: '7B',
    mrrUSD: 15000000, employees: 900, investors: ['ParaFi', 'Temasek'],
    description: 'Ethereum software engineering.', status: 'healthy', offset3D: O.f,
  },
  {
    id: 'tech-web3-3', name: 'Polygon', industryId: 'ind-technology', subdomain: 'Web3',
    country: 'India', founded: 2017, stage: 'Series B', isPublic: false, valuation: '10B',
    mrrUSD: 10000000, employees: 500, investors: ['Sequoia', 'SoftBank'],
    description: 'Ethereum scaling platform.', status: 'healthy', offset3D: O.g,
  },
  {
    id: 'tech-web3-4', name: 'Chainlink', industryId: 'ind-technology', subdomain: 'Web3',
    country: 'Global', founded: 2017, stage: 'Bootstrapped', isPublic: false, valuation: '8B',
    mrrUSD: 5000000, employees: 300, investors: [],
    description: 'Decentralized oracle network.', status: 'healthy', offset3D: O.h,
  },
  {
    id: 'tech-web3-5', name: 'Alchemy', industryId: 'ind-technology', subdomain: 'Web3',
    country: 'USA', founded: 2017, stage: 'Series C', isPublic: false, valuation: '10B',
    mrrUSD: 8000000, employees: 200, investors: ['a16z', 'Lightspeed'],
    description: 'Web3 developer platform.', status: 'healthy', offset3D: O.a,
  },

  /* ── Subdomain: Enterprise Software ── */
  {
    id: 'tech-ent-1', name: 'Salesforce', industryId: 'ind-technology', subdomain: 'Enterprise Software',
    country: 'USA', founded: 1999, stage: 'Public', isPublic: true, stockSymbol: 'CRM', valuation: '280B',
    mrrUSD: 2500000000, employees: 79000, investors: [],
    description: 'Cloud-based CRM software.', status: 'healthy', offset3D: O.b,
  },
  {
    id: 'tech-ent-2', name: 'ServiceNow', industryId: 'ind-technology', subdomain: 'Enterprise Software',
    country: 'USA', founded: 2004, stage: 'Public', isPublic: true, stockSymbol: 'NOW', valuation: '150B',
    mrrUSD: 750000000, employees: 20000, investors: [],
    description: 'IT service management platform.', status: 'healthy', offset3D: O.c,
  },
  {
    id: 'tech-ent-3', name: 'Workday', industryId: 'ind-technology', subdomain: 'Enterprise Software',
    country: 'USA', founded: 2005, stage: 'Public', isPublic: true, stockSymbol: 'WDAY', valuation: '70B',
    mrrUSD: 500000000, employees: 17000, investors: [],
    description: 'Finance and HR enterprise cloud.', status: 'healthy', offset3D: O.d,
  },
  {
    id: 'tech-ent-4', name: 'Deel', industryId: 'ind-technology', subdomain: 'Enterprise Software',
    country: 'USA', founded: 2019, stage: 'Series D+', isPublic: false, valuation: '12B',
    mrrUSD: 35000000, employees: 3000, investors: ['a16z', 'Spark Capital'],
    description: 'Global payroll and compliance.', status: 'healthy', offset3D: O.e,
  },
  {
    id: 'tech-ent-5', name: 'Rippling', industryId: 'ind-technology', subdomain: 'Enterprise Software',
    country: 'USA', founded: 2016, stage: 'Series E', isPublic: false, valuation: '11B',
    mrrUSD: 25000000, employees: 2000, investors: ['Founders Fund', 'Kleiner Perkins'],
    description: 'Workforce management platform.', status: 'healthy', offset3D: O.f,
  },

  /* ── Subdomain: Software ── */
  {
    id: 'tech-soft-1', name: 'Atlassian', industryId: 'ind-technology', subdomain: 'Software',
    country: 'Australia', founded: 2002, stage: 'Public', isPublic: true, stockSymbol: 'TEAM', valuation: '50B',
    mrrUSD: 300000000, employees: 10000, investors: [],
    description: 'Collaboration and productivity software.', status: 'healthy', offset3D: O.g,
  },
  {
    id: 'tech-soft-2', name: 'Notion', industryId: 'ind-technology', subdomain: 'Software',
    country: 'USA', founded: 2013, stage: 'Series C', isPublic: false, valuation: '10B',
    mrrUSD: 15000000, employees: 500, investors: ['Index Ventures', 'Sequoia'],
    description: 'Connected workspace for tasks and docs.', status: 'healthy', offset3D: O.h,
  },
  {
    id: 'tech-soft-3', name: 'Figma', industryId: 'ind-technology', subdomain: 'Software',
    country: 'USA', founded: 2012, stage: 'Series E', isPublic: false, valuation: '12B',
    mrrUSD: 40000000, employees: 1300, investors: ['Index Ventures', 'Greylock'],
    description: 'Collaborative interface design tool.', status: 'healthy', offset3D: O.a,
  },
  {
    id: 'tech-soft-4', name: 'Canva', industryId: 'ind-technology', subdomain: 'Software',
    country: 'Australia', founded: 2013, stage: 'Series F', isPublic: false, valuation: '26B',
    mrrUSD: 150000000, employees: 3500, investors: ['Blackbird', 'Sequoia'],
    description: 'Online design and publishing tool.', status: 'healthy', offset3D: O.b,
  },
  {
    id: 'tech-soft-5', name: 'Linear', industryId: 'ind-technology', subdomain: 'Software',
    country: 'USA', founded: 2019, stage: 'Series B', isPublic: false, valuation: '400M',
    mrrUSD: 2000000, employees: 50, investors: ['Sequoia', 'Index Ventures'],
    description: 'Issue tracking for modern software teams.', status: 'healthy', offset3D: O.c,
  },
  ...(FINANCE_COMPANIES as CompanyRecord[]),
  ...(MANUFACTURING_COMPANIES as CompanyRecord[]),
  ...(HEALTHCARE_COMPANIES as CompanyRecord[]),
  ...(EDUCATION_COMPANIES as CompanyRecord[]),
  ...(MEDIA_COMPANIES as CompanyRecord[]),
  ...(COMMERCE_COMPANIES as CompanyRecord[]),
  ...(REST_COMPANIES as CompanyRecord[]),
  ...(AUTO_COMPANIES as CompanyRecord[]),
];

export const COMPANY_MAP = new Map<string, CompanyRecord>(
  COMPANIES.map(c => [c.id, c])
);
