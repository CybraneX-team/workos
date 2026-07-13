export interface IndustryKnowledge {
  emoji: string;
  tagline: string;
  marketSize: string;
  cagr: string;
  keyTrends: string[];
  keyMetrics: string[];
}

export const INDUSTRY_KNOWLEDGE: Record<string, IndustryKnowledge> = {
  fintech: {
    emoji: '💳',
    tagline: 'Reshaping global finance with software',
    marketSize: '$310B',
    cagr: '16.8%',
    keyTrends: ['Embedded finance', 'Open banking APIs', 'BNPL consolidation', 'Crypto regulation clarity'],
    keyMetrics: ['CAC/LTV ratio', 'Payment volume GMV', 'Monthly active wallets', 'Transaction success rate'],
  },
  healthtech: {
    emoji: '🏥',
    tagline: 'Digital health and medical intelligence',
    marketSize: '$280B',
    cagr: '18.6%',
    keyTrends: ['AI diagnostics', 'Remote patient monitoring', 'Value-based care', 'Mental health SaaS'],
    keyMetrics: ['Patient engagement rate', 'Clinical outcome delta', 'Provider adoption', 'Claims processing speed'],
  },
  edtech: {
    emoji: '🎓',
    tagline: 'Reimagining how the world learns',
    marketSize: '$85B',
    cagr: '13.4%',
    keyTrends: ['AI tutoring', 'Micro-credentials', 'Skills-based hiring', 'Corporate L&D automation'],
    keyMetrics: ['Course completion rate', 'Learning velocity', 'Skills assessment accuracy', 'Employer placement rate'],
  },
  retailtech: {
    emoji: '🛒',
    tagline: 'Commerce intelligence at every touchpoint',
    marketSize: '$200B',
    cagr: '14.2%',
    keyTrends: ['Unified commerce', 'AI merchandising', 'Social commerce', 'Sustainable supply chains'],
    keyMetrics: ['GMV growth', 'Cart abandonment rate', 'Average order value', 'Customer repeat rate'],
  },
  proptech: {
    emoji: '🏗️',
    tagline: 'Smart buildings and digital real estate',
    marketSize: '$18B',
    cagr: '15.8%',
    keyTrends: ['AI valuations', 'Fractional ownership', 'Smart building IoT', 'Short-term rental platforms'],
    keyMetrics: ['Deal velocity', 'Occupancy rate', 'Cost per lead', 'AUM under management'],
  },
  legaltech: {
    emoji: '⚖️',
    tagline: 'Automating legal work and access to justice',
    marketSize: '$27B',
    cagr: '9.5%',
    keyTrends: ['Contract AI', 'E-discovery automation', 'Legal AI assistants', 'Access-to-justice platforms'],
    keyMetrics: ['Hours saved per attorney', 'Contract review speed', 'Error reduction rate', 'Matter resolution time'],
  },
  cleantech: {
    emoji: '🌱',
    tagline: 'Technology for a net-zero future',
    marketSize: '$150B',
    cagr: '22.1%',
    keyTrends: ['Grid-scale storage', 'Carbon credit markets', 'EV infrastructure', 'Green hydrogen'],
    keyMetrics: ['Carbon offset per $ invested', 'Energy cost reduction %', 'Renewable penetration', 'Carbon credit price'],
  },
  saas: {
    emoji: '☁️',
    tagline: 'The backbone of the modern enterprise',
    marketSize: '$800B',
    cagr: '18.4%',
    keyTrends: ['AI-native SaaS', 'Usage-based pricing', 'Product-led growth', 'Vertical SaaS consolidation'],
    keyMetrics: ['ARR growth rate', 'Net Revenue Retention', 'CAC payback period', 'Magic Number'],
  },
  ai: {
    emoji: '🤖',
    tagline: 'Intelligence as infrastructure',
    marketSize: '$450B',
    cagr: '36.8%',
    keyTrends: ['Agentic AI', 'Multimodal models', 'AI at the edge', 'Compound AI systems'],
    keyMetrics: ['Token cost per query', 'Model accuracy benchmarks', 'Inference latency', 'Compute efficiency'],
  },
  cybersecurity: {
    emoji: '🔐',
    tagline: 'Zero trust in every system',
    marketSize: '$160B',
    cagr: '12.3%',
    keyTrends: ['AI-powered SOC', 'Zero Trust architecture', 'Supply chain security', 'Autonomous threat response'],
    keyMetrics: ['Mean time to detect (MTTD)', 'False positive rate', 'Patch velocity', 'Security posture score'],
  },
  mobility: {
    emoji: '🚗',
    tagline: 'Moving people and goods, intelligently',
    marketSize: '$70B',
    cagr: '11.7%',
    keyTrends: ['Autonomous Level 4 deployments', 'Fleet electrification', 'MaaS platforms', 'Last-mile logistics AI'],
    keyMetrics: ['Utilization rate', 'Cost per mile', 'On-time delivery %', 'Fleet downtime'],
  },
  foodtech: {
    emoji: '🍽️',
    tagline: 'The future of food production and delivery',
    marketSize: '$340B',
    cagr: '8.9%',
    keyTrends: ['Alt-protein scale-up', 'Ghost kitchen networks', 'Precision fermentation', 'Regenerative agriculture tech'],
    keyMetrics: ['Food waste reduction %', 'Order fulfillment time', 'Customer reorder rate', 'COGS as % of revenue'],
  },
  hrtech: {
    emoji: '👥',
    tagline: 'People intelligence and workforce automation',
    marketSize: '$30B',
    cagr: '10.4%',
    keyTrends: ['AI recruiting', 'Skills-based org design', 'Continuous performance management', 'Financial wellness benefits'],
    keyMetrics: ['Time-to-hire', 'Employee engagement score', 'Retention rate', 'Offer acceptance rate'],
  },
  martech: {
    emoji: '📣',
    tagline: 'Data-driven growth at every touchpoint',
    marketSize: '$500B',
    cagr: '14.9%',
    keyTrends: ['CDPs replacing DMPs', 'Cookieless attribution', 'Generative content at scale', 'Conversational commerce'],
    keyMetrics: ['ROAS', 'CAC by channel', 'Email open rate', 'Attribution window accuracy'],
  },
  gaming: {
    emoji: '🎮',
    tagline: 'Interactive entertainment and virtual worlds',
    marketSize: '$200B',
    cagr: '12.6%',
    keyTrends: ['Generative game content', 'Cloud gaming infrastructure', 'AI NPCs', 'Creator economy integration'],
    keyMetrics: ['DAU/MAU ratio', 'ARPU', 'Day-7 retention', 'Session length'],
  },
  spacetech: {
    emoji: '🚀',
    tagline: 'Humanity\'s expansion beyond Earth',
    marketSize: '$400B',
    cagr: '9.6%',
    keyTrends: ['Low-cost launch vehicles', 'Satellite mega-constellations', 'In-orbit servicing', 'Earth observation AI'],
    keyMetrics: ['Launch cost per kg to orbit', 'Satellite uptime %', 'Data latency', 'Revenue per satellite'],
  },
};

export function getIndustryKnowledge(name: string): IndustryKnowledge | null {
  const lower = name.toLowerCase().replace(/[^a-z]/g, '');
  const key = Object.keys(INDUSTRY_KNOWLEDGE).find(k => lower.includes(k) || k.includes(lower.slice(0, 5)));
  return key ? INDUSTRY_KNOWLEDGE[key] : null;
}

export interface SubdomainSignal {
  trend: string;
  hot: boolean;
}

// High-level market sizing hints per subdomain keyword
export const SUBDOMAIN_SIGNALS: Record<string, SubdomainSignal> = {
  payment: { trend: 'Embedded finance taking share from legacy rails', hot: true },
  banking: { trend: 'Open banking APIs commoditising core banking', hot: false },
  insurance: { trend: 'AI underwriting shrinking loss ratios', hot: true },
  wealth: { trend: 'Self-directed investing platforms growing fast', hot: false },
  lending: { trend: 'BNPL consolidation; credit AI replacing FICO', hot: true },
  health: { trend: 'Remote monitoring reimbursement expanding', hot: true },
  diagnostic: { trend: 'FDA clearing AI diagnostics at record pace', hot: true },
  therapy: { trend: 'Mental health SaaS CAC dropping with consumer demand', hot: true },
  genome: { trend: 'Whole-genome sequencing cost below $200', hot: false },
  drug: { trend: 'AI accelerating hit identification → IND timelines', hot: true },
  learning: { trend: 'Micro-credential acceptance rising in enterprise hiring', hot: true },
  corporate: { trend: 'CLO budgets shifting from LMS to AI coaching', hot: true },
  retail: { trend: 'AI merchandising delivering +15% AOV lifts', hot: false },
  logistics: { trend: 'Warehouse robotics ROI under 18 months now', hot: true },
  security: { trend: 'Identity-first security eating perimeter model', hot: true },
  cloud: { trend: 'CNAPP consolidating cloud security tools', hot: true },
  saas: { trend: 'Vertical SaaS outperforming horizontal peers 3×', hot: true },
  ai: { trend: 'AI-native SaaS achieving NRR above 120% consistently', hot: true },
  autonomous: { trend: 'Level 4 robotaxi deployments scaling in 3 cities', hot: true },
  energy: { trend: 'Grid-scale battery costs at $90/kWh — parity reached', hot: true },
  carbon: { trend: 'Voluntary carbon markets growing 40% YoY', hot: false },
  food: { trend: 'Ghost kitchens consolidating; alt-protein costs down 60%', hot: false },
  agri: { trend: 'Precision ag reducing input costs by 25–30%', hot: true },
  hr: { trend: 'Skills-based hiring shifting ATS from credential-first', hot: true },
  recruit: { trend: 'AI sourcing cutting time-to-hire by 40%', hot: true },
  marketing: { trend: 'CDPs replacing third-party cookie stacks entirely', hot: false },
  ad: { trend: 'Contextual targeting outperforming behavioural post-cookie', hot: true },
  gaming: { trend: 'Generative content studios cutting dev costs 50%', hot: true },
  space: { trend: 'LEO launch costs below $1,000/kg — opens new use cases', hot: true },
  legal: { trend: 'Contract AI cutting legal review time by 70%', hot: true },
  real: { trend: 'PropTech consolidating after 2024 correction', hot: false },
};

export function getSubdomainSignal(name: string): SubdomainSignal | null {
  const lower = name.toLowerCase();
  const key = Object.keys(SUBDOMAIN_SIGNALS).find(k => lower.includes(k));
  return key ? SUBDOMAIN_SIGNALS[key] : null;
}
