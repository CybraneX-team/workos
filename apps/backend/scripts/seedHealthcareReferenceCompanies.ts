import 'dotenv/config';
import { pool } from '../src/db.js';

/**
 * Directly seeds reference_companies + reference_company_nodes for the
 * Healthcare industry, bypassing the CreateCompanyModal UI and the
 * Gemini-backed generate job (apps/backend/src/jobs/referenceCompanyTwin.ts).
 * No LLM calls are made — root/branch/action content below is hand-authored.
 *
 * Every level (company, root, branch, action) is get-or-create, so this is
 * safe to re-run: it fills in anything missing without duplicating rows.
 *
 * Action nodes matter: rootsToPolytopeDepartments() in
 * src/data/companyPlanetRoots.ts hardcodes every branch's `type` to 'team'
 * and only builds children from branch.actions — a branch with zero actions
 * always renders as an empty "no teammates" leaf in the 3D root drill-down
 * view, regardless of its summary text. Actions are the real content unit.
 *
 * Usage: pnpm --filter backend exec tsx scripts/seedHealthcareReferenceCompanies.ts [email]
 */

const TARGET_EMAIL = process.argv[2] || 'kushagra0304@gmail.com';

// Mirrors ROOT_ONTOLOGY in src/jobs/referenceCompanyTwin.ts so seeded
// planets look identical to AI-generated ones.
const ROOT_ONTOLOGY = [
  { label: 'Identity', color: '#60a5fa' },
  { label: 'Product & Tech', color: '#a78bfa' },
  { label: 'Market Position', color: '#34d399' },
  { label: 'Commercial Signals', color: '#fbbf24' },
  { label: 'People & Access', color: '#f472b6' },
  { label: 'Engagement History', color: '#22d3ee' },
] as const;

type RootKey = (typeof ROOT_ONTOLOGY)[number]['label'];

interface SeedAction {
  label: string;
  summary: string;
  hint: string;
  nextSteps: string[];
}

interface SeedBranch {
  root: RootKey;
  label: string;
  nodeType: 'information' | 'metric' | 'signal' | 'relationship' | 'evidence' | 'decision';
  summary: string;
  action: SeedAction;
}

interface SeedCompany {
  subdomainId: string;
  name: string;
  sourceUrl: string;
  description: string;
  branches: SeedBranch[];
}

const COMPANIES: SeedCompany[] = [
  {
    subdomainId: 'sd-health-pharma',
    name: 'Moderna',
    sourceUrl: 'https://www.moderna.com',
    description: 'Biotechnology company built around an mRNA therapeutics and vaccines platform, best known for its COVID-19 vaccine Spikevax.',
    branches: [
      {
        root: 'Identity', label: 'Company Snapshot', nodeType: 'information',
        summary: 'Publicly traded (NASDAQ: MRNA) biotech headquartered in Cambridge, Massachusetts, founded 2010.',
        action: {
          label: 'Public Filings', summary: 'MRNA 10-K/10-Q filings disclose pipeline progress and vaccine revenue trends.',
          hint: 'Check the latest 10-K for detailed financials and pipeline updates.',
          nextSteps: ['Review latest 10-K', 'Track FDA pipeline updates'],
        },
      },
      {
        root: 'Product & Tech', label: 'mRNA Platform', nodeType: 'information',
        summary: 'Proprietary mRNA platform used across vaccines, and expanding into oncology and rare-disease therapeutics.',
        action: {
          label: 'Platform Applications', summary: 'Platform spans respiratory vaccines, individualized cancer vaccines, and rare-disease programs.',
          hint: 'Compare platform reuse across vaccine vs. therapeutic pipelines.',
          nextSteps: ['Map pipeline by therapeutic area', 'Flag overlapping platform R&D spend'],
        },
      },
      {
        root: 'Market Position', label: 'Pharma Positioning', nodeType: 'signal',
        summary: 'One of the few companies with a commercially proven mRNA vaccine at global scale; competes with Pfizer/BioNTech in respiratory vaccines.',
        action: {
          label: 'Competitive Set', summary: 'Primary competitive overlap is Pfizer/BioNTech in COVID and flu/RSV combination vaccines.',
          hint: 'Watch combination-vaccine approvals as the next competitive inflection point.',
          nextSteps: ['Track combo-vaccine trial readouts', 'Compare list pricing vs. Pfizer/BioNTech'],
        },
      },
      {
        root: 'Commercial Signals', label: 'Revenue Mix', nodeType: 'metric',
        summary: 'Revenue historically concentrated in COVID-19 vaccine sales, now diversifying into flu, RSV, and pipeline therapeutics.',
        action: {
          label: 'Revenue Diversification', summary: 'Post-COVID revenue decline is being offset by new respiratory and non-respiratory launches.',
          hint: 'Track quarterly revenue mix shift away from COVID-only dependence.',
          nextSteps: ['Watch quarterly earnings segment breakdown', 'Track new product launch cadence'],
        },
      },
      {
        root: 'People & Access', label: 'Leadership', nodeType: 'relationship',
        summary: 'Co-founder and CEO Stéphane Bancel has led the company since inception.',
        action: {
          label: 'Executive Team', summary: 'Founder-led since 2011, with a leadership team drawn heavily from biotech and pharma R&D backgrounds.',
          hint: 'Founder-led continuity is a relevant signal for long-horizon platform bets.',
          nextSteps: ['Review recent leadership changes', 'Check investor-day exec commentary'],
        },
      },
      {
        root: 'Engagement History', label: 'Twin Note', nodeType: 'evidence',
        summary: 'Seeded manually as a reference twin for the Pharma subdomain; no AI research run yet.',
        action: {
          label: 'Refresh Recommended', summary: 'This twin was seeded with hand-written public-knowledge content, not an AI research pass.',
          hint: 'Run "Refresh" on this planet to replace this placeholder with a live AI-researched twin.',
          nextSteps: ['Trigger refresh from the planet panel', 'Verify sources once refreshed'],
        },
      },
    ],
  },
  {
    subdomainId: 'sd-health-hospitals',
    name: 'Apollo Hospitals',
    sourceUrl: 'https://www.apollohospitals.com',
    description: 'India\'s largest private hospital chain, operating hospitals, pharmacies, diagnostics, and digital health (Apollo 24|7) under one group.',
    branches: [
      {
        root: 'Identity', label: 'Company Snapshot', nodeType: 'information',
        summary: 'Founded 1983 by Dr. Prathap C. Reddy; publicly traded on NSE/BSE; headquartered in Chennai, India.',
        action: {
          label: 'Corporate Structure', summary: 'Publicly listed group with hospital, pharmacy, and digital health arms under one umbrella.',
          hint: 'Group structure spans listed and subsidiary entities — check which arm a deal would touch.',
          nextSteps: ['Map group corporate structure', 'Identify the relevant subsidiary for engagement'],
        },
      },
      {
        root: 'Product & Tech', label: 'Care Network', nodeType: 'information',
        summary: 'Operates a large network of hospitals, clinics, pharmacies, and the Apollo 24|7 telehealth app.',
        action: {
          label: 'Network Footprint', summary: 'Network spans tertiary hospitals, primary-care clinics, retail pharmacy, and a telehealth app.',
          hint: 'Footprint breadth affects which product categories are relevant to pitch.',
          nextSteps: ['Map network by care tier', 'Check Apollo 24|7 active user trends'],
        },
      },
      {
        root: 'Market Position', label: 'Hospital Chain Leadership', nodeType: 'signal',
        summary: 'Largest private hospital group in India by bed count, with a strong brand in tertiary and quaternary care.',
        action: {
          label: 'Category Leadership', summary: 'Bed-count and brand leadership position it as the anchor account in Indian private healthcare.',
          hint: 'Scale advantage makes this a reference-customer-grade account in the region.',
          nextSteps: ['Benchmark bed count vs. Fortis/Manipal', 'Assess regional expansion plans'],
        },
      },
      {
        root: 'Commercial Signals', label: 'Revenue Streams', nodeType: 'metric',
        summary: 'Revenue spans hospital services, retail pharmacy, and a fast-growing digital health segment.',
        action: {
          label: 'Segment Growth', summary: 'Digital health (Apollo 24|7) is the fastest-growing revenue segment relative to legacy hospital ops.',
          hint: 'Digital health segment growth signals appetite for new health-tech tooling.',
          nextSteps: ['Track digital health segment revenue growth', 'Watch pharmacy segment margin trends'],
        },
      },
      {
        root: 'People & Access', label: 'Leadership', nodeType: 'relationship',
        summary: 'Led by the Reddy family, with Suneeta Reddy as Managing Director.',
        action: {
          label: 'Family Leadership', summary: 'Founder family retains active operational leadership across the group.',
          hint: 'Family-led governance means relationship continuity matters more than typical exec turnover risk.',
          nextSteps: ['Identify current family-held exec roles', 'Track succession planning signals'],
        },
      },
      {
        root: 'Engagement History', label: 'Twin Note', nodeType: 'evidence',
        summary: 'Seeded manually as a reference twin for the Hospitals subdomain; no AI research run yet.',
        action: {
          label: 'Refresh Recommended', summary: 'This twin was seeded with hand-written public-knowledge content, not an AI research pass.',
          hint: 'Run "Refresh" on this planet to replace this placeholder with a live AI-researched twin.',
          nextSteps: ['Trigger refresh from the planet panel', 'Verify sources once refreshed'],
        },
      },
    ],
  },
  {
    subdomainId: 'sd-health-biotech',
    name: 'Ginkgo Bioworks',
    sourceUrl: 'https://www.ginkgobioworks.com',
    description: 'Synthetic biology company that engineers custom organisms for pharma, agriculture, and industrial customers, and offers biosecurity services.',
    branches: [
      {
        root: 'Identity', label: 'Company Snapshot', nodeType: 'information',
        summary: 'Publicly traded (NYSE: DNA), founded 2008, headquartered in Boston, Massachusetts.',
        action: {
          label: 'Public Filings', summary: 'DNA 10-K/10-Q filings break out Foundry vs. Biosecurity segment performance.',
          hint: 'Segment reporting is the clearest lens on which business line is actually scaling.',
          nextSteps: ['Review latest 10-K segment breakdown', 'Track cash runway commentary'],
        },
      },
      {
        root: 'Product & Tech', label: 'Foundry Platform', nodeType: 'information',
        summary: 'Automated cell-programming "foundry" used to design organisms for customers across industries.',
        action: {
          label: 'Platform Use Cases', summary: 'Foundry has been applied across pharma R&D, agricultural biologics, and industrial enzymes.',
          hint: 'Use-case breadth is the pitch, but customer concentration risk should be checked.',
          nextSteps: ['List named foundry customers by industry', 'Check program renewal rates'],
        },
      },
      {
        root: 'Market Position', label: 'Biotech Platform Play', nodeType: 'signal',
        summary: 'Positions itself as infrastructure ("AWS for biology") rather than a single-product biotech.',
        action: {
          label: 'Positioning Risk', summary: 'Platform/infrastructure positioning trades single-product upside for diversified, slower-scaling revenue.',
          hint: 'Compare against product-focused biotech peers to sanity-check the platform thesis.',
          nextSteps: ['Compare growth rate vs. product-focused biotech peers', 'Assess platform margin trajectory'],
        },
      },
      {
        root: 'Commercial Signals', label: 'Revenue Mix', nodeType: 'metric',
        summary: 'Revenue from Foundry (R&D services) and Biosecurity (pathogen monitoring) business lines.',
        action: {
          label: 'Segment Mix Shift', summary: 'Biosecurity has grown as a share of revenue as Foundry program volume has been inconsistent.',
          hint: 'Track whether Biosecurity is a durable business or a pandemic-era tailwind.',
          nextSteps: ['Track Biosecurity contract renewals', 'Watch Foundry program count trend'],
        },
      },
      {
        root: 'People & Access', label: 'Leadership', nodeType: 'relationship',
        summary: 'Co-founded and led by CEO Jason Kelly.',
        action: {
          label: 'Executive Team', summary: 'Founder-led since 2008, with a leadership bench drawn from synthetic biology academia and industry.',
          hint: 'Founder-CEO continuity is relevant given the platform\'s long R&D horizon.',
          nextSteps: ['Review recent leadership changes', 'Check investor-day exec commentary'],
        },
      },
      {
        root: 'Engagement History', label: 'Twin Note', nodeType: 'evidence',
        summary: 'Seeded manually as a reference twin for the Biotech subdomain; no AI research run yet.',
        action: {
          label: 'Refresh Recommended', summary: 'This twin was seeded with hand-written public-knowledge content, not an AI research pass.',
          hint: 'Run "Refresh" on this planet to replace this placeholder with a live AI-researched twin.',
          nextSteps: ['Trigger refresh from the planet panel', 'Verify sources once refreshed'],
        },
      },
    ],
  },
  {
    subdomainId: 'sd-health-diag',
    name: 'Labcorp',
    sourceUrl: 'https://www.labcorp.com',
    description: 'One of the largest clinical laboratory and diagnostics companies in the world, running lab testing and drug-development services.',
    branches: [
      {
        root: 'Identity', label: 'Company Snapshot', nodeType: 'information',
        summary: 'Publicly traded (NYSE: LH), headquartered in Burlington, North Carolina.',
        action: {
          label: 'Public Filings', summary: 'LH 10-K/10-Q filings split performance between Diagnostics and Biopharma Laboratory Services.',
          hint: 'Segment split is the clearest read on lab-testing volume vs. drug-development services demand.',
          nextSteps: ['Review latest 10-K segment breakdown', 'Track test-volume trend commentary'],
        },
      },
      {
        root: 'Product & Tech', label: 'Testing Network', nodeType: 'information',
        summary: 'Operates a nationwide network of patient service centers and central labs offering thousands of diagnostic tests.',
        action: {
          label: 'Network Scale', summary: 'Nationwide patient service center network is a key logistics moat vs. smaller regional labs.',
          hint: 'Network density matters more than test menu breadth for most volume-driven deals.',
          nextSteps: ['Map patient service center density by region', 'Check central lab turnaround-time benchmarks'],
        },
      },
      {
        root: 'Market Position', label: 'Diagnostics Scale Leader', nodeType: 'signal',
        summary: 'Duopoly player alongside Quest Diagnostics in the US clinical lab testing market.',
        action: {
          label: 'Competitive Set', summary: 'Effective duopoly with Quest Diagnostics dominates US clinical lab testing share.',
          hint: 'Pricing and payer-contract dynamics track closely with Quest\'s moves.',
          nextSteps: ['Compare payer contract terms vs. Quest', 'Watch regional lab M&A activity'],
        },
      },
      {
        root: 'Commercial Signals', label: 'Revenue Mix', nodeType: 'metric',
        summary: 'Revenue split across Diagnostics Laboratories and Biopharma Laboratory Services (drug development) segments.',
        action: {
          label: 'Segment Growth', summary: 'Biopharma Laboratory Services (drug-development support) has been the higher-margin growth segment.',
          hint: 'Drug-development services growth is a stronger secular signal than routine test volume.',
          nextSteps: ['Track Biopharma segment backlog trend', 'Watch routine testing volume recovery'],
        },
      },
      {
        root: 'People & Access', label: 'Leadership', nodeType: 'relationship',
        summary: 'Led by Chairman and CEO Adam Schechter.',
        action: {
          label: 'Executive Team', summary: 'CEO brought a pharma commercial background prior to leading Labcorp.',
          hint: 'Commercial-background leadership suggests active portfolio/segment reshaping.',
          nextSteps: ['Review recent leadership changes', 'Check investor-day exec commentary'],
        },
      },
      {
        root: 'Engagement History', label: 'Twin Note', nodeType: 'evidence',
        summary: 'Seeded manually as a reference twin for the Diagnostics subdomain; no AI research run yet.',
        action: {
          label: 'Refresh Recommended', summary: 'This twin was seeded with hand-written public-knowledge content, not an AI research pass.',
          hint: 'Run "Refresh" on this planet to replace this placeholder with a live AI-researched twin.',
          nextSteps: ['Trigger refresh from the planet panel', 'Verify sources once refreshed'],
        },
      },
    ],
  },
  {
    subdomainId: 'sd-health-devices',
    name: 'Medtronic',
    sourceUrl: 'https://www.medtronic.com',
    description: 'Global medical device company spanning cardiac, neuroscience, diabetes, and surgical robotics products.',
    branches: [
      {
        root: 'Identity', label: 'Company Snapshot', nodeType: 'information',
        summary: 'Publicly traded (NYSE: MDT), incorporated in Ireland with operational headquarters in Minneapolis, Minnesota.',
        action: {
          label: 'Public Filings', summary: 'MDT 10-K/10-Q filings report across Cardiovascular, Neuroscience, Medical Surgical, and Diabetes segments.',
          hint: 'Segment reporting is the clearest lens on where growth vs. legacy pressure sits.',
          nextSteps: ['Review latest 10-K segment breakdown', 'Track FDA approval pipeline'],
        },
      },
      {
        root: 'Product & Tech', label: 'Device Portfolio', nodeType: 'information',
        summary: 'Broad device portfolio including pacemakers, insulin pumps (MiniMed), and the Hugo surgical robotics system.',
        action: {
          label: 'Portfolio Breadth', summary: 'Portfolio spans legacy cardiac devices to newer surgical robotics (Hugo) and diabetes tech (MiniMed).',
          hint: 'Robotics (Hugo) is the newest growth bet vs. mature cardiac device lines.',
          nextSteps: ['Track Hugo regulatory approvals by region', 'Watch MiniMed competitive response to Dexcom/Insulet'],
        },
      },
      {
        root: 'Market Position', label: 'Med-Device Scale Leader', nodeType: 'signal',
        summary: 'One of the largest medical device makers globally, competing with J&J MedTech, Stryker, and Boston Scientific.',
        action: {
          label: 'Competitive Set', summary: 'Competes broadly across device categories against J&J MedTech, Stryker, and Boston Scientific.',
          hint: 'Category leadership varies by device line — check the specific segment before comparing.',
          nextSteps: ['Compare segment share vs. Stryker/BSX by category', 'Watch M&A activity in device space'],
        },
      },
      {
        root: 'Commercial Signals', label: 'Revenue Mix', nodeType: 'metric',
        summary: 'Revenue organized across Cardiovascular, Neuroscience, Medical Surgical, and Diabetes segments.',
        action: {
          label: 'Segment Growth', summary: 'Diabetes and robotics-adjacent surgical lines have been priority growth areas relative to legacy segments.',
          hint: 'Track which segments are getting incremental R&D investment in earnings calls.',
          nextSteps: ['Track segment-level growth guidance', 'Watch R&D spend allocation by segment'],
        },
      },
      {
        root: 'People & Access', label: 'Leadership', nodeType: 'relationship',
        summary: 'Led by Chairman and CEO Geoff Martha.',
        action: {
          label: 'Executive Team', summary: 'CEO has pushed portfolio simplification and a stronger focus on higher-growth device categories.',
          hint: 'Portfolio simplification signals which legacy lines may be divested or deprioritized.',
          nextSteps: ['Review recent leadership changes', 'Track any divestiture announcements'],
        },
      },
      {
        root: 'Engagement History', label: 'Twin Note', nodeType: 'evidence',
        summary: 'Seeded manually as a reference twin for the Medical Devices subdomain; no AI research run yet.',
        action: {
          label: 'Refresh Recommended', summary: 'This twin was seeded with hand-written public-knowledge content, not an AI research pass.',
          hint: 'Run "Refresh" on this planet to replace this placeholder with a live AI-researched twin.',
          nextSteps: ['Trigger refresh from the planet panel', 'Verify sources once refreshed'],
        },
      },
    ],
  },
  {
    subdomainId: 'sd-health-digital',
    name: 'Teladoc Health',
    sourceUrl: 'https://www.teladochealth.com',
    description: 'Virtual care company offering telehealth visits, chronic condition management (via Livongo), and mental health services.',
    branches: [
      {
        root: 'Identity', label: 'Company Snapshot', nodeType: 'information',
        summary: 'Publicly traded (NYSE: TDOC), headquartered in Purchase, New York.',
        action: {
          label: 'Public Filings', summary: 'TDOC 10-K/10-Q filings split performance between Integrated Care and (through 2025) BetterHelp segments.',
          hint: 'Segment split matters given BetterHelp\'s 2025 spin-off changed the reporting structure.',
          nextSteps: ['Review latest 10-K segment breakdown', 'Confirm current post-spin-off segment structure'],
        },
      },
      {
        root: 'Product & Tech', label: 'Virtual Care Platform', nodeType: 'information',
        summary: 'Telehealth visits plus chronic-condition remote monitoring acquired via its Livongo merger.',
        action: {
          label: 'Platform Scope', summary: 'Platform spans on-demand telehealth visits and Livongo-derived chronic condition monitoring (diabetes, hypertension).',
          hint: 'Chronic-condition monitoring is the stickier, higher-retention product line vs. one-off visits.',
          nextSteps: ['Compare visit-based vs. chronic-care segment retention', 'Track employer/health-plan contract renewals'],
        },
      },
      {
        root: 'Market Position', label: 'Telehealth Category Leader', nodeType: 'signal',
        summary: 'One of the largest pure-play telehealth providers, competing with Amwell and health-system-native virtual care.',
        action: {
          label: 'Competitive Pressure', summary: 'Faces pressure both from Amwell and from health systems building native virtual care in-house.',
          hint: 'In-house health-system virtual care is the bigger long-term competitive threat vs. Amwell directly.',
          nextSteps: ['Track health-system in-house virtual care rollouts', 'Compare pricing vs. Amwell'],
        },
      },
      {
        root: 'Commercial Signals', label: 'Revenue Mix', nodeType: 'metric',
        summary: 'Revenue from Integrated Care (employer/health-plan telehealth) and BetterHelp (direct-to-consumer mental health, until its 2025 spin-off).',
        action: {
          label: 'Post-Spinoff Mix', summary: 'Following the BetterHelp spin-off, revenue is now concentrated in the Integrated Care B2B2C business.',
          hint: 'Post-spinoff, growth depends entirely on Integrated Care — check its standalone trajectory.',
          nextSteps: ['Track Integrated Care standalone revenue trend', 'Watch member growth vs. churn'],
        },
      },
      {
        root: 'People & Access', label: 'Leadership', nodeType: 'relationship',
        summary: 'Led by CEO Chuck Divita.',
        action: {
          label: 'Executive Team', summary: 'CEO joined from a health-plan background, aligning with the employer/health-plan-centric Integrated Care focus.',
          hint: 'Health-plan background leadership suggests continued focus on payer/employer channel growth.',
          nextSteps: ['Review recent leadership changes', 'Check investor-day exec commentary'],
        },
      },
      {
        root: 'Engagement History', label: 'Twin Note', nodeType: 'evidence',
        summary: 'Seeded manually as a reference twin for the Healthtech subdomain; no AI research run yet.',
        action: {
          label: 'Refresh Recommended', summary: 'This twin was seeded with hand-written public-knowledge content, not an AI research pass.',
          hint: 'Run "Refresh" on this planet to replace this placeholder with a live AI-researched twin.',
          nextSteps: ['Trigger refresh from the planet panel', 'Verify sources once refreshed'],
        },
      },
    ],
  },
  {
    subdomainId: 'sd-health-preventive',
    name: 'Noom',
    sourceUrl: 'https://www.noom.com',
    description: 'Consumer health company offering psychology-based weight management and, more recently, GLP-1-adjacent coaching programs.',
    branches: [
      {
        root: 'Identity', label: 'Company Snapshot', nodeType: 'information',
        summary: 'Privately held, founded 2008, headquartered in New York City.',
        action: {
          label: 'Company Basics', summary: 'Privately held consumer health company; not subject to public quarterly disclosure.',
          hint: 'No public filings — rely on press coverage and hiring signals for growth indicators.',
          nextSteps: ['Monitor press coverage for growth signals', 'Check leadership LinkedIn activity for hiring trends'],
        },
      },
      {
        root: 'Product & Tech', label: 'Behavior-Change App', nodeType: 'information',
        summary: 'Mobile app combining CBT-based coaching, food logging, and human coaches for weight and lifestyle change.',
        action: {
          label: 'Product Model', summary: 'Combines algorithmic coaching content with human coach touchpoints, differentiating from pure self-tracking apps.',
          hint: 'Human-coach hybrid model is the key differentiator vs. MyFitnessPal-style pure tracking apps.',
          nextSteps: ['Compare retention vs. pure self-tracking competitors', 'Track coach-to-user ratio trends'],
        },
      },
      {
        root: 'Market Position', label: 'Preventive/Chronic Care Fit', nodeType: 'signal',
        summary: 'Positioned in preventive/lifestyle medicine, now adapting its model around GLP-1 drug adjunct coaching.',
        action: {
          label: 'GLP-1 Repositioning', summary: 'Actively repositioning as a behavioral adjunct to GLP-1 weight-loss drugs rather than a standalone diet app.',
          hint: 'GLP-1 adjunct positioning is a direct response to weight-loss drugs disrupting the diet-app category.',
          nextSteps: ['Track GLP-1 partnership or integration announcements', 'Watch category-wide impact of GLP-1 drugs on diet apps'],
        },
      },
      {
        root: 'Commercial Signals', label: 'Business Model', nodeType: 'metric',
        summary: 'Subscription-based consumer app with tiered coaching plans; expanding into employer and clinical partnerships.',
        action: {
          label: 'Channel Expansion', summary: 'Expanding beyond direct-to-consumer subscriptions into employer benefits and clinical partnership channels.',
          hint: 'B2B2C channel expansion is a hedge against direct-to-consumer subscription fatigue.',
          nextSteps: ['Track employer benefit partnership announcements', 'Watch consumer subscription pricing changes'],
        },
      },
      {
        root: 'People & Access', label: 'Leadership', nodeType: 'relationship',
        summary: 'Co-founded by Saeju Jeong and Artem Petakov.',
        action: {
          label: 'Founder Team', summary: 'Founder-led since 2008, with leadership drawn from behavioral psychology and consumer tech backgrounds.',
          hint: 'Founder continuity through a major category shift (GLP-1) is worth watching.',
          nextSteps: ['Review recent leadership changes', 'Check founder public commentary on GLP-1 strategy'],
        },
      },
      {
        root: 'Engagement History', label: 'Twin Note', nodeType: 'evidence',
        summary: 'Seeded manually as a reference twin for the Preventive Care subdomain; no AI research run yet.',
        action: {
          label: 'Refresh Recommended', summary: 'This twin was seeded with hand-written public-knowledge content, not an AI research pass.',
          hint: 'Run "Refresh" on this planet to replace this placeholder with a live AI-researched twin.',
          nextSteps: ['Trigger refresh from the planet panel', 'Verify sources once refreshed'],
        },
      },
    ],
  },
  {
    subdomainId: 'sd-health-mental',
    name: 'Headspace',
    sourceUrl: 'https://www.headspace.com',
    description: 'Mental wellness company offering meditation, mindfulness, and (after merging with Ginger) on-demand mental health coaching and therapy.',
    branches: [
      {
        root: 'Identity', label: 'Company Snapshot', nodeType: 'information',
        summary: 'Privately held, founded 2010 in the UK, now headquartered in the US after merging with Ginger to form Headspace Health.',
        action: {
          label: 'Company Basics', summary: 'Privately held; formed via the 2021 Headspace–Ginger merger combining consumer app and clinical care.',
          hint: 'No public filings — rely on press coverage and hiring signals for growth indicators.',
          nextSteps: ['Monitor press coverage for growth signals', 'Track post-merger integration news'],
        },
      },
      {
        root: 'Product & Tech', label: 'Wellness + Care Platform', nodeType: 'information',
        summary: 'Consumer meditation/mindfulness app plus on-demand coaching and clinical mental health care via the Ginger merger.',
        action: {
          label: 'Care Continuum', summary: 'Spans self-guided meditation content through on-demand coaching to clinical therapy/psychiatry access.',
          hint: 'Full-continuum model (self-serve to clinical) differentiates from meditation-only apps like Calm.',
          nextSteps: ['Compare continuum breadth vs. Calm', 'Track clinical-tier utilization vs. free-tier usage'],
        },
      },
      {
        root: 'Market Position', label: 'Mental Health Category Player', nodeType: 'signal',
        summary: 'Competes with Calm on consumer mindfulness and with BetterHelp/Talkspace on the clinical-care side.',
        action: {
          label: 'Two-Front Competition', summary: 'Uniquely positioned to compete on both the consumer wellness front (vs. Calm) and clinical front (vs. BetterHelp/Talkspace).',
          hint: 'Two-front competition is a strength if well-integrated, a distraction if not — worth checking messaging focus.',
          nextSteps: ['Compare messaging focus vs. Calm and BetterHelp', 'Track employer benefits win-rate vs. Talkspace'],
        },
      },
      {
        root: 'Commercial Signals', label: 'Business Model', nodeType: 'metric',
        summary: 'Revenue from consumer subscriptions and B2B/employer mental health benefits contracts.',
        action: {
          label: 'B2B2C Mix', summary: 'Employer/health-plan benefits contracts are a growing share alongside direct consumer subscriptions.',
          hint: 'B2B2C employer channel is typically the higher-LTV, lower-churn revenue line to watch.',
          nextSteps: ['Track employer benefit contract wins', 'Watch consumer subscription churn trend'],
        },
      },
      {
        root: 'People & Access', label: 'Leadership', nodeType: 'relationship',
        summary: 'Co-founded by Andy Puddicombe and Rich Pierson.',
        action: {
          label: 'Founder Team', summary: 'Founder-led since 2010, with leadership expanded post-merger to include Ginger\'s clinical-care executives.',
          hint: 'Post-merger leadership blend of consumer and clinical backgrounds signals the dual-market strategy.',
          nextSteps: ['Review recent leadership changes', 'Check founder public commentary post-merger'],
        },
      },
      {
        root: 'Engagement History', label: 'Twin Note', nodeType: 'evidence',
        summary: 'Seeded manually as a reference twin for the Mental Health subdomain; no AI research run yet.',
        action: {
          label: 'Refresh Recommended', summary: 'This twin was seeded with hand-written public-knowledge content, not an AI research pass.',
          hint: 'Run "Refresh" on this planet to replace this placeholder with a live AI-researched twin.',
          nextSteps: ['Trigger refresh from the planet panel', 'Verify sources once refreshed'],
        },
      },
    ],
  },
];

async function findWorkspace(email: string): Promise<{ companyId: string; userId: string; firstName: string | null }> {
  const { rows } = await pool.query(
    `
    SELECT up.company_id, up.id AS user_id, up.first_name
      FROM auth.users u
      JOIN public.user_profiles up ON up.id = u.id
     WHERE lower(u.email) = lower($1)
    `,
    [email],
  );
  const row = rows[0];
  if (!row || !row.company_id) {
    throw new Error(`No workspace found for ${email}. Checked auth.users -> user_profiles.company_id.`);
  }
  return { companyId: row.company_id, userId: row.user_id, firstName: row.first_name };
}

async function getOrCreateCompany(
  client: import('pg').PoolClient,
  workspaceCompanyId: string,
  userId: string,
  seed: SeedCompany,
): Promise<{ id: string; isNew: boolean }> {
  const existing = await client.query(
    `SELECT id FROM public.reference_companies WHERE company_id = $1 AND subdomain_id = $2 AND source_url = $3`,
    [workspaceCompanyId, seed.subdomainId, seed.sourceUrl],
  );
  if (existing.rows[0]) {
    return { id: existing.rows[0].id, isNew: false };
  }

  const { rows: subdomainRows } = await client.query(
    `SELECT industry_id FROM public.subdomains WHERE id = $1`,
    [seed.subdomainId],
  );
  const industryId = subdomainRows[0]?.industry_id;
  if (!industryId) throw new Error(`Unknown subdomain: ${seed.subdomainId}`);

  const { rows: companyRows } = await client.query(
    `
    INSERT INTO public.reference_companies
      (company_id, industry_id, subdomain_id, name, source_url, canonical_url, description,
       status, generated_at, created_by, updated_by)
    VALUES ($1, $2, $3, $4, $5, $5, $6, 'ready', NOW(), $7, $7)
    RETURNING id
    `,
    [workspaceCompanyId, industryId, seed.subdomainId, seed.name, seed.sourceUrl, seed.description, userId],
  );
  return { id: companyRows[0].id, isNew: true };
}

async function getOrCreateNode(
  client: import('pg').PoolClient,
  params: {
    referenceCompanyId: string;
    parentNodeId: string | null;
    nodeKind: 'root' | 'branch' | 'action';
    label: string;
    summary: string | null;
    nodeType: string | null;
    color: string | null;
    sortOrder: number;
    metadata: Record<string, unknown>;
    userId: string;
  },
): Promise<{ id: string; isNew: boolean }> {
  const existing = await client.query(
    `
    SELECT id FROM public.reference_company_nodes
     WHERE reference_company_id = $1
       AND node_kind = $2
       AND label = $3
       AND parent_node_id IS NOT DISTINCT FROM $4
    `,
    [params.referenceCompanyId, params.nodeKind, params.label, params.parentNodeId],
  );
  if (existing.rows[0]) {
    return { id: existing.rows[0].id, isNew: false };
  }

  const { rows } = await client.query(
    `
    INSERT INTO public.reference_company_nodes
      (reference_company_id, parent_node_id, node_kind, label, summary, node_type,
       relevance, confidence, color, sort_order, is_dynamic, source, created_by, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, 75, 0.7, $7, $8, false, 'manual', $9, $10)
    RETURNING id
    `,
    [
      params.referenceCompanyId, params.parentNodeId, params.nodeKind, params.label,
      params.summary, params.nodeType, params.color, params.sortOrder, params.userId,
      JSON.stringify(params.metadata),
    ],
  );
  return { id: rows[0].id, isNew: true };
}

async function seedCompany(client: import('pg').PoolClient, workspaceCompanyId: string, userId: string, seed: SeedCompany) {
  const { id: referenceCompanyId, isNew: companyIsNew } = await getOrCreateCompany(client, workspaceCompanyId, userId, seed);

  let rootsAdded = 0;
  let branchesAdded = 0;
  let actionsAdded = 0;

  for (let i = 0; i < ROOT_ONTOLOGY.length; i++) {
    const root = ROOT_ONTOLOGY[i];
    const { id: rootId, isNew: rootIsNew } = await getOrCreateNode(client, {
      referenceCompanyId, parentNodeId: null, nodeKind: 'root',
      label: root.label, summary: null, nodeType: null, color: root.color,
      sortOrder: i, metadata: {}, userId,
    });
    if (rootIsNew) rootsAdded++;

    const branch = seed.branches.find((b) => b.root === root.label);
    if (!branch) continue;

    const { id: branchId, isNew: branchIsNew } = await getOrCreateNode(client, {
      referenceCompanyId, parentNodeId: rootId, nodeKind: 'branch',
      label: branch.label, summary: branch.summary, nodeType: branch.nodeType, color: root.color,
      sortOrder: 0, metadata: {}, userId,
    });
    if (branchIsNew) branchesAdded++;

    const { isNew: actionIsNew } = await getOrCreateNode(client, {
      referenceCompanyId, parentNodeId: branchId, nodeKind: 'action',
      label: branch.action.label, summary: branch.action.summary, nodeType: null, color: root.color,
      sortOrder: 0,
      metadata: { hint: branch.action.hint, nextSteps: branch.action.nextSteps },
      userId,
    });
    if (actionIsNew) actionsAdded++;
  }

  console.log(
    `  ${companyIsNew ? 'seeded' : 'checked'}: ${seed.name} -> ${seed.subdomainId}` +
    ` (+${rootsAdded} roots, +${branchesAdded} branches, +${actionsAdded} actions)`,
  );
}

async function main() {
  const { companyId, userId, firstName } = await findWorkspace(TARGET_EMAIL);
  console.log(`Seeding into workspace company_id=${companyId} (${firstName ?? 'unknown'}'s workspace, ${TARGET_EMAIL})`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const seed of COMPANIES) {
      await seedCompany(client, companyId, userId, seed);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
