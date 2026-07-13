import type { CompanyRecord } from './schema';

export const REST_COMPANIES: Partial<CompanyRecord>[] = [
  /* ── INDUSTRY: ENERGY ── */
  {
    id: 'en-sol-1', name: 'First Solar', industryId: 'ind-energy', subdomain: 'Solar',
    country: 'USA', founded: 1999, stage: 'Public', isPublic: true, stockSymbol: 'FSLR', valuation: '15B',
    mrrUSD: 200000000, employees: 5000, investors: [],
    description: 'Manufacturer of solar panels and provider of utility-scale PV power plants.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'en-win-1', name: 'Vestas', industryId: 'ind-energy', subdomain: 'Wind',
    country: 'Denmark', founded: 1945, stage: 'Public', isPublic: true, stockSymbol: 'VWS', valuation: '30B',
    mrrUSD: 1000000000, employees: 29000, investors: [],
    description: 'Wind turbine manufacturer.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'en-stor-1', name: 'Fluence', industryId: 'ind-energy', subdomain: 'Storage',
    country: 'USA', founded: 2018, stage: 'Public', isPublic: true, stockSymbol: 'FLNC', valuation: '3B',
    mrrUSD: 50000000, employees: 1000, investors: ['Siemens', 'AES'],
    description: 'Energy storage products and services.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'en-ev-1', name: 'ChargePoint', industryId: 'ind-energy', subdomain: 'EV Infrastructure',
    country: 'USA', founded: 2007, stage: 'Public', isPublic: true, stockSymbol: 'CHPT', valuation: '0.6B',
    mrrUSD: 20000000, employees: 1500, investors: [],
    description: 'Electric vehicle charging network.', status: 'warning', offset3D: [4, 7, -8]
  },
  {
    id: 'en-clim-1', name: 'Climeworks', industryId: 'ind-energy', subdomain: 'Climate Tech',
    country: 'Switzerland', founded: 2009, stage: 'Series F', isPublic: false, valuation: '1.2B',
    mrrUSD: 5000000, employees: 300, investors: ['Partners Group', 'GIC'],
    description: 'Direct air capture technology to remove carbon dioxide from the air.', status: 'healthy', offset3D: [-5, -6, 5]
  },

  /* ── INDUSTRY: GOVERNMENT ── */
  {
    id: 'gov-def-1', name: 'Lockheed Martin', industryId: 'ind-government', subdomain: 'Defense',
    country: 'USA', founded: 1995, stage: 'Public', isPublic: true, stockSymbol: 'LMT', valuation: '100B',
    mrrUSD: 5000000000, employees: 116000, investors: [],
    description: 'Aerospace, arms, defense, information security, and technology corporation.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'gov-def-2', name: 'Palantir', industryId: 'ind-government', subdomain: 'Defense',
    country: 'USA', founded: 2003, stage: 'Public', isPublic: true, stockSymbol: 'PLTR', valuation: '40B',
    mrrUSD: 150000000, employees: 3000, investors: [],
    description: 'Software company that specializes in big data analytics.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'gov-gov-1', name: 'Tyler Technologies', industryId: 'ind-government', subdomain: 'Governance',
    country: 'USA', founded: 1966, stage: 'Public', isPublic: true, stockSymbol: 'TYL', valuation: '18B',
    mrrUSD: 100000000, employees: 7000, investors: [],
    description: 'Provider of software to the United States public sector.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'gov-civ-1', name: 'OpenGov', industryId: 'ind-government', subdomain: 'Civic Tech',
    country: 'USA', founded: 2012, stage: 'Private', isPublic: false, valuation: '1.8B',
    mrrUSD: 10000000, employees: 500, investors: ['Cox Enterprises'],
    description: 'Cloud software for government agencies.', status: 'healthy', offset3D: [8, 2, 2]
  },

  /* ── INDUSTRY: MOBILITY ── */
  {
    id: 'mob-avia-1', name: 'Boeing', industryId: 'ind-mobility', subdomain: 'Aviation',
    country: 'USA', founded: 1916, stage: 'Public', isPublic: true, stockSymbol: 'BA', valuation: '120B',
    mrrUSD: 6000000000, employees: 156000, investors: [],
    description: 'Multinational corporation that designs, manufactures, and sells airplanes.', status: 'warning', offset3D: [-7, 4, -5]
  },
  {
    id: 'mob-rail-1', name: 'Union Pacific', industryId: 'ind-mobility', subdomain: 'Rail',
    country: 'USA', founded: 1862, stage: 'Public', isPublic: true, stockSymbol: 'UNP', valuation: '140B',
    mrrUSD: 1500000000, employees: 30000, investors: [],
    description: 'Freight-hauling railroad that operates 8,300 locomotives.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'mob-log-1', name: 'Uber Freight', industryId: 'ind-mobility', subdomain: 'Logistics',
    country: 'USA', founded: 2017, stage: 'Subsidiary', isPublic: false, valuation: '3.3B',
    mrrUSD: 100000000, employees: 2000, investors: ['Uber', 'Greenbriar'],
    description: 'Freight matching app that connects shippers with carriers.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'mob-auto-1', name: 'Waymo', industryId: 'ind-mobility', subdomain: 'Automotive Mobility',
    country: 'USA', founded: 2009, stage: 'Subsidiary', isPublic: false, valuation: '30B',
    mrrUSD: 5000000, employees: 2500, investors: ['Alphabet', 'Andreessen Horowitz'],
    description: 'Autonomous driving technology company.', status: 'healthy', offset3D: [-5, -6, 5]
  },

  /* ── INDUSTRY: REAL ESTATE ── */
  {
    id: 're-res-1', name: 'Zillow', industryId: 'ind-realestate', subdomain: 'Residential',
    country: 'USA', founded: 2006, stage: 'Public', isPublic: true, stockSymbol: 'Z', valuation: '11B',
    mrrUSD: 150000000, employees: 6000, investors: [],
    description: 'Tech real-estate marketplace company.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 're-com-1', name: 'WeWork', industryId: 'ind-realestate', subdomain: 'Commercial',
    country: 'USA', founded: 2010, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 200000000, employees: 4000, investors: ['SoftBank'],
    description: 'Provider of coworking spaces.', status: 'critical', offset3D: [-4, 6, -3]
  },
  {
    id: 're-prop-1', name: 'Opendoor', industryId: 'ind-realestate', subdomain: 'Proptech',
    country: 'USA', founded: 2014, stage: 'Public', isPublic: true, stockSymbol: 'OPEN', valuation: '1.5B',
    mrrUSD: 200000000, employees: 2000, investors: [],
    description: 'Online company that buys and sells residential real estate.', status: 'warning', offset3D: [3, -5, 7]
  },

  /* ── INDUSTRY: AGRICULTURE ── */
  {
    id: 'ag-farm-1', name: 'Deere & Company', industryId: 'ind-agriculture', subdomain: 'Farming',
    country: 'USA', founded: 1837, stage: 'Public', isPublic: true, stockSymbol: 'DE', valuation: '110B',
    mrrUSD: 4000000000, employees: 82000, investors: [],
    description: 'Agricultural machinery.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'ag-agr-1', name: 'Indigo Ag', industryId: 'ind-agriculture', subdomain: 'Agri-tech',
    country: 'USA', founded: 2014, stage: 'Series F', isPublic: false, valuation: '3.5B',
    mrrUSD: 10000000, employees: 1000, investors: ['Flagship Pioneering'],
    description: 'Agricultural technology company that works with plant microbes.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'ag-food-1', name: 'Tyson Foods', industryId: 'ind-agriculture', subdomain: 'Food Processing',
    country: 'USA', founded: 1935, stage: 'Public', isPublic: true, stockSymbol: 'TSN', valuation: '20B',
    mrrUSD: 4000000000, employees: 142000, investors: [],
    description: 'Multinational corporation that operates in the food industry.', status: 'healthy', offset3D: [7, -3, -6]
  },

  /* ── Missing Energy ── */
  {
    id: 'en-cman-1', name: 'Carbon Engineering', industryId: 'ind-energy', subdomain: 'Carbon Management',
    country: 'Canada', founded: 2009, stage: 'Acquired', isPublic: false, valuation: '1.1B',
    mrrUSD: 5000000, employees: 150, investors: ['Oxy Low Carbon Ventures'],
    description: 'Direct Air Capture technology.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'en-wsys-1', name: 'Rubicon', industryId: 'ind-energy', subdomain: 'Waste Systems',
    country: 'USA', founded: 2008, stage: 'Public', isPublic: true, stockSymbol: 'RBT', valuation: '0.1B',
    mrrUSD: 20000000, employees: 400, investors: [],
    description: 'Software platform that provides smart waste and recycling solutions.', status: 'warning', offset3D: [3, -5, 7]
  },
  {
    id: 'en-wman-1', name: 'Waste Management', industryId: 'ind-energy', subdomain: 'Waste Management',
    country: 'USA', founded: 1968, stage: 'Public', isPublic: true, stockSymbol: 'WM', valuation: '80B',
    mrrUSD: 1500000000, employees: 48000, investors: [],
    description: 'Waste management, comprehensive waste, and environmental services.', status: 'healthy', offset3D: [8, 2, 2]
  },

  /* ── Missing Government ── */
  {
    id: 'gov-pol-1', name: 'FiscalNote', industryId: 'ind-government', subdomain: 'Public Policy',
    country: 'USA', founded: 2013, stage: 'Public', isPublic: true, stockSymbol: 'NOTE', valuation: '0.2B',
    mrrUSD: 10000000, employees: 700, investors: [],
    description: 'Software, data, and media company.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'gov-wel-1', name: 'Findhelp', industryId: 'ind-government', subdomain: 'Social Welfare',
    country: 'USA', founded: 2010, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 5000000, employees: 300, investors: [],
    description: 'Social care network connecting people to programs.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'gov-pubh-1', name: 'Cerner', industryId: 'ind-government', subdomain: 'Public Health Systems',
    country: 'USA', founded: 1979, stage: 'Acquired', isPublic: false, valuation: '28B',
    mrrUSD: 500000000, employees: 28000, investors: ['Oracle'],
    description: 'Supplier of health information technology services.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'gov-socs-1', name: 'Granicus', industryId: 'ind-government', subdomain: 'Social Systems',
    country: 'USA', founded: 1999, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 15000000, employees: 1000, investors: ['Vista Equity Partners'],
    description: 'Cloud-based platform empowering government to connect with citizens.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'gov-sust-1', name: 'Aclima', industryId: 'ind-government', subdomain: 'Sust Tech',
    country: 'USA', founded: 2010, stage: 'Series B', isPublic: false, valuation: 'N/A',
    mrrUSD: 2000000, employees: 100, investors: ['Clearvision Ventures'],
    description: 'Hyperlocal air quality and greenhouse gas measurement.', status: 'healthy', offset3D: [6, 5, 4]
  },

  /* ── Missing Mobility ── */
  {
    id: 'mob-ship-1', name: 'Flexport', industryId: 'ind-mobility', subdomain: 'Shipping',
    country: 'USA', founded: 2013, stage: 'Series E', isPublic: false, valuation: '8B',
    mrrUSD: 200000000, employees: 3000, investors: ['Founders Fund'],
    description: 'Digital freight forwarder.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'mob-trav-1', name: 'Amadeus', industryId: 'ind-mobility', subdomain: 'Travel Infrastructure',
    country: 'Spain', founded: 1987, stage: 'Public', isPublic: true, stockSymbol: 'AMADY', valuation: '30B',
    mrrUSD: 400000000, employees: 16000, investors: [],
    description: 'Major Spanish IT provider for the global travel and tourism industry.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'mob-del-1', name: 'DoorDash', industryId: 'ind-mobility', subdomain: 'Delivery Systems',
    country: 'USA', founded: 2013, stage: 'Public', isPublic: true, stockSymbol: 'DASH', valuation: '50B',
    mrrUSD: 600000000, employees: 16000, investors: [],
    description: 'Operates an online food ordering and food delivery platform.', status: 'healthy', offset3D: [8, 2, 2]
  },

  /* ── Missing Real Estate ── */
  {
    id: 're-cons-1', name: 'Procore', industryId: 'ind-realestate', subdomain: 'Construction',
    country: 'USA', founded: 2002, stage: 'Public', isPublic: true, stockSymbol: 'PCOR', valuation: '10B',
    mrrUSD: 60000000, employees: 3000, investors: [],
    description: 'Construction management software.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 're-fac-1', name: 'CBRE Group', industryId: 'ind-realestate', subdomain: 'Facility Management',
    country: 'USA', founded: 1906, stage: 'Public', isPublic: true, stockSymbol: 'CBRE', valuation: '25B',
    mrrUSD: 2000000000, employees: 115000, investors: [],
    description: 'Commercial real estate services and investment firm.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 're-smrt-1', name: 'Verkada', industryId: 'ind-realestate', subdomain: 'Smart Management',
    country: 'USA', founded: 2016, stage: 'Series D', isPublic: false, valuation: '3.2B',
    mrrUSD: 15000000, employees: 1500, investors: ['Sequoia', 'Meritech'],
    description: 'Cloud-based physical security systems.', status: 'healthy', offset3D: [4, 7, -8]
  },

  /* ── Missing Agriculture ── */
  {
    id: 'ag-fish-1', name: 'Mowi', industryId: 'ind-agriculture', subdomain: 'Fisheries',
    country: 'Norway', founded: 1964, stage: 'Public', isPublic: true, stockSymbol: 'MOWI', valuation: '10B',
    mrrUSD: 400000000, employees: 11000, investors: [],
    description: 'Norwegian seafood company with operations in a number of countries.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'ag-supp-1', name: 'Lineage Logistics', industryId: 'ind-agriculture', subdomain: 'Supply Delivery',
    country: 'USA', founded: 2008, stage: 'Private', isPublic: false, valuation: '18B',
    mrrUSD: 300000000, employees: 22000, investors: ['Bay Grove'],
    description: 'International warehousing and logistics management company.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'ag-mark-1', name: 'Farmers Business Network', industryId: 'ind-agriculture', subdomain: 'Market Discovery',
    country: 'USA', founded: 2014, stage: 'Series G', isPublic: false, valuation: '3.9B',
    mrrUSD: 20000000, employees: 800, investors: ['Google Ventures', 'Kleiner Perkins'],
    description: 'Farmer-to-farmer network and e-commerce platform.', status: 'healthy', offset3D: [-4, 6, -3]
  }
];
