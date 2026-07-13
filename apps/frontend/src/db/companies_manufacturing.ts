import type { CompanyRecord } from './schema';

export const MANUFACTURING_COMPANIES: Partial<CompanyRecord>[] = [
  /* ── Subdomain: Automotive ── */
  {
    id: 'mfg-auto-1', name: 'Tesla', industryId: 'ind-manufacturing', subdomain: 'Automotive',
    country: 'USA', founded: 2003, stage: 'Public', isPublic: true, stockSymbol: 'TSLA', valuation: '600B',
    mrrUSD: 5000000000, employees: 127000, investors: [],
    description: 'Electric vehicles, energy storage, and solar panels.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'mfg-auto-2', name: 'Rivian', industryId: 'ind-manufacturing', subdomain: 'Automotive',
    country: 'USA', founded: 2009, stage: 'Public', isPublic: true, stockSymbol: 'RIVN', valuation: '10B',
    mrrUSD: 200000000, employees: 14000, investors: ['Amazon', 'Ford'],
    description: 'Electric adventure vehicles and delivery vans.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'mfg-auto-3', name: 'Lucid Motors', industryId: 'ind-manufacturing', subdomain: 'Automotive',
    country: 'USA', founded: 2007, stage: 'Public', isPublic: true, stockSymbol: 'LCID', valuation: '6B',
    mrrUSD: 50000000, employees: 7000, investors: ['PIF'],
    description: 'Luxury electric vehicles.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'mfg-auto-4', name: 'NIO', industryId: 'ind-manufacturing', subdomain: 'Automotive',
    country: 'China', founded: 2014, stage: 'Public', isPublic: true, stockSymbol: 'NIO', valuation: '12B',
    mrrUSD: 600000000, employees: 26000, investors: ['Tencent', 'Baillie Gifford'],
    description: 'Smart electric vehicles with battery swapping technology.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'mfg-auto-5', name: 'BYD', industryId: 'ind-manufacturing', subdomain: 'Automotive',
    country: 'China', founded: 1995, stage: 'Public', isPublic: true, stockSymbol: 'BYDDY', valuation: '70B',
    mrrUSD: 5000000000, employees: 570000, investors: ['Berkshire Hathaway'],
    description: 'Electric vehicles, batteries, and electronics.', status: 'healthy', offset3D: [-5, -6, 5]
  },

  /* ── Subdomain: Electronics ── */
  {
    id: 'mfg-elec-1', name: 'Foxconn', industryId: 'ind-manufacturing', subdomain: 'Electronics',
    country: 'Taiwan', founded: 1974, stage: 'Public', isPublic: true, stockSymbol: 'HNHPF', valuation: '60B',
    mrrUSD: 15000000000, employees: 1200000, investors: [],
    description: 'Largest electronics contract manufacturer in the world.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'mfg-elec-2', name: 'TSMC', industryId: 'ind-manufacturing', subdomain: 'Electronics',
    country: 'Taiwan', founded: 1987, stage: 'Public', isPublic: true, stockSymbol: 'TSM', valuation: '700B',
    mrrUSD: 6000000000, employees: 73000, investors: [],
    description: 'World\'s most valuable semiconductor foundry.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'mfg-elec-3', name: 'Flex', industryId: 'ind-manufacturing', subdomain: 'Electronics',
    country: 'Singapore', founded: 1969, stage: 'Public', isPublic: true, stockSymbol: 'FLEX', valuation: '10B',
    mrrUSD: 2000000000, employees: 170000, investors: [],
    description: 'Global supply chain and manufacturing solutions.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'mfg-elec-4', name: 'Jabil', industryId: 'ind-manufacturing', subdomain: 'Electronics',
    country: 'USA', founded: 1966, stage: 'Public', isPublic: true, stockSymbol: 'JBL', valuation: '15B',
    mrrUSD: 2500000000, employees: 250000, investors: [],
    description: 'Electronic manufacturing services.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'mfg-elec-5', name: 'Samsung Electronics', industryId: 'ind-manufacturing', subdomain: 'Electronics',
    country: 'South Korea', founded: 1969, stage: 'Public', isPublic: true, stockSymbol: 'SSNLF', valuation: '300B',
    mrrUSD: 18000000000, employees: 260000, investors: [],
    description: 'Consumer electronics, semiconductors, and telecommunications.', status: 'healthy', offset3D: [-7, 4, -5]
  },

  /* ── Subdomain: Industrial Machinery ── */
  {
    id: 'mfg-indm-1', name: 'Caterpillar', industryId: 'ind-manufacturing', subdomain: 'Industrial Machinery',
    country: 'USA', founded: 1925, stage: 'Public', isPublic: true, stockSymbol: 'CAT', valuation: '150B',
    mrrUSD: 5000000000, employees: 109000, investors: [],
    description: 'Construction and mining equipment.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'mfg-indm-2', name: 'John Deere', industryId: 'ind-manufacturing', subdomain: 'Industrial Machinery',
    country: 'USA', founded: 1837, stage: 'Public', isPublic: true, stockSymbol: 'DE', valuation: '110B',
    mrrUSD: 4000000000, employees: 82000, investors: [],
    description: 'Agricultural, construction, and forestry machinery.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'mfg-indm-3', name: 'Siemens', industryId: 'ind-manufacturing', subdomain: 'Industrial Machinery',
    country: 'Germany', founded: 1847, stage: 'Public', isPublic: true, stockSymbol: 'SIE', valuation: '130B',
    mrrUSD: 6000000000, employees: 311000, investors: [],
    description: 'Industrial manufacturing and automation.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'mfg-indm-4', name: 'Hitachi', industryId: 'ind-manufacturing', subdomain: 'Industrial Machinery',
    country: 'Japan', founded: 1910, stage: 'Public', isPublic: true, stockSymbol: 'HTHIY', valuation: '80B',
    mrrUSD: 7000000000, employees: 368000, investors: [],
    description: 'IT, electronics, and industrial machinery.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'mfg-indm-5', name: 'Komatsu', industryId: 'ind-manufacturing', subdomain: 'Industrial Machinery',
    country: 'Japan', founded: 1921, stage: 'Public', isPublic: true, stockSymbol: 'KMTUY', valuation: '30B',
    mrrUSD: 2000000000, employees: 62000, investors: [],
    description: 'Construction, mining, forestry, and military equipment.', status: 'healthy', offset3D: [-4, 6, -3]
  },

  /* ── Subdomain: Consumer Goods ── */
  {
    id: 'mfg-cons-1', name: 'Procter & Gamble', industryId: 'ind-manufacturing', subdomain: 'Consumer Goods',
    country: 'USA', founded: 1837, stage: 'Public', isPublic: true, stockSymbol: 'PG', valuation: '350B',
    mrrUSD: 6000000000, employees: 106000, investors: [],
    description: 'Multinational consumer goods corporation.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'mfg-cons-2', name: 'Unilever', industryId: 'ind-manufacturing', subdomain: 'Consumer Goods',
    country: 'UK', founded: 1929, stage: 'Public', isPublic: true, stockSymbol: 'UL', valuation: '120B',
    mrrUSD: 5000000000, employees: 148000, investors: [],
    description: 'Food, condiments, ice cream, wellbeing vitamins, minerals and supplements.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'mfg-cons-3', name: 'Nestlé', industryId: 'ind-manufacturing', subdomain: 'Consumer Goods',
    country: 'Switzerland', founded: 1866, stage: 'Public', isPublic: true, stockSymbol: 'NSRGY', valuation: '300B',
    mrrUSD: 8000000000, employees: 275000, investors: [],
    description: 'Multinational food and drink processing conglomerate.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'mfg-cons-4', name: 'PepsiCo', industryId: 'ind-manufacturing', subdomain: 'Consumer Goods',
    country: 'USA', founded: 1965, stage: 'Public', isPublic: true, stockSymbol: 'PEP', valuation: '230B',
    mrrUSD: 7000000000, employees: 315000, investors: [],
    description: 'Multinational food, snack, and beverage corporation.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'mfg-cons-5', name: 'Coca-Cola', industryId: 'ind-manufacturing', subdomain: 'Consumer Goods',
    country: 'USA', founded: 1892, stage: 'Public', isPublic: true, stockSymbol: 'KO', valuation: '260B',
    mrrUSD: 3000000000, employees: 82000, investors: [],
    description: 'Beverage corporation and manufacturer.', status: 'healthy', offset3D: [4, 7, -8]
  },

  /* ── Subdomain: Textiles ── */
  {
    id: 'mfg-text-1', name: 'Inditex', industryId: 'ind-manufacturing', subdomain: 'Textiles',
    country: 'Spain', founded: 1985, stage: 'Public', isPublic: true, stockSymbol: 'IDEXY', valuation: '140B',
    mrrUSD: 3000000000, employees: 165000, investors: [],
    description: 'Multinational clothing company, owner of Zara.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'mfg-text-2', name: 'H&M', industryId: 'ind-manufacturing', subdomain: 'Textiles',
    country: 'Sweden', founded: 1947, stage: 'Public', isPublic: true, stockSymbol: 'HNNMY', valuation: '25B',
    mrrUSD: 2000000000, employees: 107000, investors: [],
    description: 'Multinational clothing-retail company.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'mfg-text-3', name: 'Nike', industryId: 'ind-manufacturing', subdomain: 'Textiles',
    country: 'USA', founded: 1964, stage: 'Public', isPublic: true, stockSymbol: 'NKE', valuation: '150B',
    mrrUSD: 4000000000, employees: 83000, investors: [],
    description: 'Athletic footwear, apparel, equipment, and accessories.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'mfg-text-4', name: 'Adidas', industryId: 'ind-manufacturing', subdomain: 'Textiles',
    country: 'Germany', founded: 1949, stage: 'Public', isPublic: true, stockSymbol: 'ADDYY', valuation: '40B',
    mrrUSD: 2000000000, employees: 59000, investors: [],
    description: 'Sports shoes, clothing, and accessories.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'mfg-text-5', name: 'LVMH', industryId: 'ind-manufacturing', subdomain: 'Textiles',
    country: 'France', founded: 1987, stage: 'Public', isPublic: true, stockSymbol: 'LVMUY', valuation: '400B',
    mrrUSD: 7000000000, employees: 196000, investors: [],
    description: 'Luxury goods conglomerate.', status: 'healthy', offset3D: [8, 2, 2]
  },

  /* ── Subdomain: Supply Chain Systems ── */
  {
    id: 'mfg-supc-1', name: 'Flexport', industryId: 'ind-manufacturing', subdomain: 'Supply Chain Systems',
    country: 'USA', founded: 2013, stage: 'Series E', isPublic: false, valuation: '8B',
    mrrUSD: 200000000, employees: 3000, investors: ['Founders Fund', 'Andreessen Horowitz'],
    description: 'Digital freight forwarder and customs broker.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'mfg-supc-2', name: 'Project44', industryId: 'ind-manufacturing', subdomain: 'Supply Chain Systems',
    country: 'USA', founded: 2014, stage: 'Series F', isPublic: false, valuation: '2.4B',
    mrrUSD: 10000000, employees: 1200, investors: ['TPG', 'Goldman Sachs'],
    description: 'Advanced visibility platform for shippers and logistics service providers.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'mfg-supc-3', name: 'FourKites', industryId: 'ind-manufacturing', subdomain: 'Supply Chain Systems',
    country: 'USA', founded: 2014, stage: 'Series D', isPublic: false, valuation: '1B',
    mrrUSD: 8000000, employees: 1000, investors: ['Bain Capital Ventures', 'Sequoia'],
    description: 'Real-time supply chain visibility platform.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'mfg-supc-4', name: 'Stord', industryId: 'ind-manufacturing', subdomain: 'Supply Chain Systems',
    country: 'USA', founded: 2015, stage: 'Series D', isPublic: false, valuation: '1.3B',
    mrrUSD: 5000000, employees: 700, investors: ['Kleiner Perkins', 'Founders Fund'],
    description: 'Cloud supply chain platform offering fulfillment and logistics.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'mfg-supc-5', name: 'Shippo', industryId: 'ind-manufacturing', subdomain: 'Supply Chain Systems',
    country: 'USA', founded: 2013, stage: 'Series E', isPublic: false, valuation: '1B',
    mrrUSD: 4000000, employees: 300, investors: ['Bessemer Venture Partners', 'Union Square Ventures'],
    description: 'Multi-carrier shipping software for e-commerce.', status: 'healthy', offset3D: [6, 5, 4]
  },

  /* ── Subdomain: Heavy Industry ── */
  {
    id: 'mfg-heav-1', name: 'ArcelorMittal', industryId: 'ind-manufacturing', subdomain: 'Heavy Industry',
    country: 'Global', founded: 2006, stage: 'Public', isPublic: true, stockSymbol: 'MT', valuation: '25B',
    mrrUSD: 6000000000, employees: 154000, investors: [],
    description: 'Multinational steel manufacturing corporation.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'mfg-heav-2', name: 'Nippon Steel', industryId: 'ind-manufacturing', subdomain: 'Heavy Industry',
    country: 'Japan', founded: 2012, stage: 'Public', isPublic: true, stockSymbol: 'NPSCY', valuation: '20B',
    mrrUSD: 4000000000, employees: 106000, investors: [],
    description: 'Major steel manufacturer.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'mfg-heav-3', name: 'POSCO', industryId: 'ind-manufacturing', subdomain: 'Heavy Industry',
    country: 'South Korea', founded: 1968, stage: 'Public', isPublic: true, stockSymbol: 'PKX', valuation: '22B',
    mrrUSD: 5000000000, employees: 35000, investors: [],
    description: 'Steel-making company.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'mfg-heav-4', name: 'ThyssenKrupp', industryId: 'ind-manufacturing', subdomain: 'Heavy Industry',
    country: 'Germany', founded: 1999, stage: 'Public', isPublic: true, stockSymbol: 'TKAMY', valuation: '5B',
    mrrUSD: 3000000000, employees: 96000, investors: [],
    description: 'Industrial engineering and steel production.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'mfg-heav-5', name: 'BHP', industryId: 'ind-manufacturing', subdomain: 'Heavy Industry',
    country: 'Australia', founded: 1885, stage: 'Public', isPublic: true, stockSymbol: 'BHP', valuation: '140B',
    mrrUSD: 4500000000, employees: 80000, investors: [],
    description: 'Multinational mining, metals and petroleum public company.', status: 'healthy', offset3D: [7, -3, -6]
  }
];
