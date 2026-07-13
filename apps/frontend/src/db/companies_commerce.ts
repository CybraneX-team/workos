import type { CompanyRecord } from './schema';

export const COMMERCE_COMPANIES: Partial<CompanyRecord>[] = [
  /* ── Subdomain: E-commerce ── */
  {
    id: 'com-ecom-1', name: 'Amazon', industryId: 'ind-commerce', subdomain: 'E-commerce',
    country: 'USA', founded: 1994, stage: 'Public', isPublic: true, stockSymbol: 'AMZN', valuation: '1.8T',
    mrrUSD: 40000000000, employees: 1540000, investors: [],
    description: 'Multinational technology company focusing on e-commerce, cloud computing, online advertising, digital streaming, and AI.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'com-ecom-2', name: 'Alibaba', industryId: 'ind-commerce', subdomain: 'E-commerce',
    country: 'China', founded: 1999, stage: 'Public', isPublic: true, stockSymbol: 'BABA', valuation: '200B',
    mrrUSD: 10000000000, employees: 235000, investors: [],
    description: 'Multinational technology company specializing in e-commerce, retail, Internet, and technology.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'com-ecom-3', name: 'Shopify', industryId: 'ind-commerce', subdomain: 'E-commerce',
    country: 'Canada', founded: 2006, stage: 'Public', isPublic: true, stockSymbol: 'SHOP', valuation: '90B',
    mrrUSD: 500000000, employees: 11000, investors: [],
    description: 'Multinational e-commerce company.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'com-ecom-4', name: 'Mercado Libre', industryId: 'ind-commerce', subdomain: 'E-commerce',
    country: 'Argentina', founded: 1999, stage: 'Public', isPublic: true, stockSymbol: 'MELI', valuation: '80B',
    mrrUSD: 900000000, employees: 39000, investors: [],
    description: 'Operating online marketplaces dedicated to e-commerce and online auctions.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'com-ecom-5', name: 'JD.com', industryId: 'ind-commerce', subdomain: 'E-commerce',
    country: 'China', founded: 1998, stage: 'Public', isPublic: true, stockSymbol: 'JD', valuation: '40B',
    mrrUSD: 12000000000, employees: 450000, investors: [],
    description: 'E-commerce company headquartered in Beijing.', status: 'healthy', offset3D: [-5, -6, 5]
  },

  /* ── Subdomain: Retail ── */
  {
    id: 'com-ret-1', name: 'Walmart', industryId: 'ind-commerce', subdomain: 'Retail',
    country: 'USA', founded: 1962, stage: 'Public', isPublic: true, stockSymbol: 'WMT', valuation: '480B',
    mrrUSD: 50000000000, employees: 2100000, investors: [],
    description: 'Multinational retail corporation that operates a chain of hypermarkets.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'com-ret-2', name: 'Costco', industryId: 'ind-commerce', subdomain: 'Retail',
    country: 'USA', founded: 1983, stage: 'Public', isPublic: true, stockSymbol: 'COST', valuation: '320B',
    mrrUSD: 19000000000, employees: 300000, investors: [],
    description: 'Multinational corporation which operates a chain of membership-only big-box retail stores.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'com-ret-3', name: 'Target', industryId: 'ind-commerce', subdomain: 'Retail',
    country: 'USA', founded: 1902, stage: 'Public', isPublic: true, stockSymbol: 'TGT', valuation: '70B',
    mrrUSD: 9000000000, employees: 440000, investors: [],
    description: 'Big box department store chain.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'com-ret-4', name: 'IKEA', industryId: 'ind-commerce', subdomain: 'Retail',
    country: 'Sweden', founded: 1943, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 3500000000, employees: 231000, investors: [],
    description: 'Multinational conglomerate that designs and sells ready-to-assemble furniture.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'com-ret-5', name: 'Home Depot', industryId: 'ind-commerce', subdomain: 'Retail',
    country: 'USA', founded: 1978, stage: 'Public', isPublic: true, stockSymbol: 'HD', valuation: '350B',
    mrrUSD: 12000000000, employees: 470000, investors: [],
    description: 'Multinational home improvement retail corporation.', status: 'healthy', offset3D: [-7, 4, -5]
  },

  /* ── Subdomain: Marketplaces ── */
  {
    id: 'com-mar-1', name: 'eBay', industryId: 'ind-commerce', subdomain: 'Marketplaces',
    country: 'USA', founded: 1995, stage: 'Public', isPublic: true, stockSymbol: 'EBAY', valuation: '25B',
    mrrUSD: 800000000, employees: 11000, investors: [],
    description: 'Multinational e-commerce corporation that facilitates consumer-to-consumer and business-to-consumer sales.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'com-mar-2', name: 'Etsy', industryId: 'ind-commerce', subdomain: 'Marketplaces',
    country: 'USA', founded: 2005, stage: 'Public', isPublic: true, stockSymbol: 'ETSY', valuation: '9B',
    mrrUSD: 200000000, employees: 2700, investors: [],
    description: 'E-commerce company focused on handmade or vintage items and craft supplies.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'com-mar-3', name: 'Airbnb', industryId: 'ind-commerce', subdomain: 'Marketplaces',
    country: 'USA', founded: 2008, stage: 'Public', isPublic: true, stockSymbol: 'ABNB', valuation: '95B',
    mrrUSD: 700000000, employees: 6800, investors: [],
    description: 'Online marketplace for short-term homestays and experiences.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'com-mar-4', name: 'Uber', industryId: 'ind-commerce', subdomain: 'Marketplaces',
    country: 'USA', founded: 2009, stage: 'Public', isPublic: true, stockSymbol: 'UBER', valuation: '150B',
    mrrUSD: 3000000000, employees: 32000, investors: [],
    description: 'Mobility as a service provider, allowing users to book a car and driver.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'com-mar-5', name: 'Fiverr', industryId: 'ind-commerce', subdomain: 'Marketplaces',
    country: 'Israel', founded: 2010, stage: 'Public', isPublic: true, stockSymbol: 'FVRR', valuation: '1B',
    mrrUSD: 25000000, employees: 700, investors: [],
    description: 'Multinational online marketplace for freelance services.', status: 'healthy', offset3D: [-4, 6, -3]
  },

  /* ── Subdomain: D2C Brands ── */
  {
    id: 'com-d2c-1', name: 'Warby Parker', industryId: 'ind-commerce', subdomain: 'D2C Brands',
    country: 'USA', founded: 2010, stage: 'Public', isPublic: true, stockSymbol: 'WRBY', valuation: '1.5B',
    mrrUSD: 50000000, employees: 3000, investors: [],
    description: 'American online retailer of prescription glasses and sunglasses.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'com-d2c-2', name: 'Allbirds', industryId: 'ind-commerce', subdomain: 'D2C Brands',
    country: 'USA', founded: 2014, stage: 'Public', isPublic: true, stockSymbol: 'BIRD', valuation: '0.1B',
    mrrUSD: 20000000, employees: 700, investors: [],
    description: 'New Zealand-American apparel and footwear company.', status: 'warning', offset3D: [8, 2, 2]
  },
  {
    id: 'com-d2c-3', name: 'Casper', industryId: 'ind-commerce', subdomain: 'D2C Brands',
    country: 'USA', founded: 2014, stage: 'Private', isPublic: false, valuation: '0.3B',
    mrrUSD: 40000000, employees: 600, investors: ['Durational Capital Management'],
    description: 'E-commerce company that sells sleep products online and in retail locations.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'com-d2c-4', name: 'Glossier', industryId: 'ind-commerce', subdomain: 'D2C Brands',
    country: 'USA', founded: 2014, stage: 'Series E', isPublic: false, valuation: '1.8B',
    mrrUSD: 15000000, employees: 400, investors: ['Sequoia', 'Lone Pine Capital'],
    description: 'Beauty brand inspired by real life.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'com-d2c-5', name: 'Harry\'s', industryId: 'ind-commerce', subdomain: 'D2C Brands',
    country: 'USA', founded: 2013, stage: 'Series F', isPublic: false, valuation: '1.7B',
    mrrUSD: 30000000, employees: 900, investors: ['Macquarie Capital', 'Bain Capital Ventures'],
    description: 'Company that manufactures and sells shaving equipment and men\'s personal care products via mail order.', status: 'healthy', offset3D: [4, 7, -8]
  },

  /* ── Subdomain: Logistics ── */
  {
    id: 'com-log-1', name: 'FedEx', industryId: 'ind-commerce', subdomain: 'Logistics',
    country: 'USA', founded: 1971, stage: 'Public', isPublic: true, stockSymbol: 'FDX', valuation: '65B',
    mrrUSD: 7000000000, employees: 500000, investors: [],
    description: 'Multinational conglomerate holding company focused on transportation, e-commerce and business services.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'com-log-2', name: 'UPS', industryId: 'ind-commerce', subdomain: 'Logistics',
    country: 'USA', founded: 1907, stage: 'Public', isPublic: true, stockSymbol: 'UPS', valuation: '130B',
    mrrUSD: 8000000000, employees: 500000, investors: [],
    description: 'Multinational shipping & receiving and supply chain management company.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'com-log-3', name: 'DHL', industryId: 'ind-commerce', subdomain: 'Logistics',
    country: 'Germany', founded: 1969, stage: 'Public', isPublic: true, stockSymbol: 'DPW', valuation: '50B',
    mrrUSD: 7500000000, employees: 600000, investors: [],
    description: 'International shipping, courier, and packaging delivery service.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'com-log-4', name: 'Maersk', industryId: 'ind-commerce', subdomain: 'Logistics',
    country: 'Denmark', founded: 1904, stage: 'Public', isPublic: true, stockSymbol: 'AMKBY', valuation: '30B',
    mrrUSD: 4000000000, employees: 100000, investors: [],
    description: 'Integrated transport and logistics company.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'com-log-5', name: 'XPO Logistics', industryId: 'ind-commerce', subdomain: 'Logistics',
    country: 'USA', founded: 1989, stage: 'Public', isPublic: true, stockSymbol: 'XPO', valuation: '14B',
    mrrUSD: 600000000, employees: 38000, investors: [],
    description: 'American freight transportation company.', status: 'healthy', offset3D: [8, 2, 2]
  },

  /* ── Subdomain: Payments ── */
  {
    id: 'com-pay-1', name: 'Visa', industryId: 'ind-commerce', subdomain: 'Payments',
    country: 'USA', founded: 1958, stage: 'Public', isPublic: true, stockSymbol: 'V', valuation: '550B',
    mrrUSD: 2500000000, employees: 26000, investors: [],
    description: 'Multinational payment card services corporation.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'com-pay-2', name: 'Mastercard', industryId: 'ind-commerce', subdomain: 'Payments',
    country: 'USA', founded: 1966, stage: 'Public', isPublic: true, stockSymbol: 'MA', valuation: '440B',
    mrrUSD: 1800000000, employees: 29000, investors: [],
    description: 'Multinational payment card services corporation.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'com-pay-3', name: 'PayPal', industryId: 'ind-commerce', subdomain: 'Payments',
    country: 'USA', founded: 1998, stage: 'Public', isPublic: true, stockSymbol: 'PYPL', valuation: '65B',
    mrrUSD: 2000000000, employees: 29000, investors: [],
    description: 'Multinational financial technology company operating an online payments system.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'com-pay-4', name: 'Adyen', industryId: 'ind-commerce', subdomain: 'Payments',
    country: 'Netherlands', founded: 2006, stage: 'Public', isPublic: true, stockSymbol: 'ADYEN', valuation: '45B',
    mrrUSD: 700000000, employees: 3300, investors: [],
    description: 'Global payment company that allows businesses to accept e-commerce, mobile, and point-of-sale payments.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'com-pay-5', name: 'Klarna', industryId: 'ind-commerce', subdomain: 'Payments',
    country: 'Sweden', founded: 2005, stage: 'Series H', isPublic: false, valuation: '6.7B',
    mrrUSD: 150000000, employees: 5000, investors: ['Sequoia', 'Silver Lake'],
    description: 'Fintech company that provides online financial services such as payments for online storefronts.', status: 'healthy', offset3D: [6, 5, 4]
  },

  /* ── Subdomain: Supply Chain Tech ── */
  {
    id: 'com-sct-1', name: 'Körber Supply Chain', industryId: 'ind-commerce', subdomain: 'Supply Chain Tech',
    country: 'Germany', founded: 1946, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 150000000, employees: 12000, investors: [],
    description: 'Supply chain software, automation, voice, robotics, and materials handling.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'com-sct-2', name: 'Kinaxis', industryId: 'ind-commerce', subdomain: 'Supply Chain Tech',
    country: 'Canada', founded: 1984, stage: 'Public', isPublic: true, stockSymbol: 'KXS', valuation: '3B',
    mrrUSD: 30000000, employees: 1500, investors: [],
    description: 'Supply chain management and sales and operations planning software.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'com-sct-3', name: 'Manhattan Associates', industryId: 'ind-commerce', subdomain: 'Supply Chain Tech',
    country: 'USA', founded: 1990, stage: 'Public', isPublic: true, stockSymbol: 'MANH', valuation: '14B',
    mrrUSD: 70000000, employees: 4000, investors: [],
    description: 'Supply chain and omnichannel commerce technology company.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'com-sct-4', name: 'Blue Yonder', industryId: 'ind-commerce', subdomain: 'Supply Chain Tech',
    country: 'USA', founded: 1985, stage: 'Subsidiary', isPublic: false, valuation: '8.5B',
    mrrUSD: 85000000, employees: 5500, investors: ['Panasonic'],
    description: 'Software and consultancy company providing supply chain management.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'com-sct-5', name: 'Project44', industryId: 'ind-commerce', subdomain: 'Supply Chain Tech',
    country: 'USA', founded: 2014, stage: 'Series F', isPublic: false, valuation: '2.4B',
    mrrUSD: 10000000, employees: 1200, investors: ['TPG', 'Goldman Sachs'],
    description: 'Advanced visibility platform for shippers and logistics service providers.', status: 'healthy', offset3D: [7, -3, -6]
  }
];
