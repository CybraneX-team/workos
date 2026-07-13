import type { CompanyRecord } from './schema';

export const FINANCE_COMPANIES: Partial<CompanyRecord>[] = [
  /* ── Subdomain: Fintech ── */
  {
    id: 'fin-fintech-1', name: 'Stripe', industryId: 'ind-finance', subdomain: 'Fintech',
    country: 'USA', founded: 2010, stage: 'Series I', isPublic: false, valuation: '65B',
    mrrUSD: 500000000, employees: 7000, investors: ['Sequoia', 'Andreessen Horowitz'],
    description: 'Financial infrastructure platform for the internet.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'fin-fintech-2', name: 'Plaid', industryId: 'ind-finance', subdomain: 'Fintech',
    country: 'USA', founded: 2013, stage: 'Series D', isPublic: false, valuation: '13.4B',
    mrrUSD: 100000000, employees: 1200, investors: ['Index Ventures', 'Kleiner Perkins'],
    description: 'Data network powering the fintech tools.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'fin-fintech-3', name: 'Square', industryId: 'ind-finance', subdomain: 'Fintech',
    country: 'USA', founded: 2009, stage: 'Public', isPublic: true, stockSymbol: 'SQ', valuation: '40B',
    mrrUSD: 600000000, employees: 8500, investors: [],
    description: 'Financial services and mobile payment company.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'fin-fintech-4', name: 'Revolut', industryId: 'ind-finance', subdomain: 'Fintech',
    country: 'UK', founded: 2015, stage: 'Series E', isPublic: false, valuation: '33B',
    mrrUSD: 200000000, employees: 6000, investors: ['Tiger Global', 'SoftBank'],
    description: 'Global financial superapp.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'fin-fintech-5', name: 'Chime', industryId: 'ind-finance', subdomain: 'Fintech',
    country: 'USA', founded: 2013, stage: 'Series G', isPublic: false, valuation: '25B',
    mrrUSD: 150000000, employees: 1300, investors: ['Sequoia', 'Tiger Global'],
    description: 'Financial technology company providing fee-free banking services.', status: 'healthy', offset3D: [-5, -6, 5]
  },

  /* ── Subdomain: Banking ── */
  {
    id: 'fin-banking-1', name: 'Monzo', industryId: 'ind-finance', subdomain: 'Banking',
    country: 'UK', founded: 2015, stage: 'Series H', isPublic: false, valuation: '4.5B',
    mrrUSD: 40000000, employees: 2500, investors: ['Passion Capital', 'Tencent'],
    description: 'Online bank based in the United Kingdom.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'fin-banking-2', name: 'N26', industryId: 'ind-finance', subdomain: 'Banking',
    country: 'Germany', founded: 2013, stage: 'Series E', isPublic: false, valuation: '9B',
    mrrUSD: 50000000, employees: 1500, investors: ['Valar Ventures', 'Insight Partners'],
    description: 'Mobile bank operating across Europe.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'fin-banking-3', name: 'Starling Bank', industryId: 'ind-finance', subdomain: 'Banking',
    country: 'UK', founded: 2014, stage: 'Growth', isPublic: false, valuation: '3.3B',
    mrrUSD: 35000000, employees: 2000, investors: ['Fidelity', 'Goldman Sachs'],
    description: 'Digital challenger bank based in the UK.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'fin-banking-4', name: 'Varo', industryId: 'ind-finance', subdomain: 'Banking',
    country: 'USA', founded: 2015, stage: 'Series E', isPublic: false, valuation: '2.5B',
    mrrUSD: 20000000, employees: 800, investors: ['Warburg Pincus', 'TPG'],
    description: 'First all-digital, nationally chartered US consumer bank.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'fin-banking-5', name: 'NuBank', industryId: 'ind-finance', subdomain: 'Banking',
    country: 'Brazil', founded: 2013, stage: 'Public', isPublic: true, stockSymbol: 'NU', valuation: '45B',
    mrrUSD: 400000000, employees: 7000, investors: ['Sequoia', 'Tencent'],
    description: 'Largest fintech bank in Latin America.', status: 'healthy', offset3D: [-7, 4, -5]
  },

  /* ── Subdomain: Insurance ── */
  {
    id: 'fin-insur-1', name: 'Lemonade', industryId: 'ind-finance', subdomain: 'Insurance',
    country: 'USA', founded: 2015, stage: 'Public', isPublic: true, stockSymbol: 'LMND', valuation: '1.2B',
    mrrUSD: 25000000, employees: 1000, investors: [],
    description: 'Insurance company powered by artificial intelligence.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'fin-insur-2', name: 'Oscar Health', industryId: 'ind-finance', subdomain: 'Insurance',
    country: 'USA', founded: 2012, stage: 'Public', isPublic: true, stockSymbol: 'OSCR', valuation: '4B',
    mrrUSD: 100000000, employees: 2000, investors: [],
    description: 'Technology-focused health insurance company.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'fin-insur-3', name: 'Root Insurance', industryId: 'ind-finance', subdomain: 'Insurance',
    country: 'USA', founded: 2015, stage: 'Public', isPublic: true, stockSymbol: 'ROOT', valuation: '1B',
    mrrUSD: 20000000, employees: 900, investors: [],
    description: 'Automobile insurance company based on driver behavior.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'fin-insur-4', name: 'Policygenius', industryId: 'ind-finance', subdomain: 'Insurance',
    country: 'USA', founded: 2014, stage: 'Series E', isPublic: false, valuation: '1B',
    mrrUSD: 15000000, employees: 600, investors: ['KKR', 'Norwest'],
    description: 'Online insurance marketplace.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'fin-insur-5', name: 'Hippo', industryId: 'ind-finance', subdomain: 'Insurance',
    country: 'USA', founded: 2015, stage: 'Public', isPublic: true, stockSymbol: 'HIPO', valuation: '400M',
    mrrUSD: 10000000, employees: 500, investors: [],
    description: 'Home insurance company focusing on proactive protection.', status: 'healthy', offset3D: [-4, 6, -3]
  },

  /* ── Subdomain: Investing ── */
  {
    id: 'fin-inv-1', name: 'Robinhood', industryId: 'ind-finance', subdomain: 'Investing',
    country: 'USA', founded: 2013, stage: 'Public', isPublic: true, stockSymbol: 'HOOD', valuation: '15B',
    mrrUSD: 150000000, employees: 3200, investors: [],
    description: 'Pioneer of commission-free investing.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'fin-inv-2', name: 'Wealthfront', industryId: 'ind-finance', subdomain: 'Investing',
    country: 'USA', founded: 2008, stage: 'Series E', isPublic: false, valuation: '1.4B',
    mrrUSD: 12000000, employees: 300, investors: ['Benchmark', 'Spark Capital'],
    description: 'Automated investment service.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'fin-inv-3', name: 'Betterment', industryId: 'ind-finance', subdomain: 'Investing',
    country: 'USA', founded: 2008, stage: 'Series F', isPublic: false, valuation: '1.3B',
    mrrUSD: 15000000, employees: 400, investors: ['Bessemer', 'Kinnevik'],
    description: 'Smart money manager and independent robo-advisor.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'fin-inv-4', name: 'eToro', industryId: 'ind-finance', subdomain: 'Investing',
    country: 'Israel', founded: 2007, stage: 'Growth', isPublic: false, valuation: '8.8B',
    mrrUSD: 100000000, employees: 3200, investors: ['SoftBank', 'Spark Capital'],
    description: 'Social trading and multi-asset brokerage company.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'fin-inv-5', name: 'Acorns', industryId: 'ind-finance', subdomain: 'Investing',
    country: 'USA', founded: 2012, stage: 'Series F', isPublic: false, valuation: '1.9B',
    mrrUSD: 10000000, employees: 500, investors: ['PayPal', 'BlackRock'],
    description: 'Micro-investing app that invests spare change.', status: 'healthy', offset3D: [4, 7, -8]
  },

  /* ── Subdomain: Trading ── */
  {
    id: 'fin-trad-1', name: 'Coinbase', industryId: 'ind-finance', subdomain: 'Trading',
    country: 'USA', founded: 2012, stage: 'Public', isPublic: true, stockSymbol: 'COIN', valuation: '45B',
    mrrUSD: 250000000, employees: 4500, investors: [],
    description: 'Secure platform for buying, selling, and storing cryptocurrency.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'fin-trad-2', name: 'Kraken', industryId: 'ind-finance', subdomain: 'Trading',
    country: 'USA', founded: 2011, stage: 'Growth', isPublic: false, valuation: '10.8B',
    mrrUSD: 100000000, employees: 3000, investors: ['Hummingbird', 'Tribe Capital'],
    description: 'Cryptocurrency exchange and bank.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'fin-trad-3', name: 'Binance', industryId: 'ind-finance', subdomain: 'Trading',
    country: 'Global', founded: 2017, stage: 'Private', isPublic: false, valuation: '40B',
    mrrUSD: 300000000, employees: 8000, investors: ['Vertex', 'Sequoia'],
    description: 'Largest cryptocurrency exchange by trading volume.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'fin-trad-4', name: 'Gemini', industryId: 'ind-finance', subdomain: 'Trading',
    country: 'USA', founded: 2014, stage: 'Growth', isPublic: false, valuation: '7.1B',
    mrrUSD: 50000000, employees: 1000, investors: ['Morgan Creek'],
    description: 'Crypto exchange and custodian.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'fin-trad-5', name: 'Interactive Brokers', industryId: 'ind-finance', subdomain: 'Trading',
    country: 'USA', founded: 1978, stage: 'Public', isPublic: true, stockSymbol: 'IBKR', valuation: '35B',
    mrrUSD: 200000000, employees: 2500, investors: [],
    description: 'Multinational electronic brokerage firm.', status: 'healthy', offset3D: [8, 2, 2]
  },

  /* ── Subdomain: Asset Management ── */
  {
    id: 'fin-am-1', name: 'BlackRock', industryId: 'ind-finance', subdomain: 'Asset Management',
    country: 'USA', founded: 1988, stage: 'Public', isPublic: true, stockSymbol: 'BLK', valuation: '120B',
    mrrUSD: 1500000000, employees: 18000, investors: [],
    description: 'Multinational investment management corporation.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'fin-am-2', name: 'Vanguard', industryId: 'ind-finance', subdomain: 'Asset Management',
    country: 'USA', founded: 1975, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 1000000000, employees: 18800, investors: [],
    description: 'Registered investment advisor and mutually owned company.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'fin-am-3', name: 'Fidelity', industryId: 'ind-finance', subdomain: 'Asset Management',
    country: 'USA', founded: 1946, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 2000000000, employees: 65000, investors: [],
    description: 'Multinational financial services corporation.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'fin-am-4', name: 'State Street', industryId: 'ind-finance', subdomain: 'Asset Management',
    country: 'USA', founded: 1792, stage: 'Public', isPublic: true, stockSymbol: 'STT', valuation: '22B',
    mrrUSD: 500000000, employees: 39000, investors: [],
    description: 'Financial services and bank holding company.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'fin-am-5', name: 'Charles Schwab', industryId: 'ind-finance', subdomain: 'Asset Management',
    country: 'USA', founded: 1971, stage: 'Public', isPublic: true, stockSymbol: 'SCHW', valuation: '130B',
    mrrUSD: 1000000000, employees: 32000, investors: [],
    description: 'Multinational financial services company.', status: 'healthy', offset3D: [6, 5, 4]
  },

  /* ── Subdomain: Lending ── */
  {
    id: 'fin-lend-1', name: 'SoFi', industryId: 'ind-finance', subdomain: 'Lending',
    country: 'USA', founded: 2011, stage: 'Public', isPublic: true, stockSymbol: 'SOFI', valuation: '7B',
    mrrUSD: 80000000, employees: 4000, investors: [],
    description: 'Personal finance company and online bank.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'fin-lend-2', name: 'Affirm', industryId: 'ind-finance', subdomain: 'Lending',
    country: 'USA', founded: 2012, stage: 'Public', isPublic: true, stockSymbol: 'AFRM', valuation: '8B',
    mrrUSD: 100000000, employees: 2000, investors: [],
    description: 'Financial technology company providing buy now, pay later services.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'fin-lend-3', name: 'Upstart', industryId: 'ind-finance', subdomain: 'Lending',
    country: 'USA', founded: 2012, stage: 'Public', isPublic: true, stockSymbol: 'UPST', valuation: '2.5B',
    mrrUSD: 50000000, employees: 1500, investors: [],
    description: 'AI lending platform.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'fin-lend-4', name: 'LendingClub', industryId: 'ind-finance', subdomain: 'Lending',
    country: 'USA', founded: 2006, stage: 'Public', isPublic: true, stockSymbol: 'LC', valuation: '1B',
    mrrUSD: 40000000, employees: 1200, investors: [],
    description: 'Peer-to-peer lending company.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'fin-lend-5', name: 'Klarna', industryId: 'ind-finance', subdomain: 'Lending',
    country: 'Sweden', founded: 2005, stage: 'Series H', isPublic: false, valuation: '6.7B',
    mrrUSD: 150000000, employees: 5000, investors: ['Sequoia', 'Silver Lake'],
    description: 'Fintech company that provides online financial services such as payments for online storefronts.', status: 'healthy', offset3D: [7, -3, -6]
  }
];
