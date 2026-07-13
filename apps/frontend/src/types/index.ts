export interface Department {
  name: string;
  size: number;
  hod: string;
  kpis: string[];
  aiAugmented: boolean;
}

export interface Metric {
  name: string;
  value: number;
  unit: string;
  change: number;
  percentile?: number;
}

export interface SimulationScenario {
  id: string;
  name: string;
  parameters: Record<string, number>;
  outcomes: Record<string, number>;
}

export interface BenchmarkData {
  metric: string;
  industry: string;
  stage: string;
  geography: string;
  percentiles: {
    P10: number;
    P25: number;
    P50: number;
    P75: number;
    P90: number;
  };
  currentValue: number;
}

export interface EnvironmentSignal {
  source: string;
  type: 'market' | 'competition' | 'regulation' | 'sentiment' | 'macro';
  title: string;
  impact: 'positive' | 'negative' | 'neutral';
  score: number;
  timestamp: string;
}

// --- Twin Graph Types ---

export interface TwinNode {
  id: string;
  label: string;
  type: 'industry' | 'company' | 'department' | 'signal' | 'kpi' | 'feature';
  children?: string[];
  metrics?: Record<string, number | string | null | undefined>;
  status?: 'healthy' | 'warning' | 'critical';
  description?: string;
  route?: string; // for feature nodes — navigates to this route on click
  icon?: string;  // lucide icon name for feature nodes
  // Live Supabase company fields
  _pos3D?: { x: number; y: number; z: number } | null;
  _industryId?: string;
}

export interface TwinEdge {
  from: string;
  to: string;
  strength: number; // 0-1
  label?: string;
}

// --- Task Types ---

export interface Task {
  id: string;
  title: string;
  department: string;
  status: 'running' | 'completed' | 'queued' | 'failed';
  progress: number; // 0-100
  assignee: string;
  aiPowered: boolean;
  startedAt: string;
  eta?: string;
}

// --- Simulation Decision Tree ---

export interface DecisionNode {
  id: string;
  label: string;
  probability: number;
  outcome: string;
  impact: number; // -100 to +100
  children?: DecisionNode[];
}

// --- Benchmark Cohort ---

export interface CohortComparison {
  dimension: string;
  you: number;
  cohortAvg: number;
  topQuartile: number;
}

export interface Integration {
  id: string;
  name: string;
  category: 'finance' | 'crm' | 'analytics' | 'project' | 'market' | 'social' | 'government';
  status: 'connected' | 'available' | 'coming-soon';
  description: string;
}

// --- Decision Flow Types ---

export interface DecisionOption {
  id: string;
  label: string;
  description: string;
  source: 'generated' | 'user-proposed';
  evaluation: {
    impact: number;       // -100 to 100
    risk: number;         // 0 to 100
    resources: number;    // 0 to 100 (effort)
    confidence: number;   // 0 to 100
    sensitivity: number;  // 0 to 100
  };
  rank?: number;
  dependencies: string[];
}

export interface Decision {
  id: string;
  title: string;
  origin: 'top-down' | 'bottom-up';
  department: string;
  proposedBy: string;
  status: 'draft' | 'evaluating' | 'ranked' | 'decided';
  options: DecisionOption[];
  selectedOption?: string;
  decidedBy?: string;
}

// --- Goal Types ---

export type FundingStage = 'FFF' | 'Seed' | 'Series A' | 'Series B' | 'Series C' | 'Series D' | 'Pre-IPO' | 'IPO';

export type GoalHorizon = 'daily' | 'weekly' | 'monthly' | 'stage';

export interface Goal {
  id: string;
  title: string;
  horizon: GoalHorizon;
  department: string;
  owner: string;
  source: 'user' | 'suggested' | 'cascaded' | 'simulator';
  status: 'active' | 'completed' | 'at-risk' | 'missed';
  progress: number;
  parentGoalId?: string;
  kpiLinked?: string;
  dueDate: string;
  crucial: boolean;
  fundingStage?: FundingStage;
}

export interface StageGoalRecommendation {
  stage: FundingStage;
  title: string;
  department: string;
  kpiLinked?: string;
  crucial: boolean;
  source: 'simulator';
}

// --- Tracked Metrics Types ---

export type MetricCategory = 'Growth' | 'Product' | 'Sales' | 'Finance' | 'Ops/People';
export type MetricDataSource = 'auto-ingested' | 'manual' | 'proxy';

export interface TrackedMetric {
  id: string;
  name: string;
  category: MetricCategory;
  value: number;
  unit: string;
  change: number;
  dataSource: MetricDataSource;
  integration?: string;
  trend: number[]; // last 12 data points
  target?: number;
  percentile?: number;
  description: string;
}

// --- VC & Mentor Connect Types ---

export type InvestorStage = 'angel' | 'seed' | 'series-a' | 'series-b' | 'growth';
export type InvestorStatus = 'prospect' | 'contacted' | 'in-discussion' | 'term-sheet' | 'committed' | 'passed';

export interface Investor {
  id: string;
  name: string;
  firm: string;
  stages: InvestorStage[];
  sectors: string[];
  avgTicket: string;
  status: InvestorStatus;
  lastContact?: string;
  nextFollowUp?: string;
  notes?: string;
  warmIntro: boolean;
  sharedDashboards: string[]; // metric ids shared with this investor
}

export interface InvestorUpdate {
  id: string;
  month: string;
  highlights: string[];
  metrics: Record<string, number>;
  asks: string[];
  sentTo: string[]; // investor ids
  status: 'draft' | 'sent';
}

export interface Mentor {
  id: string;
  name: string;
  expertise: string[];
  company?: string;
  role?: string;
  availability: 'weekly' | 'biweekly' | 'monthly' | 'on-demand';
  lastSession?: string;
  nextSession?: string;
}

export interface MentorSession {
  id: string;
  mentorId: string;
  date: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  agenda: string[];
  actions: string[];
  followUps: string[];
}

// --- Startup Network Types ---

export type ConnectionType = 'outsourcing' | 'partnership' | 'hiring-referral' | 'knowledge-exchange';
export type ConnectionStatus = 'active' | 'pending' | 'proposed';

export interface StartupPeer {
  id: string;
  name: string;
  stage: FundingStage;
  industry: string;
  teamSize: number;
  geography: string;
  strengths: string[];
  lookingFor: string[];
  optInBenchmark: boolean;
}

export interface PeerConnection {
  id: string;
  peerId: string;
  type: ConnectionType;
  status: ConnectionStatus;
  description: string;
  startedAt?: string;
}

export interface PeerBenchmark {
  metric: string;
  you: number;
  peerMedian: number;
  peerTop: number;
  unit: string;
  anonymised: boolean;
}
