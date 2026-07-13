import type { CompanyRecord } from './schema';

export const MEDIA_COMPANIES: Partial<CompanyRecord>[] = [
  /* ── Subdomain: Film & TV ── */
  {
    id: 'med-film-1', name: 'Disney', industryId: 'ind-media', subdomain: 'Film & TV',
    country: 'USA', founded: 1923, stage: 'Public', isPublic: true, stockSymbol: 'DIS', valuation: '200B',
    mrrUSD: 7000000000, employees: 220000, investors: [],
    description: 'Multinational mass media and entertainment conglomerate.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'med-film-2', name: 'Warner Bros. Discovery', industryId: 'ind-media', subdomain: 'Film & TV',
    country: 'USA', founded: 2022, stage: 'Public', isPublic: true, stockSymbol: 'WBD', valuation: '30B',
    mrrUSD: 3500000000, employees: 37000, investors: [],
    description: 'Mass media and entertainment conglomerate.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'med-film-3', name: 'Paramount Global', industryId: 'ind-media', subdomain: 'Film & TV',
    country: 'USA', founded: 2019, stage: 'Public', isPublic: true, stockSymbol: 'PARA', valuation: '10B',
    mrrUSD: 2500000000, employees: 21000, investors: [],
    description: 'Multinational mass media and entertainment conglomerate.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'med-film-4', name: 'Universal Pictures', industryId: 'ind-media', subdomain: 'Film & TV',
    country: 'USA', founded: 1912, stage: 'Subsidiary', isPublic: false, valuation: 'N/A',
    mrrUSD: 1000000000, employees: 10000, investors: ['Comcast'],
    description: 'American film production and distribution company.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'med-film-5', name: 'A24', industryId: 'ind-media', subdomain: 'Film & TV',
    country: 'USA', founded: 2012, stage: 'Private', isPublic: false, valuation: '2.5B',
    mrrUSD: 30000000, employees: 200, investors: ['Stripes'],
    description: 'Independent entertainment company specializing in film and television.', status: 'healthy', offset3D: [-5, -6, 5]
  },

  /* ── Subdomain: Streaming ── */
  {
    id: 'med-strm-1', name: 'Netflix', industryId: 'ind-media', subdomain: 'Streaming',
    country: 'USA', founded: 1997, stage: 'Public', isPublic: true, stockSymbol: 'NFLX', valuation: '250B',
    mrrUSD: 2500000000, employees: 12800, investors: [],
    description: 'Subscription video on-demand over-the-top streaming service.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'med-strm-2', name: 'Spotify', industryId: 'ind-media', subdomain: 'Streaming',
    country: 'Sweden', founded: 2006, stage: 'Public', isPublic: true, stockSymbol: 'SPOT', valuation: '50B',
    mrrUSD: 1000000000, employees: 8000, investors: [],
    description: 'Audio streaming and media services provider.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'med-strm-3', name: 'Hulu', industryId: 'ind-media', subdomain: 'Streaming',
    country: 'USA', founded: 2007, stage: 'Subsidiary', isPublic: false, valuation: 'N/A',
    mrrUSD: 800000000, employees: 3000, investors: ['Disney'],
    description: 'Subscription video on-demand service.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'med-strm-4', name: 'Roku', industryId: 'ind-media', subdomain: 'Streaming',
    country: 'USA', founded: 2002, stage: 'Public', isPublic: true, stockSymbol: 'ROKU', valuation: '12B',
    mrrUSD: 250000000, employees: 3000, investors: [],
    description: 'Hardware digital media players and streaming platform.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'med-strm-5', name: 'Crunchyroll', industryId: 'ind-media', subdomain: 'Streaming',
    country: 'USA', founded: 2006, stage: 'Subsidiary', isPublic: false, valuation: 'N/A',
    mrrUSD: 100000000, employees: 1000, investors: ['Sony'],
    description: 'Anime, manga, and dorama streaming service.', status: 'healthy', offset3D: [-7, 4, -5]
  },

  /* ── Subdomain: Music ── */
  {
    id: 'med-mus-1', name: 'Universal Music Group', industryId: 'ind-media', subdomain: 'Music',
    country: 'USA', founded: 1934, stage: 'Public', isPublic: true, stockSymbol: 'UMG', valuation: '50B',
    mrrUSD: 900000000, employees: 9000, investors: [],
    description: 'Global music corporation.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'med-mus-2', name: 'Sony Music Entertainment', industryId: 'ind-media', subdomain: 'Music',
    country: 'USA', founded: 1929, stage: 'Subsidiary', isPublic: false, valuation: 'N/A',
    mrrUSD: 800000000, employees: 8500, investors: ['Sony'],
    description: 'Global music and entertainment company.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'med-mus-3', name: 'Warner Music Group', industryId: 'ind-media', subdomain: 'Music',
    country: 'USA', founded: 1958, stage: 'Public', isPublic: true, stockSymbol: 'WMG', valuation: '18B',
    mrrUSD: 500000000, employees: 5900, investors: [],
    description: 'Multinational entertainment and record label conglomerate.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'med-mus-4', name: 'SoundCloud', industryId: 'ind-media', subdomain: 'Music',
    country: 'Germany', founded: 2007, stage: 'Private', isPublic: false, valuation: '1B',
    mrrUSD: 20000000, employees: 400, investors: ['SiriusXM'],
    description: 'Audio distribution platform and music sharing website.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'med-mus-5', name: 'Live Nation Entertainment', industryId: 'ind-media', subdomain: 'Music',
    country: 'USA', founded: 2010, stage: 'Public', isPublic: true, stockSymbol: 'LYV', valuation: '22B',
    mrrUSD: 1000000000, employees: 10000, investors: [],
    description: 'Global entertainment company producing live events.', status: 'healthy', offset3D: [-4, 6, -3]
  },

  /* ── Subdomain: Gaming ── */
  {
    id: 'med-gam-1', name: 'Epic Games', industryId: 'ind-media', subdomain: 'Gaming',
    country: 'USA', founded: 1991, stage: 'Private', isPublic: false, valuation: '31.5B',
    mrrUSD: 400000000, employees: 4000, investors: ['Tencent', 'Sony'],
    description: 'Video game and software developer and publisher, creator of Unreal Engine.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'med-gam-2', name: 'Electronic Arts (EA)', industryId: 'ind-media', subdomain: 'Gaming',
    country: 'USA', founded: 1982, stage: 'Public', isPublic: true, stockSymbol: 'EA', valuation: '40B',
    mrrUSD: 600000000, employees: 13000, investors: [],
    description: 'Video game company.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'med-gam-3', name: 'Tencent Games', industryId: 'ind-media', subdomain: 'Gaming',
    country: 'China', founded: 2003, stage: 'Subsidiary', isPublic: false, valuation: 'N/A',
    mrrUSD: 2000000000, employees: 20000, investors: ['Tencent'],
    description: 'Video game publishing division of Tencent.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'med-gam-4', name: 'Nintendo', industryId: 'ind-media', subdomain: 'Gaming',
    country: 'Japan', founded: 1889, stage: 'Public', isPublic: true, stockSymbol: 'NTDOY', valuation: '60B',
    mrrUSD: 1000000000, employees: 6500, investors: [],
    description: 'Multinational video game company.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'med-gam-5', name: 'Take-Two Interactive', industryId: 'ind-media', subdomain: 'Gaming',
    country: 'USA', founded: 1993, stage: 'Public', isPublic: true, stockSymbol: 'TTWO', valuation: '28B',
    mrrUSD: 400000000, employees: 7000, investors: [],
    description: 'Video game holding company.', status: 'healthy', offset3D: [4, 7, -8]
  },

  /* ── Subdomain: Creator Economy ── */
  {
    id: 'med-cre-1', name: 'Patreon', industryId: 'ind-media', subdomain: 'Creator Economy',
    country: 'USA', founded: 2013, stage: 'Series F', isPublic: false, valuation: '4B',
    mrrUSD: 15000000, employees: 400, investors: ['Index Ventures', 'Thrive Capital'],
    description: 'Membership platform that provides business tools for creators.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'med-cre-2', name: 'Substack', industryId: 'ind-media', subdomain: 'Creator Economy',
    country: 'USA', founded: 2017, stage: 'Series B', isPublic: false, valuation: '0.6B',
    mrrUSD: 2000000, employees: 100, investors: ['Andreessen Horowitz'],
    description: 'Online platform that provides publishing, payment, analytics, and design infrastructure to support subscription newsletters.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'med-cre-3', name: 'Cameo', industryId: 'ind-media', subdomain: 'Creator Economy',
    country: 'USA', founded: 2016, stage: 'Series C', isPublic: false, valuation: '1B',
    mrrUSD: 8000000, employees: 300, investors: ['Kleiner Perkins', 'Lightspeed'],
    description: 'Video-sharing website that allows celebrities to send personalized video messages to fans.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'med-cre-4', name: 'Linktree', industryId: 'ind-media', subdomain: 'Creator Economy',
    country: 'Australia', founded: 2016, stage: 'Series C', isPublic: false, valuation: '1.3B',
    mrrUSD: 5000000, employees: 250, investors: ['Index Ventures', 'Coatue'],
    description: 'Social media reference landing page.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'med-cre-5', name: 'Kajabi', industryId: 'ind-media', subdomain: 'Creator Economy',
    country: 'USA', founded: 2010, stage: 'Private', isPublic: false, valuation: '2B',
    mrrUSD: 10000000, employees: 300, investors: ['Spectrum Equity', 'Tiger Global'],
    description: 'All-in-one platform for creators to build, market, and sell online courses.', status: 'healthy', offset3D: [8, 2, 2]
  },

  /* ── Subdomain: Publishing ── */
  {
    id: 'med-pub-1', name: 'The New York Times Company', industryId: 'ind-media', subdomain: 'Publishing',
    country: 'USA', founded: 1851, stage: 'Public', isPublic: true, stockSymbol: 'NYT', valuation: '8B',
    mrrUSD: 150000000, employees: 5000, investors: [],
    description: 'American mass media company that publishes its namesake newspaper.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'med-pub-2', name: 'Condé Nast', industryId: 'ind-media', subdomain: 'Publishing',
    country: 'USA', founded: 1909, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 80000000, employees: 6000, investors: [],
    description: 'Global mass media company.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'med-pub-3', name: 'Hearst Communications', industryId: 'ind-media', subdomain: 'Publishing',
    country: 'USA', founded: 1887, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 900000000, employees: 20000, investors: [],
    description: 'Multinational mass media and business information conglomerate.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'med-pub-4', name: 'Axel Springer', industryId: 'ind-media', subdomain: 'Publishing',
    country: 'Germany', founded: 1946, stage: 'Private', isPublic: false, valuation: '7.5B',
    mrrUSD: 300000000, employees: 16000, investors: ['KKR'],
    description: 'Multinational digital publishing house.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'med-pub-5', name: 'Penguin Random House', industryId: 'ind-media', subdomain: 'Publishing',
    country: 'USA', founded: 2013, stage: 'Subsidiary', isPublic: false, valuation: 'N/A',
    mrrUSD: 200000000, employees: 10000, investors: ['Bertelsmann'],
    description: 'Multinational conglomerate publishing company.', status: 'healthy', offset3D: [6, 5, 4]
  },

  /* ── Subdomain: Sports Media ── */
  {
    id: 'med-spo-1', name: 'ESPN', industryId: 'ind-media', subdomain: 'Sports Media',
    country: 'USA', founded: 1979, stage: 'Subsidiary', isPublic: false, valuation: 'N/A',
    mrrUSD: 500000000, employees: 8000, investors: ['Disney', 'Hearst'],
    description: 'International basic cable sports channel.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'med-spo-2', name: 'Sky Sports', industryId: 'ind-media', subdomain: 'Sports Media',
    country: 'UK', founded: 1990, stage: 'Subsidiary', isPublic: false, valuation: 'N/A',
    mrrUSD: 300000000, employees: 3000, investors: ['Comcast'],
    description: 'Group of British subscription sports channels.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'med-spo-3', name: 'DAZN', industryId: 'ind-media', subdomain: 'Sports Media',
    country: 'UK', founded: 2015, stage: 'Private', isPublic: false, valuation: '3B',
    mrrUSD: 80000000, employees: 2500, investors: ['Access Industries'],
    description: 'Global over-the-top sports subscription video streaming service.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'med-spo-4', name: 'Bleacher Report', industryId: 'ind-media', subdomain: 'Sports Media',
    country: 'USA', founded: 2005, stage: 'Subsidiary', isPublic: false, valuation: 'N/A',
    mrrUSD: 10000000, employees: 500, investors: ['Warner Bros. Discovery'],
    description: 'Website that focuses on sport and sports culture.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'med-spo-5', name: 'The Athletic', industryId: 'ind-media', subdomain: 'Sports Media',
    country: 'USA', founded: 2016, stage: 'Subsidiary', isPublic: false, valuation: '0.5B',
    mrrUSD: 6000000, employees: 600, investors: ['The New York Times Company'],
    description: 'Subscription-based sports journalism website.', status: 'healthy', offset3D: [7, -3, -6]
  }
];
