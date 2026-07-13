/* ================================================================
   WorkOS — Database Schema
   Single source of truth for all industry, company, and signal data.
   The graph layer derives positions + colors from this.
================================================================ */

export type NodeStatus = 'healthy' | 'warning' | 'critical';
export type CompanyStage =
  | 'Idea' | 'Pre-seed' | 'Seed' | 'Series A' | 'Series B'
  | 'Series C' | 'Series D' | 'Series D+' | 'Series E' | 'Series F'
  | 'Series G' | 'Series H' | 'Series I' | 'Growth'
  | 'Pre-IPO' | 'Public' | 'PSU' | 'Bootstrapped'
  | 'Private' | 'Acquired' | 'Subsidiary';

export type Country =
  | 'India' | 'USA' | 'UK' | 'Brazil' | 'France' | 'Canada'
  | 'South Korea' | 'Australia' | 'Germany' | 'Singapore' | 'Global'
  | 'China' | 'Japan' | 'Israel' | 'Sweden' | 'Netherlands' | 'Denmark'
  | 'Norway' | 'Finland' | 'Switzerland' | 'Spain' | 'Ireland'
  | 'Taiwan' | 'Argentina' | 'Mexico' | 'UAE' | 'South Africa'
  | 'Indonesia' | 'Nigeria' | 'Italy' | 'Belgium' | 'Austria';

/* ---------------------------------------------------------------- */
/*  Industry                                                         */
/* ---------------------------------------------------------------- */
export interface IndustryRecord {
  id: string;                          // e.g. 'ind-technology'
  label: string;                       // display name
  description: string;                 // one-liner
  color: string;                       // hex — used for 3D globe tint
  position3D: [number, number, number]; // cluster center in 3D space
  bubbleRadius: number;                // wireframe sphere visual radius
  tags: string[];                      // e.g. ['b2b', 'india', 'global']
  subdomains: string[];                // e.g. ['AI', 'Cloud', 'Cybersecurity']
  coreLabel: string;                   // e.g. 'TECH CORE'
}

/* ---------------------------------------------------------------- */
/*  Company                                                          */
/* ---------------------------------------------------------------- */
export interface CompanyRecord {
  id: string;                           // unique graph node id
  name: string;
  industryId: string;                   // parent industry (e.g. 'ind-technology')
  subdomain?: string;                   // e.g. 'AI', 'Fintech', 'E-commerce'
  country: Country;
  founded: number;
  stage: CompanyStage;
  isPublic: boolean;
  stockSymbol?: string;
  valuation: string;                    // e.g. '7.5B', '200B', 'PSU'
  mrrUSD: number;                       // monthly revenue in USD
  employees: number;
  investors: string[];
  description: string;
  status: NodeStatus;
  offset3D: [number, number, number];   // relative to industry cluster center
}

/* ---------------------------------------------------------------- */
/*  Signal                                                           */
/* ---------------------------------------------------------------- */
export interface SignalRecord {
  id: string;
  label: string;
  description: string;
  status: NodeStatus;
  position3D: [number, number, number];  // absolute position in 3D space
  affectedIndustries: string[];          // industry ids
  affectedCompanies?: string[];          // company ids
  edgeStrengths?: Record<string, number>; // per-target strength override
}

/* ---------------------------------------------------------------- */
/*  Derived Graph Types (output of query layer)                      */
/* ---------------------------------------------------------------- */
export interface GraphLayoutConfig {
  CLUSTER_CENTER: Record<string, [number, number, number]>;
  BUBBLE_RADIUS: Record<string, number>;
  INDUSTRY_CLR: Record<string, string>;
  POS3D: Record<string, [number, number, number]>;
  COMPANY_INDUSTRY: Record<string, string>;
}
