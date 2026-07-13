import type { CompanyRecord } from './schema';

export const HEALTHCARE_COMPANIES: Partial<CompanyRecord>[] = [
  /* ── Subdomain: Pharma ── */
  {
    id: 'hlth-phar-1', name: 'Pfizer', industryId: 'ind-healthcare', subdomain: 'Pharma',
    country: 'USA', founded: 1849, stage: 'Public', isPublic: true, stockSymbol: 'PFE', valuation: '150B',
    mrrUSD: 5000000000, employees: 83000, investors: [],
    description: 'Multinational pharmaceutical and biotechnology corporation.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'hlth-phar-2', name: 'Johnson & Johnson', industryId: 'ind-healthcare', subdomain: 'Pharma',
    country: 'USA', founded: 1886, stage: 'Public', isPublic: true, stockSymbol: 'JNJ', valuation: '380B',
    mrrUSD: 7000000000, employees: 152000, investors: [],
    description: 'Medical devices, pharmaceuticals, and consumer packaged goods.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'hlth-phar-3', name: 'Roche', industryId: 'ind-healthcare', subdomain: 'Pharma',
    country: 'Switzerland', founded: 1896, stage: 'Public', isPublic: true, stockSymbol: 'ROG', valuation: '250B',
    mrrUSD: 5500000000, employees: 103000, investors: [],
    description: 'Multinational healthcare company worldwide.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'hlth-phar-4', name: 'Novartis', industryId: 'ind-healthcare', subdomain: 'Pharma',
    country: 'Switzerland', founded: 1996, stage: 'Public', isPublic: true, stockSymbol: 'NVS', valuation: '200B',
    mrrUSD: 4000000000, employees: 101000, investors: [],
    description: 'Global healthcare company based in Switzerland.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'hlth-phar-5', name: 'AstraZeneca', industryId: 'ind-healthcare', subdomain: 'Pharma',
    country: 'UK', founded: 1999, stage: 'Public', isPublic: true, stockSymbol: 'AZN', valuation: '200B',
    mrrUSD: 3500000000, employees: 83000, investors: [],
    description: 'Multinational pharmaceutical and biotechnology company.', status: 'healthy', offset3D: [-5, -6, 5]
  },

  /* ── Subdomain: Biotech ── */
  {
    id: 'hlth-bio-1', name: 'Moderna', industryId: 'ind-healthcare', subdomain: 'Biotech',
    country: 'USA', founded: 2010, stage: 'Public', isPublic: true, stockSymbol: 'MRNA', valuation: '40B',
    mrrUSD: 500000000, employees: 5900, investors: [],
    description: 'Pioneering messenger RNA (mRNA) therapeutics and vaccines.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'hlth-bio-2', name: 'BioNTech', industryId: 'ind-healthcare', subdomain: 'Biotech',
    country: 'Germany', founded: 2008, stage: 'Public', isPublic: true, stockSymbol: 'BNTX', valuation: '22B',
    mrrUSD: 300000000, employees: 4500, investors: [],
    description: 'Developing active immunotherapies for patient-specific approaches.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'hlth-bio-3', name: 'Gilead Sciences', industryId: 'ind-healthcare', subdomain: 'Biotech',
    country: 'USA', founded: 1987, stage: 'Public', isPublic: true, stockSymbol: 'GILD', valuation: '95B',
    mrrUSD: 2000000000, employees: 17000, investors: [],
    description: 'Biopharmaceutical company focusing on antiviral drugs.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'hlth-bio-4', name: 'Amgen', industryId: 'ind-healthcare', subdomain: 'Biotech',
    country: 'USA', founded: 1980, stage: 'Public', isPublic: true, stockSymbol: 'AMGN', valuation: '160B',
    mrrUSD: 2000000000, employees: 25000, investors: [],
    description: 'Discovering, developing, manufacturing and delivering innovative human therapeutics.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'hlth-bio-5', name: 'Vertex Pharmaceuticals', industryId: 'ind-healthcare', subdomain: 'Biotech',
    country: 'USA', founded: 1989, stage: 'Public', isPublic: true, stockSymbol: 'VRTX', valuation: '100B',
    mrrUSD: 800000000, employees: 4800, investors: [],
    description: 'Transformative medicines for people with serious diseases.', status: 'healthy', offset3D: [-7, 4, -5]
  },

  /* ── Subdomain: Hospitals ── */
  {
    id: 'hlth-hosp-1', name: 'HCA Healthcare', industryId: 'ind-healthcare', subdomain: 'Hospitals',
    country: 'USA', founded: 1968, stage: 'Public', isPublic: true, stockSymbol: 'HCA', valuation: '85B',
    mrrUSD: 5000000000, employees: 294000, investors: [],
    description: 'For-profit operator of health care facilities.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'hlth-hosp-2', name: 'Mayo Clinic', industryId: 'ind-healthcare', subdomain: 'Hospitals',
    country: 'USA', founded: 1864, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 1000000000, employees: 76000, investors: [],
    description: 'Nonprofit American academic medical center focused on integrated health care.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'hlth-hosp-3', name: 'Cleveland Clinic', industryId: 'ind-healthcare', subdomain: 'Hospitals',
    country: 'USA', founded: 1921, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 900000000, employees: 72000, investors: [],
    description: 'Nonprofit multispecialty academic medical center.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'hlth-hosp-4', name: 'Apollo Hospitals', industryId: 'ind-healthcare', subdomain: 'Hospitals',
    country: 'India', founded: 1983, stage: 'Public', isPublic: true, stockSymbol: 'APOLLOHOSP', valuation: '10B',
    mrrUSD: 150000000, employees: 70000, investors: [],
    description: 'Indian multinational healthcare group.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'hlth-hosp-5', name: 'Tenet Healthcare', industryId: 'ind-healthcare', subdomain: 'Hospitals',
    country: 'USA', founded: 1969, stage: 'Public', isPublic: true, stockSymbol: 'THC', valuation: '10B',
    mrrUSD: 1500000000, employees: 100000, investors: [],
    description: 'Multinational healthcare services company.', status: 'healthy', offset3D: [-4, 6, -3]
  },

  /* ── Subdomain: Diagnostics ── */
  {
    id: 'hlth-diag-1', name: 'Quest Diagnostics', industryId: 'ind-healthcare', subdomain: 'Diagnostics',
    country: 'USA', founded: 1967, stage: 'Public', isPublic: true, stockSymbol: 'DGX', valuation: '15B',
    mrrUSD: 800000000, employees: 50000, investors: [],
    description: 'Clinical laboratory services.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'hlth-diag-2', name: 'LabCorp', industryId: 'ind-healthcare', subdomain: 'Diagnostics',
    country: 'USA', founded: 1978, stage: 'Public', isPublic: true, stockSymbol: 'LH', valuation: '18B',
    mrrUSD: 1000000000, employees: 60000, investors: [],
    description: 'Global life sciences company providing comprehensive clinical laboratory and end-to-end drug development services.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'hlth-diag-3', name: 'Illumina', industryId: 'ind-healthcare', subdomain: 'Diagnostics',
    country: 'USA', founded: 1998, stage: 'Public', isPublic: true, stockSymbol: 'ILMN', valuation: '20B',
    mrrUSD: 300000000, employees: 10000, investors: [],
    description: 'Developing, manufacturing, and marketing integrated systems for the analysis of genetic variation.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'hlth-diag-4', name: 'Exact Sciences', industryId: 'ind-healthcare', subdomain: 'Diagnostics',
    country: 'USA', founded: 1995, stage: 'Public', isPublic: true, stockSymbol: 'EXAS', valuation: '10B',
    mrrUSD: 150000000, employees: 6500, investors: [],
    description: 'Molecular diagnostics company specializing in the detection of early stage cancers.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'hlth-diag-5', name: 'Guardant Health', industryId: 'ind-healthcare', subdomain: 'Diagnostics',
    country: 'USA', founded: 2012, stage: 'Public', isPublic: true, stockSymbol: 'GH', valuation: '3B',
    mrrUSD: 40000000, employees: 1700, investors: [],
    description: 'Precision oncology company focused on helping conquer cancer globally.', status: 'healthy', offset3D: [4, 7, -8]
  },

  /* ── Subdomain: Preventive Care ── */
  {
    id: 'hlth-prev-1', name: 'Hims & Hers', industryId: 'ind-healthcare', subdomain: 'Preventive Care',
    country: 'USA', founded: 2017, stage: 'Public', isPublic: true, stockSymbol: 'HIMS', valuation: '3B',
    mrrUSD: 60000000, employees: 500, investors: [],
    description: 'Telehealth company that sells prescription and over-the-counter drugs online.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'hlth-prev-2', name: 'Ro', industryId: 'ind-healthcare', subdomain: 'Preventive Care',
    country: 'USA', founded: 2017, stage: 'Series D', isPublic: false, valuation: '7B',
    mrrUSD: 30000000, employees: 800, investors: ['General Catalyst', 'FirstMark'],
    description: 'Direct-to-patient healthcare company.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'hlth-prev-3', name: 'Oura', industryId: 'ind-healthcare', subdomain: 'Preventive Care',
    country: 'Finland', founded: 2013, stage: 'Series C', isPublic: false, valuation: '2.55B',
    mrrUSD: 15000000, employees: 500, investors: ['Forerunner Ventures', 'Square'],
    description: 'Health technology company known for the Oura Ring.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'hlth-prev-4', name: 'Whoop', industryId: 'ind-healthcare', subdomain: 'Preventive Care',
    country: 'USA', founded: 2012, stage: 'Series F', isPublic: false, valuation: '3.6B',
    mrrUSD: 10000000, employees: 600, investors: ['SoftBank', 'IVP'],
    description: 'Wearable technology company focused on human performance.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'hlth-prev-5', name: 'Noom', industryId: 'ind-healthcare', subdomain: 'Preventive Care',
    country: 'USA', founded: 2008, stage: 'Series F', isPublic: false, valuation: '3.7B',
    mrrUSD: 30000000, employees: 1200, investors: ['Silver Lake', 'Sequoia'],
    description: 'Digital health platform focused on behavior change and weight loss.', status: 'healthy', offset3D: [8, 2, 2]
  },

  /* ── Subdomain: Mental Health ── */
  {
    id: 'hlth-ment-1', name: 'BetterHelp', industryId: 'ind-healthcare', subdomain: 'Mental Health',
    country: 'USA', founded: 2013, stage: 'Public', isPublic: true, stockSymbol: 'TDOC', valuation: 'N/A',
    mrrUSD: 50000000, employees: 1000, investors: [],
    description: 'Mental health portal providing direct-to-consumer access to mental health services.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'hlth-ment-2', name: 'Talkspace', industryId: 'ind-healthcare', subdomain: 'Mental Health',
    country: 'USA', founded: 2012, stage: 'Public', isPublic: true, stockSymbol: 'TALK', valuation: '0.4B',
    mrrUSD: 10000000, employees: 500, investors: [],
    description: 'Online and mobile therapy company.', status: 'healthy', offset3D: [7, -3, -6]
  },
  {
    id: 'hlth-ment-3', name: 'Calm', industryId: 'ind-healthcare', subdomain: 'Mental Health',
    country: 'USA', founded: 2012, stage: 'Series C', isPublic: false, valuation: '2B',
    mrrUSD: 15000000, employees: 300, investors: ['Lightspeed', 'TPG'],
    description: 'Software company producing meditation products.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'hlth-ment-4', name: 'Headspace', industryId: 'ind-healthcare', subdomain: 'Mental Health',
    country: 'USA', founded: 2010, stage: 'Series C', isPublic: false, valuation: '3B',
    mrrUSD: 12000000, employees: 1000, investors: ['Blisce', 'Times Bridge'],
    description: 'Digital health platform providing guided meditation sessions.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'hlth-ment-5', name: 'Spring Health', industryId: 'ind-healthcare', subdomain: 'Mental Health',
    country: 'USA', founded: 2016, stage: 'Series C', isPublic: false, valuation: '2.5B',
    mrrUSD: 5000000, employees: 400, investors: ['Kinnevik', 'Tiger Global'],
    description: 'Comprehensive mental health benefit for employers.', status: 'healthy', offset3D: [6, 5, 4]
  },

  /* ── Subdomain: Medical Devices ── */
  {
    id: 'hlth-medd-1', name: 'Medtronic', industryId: 'ind-healthcare', subdomain: 'Medical Devices',
    country: 'Ireland', founded: 1949, stage: 'Public', isPublic: true, stockSymbol: 'MDT', valuation: '100B',
    mrrUSD: 2500000000, employees: 95000, investors: [],
    description: 'Medical device company that generates the majority of its sales and profits from the US.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'hlth-medd-2', name: 'Abbott Laboratories', industryId: 'ind-healthcare', subdomain: 'Medical Devices',
    country: 'USA', founded: 1888, stage: 'Public', isPublic: true, stockSymbol: 'ABT', valuation: '180B',
    mrrUSD: 3500000000, employees: 115000, investors: [],
    description: 'Multinational medical devices and health care company.', status: 'healthy', offset3D: [3, -5, 7]
  },
  {
    id: 'hlth-medd-3', name: 'Stryker', industryId: 'ind-healthcare', subdomain: 'Medical Devices',
    country: 'USA', founded: 1941, stage: 'Public', isPublic: true, stockSymbol: 'SYK', valuation: '130B',
    mrrUSD: 1500000000, employees: 51000, investors: [],
    description: 'Multinational medical technologies corporation.', status: 'healthy', offset3D: [8, 2, 2]
  },
  {
    id: 'hlth-medd-4', name: 'Boston Scientific', industryId: 'ind-healthcare', subdomain: 'Medical Devices',
    country: 'USA', founded: 1979, stage: 'Public', isPublic: true, stockSymbol: 'BSX', valuation: '100B',
    mrrUSD: 1100000000, employees: 45000, investors: [],
    description: 'Manufacturer of medical devices used in interventional medical specialties.', status: 'healthy', offset3D: [-7, 4, -5]
  },
  {
    id: 'hlth-medd-5', name: 'Intuitive Surgical', industryId: 'ind-healthcare', subdomain: 'Medical Devices',
    country: 'USA', founded: 1995, stage: 'Public', isPublic: true, stockSymbol: 'ISRG', valuation: '130B',
    mrrUSD: 600000000, employees: 12000, investors: [],
    description: 'Develops, manufactures, and markets robotic products designed to improve clinical outcomes.', status: 'healthy', offset3D: [7, -3, -6]
  },

  /* ── Subdomain: Healthtech ── */
  {
    id: 'hlth-htech-1', name: 'Epic Systems', industryId: 'ind-healthcare', subdomain: 'Healthtech',
    country: 'USA', founded: 1979, stage: 'Private', isPublic: false, valuation: 'N/A',
    mrrUSD: 300000000, employees: 13000, investors: [],
    description: 'Privately held healthcare software company.', status: 'healthy', offset3D: [4, 7, -8]
  },
  {
    id: 'hlth-htech-2', name: 'Veeva Systems', industryId: 'ind-healthcare', subdomain: 'Healthtech',
    country: 'USA', founded: 2007, stage: 'Public', isPublic: true, stockSymbol: 'VEEV', valuation: '35B',
    mrrUSD: 180000000, employees: 7000, investors: [],
    description: 'Cloud-computing company focused on pharmaceutical and life sciences industry applications.', status: 'healthy', offset3D: [-5, -6, 5]
  },
  {
    id: 'hlth-htech-3', name: 'Teladoc Health', industryId: 'ind-healthcare', subdomain: 'Healthtech',
    country: 'USA', founded: 2002, stage: 'Public', isPublic: true, stockSymbol: 'TDOC', valuation: '2.5B',
    mrrUSD: 200000000, employees: 5000, investors: [],
    description: 'Multinational telemedicine and virtual healthcare company.', status: 'healthy', offset3D: [6, 5, 4]
  },
  {
    id: 'hlth-htech-4', name: 'Oscar Health', industryId: 'ind-healthcare', subdomain: 'Healthtech',
    country: 'USA', founded: 2012, stage: 'Public', isPublic: true, stockSymbol: 'OSCR', valuation: '3.5B',
    mrrUSD: 100000000, employees: 2000, investors: [],
    description: 'Technology-focused health insurance company.', status: 'healthy', offset3D: [-4, 6, -3]
  },
  {
    id: 'hlth-htech-5', name: 'Zocdoc', industryId: 'ind-healthcare', subdomain: 'Healthtech',
    country: 'USA', founded: 2007, stage: 'Series D', isPublic: false, valuation: '1.8B',
    mrrUSD: 8000000, employees: 600, investors: ['Founders Fund', 'Khosla Ventures'],
    description: 'Online medical care appointment booking service.', status: 'healthy', offset3D: [3, -5, 7]
  }
];
