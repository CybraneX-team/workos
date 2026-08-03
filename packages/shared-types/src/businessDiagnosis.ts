/**
 * The browser and API share this stable questionnaire contract.  It is deliberately
 * data-only: the backend remains responsible for validating submitted answers.
 */
export const BUSINESS_DIAGNOSIS_QUESTIONNAIRE_VERSION = '2026-08-03' as const;

export type BusinessDiagnosisQuestionType = 'text' | 'number' | 'select' | 'radio' | 'multiselect';

export interface BusinessDiagnosisQuestion {
  id: string;
  label: string;
  type: BusinessDiagnosisQuestionType;
  required: boolean;
  options?: readonly string[];
  min?: number;
  max?: number;
}

export interface BusinessDiagnosisDynamicQuestion {
  id: string;
  label: string;
  type: Exclude<BusinessDiagnosisQuestionType, 'select'>;
  options?: string[];
}

export type BusinessDiagnosisAnswers = Record<string, string | number | string[]>;

const sectors = [
  'Textile & Garments', 'Food Processing', 'Handicrafts & Artisanal Products',
  'Leather Goods & Footwear', 'Agriculture & Agri-Business', 'Engineering & Metal Work',
  'Furniture & Wood Products', 'Electronics & Electrical Equipment', 'Printing & Packaging',
  'Chemical Products', 'IT & Software Services', 'Retail & E-commerce', 'Healthcare & Wellness',
  'Hospitality & Tourism', 'Professional & Financial Services', 'Construction & Real Estate',
  'Logistics & Transportation', 'Education & Training', 'Media & Entertainment', 'Other',
] as const;

export const BUSINESS_DIAGNOSIS_PROFILE_QUESTIONS: readonly BusinessDiagnosisQuestion[] = [
  { id: 'business_name', label: 'What is your business name?', type: 'text', required: true },
  { id: 'sector', label: 'Select your business sector:', type: 'select', required: true, options: sectors },
  { id: 'district', label: 'In which district and state is your business located?', type: 'text', required: true },
  { id: 'years_in_operation', label: 'How many years has your business been operating?', type: 'number', required: true, min: 0, max: 100 },
  { id: 'employee_count', label: 'How many employees does your business have?', type: 'number', required: true, min: 1, max: 100000 },
  { id: 'annual_revenue', label: 'What is your annual revenue range?', type: 'select', required: true, options: ['Less than ₹25 lakh', '₹25 lakh - ₹1 crore', '₹1 - 5 crore', '₹5 - 25 crore', '₹25 - 100 crore', 'More than ₹100 crore'] },
];

const q = (id: string, label: string, options: string[]): BusinessDiagnosisQuestion => ({ id, label, type: 'multiselect', options, required: true });

export const BUSINESS_DIAGNOSIS_SECTOR_QUESTIONS: Readonly<Record<string, readonly BusinessDiagnosisQuestion[]>> = {
  'Textile & Garments': [q('textile_type', 'What types of textile products do you manufacture?', ['Traditional wear', 'Modern clothing', 'Home textiles', 'Industrial textiles', 'Technical textiles']), q('textile_challenges', 'What are your main challenges?', ['Raw material procurement', 'Design innovation', 'Quality control', 'Market access', 'Skilled labor shortage', 'Competition from imports'])],
  'Food Processing': [q('food_type', 'What types of food products do you process?', ['Grains & flours', 'Dairy products', 'Fruits & vegetables', 'Snacks & confectionery', 'Spices & condiments', 'Ready-to-eat meals']), q('food_challenges', 'What are your main challenges?', ['Perishability management', 'Quality control', 'Packaging', 'Cold chain logistics', 'Regulatory compliance', 'Market access'])],
  'Handicrafts & Artisanal Products': [q('handicraft_type', 'What types of handicrafts do you produce?', ['Wood carving', 'Pottery/Ceramics', 'Metalwork', 'Embroidery', 'Glass work', 'Stone carving', 'Painting/Folk art']), q('handicraft_challenges', 'What are your main challenges?', ['Design innovation', 'Raw material sourcing', 'Skilled artisan shortage', 'Market access', 'Export opportunities', 'Modern packaging', 'Online presence'])],
  'IT & Software Services': [q('it_type', 'What types of IT/software services do you offer?', ['Custom software development', 'SaaS products', 'IT consulting', 'Web/app development', 'Cloud services', 'IT support & maintenance']), q('it_challenges', 'What are your main challenges?', ['Client acquisition', 'Talent retention', 'Project scoping/estimation', 'Scaling delivery', 'Technology stack decisions', 'Competition/pricing pressure'])],
  'Retail & E-commerce': [q('retail_type', 'What is your primary retail format?', ['Physical store(s)', 'Online store/marketplace', 'Omnichannel', 'Wholesale/distribution']), q('retail_challenges', 'What are your main challenges?', ['Inventory management', 'Customer acquisition', 'Logistics & delivery', 'Returns management', 'Payment processing', 'Competition from larger players'])],
  'Healthcare & Wellness': [q('healthcare_type', 'What type of healthcare/wellness services do you provide?', ['Clinic/diagnostics', 'Pharmacy', 'Wellness/fitness', 'Home healthcare', 'Telemedicine']), q('healthcare_challenges', 'What are your main challenges?', ['Patient scheduling', 'Regulatory compliance', 'Record keeping', 'Staff shortage', 'Patient acquisition', 'Billing & insurance'])],
  'Hospitality & Tourism': [q('hospitality_type', 'What type of hospitality/tourism business do you run?', ['Hotel/lodging', 'Restaurant/food service', 'Travel agency', 'Event management', 'Tour operator']), q('hospitality_challenges', 'What are your main challenges?', ['Booking management', 'Seasonal demand fluctuation', 'Staff turnover', 'Guest experience', 'Online reviews/reputation', 'Pricing optimization'])],
  'Professional & Financial Services': [q('prof_services_type', 'What type of professional/financial services do you provide?', ['Accounting/tax', 'Legal', 'Consulting', 'Financial advisory', 'Insurance', 'HR/recruitment']), q('prof_services_challenges', 'What are your main challenges?', ['Client acquisition', 'Billing & collections', 'Regulatory compliance', 'Staff utilization', 'Service differentiation', 'Data security'])],
  'Construction & Real Estate': [q('construction_type', 'What type of construction/real estate work do you do?', ['Residential construction', 'Commercial construction', 'Real estate development', 'Contracting/subcontracting', 'Property management']), q('construction_challenges', 'What are your main challenges?', ['Project scheduling', 'Cost overruns', 'Regulatory approvals', 'Material procurement', 'Skilled labor shortage', 'Safety compliance'])],
  'Logistics & Transportation': [q('logistics_type', 'What type of logistics/transportation services do you offer?', ['Freight/trucking', 'Warehousing', 'Last-mile delivery', 'Fleet management', 'Freight forwarding']), q('logistics_challenges', 'What are your main challenges?', ['Route optimization', 'Fuel costs', 'Fleet maintenance', 'Driver shortage', 'Tracking & visibility', 'Delivery timelines'])],
  'Education & Training': [q('education_type', 'What type of education/training services do you provide?', ['School/college', 'Coaching/tutoring', 'Vocational training', 'Online courses', 'Corporate training']), q('education_challenges', 'What are your main challenges?', ['Student enrollment', 'Content development', 'Faculty/staff quality', 'Learning outcomes tracking', 'Fee collection', 'Competition from online platforms'])],
  'Media & Entertainment': [q('media_type', 'What type of media/entertainment business do you run?', ['Content production', 'Digital media/publishing', 'Event/live entertainment', 'Advertising/marketing agency', 'Gaming']), q('media_challenges', 'What are your main challenges?', ['Audience acquisition', 'Monetization', 'Content distribution', 'Talent management', 'Rights management', 'Platform dependency'])],
};

export const BUSINESS_DIAGNOSIS_COMMON_QUESTIONS: readonly BusinessDiagnosisQuestion[] = [
  q('main_problems', 'Select the key problems your business is facing:', ['Access to finance', 'Technology adoption', 'Marketing & sales', 'Supply chain management', 'Quality standards compliance', 'Skilled workforce', 'Raw material procurement', 'Market competition', 'Digital transformation', 'Customer acquisition']),
  q('digital_tools', 'Which digital tools is your business currently using?', ['None', 'Basic accounting software', 'Inventory management system', 'CRM system', 'E-commerce platform', 'Digital marketing', 'Digital payments', 'ERP system', 'Machine automation']),
  { id: 'tech_comfort', label: 'How comfortable are you with adopting new technologies?', type: 'radio', required: true, options: ['Very uncomfortable', 'Somewhat uncomfortable', 'Neutral', 'Somewhat comfortable', 'Very comfortable'] },
  { id: 'growth_expectation', label: 'What are your growth expectations for the next 2 years?', type: 'radio', required: true, options: ['Decline', 'Stay the same', 'Slow growth (up to 10%)', 'Moderate growth (10-25%)', 'Rapid growth (more than 25%)'] },
];

export function businessDiagnosisQuestionsForSector(sector: string): readonly BusinessDiagnosisQuestion[] {
  return [...(BUSINESS_DIAGNOSIS_SECTOR_QUESTIONS[sector] ?? []), ...BUSINESS_DIAGNOSIS_COMMON_QUESTIONS];
}

export interface BusinessDiagnosisReport {
  executiveSummary: string;
  businessContext: string;
  rootCauses: Array<{ title: string; evidence: string; impact: 'high' | 'medium' | 'low'; urgency: 'high' | 'medium' | 'low' }>;
  priorities: Array<{ rank: number; issue: string; whyNow: string }>;
  recommendations: Array<{ title: string; problemAddressed: string; whyFit: string; expectedBenefit: string; effort: 'low' | 'medium' | 'high'; prerequisites: string[]; implementationRisks: string[] }>;
  roadmap: { days0To30: string[]; days31To90: string[]; later: string[] };
  measures: Array<{ name: string; reason: string }>;
}

export interface BusinessDiagnosisCompleted {
  status: 'completed';
  completedAt: string;
  questionnaireVersion: string;
  answers: BusinessDiagnosisAnswers;
  report: BusinessDiagnosisReport;
}
