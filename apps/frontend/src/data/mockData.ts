import type { Department, Metric, BenchmarkData, EnvironmentSignal, SimulationScenario, Task, DecisionNode, CohortComparison, Integration, Decision, Goal, StageGoalRecommendation, TrackedMetric } from '../types';

export const departments: Department[] = [
  { name: 'Product', size: 4, hod: 'Founder', kpis: ['Feature Velocity', 'Bug Rate', 'NPS'], aiAugmented: false },
  { name: 'Growth', size: 3, hod: 'Growth Lead', kpis: ['CAC', 'LTV', 'Activation Rate'], aiAugmented: true },
  { name: 'Engineering', size: 6, hod: 'CTO', kpis: ['Sprint Velocity', 'Uptime', 'Tech Debt'], aiAugmented: false },
  { name: 'Support', size: 2, hod: 'Support Lead', kpis: ['Response Time', 'CSAT', 'Ticket Volume'], aiAugmented: true },
];

export const keyMetrics: Metric[] = [
  { name: 'MRR', value: 8500, unit: '$', change: 12.5, percentile: 62 },
  { name: 'CAC', value: 95, unit: '$', change: -8.3, percentile: 71 },
  { name: 'LTV', value: 1200, unit: '$', change: 5.2, percentile: 55 },
  { name: 'Churn Rate', value: 4.2, unit: '%', change: -1.1, percentile: 48 },
  { name: 'Burn Rate', value: 45000, unit: '$/mo', change: 3.0, percentile: 58 },
  { name: 'NPS', value: 42, unit: '', change: 7.0, percentile: 65 },
  { name: 'Runway', value: 14, unit: 'months', change: -0.5, percentile: 52 },
  { name: 'Team Size', value: 12, unit: 'people', change: 2, percentile: 45 },
];

export const benchmarks: BenchmarkData[] = [
  {
    metric: 'CAC',
    industry: 'SaaS',
    stage: 'Seed',
    geography: 'India',
    percentiles: { P10: 40, P25: 65, P50: 95, P75: 130, P90: 180 },
    currentValue: 95,
  },
  {
    metric: 'LTV',
    industry: 'SaaS',
    stage: 'Seed',
    geography: 'India',
    percentiles: { P10: 400, P25: 700, P50: 1100, P75: 1800, P90: 2800 },
    currentValue: 1200,
  },
  {
    metric: 'MRR',
    industry: 'SaaS',
    stage: 'Seed',
    geography: 'India',
    percentiles: { P10: 1500, P25: 3500, P50: 7000, P75: 15000, P90: 30000 },
    currentValue: 8500,
  },
  {
    metric: 'Churn Rate',
    industry: 'SaaS',
    stage: 'Seed',
    geography: 'India',
    percentiles: { P10: 2, P25: 3, P50: 5, P75: 8, P90: 12 },
    currentValue: 4.2,
  },
  {
    metric: 'Burn Rate',
    industry: 'SaaS',
    stage: 'Seed',
    geography: 'India',
    percentiles: { P10: 20000, P25: 35000, P50: 50000, P75: 75000, P90: 120000 },
    currentValue: 45000,
  },
  {
    metric: 'NPS',
    industry: 'SaaS',
    stage: 'Seed',
    geography: 'India',
    percentiles: { P10: 10, P25: 25, P50: 40, P75: 55, P90: 70 },
    currentValue: 42,
  },
];

export const environmentSignals: EnvironmentSignal[] = [
  {
    source: 'TechCrunch',
    type: 'market',
    title: 'SaaS funding rebounds in Q1 2026 with 23% increase',
    impact: 'positive',
    score: 0.78,
    timestamp: '2026-03-15',
  },
  {
    source: 'Industry Report',
    type: 'competition',
    title: 'New competitor raised $5M seed round in adjacent space',
    impact: 'negative',
    score: -0.45,
    timestamp: '2026-03-14',
  },
  {
    source: 'Government Portal',
    type: 'regulation',
    title: 'New data privacy compliance requirements for SaaS in India',
    impact: 'negative',
    score: -0.32,
    timestamp: '2026-03-13',
  },
  {
    source: 'Social Listening',
    type: 'sentiment',
    title: 'Brand sentiment trending positive on X/Twitter',
    impact: 'positive',
    score: 0.61,
    timestamp: '2026-03-12',
  },
  {
    source: 'Bloomberg',
    type: 'macro',
    title: 'RBI keeps interest rates steady, positive for startup lending',
    impact: 'positive',
    score: 0.55,
    timestamp: '2026-03-11',
  },
  {
    source: 'G2 Reviews',
    type: 'sentiment',
    title: 'Category average satisfaction dropped 5% QoQ',
    impact: 'positive',
    score: 0.38,
    timestamp: '2026-03-10',
  },
];

export const simulationScenarios: SimulationScenario[] = [
  {
    id: 'baseline',
    name: 'Baseline (Current Trajectory)',
    parameters: { growthRate: 12, burnMultiplier: 1.0, hiringPace: 2, cacChange: 0 },
    outcomes: { mrr12m: 28500, runway12m: 8, teamSize12m: 18, valuation: 2800000 },
  },
  {
    id: 'aggressive',
    name: 'Aggressive Growth',
    parameters: { growthRate: 25, burnMultiplier: 1.6, hiringPace: 5, cacChange: 15 },
    outcomes: { mrr12m: 72000, runway12m: 5, teamSize12m: 30, valuation: 7200000 },
  },
  {
    id: 'conservative',
    name: 'Capital Efficient',
    parameters: { growthRate: 8, burnMultiplier: 0.8, hiringPace: 1, cacChange: -10 },
    outcomes: { mrr12m: 18200, runway12m: 18, teamSize12m: 14, valuation: 1800000 },
  },
];

export const revenueHistory = [
  { month: 'Sep', mrr: 3200, burn: 38000 },
  { month: 'Oct', mrr: 4100, burn: 40000 },
  { month: 'Nov', mrr: 4800, burn: 41000 },
  { month: 'Dec', mrr: 5500, burn: 42000 },
  { month: 'Jan', mrr: 6400, burn: 43000 },
  { month: 'Feb', mrr: 7500, burn: 44000 },
  { month: 'Mar', mrr: 8500, burn: 45000 },
];

export const departmentHealth = [
  { name: 'Product', health: 85, velocity: 92, satisfaction: 78 },
  { name: 'Growth', health: 72, velocity: 68, satisfaction: 81 },
  { name: 'Engineering', health: 91, velocity: 88, satisfaction: 85 },
  { name: 'Support', health: 78, velocity: 75, satisfaction: 90 },
];

// --- Tasks being executed ---

export const activeTasks: Task[] = [
  {
    id: 't1',
    title: 'Analyzing Q1 churn cohort patterns',
    department: 'Growth',
    status: 'running',
    progress: 72,
    assignee: 'AI Agent',
    aiPowered: true,
    startedAt: '3 min ago',
    eta: '~2 min',
  },
  {
    id: 't2',
    title: 'Sprint velocity regression test',
    department: 'Engineering',
    status: 'running',
    progress: 45,
    assignee: 'CTO',
    aiPowered: false,
    startedAt: '8 min ago',
    eta: '~12 min',
  },
  {
    id: 't3',
    title: 'Generating weekly investor report',
    department: 'Product',
    status: 'completed',
    progress: 100,
    assignee: 'AI Agent',
    aiPowered: true,
    startedAt: '15 min ago',
  },
  {
    id: 't4',
    title: 'CAC optimization scenario sweep',
    department: 'Growth',
    status: 'running',
    progress: 31,
    assignee: 'AI Agent',
    aiPowered: true,
    startedAt: '1 min ago',
    eta: '~5 min',
  },
  {
    id: 't5',
    title: 'Customer sentiment NLP pipeline',
    department: 'Support',
    status: 'queued',
    progress: 0,
    assignee: 'AI Agent',
    aiPowered: true,
    startedAt: 'queued',
  },
  {
    id: 't6',
    title: 'Competitor pricing scrape & analysis',
    department: 'Growth',
    status: 'completed',
    progress: 100,
    assignee: 'AI Agent',
    aiPowered: true,
    startedAt: '22 min ago',
  },
];

// --- Twin Graph: sourced from src/data/twinGraph.ts (built from src/db/) ---
export { twinNodes, twinEdges } from './twinGraph';

// --- Decision Tree for Simulation ---

export const decisionTree: DecisionNode = {
  id: 'd-root',
  label: 'Raise Series A',
  probability: 1.0,
  outcome: '',
  impact: 0,
  children: [
    {
      id: 'd-raise-yes',
      label: 'Raise $2M at $10M valuation',
      probability: 0.55,
      outcome: '18mo runway, aggressive hire',
      impact: 65,
      children: [
        { id: 'd-grow-fast', label: 'Hit $50K MRR in 8mo', probability: 0.40, outcome: 'Series B ready', impact: 90 },
        { id: 'd-grow-slow', label: 'Hit $25K MRR in 12mo', probability: 0.45, outcome: 'Extend runway, pivot possible', impact: 30 },
        { id: 'd-fail-burn', label: 'Burn too fast, 6mo runway', probability: 0.15, outcome: 'Emergency bridge or shutdown', impact: -60 },
      ],
    },
    {
      id: 'd-bootstrap',
      label: 'Bootstrap to profitability',
      probability: 0.30,
      outcome: 'Slow growth, full control',
      impact: 20,
      children: [
        { id: 'd-profit', label: 'Break even in 10mo', probability: 0.50, outcome: 'Sustainable, raise on terms', impact: 70 },
        { id: 'd-stagnate', label: 'Growth stalls at $12K MRR', probability: 0.35, outcome: 'Lifestyle business or pivot', impact: -10 },
        { id: 'd-surprise', label: 'Viral moment, 5x growth', probability: 0.15, outcome: 'Organic breakout', impact: 95 },
      ],
    },
    {
      id: 'd-pivot',
      label: 'Pivot to adjacent market',
      probability: 0.15,
      outcome: 'Reset metrics, new TAM',
      impact: -15,
      children: [
        { id: 'd-pivot-win', label: 'New PMF in 6mo', probability: 0.30, outcome: 'Stronger position', impact: 75 },
        { id: 'd-pivot-grind', label: '12mo to traction', probability: 0.40, outcome: 'Runway pressure', impact: 5 },
        { id: 'd-pivot-fail', label: 'No PMF, wind down', probability: 0.30, outcome: 'Graceful exit', impact: -80 },
      ],
    },
  ],
};

// --- Monte Carlo paths ---

export const monteCarloData = Array.from({ length: 12 }, (_, month) => {
  const base = 8500;
  const paths: Record<string, number> = { month: month + 1 };
  // Generate 5 random paths
  for (let p = 1; p <= 5; p++) {
    const growth = 0.05 + Math.random() * 0.20;
    const noise = 0.9 + Math.random() * 0.2;
    paths[`path${p}`] = Math.round(base * Math.pow(1 + growth, month) * noise);
  }
  // P10, P50, P90 envelopes
  const vals = [1, 2, 3, 4, 5].map((p) => paths[`path${p}`]);
  vals.sort((a, b) => a - b);
  paths.p10 = vals[0];
  paths.p50 = vals[2];
  paths.p90 = vals[4];
  return paths;
});

// --- Cohort comparisons for benchmarks ---

export const cohortRadar: CohortComparison[] = [
  { dimension: 'Revenue Growth', you: 78, cohortAvg: 55, topQuartile: 85 },
  { dimension: 'Capital Efficiency', you: 65, cohortAvg: 50, topQuartile: 80 },
  { dimension: 'Product Velocity', you: 82, cohortAvg: 60, topQuartile: 90 },
  { dimension: 'Team Productivity', you: 70, cohortAvg: 58, topQuartile: 82 },
  { dimension: 'Customer Retention', you: 58, cohortAvg: 52, topQuartile: 78 },
  { dimension: 'Market Position', you: 45, cohortAvg: 50, topQuartile: 75 },
];

export const industryBenchmarks = [
  { industry: 'SaaS', avgMRR: 12000, avgCAC: 110, avgChurn: 5.5, avgRunway: 11 },
  { industry: 'FinTech', avgMRR: 28000, avgCAC: 180, avgChurn: 3.8, avgRunway: 14 },
  { industry: 'HealthTech', avgMRR: 18000, avgCAC: 250, avgChurn: 2.5, avgRunway: 16 },
  { industry: 'D2C', avgMRR: 35000, avgCAC: 45, avgChurn: 8.2, avgRunway: 9 },
  { industry: 'Marketplace', avgMRR: 22000, avgCAC: 65, avgChurn: 6.1, avgRunway: 10 },
];

export const survivalCurve = [
  { month: 0, survival: 100, yourProjected: 100 },
  { month: 3, survival: 88, yourProjected: 95 },
  { month: 6, survival: 72, yourProjected: 88 },
  { month: 9, survival: 58, yourProjected: 82 },
  { month: 12, survival: 45, yourProjected: 76 },
  { month: 18, survival: 30, yourProjected: 65 },
  { month: 24, survival: 20, yourProjected: 55 },
];

// --- Integrations ---

export const integrations: Integration[] = [
  // Finance
  { id: 'int-stripe', name: 'Stripe', category: 'finance', status: 'connected', description: 'Payment & revenue data' },
  { id: 'int-razorpay', name: 'Razorpay', category: 'finance', status: 'available', description: 'India payments gateway' },
  { id: 'int-qb', name: 'QuickBooks', category: 'finance', status: 'available', description: 'Accounting & expenses' },
  // CRM
  { id: 'int-hubspot', name: 'HubSpot', category: 'crm', status: 'connected', description: 'Customer pipeline & deals' },
  { id: 'int-sf', name: 'Salesforce', category: 'crm', status: 'available', description: 'Enterprise CRM' },
  // Analytics
  { id: 'int-mixpanel', name: 'Mixpanel', category: 'analytics', status: 'connected', description: 'Product analytics events' },
  { id: 'int-amplitude', name: 'Amplitude', category: 'analytics', status: 'available', description: 'Product analytics' },
  { id: 'int-ga', name: 'Google Analytics', category: 'analytics', status: 'available', description: 'Web & traffic analytics' },
  { id: 'int-meta', name: 'Meta Ads', category: 'analytics', status: 'available', description: 'Facebook / Instagram ad performance' },
  // Project
  { id: 'int-jira', name: 'Jira', category: 'project', status: 'connected', description: 'Sprint & issue tracking' },
  { id: 'int-linear', name: 'Linear', category: 'project', status: 'available', description: 'Modern issue tracking' },
  { id: 'int-slack', name: 'Slack', category: 'project', status: 'connected', description: 'Team communication' },
  // Market
  { id: 'int-crunchbase', name: 'Crunchbase', category: 'market', status: 'connected', description: 'Competitor funding & data' },
  { id: 'int-g2', name: 'G2 Reviews', category: 'market', status: 'available', description: 'Category reviews & sentiment' },
  { id: 'int-newsapi', name: 'News APIs', category: 'market', status: 'connected', description: 'Industry news monitoring' },
  // Social
  { id: 'int-twitter', name: 'X / Twitter', category: 'social', status: 'connected', description: 'Social listening & sentiment' },
  { id: 'int-reddit', name: 'Reddit', category: 'social', status: 'available', description: 'Community discussions' },
  // Government
  { id: 'int-mca', name: 'MCA Portal', category: 'government', status: 'coming-soon', description: 'Indian regulatory filings' },
  { id: 'int-gst', name: 'GST Portal', category: 'government', status: 'coming-soon', description: 'Tax compliance data' },
];

// --- Decision Flow ---

export const decisions: Decision[] = [
  {
    id: 'dec-pricing',
    title: 'Revise pricing model for enterprise tier',
    origin: 'top-down',
    department: 'Product',
    proposedBy: 'Founder',
    status: 'ranked',
    selectedOption: undefined,
    options: [
      {
        id: 'opt-1', label: 'Usage-based pricing', description: 'Per-seat + API-call metering. Aligns revenue to value delivered.',
        source: 'generated',
        evaluation: { impact: 72, risk: 35, resources: 55, confidence: 78, sensitivity: 40 },
        rank: 1, dependencies: ['Billing infra upgrade', 'Metering SDK'],
      },
      {
        id: 'opt-2', label: 'Flat annual plans', description: 'Simple tiers ($299 / $799 / $1999). Low complexity, predictable revenue.',
        source: 'user-proposed',
        evaluation: { impact: 45, risk: 15, resources: 20, confidence: 90, sensitivity: 20 },
        rank: 2, dependencies: [],
      },
      {
        id: 'opt-3', label: 'Freemium + usage upsell', description: 'Free tier to capture market, monetize via usage caps.',
        source: 'generated',
        evaluation: { impact: 85, risk: 60, resources: 70, confidence: 55, sensitivity: 65 },
        rank: 3, dependencies: ['Free-tier infra', 'Paywall logic', 'Growth loops'],
      },
    ],
  },
  {
    id: 'dec-hiring',
    title: 'Hire senior backend engineer vs promote intern',
    origin: 'bottom-up',
    department: 'Engineering',
    proposedBy: 'CTO',
    status: 'evaluating',
    options: [
      {
        id: 'opt-h1', label: 'Hire senior ($8K/mo)', description: 'External hire, 3-month ramp. Immediate architecture impact.',
        source: 'user-proposed',
        evaluation: { impact: 68, risk: 30, resources: 80, confidence: 70, sensitivity: 25 },
        dependencies: ['Budget approval', 'Recruiting pipeline'],
      },
      {
        id: 'opt-h2', label: 'Promote intern + AI pair', description: 'Promote top intern, pair with AI code-review agent. Lower cost, higher risk.',
        source: 'generated',
        evaluation: { impact: 50, risk: 45, resources: 25, confidence: 60, sensitivity: 50 },
        dependencies: ['AI agent setup', 'Mentorship plan'],
      },
      {
        id: 'opt-h3', label: 'Contract for 3 months', description: 'Hire contractor, reassess after Q2. Flexible but no IP retention.',
        source: 'generated',
        evaluation: { impact: 40, risk: 20, resources: 60, confidence: 82, sensitivity: 15 },
        dependencies: ['Vendor shortlist'],
      },
    ],
  },
  {
    id: 'dec-channel',
    title: 'Primary growth channel for Q2',
    origin: 'top-down',
    department: 'Growth',
    proposedBy: 'Founder',
    status: 'decided',
    selectedOption: 'opt-c1',
    decidedBy: 'Growth Lead',
    options: [
      {
        id: 'opt-c1', label: 'Content-led SEO', description: 'Programmatic content + blog authority. 6-month compounding.',
        source: 'user-proposed',
        evaluation: { impact: 70, risk: 20, resources: 40, confidence: 85, sensitivity: 15 },
        rank: 1, dependencies: ['Content pipeline', 'SEO tooling'],
      },
      {
        id: 'opt-c2', label: 'Paid acquisition (Google Ads)', description: 'Fast leads, high CAC. Good for validation, not sustainable.',
        source: 'user-proposed',
        evaluation: { impact: 55, risk: 40, resources: 65, confidence: 75, sensitivity: 55 },
        rank: 2, dependencies: ['Ad budget', 'Landing pages'],
      },
      {
        id: 'opt-c3', label: 'Partnerships & integrations', description: 'Co-market with complementary tools. Slow start, strong moat.',
        source: 'generated',
        evaluation: { impact: 60, risk: 25, resources: 50, confidence: 60, sensitivity: 30 },
        rank: 3, dependencies: ['Partner outreach', 'API docs'],
      },
    ],
  },
];

// --- Multi-Horizon Goals ---

export const goals: Goal[] = [
  // Stage-based
  { id: 'g-stage-1', title: 'Reach $25K MRR for Series A readiness', horizon: 'stage', department: 'All', owner: 'Founder', source: 'user', status: 'active', progress: 34, dueDate: '2026-09-30', crucial: true, kpiLinked: 'MRR' },
  { id: 'g-stage-2', title: 'Achieve product-market fit score > 40%', horizon: 'stage', department: 'Product', owner: 'Founder', source: 'user', status: 'active', progress: 68, dueDate: '2026-06-30', crucial: true, kpiLinked: 'NPS' },

  // Monthly
  { id: 'g-month-1', title: 'Grow MRR by 15% this month', horizon: 'monthly', department: 'Growth', owner: 'Growth Lead', source: 'cascaded', status: 'active', progress: 60, parentGoalId: 'g-stage-1', dueDate: '2026-03-31', crucial: true, kpiLinked: 'MRR' },
  { id: 'g-month-2', title: 'Reduce churn below 4%', horizon: 'monthly', department: 'Support', owner: 'Support Lead', source: 'user', status: 'at-risk', progress: 30, dueDate: '2026-03-31', crucial: true, kpiLinked: 'Churn Rate' },
  { id: 'g-month-3', title: 'Ship enterprise billing feature', horizon: 'monthly', department: 'Engineering', owner: 'CTO', source: 'cascaded', status: 'active', progress: 72, parentGoalId: 'g-stage-1', dueDate: '2026-03-31', crucial: false },
  { id: 'g-month-4', title: 'Onboard 3 design partners', horizon: 'monthly', department: 'Growth', owner: 'Growth Lead', source: 'user', status: 'active', progress: 33, dueDate: '2026-03-31', crucial: false },

  // Weekly
  { id: 'g-week-1', title: 'Close 5 qualified leads', horizon: 'weekly', department: 'Growth', owner: 'Growth Lead', source: 'cascaded', status: 'active', progress: 40, parentGoalId: 'g-month-1', dueDate: '2026-03-21', crucial: false },
  { id: 'g-week-2', title: 'Complete billing API integration tests', horizon: 'weekly', department: 'Engineering', owner: 'CTO', source: 'cascaded', status: 'active', progress: 85, parentGoalId: 'g-month-3', dueDate: '2026-03-21', crucial: false },
  { id: 'g-week-3', title: 'Run 3 customer exit interviews', horizon: 'weekly', department: 'Support', owner: 'Support Lead', source: 'cascaded', status: 'completed', progress: 100, parentGoalId: 'g-month-2', dueDate: '2026-03-21', crucial: false },
  { id: 'g-week-4', title: 'Publish 2 SEO blog posts', horizon: 'weekly', department: 'Growth', owner: 'Growth Lead', source: 'user', status: 'active', progress: 50, dueDate: '2026-03-21', crucial: false },

  // Daily
  { id: 'g-day-1', title: 'Follow up with demo attendees from yesterday', horizon: 'daily', department: 'Growth', owner: 'Growth Lead', source: 'cascaded', status: 'completed', progress: 100, parentGoalId: 'g-week-1', dueDate: '2026-03-18', crucial: false },
  { id: 'g-day-2', title: 'Fix critical payment webhook bug', horizon: 'daily', department: 'Engineering', owner: 'CTO', source: 'user', status: 'active', progress: 60, dueDate: '2026-03-18', crucial: true },
  { id: 'g-day-3', title: 'Review Q1 churn cohort analysis (AI)', horizon: 'daily', department: 'Growth', owner: 'Analytics AI', source: 'suggested', status: 'active', progress: 72, dueDate: '2026-03-18', crucial: false },
  { id: 'g-day-4', title: 'Respond to compliance audit questions', horizon: 'daily', department: 'All', owner: 'Founder', source: 'suggested', status: 'active', progress: 0, dueDate: '2026-03-18', crucial: false },
];

// Suggested goals from signals (click to add)
export const suggestedGoals = [
  { title: 'Prepare data privacy compliance roadmap', source: 'Regulation signal: new data privacy requirements', department: 'Engineering', horizon: 'monthly' as const },
  { title: 'Analyze competitor pricing after $5M raise', source: 'Competition signal: RivalCo Alpha funding', department: 'Growth', horizon: 'weekly' as const },
  { title: 'Capitalize on SaaS funding rebound — update pitch deck', source: 'Market signal: SaaS funding +23% Q1', department: 'All', horizon: 'weekly' as const },
  { title: 'Leverage positive brand sentiment for case studies', source: 'Sentiment signal: brand trending positive', department: 'Growth', horizon: 'monthly' as const },
];

// --- Lifecycle / Funding Stage Goal Recommendations ---

export const stageGoalRecommendations: StageGoalRecommendation[] = [
  // FFF (Friends, Family, Fools)
  { stage: 'FFF', title: 'Validate core problem hypothesis with 20+ user interviews', department: 'Product', kpiLinked: 'NPS', crucial: true, source: 'simulator' },
  { stage: 'FFF', title: 'Build MVP with core feature set', department: 'Engineering', crucial: true, source: 'simulator' },
  { stage: 'FFF', title: 'Secure initial $50K–$150K from personal network', department: 'All', crucial: true, source: 'simulator' },
  { stage: 'FFF', title: 'Identify first 5 design partners', department: 'Growth', crucial: false, source: 'simulator' },

  // Seed
  { stage: 'Seed', title: 'Achieve product-market fit score > 40%', department: 'Product', kpiLinked: 'NPS', crucial: true, source: 'simulator' },
  { stage: 'Seed', title: 'Reach $10K MRR', department: 'Growth', kpiLinked: 'MRR', crucial: true, source: 'simulator' },
  { stage: 'Seed', title: 'Establish repeatable acquisition channel', department: 'Growth', kpiLinked: 'CAC', crucial: true, source: 'simulator' },
  { stage: 'Seed', title: 'Hire core team (CTO, Growth Lead)', department: 'All', crucial: false, source: 'simulator' },
  { stage: 'Seed', title: 'Set up basic analytics and tracking pipeline', department: 'Engineering', crucial: false, source: 'simulator' },

  // Series A
  { stage: 'Series A', title: 'Scale MRR to $50K–$100K', department: 'Growth', kpiLinked: 'MRR', crucial: true, source: 'simulator' },
  { stage: 'Series A', title: 'Prove unit economics: LTV/CAC > 3x', department: 'Growth', kpiLinked: 'LTV', crucial: true, source: 'simulator' },
  { stage: 'Series A', title: 'Reduce churn below 5% monthly', department: 'Support', kpiLinked: 'Churn Rate', crucial: true, source: 'simulator' },
  { stage: 'Series A', title: 'Build out sales playbook and process', department: 'Growth', crucial: false, source: 'simulator' },
  { stage: 'Series A', title: 'Establish department structure with HODs', department: 'All', crucial: false, source: 'simulator' },

  // Series B
  { stage: 'Series B', title: 'Scale ARR to $5M–$10M', department: 'Growth', kpiLinked: 'MRR', crucial: true, source: 'simulator' },
  { stage: 'Series B', title: 'Expand to 2+ market segments or geographies', department: 'Growth', crucial: true, source: 'simulator' },
  { stage: 'Series B', title: 'Achieve gross margin > 70%', department: 'All', kpiLinked: 'Gross Margin', crucial: true, source: 'simulator' },
  { stage: 'Series B', title: 'Scale team to 50+ with VP-level hires', department: 'All', crucial: false, source: 'simulator' },

  // Series C
  { stage: 'Series C', title: 'Reach $20M+ ARR with clear path to $50M', department: 'Growth', kpiLinked: 'MRR', crucial: true, source: 'simulator' },
  { stage: 'Series C', title: 'Establish market leadership position in core vertical', department: 'Growth', crucial: true, source: 'simulator' },
  { stage: 'Series C', title: 'Build enterprise sales motion with $50K+ ACV deals', department: 'Growth', crucial: true, source: 'simulator' },
  { stage: 'Series C', title: 'Develop platform strategy and partner ecosystem', department: 'Product', crucial: false, source: 'simulator' },

  // Series D
  { stage: 'Series D', title: 'Scale ARR to $50M+ with 50%+ YoY growth', department: 'Growth', kpiLinked: 'MRR', crucial: true, source: 'simulator' },
  { stage: 'Series D', title: 'International expansion to 3+ major markets', department: 'Growth', crucial: true, source: 'simulator' },
  { stage: 'Series D', title: 'Achieve operational efficiency: Rule of 40', department: 'All', crucial: true, source: 'simulator' },
  { stage: 'Series D', title: 'Build defensible moat (data, network effects, IP)', department: 'Product', crucial: false, source: 'simulator' },

  // Pre-IPO
  { stage: 'Pre-IPO', title: 'Reach $100M+ ARR run rate', department: 'Growth', kpiLinked: 'MRR', crucial: true, source: 'simulator' },
  { stage: 'Pre-IPO', title: 'Demonstrate 3+ consecutive quarters of predictable growth', department: 'All', crucial: true, source: 'simulator' },
  { stage: 'Pre-IPO', title: 'Establish board governance and audit readiness', department: 'All', crucial: true, source: 'simulator' },
  { stage: 'Pre-IPO', title: 'Hire CFO and prepare financial controls for public scrutiny', department: 'All', crucial: false, source: 'simulator' },

  // IPO
  { stage: 'IPO', title: 'Complete S-1 filing and SEC compliance', department: 'All', crucial: true, source: 'simulator' },
  { stage: 'IPO', title: 'Demonstrate sustained profitability or clear path to it', department: 'All', crucial: true, source: 'simulator' },
  { stage: 'IPO', title: 'Build investor relations function', department: 'All', crucial: true, source: 'simulator' },
  { stage: 'IPO', title: 'Maintain >30% revenue growth for public market story', department: 'Growth', kpiLinked: 'MRR', crucial: false, source: 'simulator' },
];

// --- Tracked Metrics Layer ---

export const trackedMetrics: TrackedMetric[] = [
  // Growth
  { id: 'tm-mrr', name: 'MRR', category: 'Growth', value: 8500, unit: '$', change: 12.5, dataSource: 'auto-ingested', integration: 'Stripe', trend: [3200, 4100, 4800, 5500, 6000, 6400, 6800, 7100, 7500, 7900, 8200, 8500], target: 10000, percentile: 62, description: 'Monthly Recurring Revenue from all subscriptions' },
  { id: 'tm-arr', name: 'ARR', category: 'Growth', value: 102000, unit: '$', change: 12.5, dataSource: 'auto-ingested', integration: 'Stripe', trend: [38400, 49200, 57600, 66000, 72000, 76800, 81600, 85200, 90000, 94800, 98400, 102000], target: 120000, percentile: 58, description: 'Annual Recurring Revenue (MRR x 12)' },
  { id: 'tm-cac', name: 'CAC', category: 'Growth', value: 95, unit: '$', change: -8.3, dataSource: 'auto-ingested', integration: 'HubSpot', trend: [140, 135, 128, 120, 115, 112, 108, 105, 102, 100, 97, 95], target: 80, percentile: 71, description: 'Customer Acquisition Cost across all channels' },
  { id: 'tm-ltv', name: 'LTV', category: 'Growth', value: 1200, unit: '$', change: 5.2, dataSource: 'auto-ingested', integration: 'Stripe', trend: [800, 850, 900, 940, 980, 1020, 1060, 1100, 1120, 1150, 1175, 1200], target: 1500, percentile: 55, description: 'Customer Lifetime Value based on revenue and churn' },
  { id: 'tm-retention', name: 'Retention (M3)', category: 'Growth', value: 72, unit: '%', change: 3.1, dataSource: 'auto-ingested', integration: 'Mixpanel', trend: [58, 60, 62, 63, 64, 65, 66, 67, 68, 69, 70, 72], target: 80, percentile: 48, description: '3-month cohort retention rate' },
  { id: 'tm-activation', name: 'Activation Rate', category: 'Growth', value: 68, unit: '%', change: 4.5, dataSource: 'auto-ingested', integration: 'Mixpanel', trend: [48, 50, 52, 55, 57, 58, 60, 62, 63, 65, 66, 68], target: 75, percentile: 52, description: 'Percentage of signups completing activation milestones' },

  // Product
  { id: 'tm-dau', name: 'DAU/MAU', category: 'Product', value: 34, unit: '%', change: 2.8, dataSource: 'auto-ingested', integration: 'Mixpanel', trend: [22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34], target: 40, percentile: 45, description: 'Daily active users as a ratio of monthly active users' },
  { id: 'tm-conversion', name: 'Trial→Paid', category: 'Product', value: 12.5, unit: '%', change: 1.2, dataSource: 'auto-ingested', integration: 'Stripe', trend: [7.8, 8.2, 8.8, 9.2, 9.5, 10.0, 10.5, 10.8, 11.2, 11.6, 12.0, 12.5], target: 15, percentile: 60, description: 'Free trial to paid conversion rate' },
  { id: 'tm-churn-drivers', name: 'Top Churn Driver', category: 'Product', value: 38, unit: '% of exits', change: -5.0, dataSource: 'proxy', trend: [55, 52, 50, 48, 47, 46, 44, 43, 42, 41, 40, 38], description: 'Percentage citing "missing features" as churn reason' },
  { id: 'tm-nps', name: 'NPS', category: 'Product', value: 42, unit: '', change: 7.0, dataSource: 'manual', trend: [20, 22, 25, 28, 30, 32, 34, 35, 37, 38, 40, 42], target: 50, percentile: 65, description: 'Net Promoter Score from quarterly surveys' },

  // Sales
  { id: 'tm-pipeline', name: 'Pipeline Velocity', category: 'Sales', value: 18500, unit: '$/wk', change: 15.2, dataSource: 'auto-ingested', integration: 'HubSpot', trend: [8000, 9200, 10500, 11000, 12000, 13000, 14000, 15000, 15500, 16500, 17200, 18500], target: 25000, percentile: 55, description: 'Weekly revenue moving through the sales pipeline' },
  { id: 'tm-winrate', name: 'Win Rate', category: 'Sales', value: 28, unit: '%', change: 3.5, dataSource: 'auto-ingested', integration: 'HubSpot', trend: [18, 19, 20, 21, 22, 23, 24, 24, 25, 26, 27, 28], target: 35, percentile: 42, description: 'Percentage of opportunities converting to closed-won' },
  { id: 'tm-deal-cycle', name: 'Deal Cycle Time', category: 'Sales', value: 32, unit: 'days', change: -12.0, dataSource: 'auto-ingested', integration: 'HubSpot', trend: [52, 50, 48, 46, 44, 42, 40, 38, 37, 35, 34, 32], target: 25, percentile: 50, description: 'Average days from first touch to closed deal' },

  // Finance
  { id: 'tm-burn', name: 'Monthly Burn', category: 'Finance', value: 45000, unit: '$', change: 3.0, dataSource: 'auto-ingested', integration: 'QuickBooks', trend: [38000, 39000, 40000, 40500, 41000, 41500, 42000, 43000, 43500, 44000, 44500, 45000], target: 40000, percentile: 58, description: 'Monthly cash burn rate including all expenses' },
  { id: 'tm-runway', name: 'Runway', category: 'Finance', value: 14, unit: 'months', change: -0.5, dataSource: 'auto-ingested', integration: 'QuickBooks', trend: [20, 19, 18.5, 18, 17.5, 17, 16.5, 16, 15.5, 15, 14.5, 14], target: 18, percentile: 52, description: 'Months of runway at current burn rate' },
  { id: 'tm-unit-econ', name: 'LTV/CAC Ratio', category: 'Finance', value: 12.6, unit: 'x', change: 14.5, dataSource: 'proxy', trend: [5.7, 6.3, 7.0, 7.8, 8.5, 9.1, 9.8, 10.5, 11.0, 11.5, 12.1, 12.6], target: 3.0, percentile: 88, description: 'Lifetime value to acquisition cost ratio' },
  { id: 'tm-gross-margin', name: 'Gross Margin', category: 'Finance', value: 78, unit: '%', change: 1.5, dataSource: 'manual', trend: [68, 69, 70, 71, 72, 73, 74, 75, 76, 76, 77, 78], target: 80, percentile: 65, description: 'Revenue minus cost of goods sold as percentage' },

  // Ops/People
  { id: 'tm-hiring', name: 'Hiring Velocity', category: 'Ops/People', value: 2.5, unit: 'hires/mo', change: 25.0, dataSource: 'manual', trend: [0.5, 0.5, 1.0, 1.0, 1.0, 1.5, 1.5, 2.0, 2.0, 2.0, 2.0, 2.5], target: 3, description: 'Average new hires per month over rolling quarter' },
  { id: 'tm-productivity', name: 'Revenue/Employee', category: 'Ops/People', value: 708, unit: '$/mo', change: 10.2, dataSource: 'proxy', trend: [400, 420, 440, 460, 480, 510, 540, 570, 600, 640, 680, 708], target: 1000, description: 'Monthly recurring revenue per full-time employee' },
  { id: 'tm-delivery', name: 'Sprint Delivery', category: 'Ops/People', value: 88, unit: '%', change: 2.3, dataSource: 'auto-ingested', integration: 'Jira', trend: [72, 74, 76, 78, 80, 82, 83, 84, 85, 86, 87, 88], target: 90, description: 'Percentage of sprint points delivered on time' },
];

// ─── VC & Mentor Connect ─────────────────────────────────────────────────────

import type { Investor, Mentor, StartupPeer, PeerConnection, PeerBenchmark } from '../types';

export const investors: Investor[] = [
  { id: 'inv-1', name: 'Priya Sharma', firm: 'Nexus Venture Partners', stages: ['seed', 'series-a'], sectors: ['SaaS', 'AI/ML'], avgTicket: '$500K–$2M', status: 'in-discussion', lastContact: '2026-03-25', nextFollowUp: '2026-04-05', notes: 'Interested after demo day. Wants to see 3-month MRR trend.', warmIntro: true, sharedDashboards: ['tm-mrr', 'tm-cac', 'tm-churn'] },
  { id: 'inv-2', name: 'Vikram Reddy', firm: 'Blume Ventures', stages: ['seed'], sectors: ['SaaS', 'FinTech'], avgTicket: '$200K–$1M', status: 'contacted', lastContact: '2026-03-18', nextFollowUp: '2026-04-02', notes: 'Cold intro via LinkedIn. Waiting for reply.', warmIntro: false, sharedDashboards: [] },
  { id: 'inv-3', name: 'Sarah Chen', firm: 'Lightspeed India', stages: ['series-a', 'series-b'], sectors: ['SaaS', 'Enterprise'], avgTicket: '$2M–$8M', status: 'prospect', notes: 'Met at SaaSBoomi. Strong SaaS thesis.', warmIntro: false, sharedDashboards: [] },
  { id: 'inv-4', name: 'Rajan Anandan', firm: 'Peak XV (Sequoia)', stages: ['seed', 'series-a'], sectors: ['AI/ML', 'DeepTech'], avgTicket: '$1M–$5M', status: 'term-sheet', lastContact: '2026-03-28', notes: 'Term sheet received. Reviewing with legal.', warmIntro: true, sharedDashboards: ['tm-mrr', 'tm-cac', 'tm-ltv', 'tm-churn', 'tm-burn', 'tm-runway'] },
  { id: 'inv-5', name: 'Ankit Jain', firm: 'Angel Fund', stages: ['angel'], sectors: ['SaaS'], avgTicket: '$25K–$100K', status: 'committed', lastContact: '2026-03-10', notes: 'Committed $50K. SAFE note signed.', warmIntro: true, sharedDashboards: ['tm-mrr'] },
  { id: 'inv-6', name: 'Meera Patel', firm: '100x.VC', stages: ['angel', 'seed'], sectors: ['SaaS', 'MarketPlace'], avgTicket: '$50K–$250K', status: 'passed', lastContact: '2026-02-20', notes: 'Passed — said too early for their current fund.', warmIntro: false, sharedDashboards: [] },
];

export const mentors: Mentor[] = [
  { id: 'mentor-1', name: 'Aarav Desai', expertise: ['Product Strategy', 'SaaS Metrics', 'Fundraising'], company: 'Ex-Freshworks', role: 'VP Product', availability: 'biweekly', lastSession: '2026-03-20', nextSession: '2026-04-03' },
  { id: 'mentor-2', name: 'Nandini Rao', expertise: ['Growth Marketing', 'PLG', 'Content Strategy'], company: 'Advisor @ 3 startups', role: 'Growth Expert', availability: 'monthly', lastSession: '2026-03-05', nextSession: '2026-04-05' },
  { id: 'mentor-3', name: 'David Kim', expertise: ['Engineering Management', 'System Design', 'Hiring'], company: 'Ex-Google', role: 'Engineering Director', availability: 'on-demand', lastSession: '2026-02-28' },
  { id: 'mentor-4', name: 'Kavya Iyer', expertise: ['Legal & Compliance', 'Cap Table', 'Term Sheets'], company: 'Khaitan & Co', role: 'Partner', availability: 'on-demand', lastSession: '2026-03-22' },
];

// ─── Startup Networking Layer ────────────────────────────────────────────────

export const startupPeers: StartupPeer[] = [
  { id: 'peer-1', name: 'DataLens AI', stage: 'Seed', industry: 'SaaS / Analytics', teamSize: 8, geography: 'Bangalore', strengths: ['Data engineering', 'ML pipelines'], lookingFor: ['Frontend devs', 'Design partner'], optInBenchmark: true },
  { id: 'peer-2', name: 'ShipFast Labs', stage: 'Seed', industry: 'SaaS / DevTools', teamSize: 5, geography: 'Remote (India)', strengths: ['CI/CD tooling', 'Developer advocacy'], lookingFor: ['Sales expertise', 'Partnership'], optInBenchmark: true },
  { id: 'peer-3', name: 'NeoRetail', stage: 'Series A', industry: 'SaaS / Retail-Tech', teamSize: 22, geography: 'Mumbai', strengths: ['Enterprise sales', 'Retail domain'], lookingFor: ['AI/ML talent', 'Knowledge exchange'], optInBenchmark: true },
  { id: 'peer-4', name: 'FinSight', stage: 'Seed', industry: 'FinTech', teamSize: 10, geography: 'Delhi', strengths: ['Compliance', 'Banking integrations'], lookingFor: ['Outsourcing frontend', 'Hiring referrals'], optInBenchmark: false },
  { id: 'peer-5', name: 'CloudNine Ops', stage: 'FFF', industry: 'SaaS / Infrastructure', teamSize: 3, geography: 'Hyderabad', strengths: ['Infra automation', 'Kubernetes'], lookingFor: ['Partnership', 'Knowledge exchange'], optInBenchmark: true },
  { id: 'peer-6', name: 'GrowthPulse', stage: 'Series A', industry: 'SaaS / MarTech', teamSize: 18, geography: 'Bangalore', strengths: ['Growth loops', 'Content marketing'], lookingFor: ['Data engineering help', 'Hiring referrals'], optInBenchmark: true },
];

export const peerConnections: PeerConnection[] = [
  { id: 'conn-1', peerId: 'peer-1', type: 'knowledge-exchange', status: 'active', description: 'Sharing ML pipeline learnings; they help with data infra, we share SaaS metrics frameworks', startedAt: '2026-01-15' },
  { id: 'conn-2', peerId: 'peer-2', type: 'partnership', status: 'active', description: 'Exploring integration — their CI/CD tool could plug into our deployment workflow', startedAt: '2026-02-20' },
  { id: 'conn-3', peerId: 'peer-3', type: 'hiring-referral', status: 'active', description: 'Mutual referral pipeline for engineering candidates', startedAt: '2026-03-01' },
  { id: 'conn-4', peerId: 'peer-4', type: 'outsourcing', status: 'pending', description: 'They want to outsource frontend UI work; evaluating scope', startedAt: '2026-03-15' },
  { id: 'conn-5', peerId: 'peer-6', type: 'knowledge-exchange', status: 'proposed', description: 'GrowthPulse proposed sharing growth loop playbooks in exchange for analytics insights' },
];

export const peerBenchmarks: PeerBenchmark[] = [
  { metric: 'MRR', you: 8500, peerMedian: 6200, peerTop: 15000, unit: '$', anonymised: true },
  { metric: 'Burn Rate', you: 45000, peerMedian: 52000, peerTop: 35000, unit: '$/mo', anonymised: true },
  { metric: 'Team Size', you: 12, peerMedian: 9, peerTop: 22, unit: 'people', anonymised: false },
  { metric: 'CAC', you: 680, peerMedian: 850, peerTop: 420, unit: '$', anonymised: true },
  { metric: 'NPS', you: 62, peerMedian: 45, peerTop: 72, unit: '', anonymised: true },
  { metric: 'Churn', you: 4.2, peerMedian: 5.8, peerTop: 2.1, unit: '%', anonymised: true },
  { metric: 'Runway', you: 14, peerMedian: 11, peerTop: 20, unit: 'months', anonymised: true },
  { metric: 'LTV/CAC', you: 12.6, peerMedian: 4.5, peerTop: 8.0, unit: 'x', anonymised: true },
];
