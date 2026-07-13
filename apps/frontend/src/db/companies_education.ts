import type { CompanyRecord } from './schema';

export const EDUCATION_COMPANIES: Partial<CompanyRecord>[] = [
  /* ── Subdomain: Schools ── */
  {
    id: 'edu-sch-1', name: 'GEMS Education', industryId: 'ind-education', subdomain: 'Schools',
    country: 'Global', founded: 1959, stage: 'Private', isPublic: false, valuation: '4B',
    mrrUSD: 100000000, employees: 20000, investors: ['CVC Capital Partners'],
    description: 'International education company that owns and operates private schools.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'edu-sch-2', name: 'Nord Anglia Education', industryId: 'ind-education', subdomain: 'Schools',
    country: 'UK', founded: 1992, stage: 'Private', isPublic: false, valuation: '4.3B',
    mrrUSD: 80000000, employees: 14000, investors: ['Baring Private Equity Asia', 'CPP Investments'],
    description: 'Provider of international schools.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'edu-sch-3', name: 'Cognita', industryId: 'ind-education', subdomain: 'Schools',
    country: 'UK', founded: 2004, stage: 'Private', isPublic: false, valuation: '2.5B',
    mrrUSD: 50000000, employees: 10000, investors: ['Jacobs Holding', 'Bregal Investments'],
    description: 'Global private schools group.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'edu-sch-4', name: 'K12 Inc. (Stride)', industryId: 'ind-education', subdomain: 'Schools',
    country: 'USA', founded: 2000, stage: 'Public', isPublic: true, stockSymbol: 'LRN', valuation: '2B',
    mrrUSD: 130000000, employees: 7000, investors: [],
    description: 'For-profit education company that offers online schooling.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'edu-sch-5', name: 'Bright Horizons', industryId: 'ind-education', subdomain: 'Schools',
    country: 'USA', founded: 1986, stage: 'Public', isPublic: true, stockSymbol: 'BFAM', valuation: '6B',
    mrrUSD: 160000000, employees: 30000, investors: [],
    description: 'Child-care provider and early education center operator.', status: 'healthy', offset3D: [-5, -6, 5]
  },

  /* ── Subdomain: Universities ── */
  {
    id: 'edu-univ-1', name: 'Grand Canyon Education', industryId: 'ind-education', subdomain: 'Universities',
    country: 'USA', founded: 2008, stage: 'Public', isPublic: true, stockSymbol: 'LOPE', valuation: '4B',
    mrrUSD: 70000000, employees: 4000, investors: [],
    description: 'Education services company providing services to universities.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'edu-univ-2', name: '2U', industryId: 'ind-education', subdomain: 'Universities',
    country: 'USA', founded: 2008, stage: 'Public', isPublic: true, stockSymbol: 'TWOU', valuation: '0.1B',
    mrrUSD: 75000000, employees: 3000, investors: [],
    description: 'Educational technology company that contracts with non-profit colleges and universities.', status: 'warning', offset3D: [-4, 6, -3]
  },
  {
    id: 'edu-univ-3', name: 'Coursera', industryId: 'ind-education', subdomain: 'Universities',
    country: 'USA', founded: 2012, stage: 'Public', isPublic: true, stockSymbol: 'COUR', valuation: '2B',
    mrrUSD: 45000000, employees: 1400, investors: [],
    description: 'Massive open online course provider, partnering with universities.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'edu-univ-4', name: 'Adtalem Global Education', industryId: 'ind-education', subdomain: 'Universities',
    country: 'USA', founded: 1931, stage: 'Public', isPublic: true, stockSymbol: 'ATGE', valuation: '2.5B',
    mrrUSD: 120000000, employees: 6000, investors: [],
    description: 'Provider of educational services.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'edu-univ-5', name: 'Navitas', industryId: 'ind-education', subdomain: 'Universities',
    country: 'Australia', founded: 1994, stage: 'Private', isPublic: false, valuation: '1.5B',
    mrrUSD: 80000000, employees: 5000, investors: ['BGH Capital'],
    description: 'Global education provider that offers university programs.', status: 'healthy', offset3D: [-7, 4, -5]
  },

  /* ── Subdomain: Edtech ── */
  {
    id: 'edu-edt-1', name: 'Byju\'s', industryId: 'ind-education', subdomain: 'Edtech',
    country: 'India', founded: 2011, stage: 'Series F', isPublic: false, valuation: '0.2B',
    mrrUSD: 10000000, employees: 5000, investors: ['Sequoia', 'Lightspeed'],
    description: 'Multinational educational technology company.', status: 'critical', offset3D: [7, -3, -6]
  },
  {
    id: 'edu-edt-2', name: 'Duolingo', industryId: 'ind-education', subdomain: 'Edtech',
    country: 'USA', founded: 2011, stage: 'Public', isPublic: true, stockSymbol: 'DUOL', valuation: '9B',
    mrrUSD: 40000000, employees: 700, investors: [],
    description: 'Language-learning website and mobile app.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'edu-edt-3', name: 'Kahoot!', industryId: 'ind-education', subdomain: 'Edtech',
    country: 'Norway', founded: 2012, stage: 'Private', isPublic: false, valuation: '1.7B',
    mrrUSD: 10000000, employees: 500, investors: ['SoftBank', 'General Atlantic'],
    description: 'Game-based learning platform.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'edu-edt-4', name: 'Age of Learning (ABCmouse)', industryId: 'ind-education', subdomain: 'Edtech',
    country: 'USA', founded: 2007, stage: 'Series C', isPublic: false, valuation: '3B',
    mrrUSD: 15000000, employees: 800, investors: ['TPG', 'Iconiq'],
    description: 'Education technology company that created ABCmouse.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'edu-edt-5', name: 'Quizlet', industryId: 'ind-education', subdomain: 'Edtech',
    country: 'USA', founded: 2005, stage: 'Series C', isPublic: false, valuation: '1B',
    mrrUSD: 8000000, employees: 200, investors: ['General Atlantic', 'Icon Ventures'],
    description: 'Multinational American company which creates and designs tools used for studying and learning.', status: 'healthy', offset3D: [-4, 6, -3]
  },

  /* ── Subdomain: Test Prep ── */
  {
    id: 'edu-test-1', name: 'Princeton Review', industryId: 'ind-education', subdomain: 'Test Prep',
    country: 'USA', founded: 1981, stage: 'Private', isPublic: false, valuation: '0.5B',
    mrrUSD: 5000000, employees: 500, investors: [],
    description: 'College admission services company offering test preparation services, tutoring and admissions resources.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'edu-test-2', name: 'Kaplan', industryId: 'ind-education', subdomain: 'Test Prep',
    country: 'USA', founded: 1938, stage: 'Subsidiary', isPublic: false, valuation: 'N/A',
    mrrUSD: 100000000, employees: 10000, investors: ['Graham Holdings'],
    description: 'For-profit corporation that provides educational services to colleges and universities and corporations.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'edu-test-3', name: 'Magoosh', industryId: 'ind-education', subdomain: 'Test Prep',
    country: 'USA', founded: 2009, stage: 'Bootstrapped', isPublic: false, valuation: 'N/A',
    mrrUSD: 2000000, employees: 100, investors: [],
    description: 'Online test preparation company.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'edu-test-4', name: 'Manhattan Prep', industryId: 'ind-education', subdomain: 'Test Prep',
    country: 'USA', founded: 2000, stage: 'Subsidiary', isPublic: false, valuation: 'N/A',
    mrrUSD: 3000000, employees: 200, investors: ['Kaplan'],
    description: 'Test preparation company.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'edu-test-5', name: 'Allen Career Institute', industryId: 'ind-education', subdomain: 'Test Prep',
    country: 'India', founded: 1988, stage: 'Private', isPublic: false, valuation: '1.2B',
    mrrUSD: 40000000, employees: 10000, investors: ['Bodhi Tree Systems'],
    description: 'Premier coaching institute for the preparation of JEE, Pre-Medical, NDA, Olympiads.', status: 'healthy', offset3D: [4, 7, -8]
  },

  /* ── Subdomain: Knowledge Publishing ── */
  {
    id: 'edu-pub-1', name: 'Pearson', industryId: 'ind-education', subdomain: 'Knowledge Publishing',
    country: 'UK', founded: 1844, stage: 'Public', isPublic: true, stockSymbol: 'PSON', valuation: '9B',
    mrrUSD: 350000000, employees: 20000, investors: [],
    description: 'Multinational publishing and education company.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'edu-pub-2', name: 'Scholastic', industryId: 'ind-education', subdomain: 'Knowledge Publishing',
    country: 'USA', founded: 1920, stage: 'Public', isPublic: true, stockSymbol: 'SCHL', valuation: '1B',
    mrrUSD: 120000000, employees: 8000, investors: [],
    description: 'Multinational publishing, education and media company known for publishing, selling, and distributing books.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'edu-pub-3', name: 'Houghton Mifflin Harcourt', industryId: 'ind-education', subdomain: 'Knowledge Publishing',
    country: 'USA', founded: 1832, stage: 'Private', isPublic: false, valuation: '2.8B',
    mrrUSD: 80000000, employees: 2500, investors: ['Veritas Capital'],
    description: 'Publisher of textbooks, instructional technology materials, assessments, reference works.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'edu-pub-4', name: 'McGraw Hill', industryId: 'ind-education', subdomain: 'Knowledge Publishing',
    country: 'USA', founded: 1888, stage: 'Private', isPublic: false, valuation: '4.5B',
    mrrUSD: 140000000, employees: 4000, investors: ['Platinum Equity'],
    description: 'American learning math company and one of the "big three" educational publishers.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'edu-pub-5', name: 'Cengage', industryId: 'ind-education', subdomain: 'Knowledge Publishing',
    country: 'USA', founded: 2007, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 100000000, employees: 4500, investors: ['Apax Partners', 'OMERS'],
    description: 'Educational content, technology, and services company for the higher education.', status: 'healthy', offset3D: [8, 2, 2]
  },

  /* ── Subdomain: Research Institutions ── */
  {
    id: 'edu-res-1', name: 'Battelle Memorial Institute', industryId: 'ind-education', subdomain: 'Research Institutions',
    country: 'USA', founded: 1929, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 500000000, employees: 22000, investors: [],
    description: 'Private nonprofit applied science and technology development company.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'edu-res-2', name: 'SRI International', industryId: 'ind-education', subdomain: 'Research Institutions',
    country: 'USA', founded: 1946, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 40000000, employees: 2100, investors: [],
    description: 'American nonprofit scientific research institute.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'edu-res-3', name: 'RAND Corporation', industryId: 'ind-education', subdomain: 'Research Institutions',
    country: 'USA', founded: 1948, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 30000000, employees: 1900, investors: [],
    description: 'American nonprofit global policy think tank.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'edu-res-4', name: 'Max Planck Society', industryId: 'ind-education', subdomain: 'Research Institutions',
    country: 'Germany', founded: 1948, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 150000000, employees: 24000, investors: [],
    description: 'Formally independent non-governmental and non-profit association of German research institutes.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'edu-res-5', name: 'Brookings Institution', industryId: 'ind-education', subdomain: 'Research Institutions',
    country: 'USA', founded: 1916, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 8000000, employees: 300, investors: [],
    description: 'American research group founded on Think Tank Row in Washington, D.C.', status: 'healthy', offset3D: [6, 5, 4]
  },

  /* ── Subdomain: Corporate Training ── */
  {
    id: 'edu-corp-1', name: 'Guild Education', industryId: 'ind-education', subdomain: 'Corporate Training',
    country: 'USA', founded: 2015, stage: 'Series F', isPublic: false, valuation: '4.4B',
    mrrUSD: 15000000, employees: 1200, investors: ['Bessemer', 'Redpoint'],
    description: 'Education benefits platform connecting employers to educational programs.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'edu-corp-2', name: 'Cornerstone OnDemand', industryId: 'ind-education', subdomain: 'Corporate Training',
    country: 'USA', founded: 1999, stage: 'Private', isPublic: false, valuation: '5.2B',
    mrrUSD: 70000000, employees: 3000, investors: ['Clearlake Capital'],
    description: 'Cloud-based people development software provider and learning technology company.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'edu-corp-3', name: 'Skillsoft', industryId: 'ind-education', subdomain: 'Corporate Training',
    country: 'USA', founded: 1998, stage: 'Public', isPublic: true, stockSymbol: 'SKIL', valuation: '1B',
    mrrUSD: 45000000, employees: 2500, investors: [],
    description: 'Educational technology company that produces learning management system software and content.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'edu-corp-4', name: 'Udacity', industryId: 'ind-education', subdomain: 'Corporate Training',
    country: 'USA', founded: 2011, stage: 'Acquired', isPublic: false, valuation: 'N/A',
    mrrUSD: 10000000, employees: 300, investors: ['Accenture'],
    description: 'For-profit educational organization focused on corporate training and "nanodegrees".', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'edu-corp-5', name: 'Degreed', industryId: 'ind-education', subdomain: 'Corporate Training',
    country: 'USA', founded: 2012, stage: 'Series D', isPublic: false, valuation: '1.4B',
    mrrUSD: 10000000, employees: 600, investors: ['Sapphire Ventures', 'Owl Ventures'],
    description: 'Lifelong learning platform that individuals and organizations use to discover learning content.', status: 'healthy', offset3D: [7, -3, -6]
  },

  /* ── Subdomain: Skill Platforms ── */
  {
    id: 'edu-skil-1', name: 'Udemy', industryId: 'ind-education', subdomain: 'Skill Platforms',
    country: 'USA', founded: 2010, stage: 'Public', isPublic: true, stockSymbol: 'UDMY', valuation: '1.5B',
    mrrUSD: 60000000, employees: 1400, investors: [],
    description: 'Massive open online course provider aimed at professional adults and students.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'edu-skil-2', name: 'Pluralsight', industryId: 'ind-education', subdomain: 'Skill Platforms',
    country: 'USA', founded: 2004, stage: 'Private', isPublic: false, valuation: '3.5B',
    mrrUSD: 35000000, employees: 1700, investors: ['Vista Equity Partners'],
    description: 'Privately held online education company that offers a variety of video training courses.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'edu-skil-3', name: 'Skillshare', industryId: 'ind-education', subdomain: 'Skill Platforms',
    country: 'USA', founded: 2010, stage: 'Series D', isPublic: false, valuation: '0.5B',
    mrrUSD: 5000000, employees: 300, investors: ['OMERS Growth Equity'],
    description: 'Online learning community with thousands of classes for creative and curious people.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'edu-skil-4', name: 'MasterClass', industryId: 'ind-education', subdomain: 'Skill Platforms',
    country: 'USA', founded: 2014, stage: 'Series F', isPublic: false, valuation: '2.75B',
    mrrUSD: 10000000, employees: 600, investors: ['Fidelity', 'IVP'],
    description: 'American online education subscription platform on which students can access tutorials and lectures.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'edu-skil-5', name: 'Codecademy', industryId: 'ind-education', subdomain: 'Skill Platforms',
    country: 'USA', founded: 2011, stage: 'Acquired', isPublic: false, valuation: '0.5B',
    mrrUSD: 4000000, employees: 200, investors: ['Skillsoft'],
    description: 'American online interactive platform that offers free coding classes in 12 different programming languages.', status: 'healthy', offset3D: [3, -5, 7]
  }
];
