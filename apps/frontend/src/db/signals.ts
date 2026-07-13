import type { SignalRecord } from './schema';

/* ================================================================
   Global market signals — placed at periphery of the 3D graph.
   affectedIndustries drives the edge connections.
================================================================ */

export const SIGNALS: SignalRecord[] = [
  {
    id: 'sig-market',
    label: 'Market Trends',
    description: 'India SaaS funding up 18% Q1 2025; AI-first SaaS multiples expanding',
    status: 'healthy',
    position3D: [40, 22, 28],
    affectedIndustries: ['ind-saas', 'ind-fintech', 'ind-ecommerce', 'ind-aiml'],
    edgeStrengths: { 'ind-saas': 0.8, 'ind-fintech': 0.6, 'ind-ecommerce': 0.6, 'ind-aiml': 0.7 },
  },
  {
    id: 'sig-regulation',
    label: 'Regulation',
    description: 'DPDP Act India 2023 enforcement begins; MeitY AI guidelines under review',
    status: 'warning',
    position3D: [-40, 22, 28],
    affectedIndustries: ['ind-fintech', 'ind-healthtech', 'ind-aiml', 'ind-saas'],
    affectedCompanies: ['comp-you'],
    edgeStrengths: { 'ind-fintech': 0.8, 'ind-healthtech': 0.6, 'ind-aiml': 0.7, 'ind-saas': 0.5, 'comp-you': 0.6 },
  },
  {
    id: 'sig-talent',
    label: 'Talent Market',
    description: 'Tier-2 tech talent costs down 12%; IIT/NIT grads increasing 22% YoY',
    status: 'healthy',
    position3D: [28, 25, -22],
    affectedIndustries: ['ind-saas', 'ind-aiml', 'ind-cyber', 'ind-space'],
    edgeStrengths: { 'ind-saas': 0.6, 'ind-aiml': 0.8, 'ind-cyber': 0.5, 'ind-space': 0.5 },
  },
  {
    id: 'sig-funding',
    label: 'Funding Climate',
    description: 'Seed deals +22% YoY; Series A median $8M; AI verticals oversubscribed',
    status: 'healthy',
    position3D: [-28, -25, 22],
    affectedIndustries: ['ind-saas', 'ind-aiml', 'ind-space', 'ind-cleantech'],
    edgeStrengths: { 'ind-saas': 0.7, 'ind-aiml': 0.9, 'ind-space': 0.6, 'ind-cleantech': 0.6 },
  },
  {
    id: 'sig-macro',
    label: 'Macro Economy',
    description: 'India GDP 7.2%; RBI repo at 6.5%; USD/INR stable at 83-84',
    status: 'healthy',
    position3D: [-40, -22, -28],
    affectedIndustries: ['ind-fintech', 'ind-ecommerce', 'ind-logistics', 'ind-proptech'],
    edgeStrengths: { 'ind-fintech': 0.7, 'ind-ecommerce': 0.6, 'ind-logistics': 0.5, 'ind-proptech': 0.5 },
  },
  {
    id: 'sig-tech-trend',
    label: 'Tech Disruption',
    description: 'GenAI adoption accelerating; agents replacing SaaS workflows; multimodal era',
    status: 'healthy',
    position3D: [35, -10, 35],
    affectedIndustries: ['ind-aiml', 'ind-saas', 'ind-edtech', 'ind-healthtech'],
    affectedCompanies: ['comp-you'],
    edgeStrengths: { 'ind-aiml': 0.9, 'ind-saas': 0.7, 'ind-edtech': 0.6, 'ind-healthtech': 0.5, 'comp-you': 0.5 },
  },
  {
    id: 'sig-geopolitics',
    label: 'Geopolitics',
    description: 'US-China trade tensions; India as China+1 supply chain hub; tariff volatility',
    status: 'warning',
    position3D: [-35, 10, -35],
    affectedIndustries: ['ind-fintech', 'ind-ecommerce', 'ind-logistics', 'ind-cleantech'],
    edgeStrengths: { 'ind-fintech': 0.6, 'ind-ecommerce': 0.5, 'ind-logistics': 0.6, 'ind-cleantech': 0.4 },
  },
  {
    id: 'sig-climate',
    label: 'Climate Policy',
    description: 'India 500GW renewable target 2030; PM Surya Ghar scheme; COP30 commitments',
    status: 'healthy',
    position3D: [25, 30, 30],
    affectedIndustries: ['ind-cleantech', 'ind-agritech', 'ind-logistics', 'ind-mobility'],
    edgeStrengths: { 'ind-cleantech': 0.9, 'ind-agritech': 0.6, 'ind-logistics': 0.4, 'ind-mobility': 0.5 },
  },
  {
    id: 'sig-ai-regulation',
    label: 'AI Governance',
    description: 'EU AI Act enforcement July 2025; India AIAG framework; G20 AI safety commitments',
    status: 'warning',
    position3D: [-25, -30, -30],
    affectedIndustries: ['ind-aiml', 'ind-saas', 'ind-healthtech', 'ind-fintech'],
    edgeStrengths: { 'ind-aiml': 0.9, 'ind-saas': 0.5, 'ind-healthtech': 0.5, 'ind-fintech': 0.5 },
  },
  {
    id: 'sig-consumer',
    label: 'Consumer Trends',
    description: 'India digital users 900M+; vernacular internet 600M; UPI 15B txns/month',
    status: 'healthy',
    position3D: [40, -22, 28],
    affectedIndustries: ['ind-ecommerce', 'ind-media', 'ind-gaming', 'ind-edtech', 'ind-fintech'],
    edgeStrengths: { 'ind-ecommerce': 0.8, 'ind-media': 0.8, 'ind-gaming': 0.7, 'ind-edtech': 0.6, 'ind-fintech': 0.6 },
  },
];

export const SIGNAL_MAP = new Map<string, SignalRecord>(
  SIGNALS.map(s => [s.id, s])
);
