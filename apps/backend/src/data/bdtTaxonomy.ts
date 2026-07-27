import type { BranchKind } from '@cybranex/shared-types';

export const BDT_TAXONOMY_VERSION = 'v3' as const;
export type BdtAvailability = 'active' | 'planned';
/** Static branches seed action/metric children; the ERP catalog branch is rendered live. */
export type BdtBranchPresentation = 'static' | 'erpnext_catalog';

export type BdtTaxonomyBranch = {
  readonly sourceKey: string;
  readonly label: string;
  readonly conceptKey: string;
  readonly meaning: string;
  readonly actionExamples: readonly string[];
  readonly integrations: readonly string[];
  readonly metricImpacts: readonly string[];
  readonly availability: BdtAvailability;
  readonly presentation: BdtBranchPresentation;
};

export type BdtTaxonomyCapability = {
  readonly sourceKey: string;
  readonly label: string;
  readonly meaning: string;
  readonly mappedUniversalCategory: BranchKind;
  readonly branches: readonly BdtTaxonomyBranch[];
};

export type BdtTaxonomyDepartment = {
  readonly departmentLabel: string;
  readonly sourceKey: string;
  readonly capabilities: readonly BdtTaxonomyCapability[];
};

type RawCapability = readonly [
  sourceKey: string,
  label: string,
  meaning: string,
  branchKind: BranchKind,
  availability: BdtAvailability,
  branches: readonly (readonly [sourceKey: string, label: string, presentation?: BdtBranchPresentation])[],
];
type RawDepartment = readonly [label: string, sourceKey: string, capabilities: readonly RawCapability[]];

function capability(departmentLabel: string, raw: RawCapability): BdtTaxonomyCapability {
  const [sourceKey, label, meaning, mappedUniversalCategory, availability, branches] = raw;
  return {
    sourceKey, label, meaning, mappedUniversalCategory,
    branches: branches.map(([branchSourceKey, branchLabel, presentation = 'static']) => ({
      sourceKey: branchSourceKey,
      label: branchLabel,
      conceptKey: branchSourceKey,
      meaning: departmentLabel + ' owns ' + branchLabel + ' within ' + label + '.',
      actionExamples: ['Review ' + branchLabel, 'Improve ' + branchLabel],
      integrations: [],
      metricImpacts: [branchLabel + ' health'],
      availability,
      presentation,
    })),
  };
}

function department([departmentLabel, sourceKey, capabilities]: RawDepartment): BdtTaxonomyDepartment {
  return { departmentLabel, sourceKey, capabilities: capabilities.map(raw => capability(departmentLabel, raw)) };
}

const ACTIVE: BdtAvailability = 'active';
const PLANNED: BdtAvailability = 'planned';
const CORE: BranchKind = 'core_workstreams';

/** Canonical V2 ownership taxonomy for all new-company BDT seeds. */
const RAW_TAXONOMY: readonly RawDepartment[] = [
  ['Engineering', 'dept_engineering', [
    ['eng_platform_foundations', 'Platform Foundations', 'Owns reusable engineering foundations.', CORE, ACTIVE, [
      ['eng_platform_foundations_services', 'Services'], ['eng_platform_foundations_technical_platforms', 'Technical Platforms'], ['eng_platform_foundations_repositories', 'Repositories'], ['eng_platform_foundations_developer_tools', 'Developer Tools'],
    ]],
    ['eng_application_delivery', 'Application Delivery', 'Owns implementation of customer-facing software.', CORE, ACTIVE, [
      ['eng_application_delivery_backend_systems', 'Backend Systems'], ['eng_application_delivery_frontend_experiences', 'Frontend Experiences'], ['eng_application_delivery_mobile_clients', 'Mobile Clients'], ['eng_application_delivery_engineering_automation', 'Engineering Automation'],
    ]],
    ['eng_architecture_reliability', 'Architecture & Reliability', 'Owns technical design and production reliability.', CORE, ACTIVE, [
      ['eng_architecture_reliability_system_architecture', 'System Architecture'], ['eng_architecture_reliability_api_contracts', 'API Contracts'], ['eng_architecture_reliability_reliability_engineering', 'Reliability Engineering'], ['eng_architecture_reliability_deployment_releases', 'Deployment Releases'],
    ]],
    ['eng_engineering_quality', 'Engineering Quality', 'Owns software quality practices and developer readiness.', CORE, ACTIVE, [
      ['eng_engineering_quality_quality_assurance', 'Quality Assurance'], ['eng_engineering_quality_code_standards', 'Code Standards'], ['eng_engineering_quality_technical_debt', 'Technical Debt'], ['eng_engineering_quality_development_environments', 'Development Environments'],
    ]],
  ]],
  ['Product', 'dept_product', [
    ['prod_product_portfolio', 'Product Portfolio', 'Owns the product portfolio and product-level choices.', CORE, ACTIVE, [
      ['prod_product_portfolio_product_lines', 'Product Lines', 'erpnext_catalog'], ['prod_product_portfolio_lifecycle_decisions', 'Lifecycle Decisions'], ['prod_product_portfolio_product_ownership', 'Product Ownership'], ['prod_product_portfolio_prioritisation', 'Prioritisation'],
    ]],
    ['prod_problem_discovery', 'Problem Discovery', 'Owns product problem framing and validation.', CORE, ACTIVE, [
      ['prod_problem_discovery_problem_framing', 'Problem Framing'], ['prod_problem_discovery_opportunity_hypotheses', 'Opportunity Hypotheses'], ['prod_problem_discovery_solution_validation', 'Solution Validation'], ['prod_problem_discovery_market_fit_decisions', 'Market-Fit Decisions'],
    ]],
    ['prod_product_definition', 'Product Definition', 'Owns what will be built and its acceptance boundary.', CORE, ACTIVE, [
      ['prod_product_definition_requirements', 'Requirements'], ['prod_product_definition_prds', 'PRDs'], ['prod_product_definition_feature_scope', 'Feature Scope'], ['prod_product_definition_acceptance_criteria', 'Acceptance Criteria'],
    ]],
    ['prod_roadmap_launch', 'Roadmap & Launch', 'Owns product delivery intent and market launch readiness.', CORE, ACTIVE, [
      ['prod_roadmap_launch_product_roadmap', 'Product Roadmap'], ['prod_roadmap_launch_epics_milestones', 'Epics & Milestones'], ['prod_roadmap_launch_release_readiness', 'Release Readiness'], ['prod_roadmap_launch_go_to_market_launches', 'Go-to-Market Launches'],
    ]],
  ]],
  ['Sales', 'dept_sales', [
    ['sales_prospect_development', 'Prospect Development', 'Owns qualification of prospective buyers.', CORE, ACTIVE, [
      ['sales_prospect_development_target_accounts', 'Target Accounts'], ['sales_prospect_development_buyer_contacts', 'Buyer Contacts'], ['sales_prospect_development_icp_qualification', 'ICP Qualification'], ['sales_prospect_development_buying_committees', 'Buying Committees'],
    ]],
    ['sales_deal_execution', 'Deal Execution', 'Owns movement of qualified commercial opportunities.', CORE, ACTIVE, [
      ['sales_deal_execution_leads', 'Leads'], ['sales_deal_execution_opportunities', 'Opportunities'], ['sales_deal_execution_deal_progression', 'Deal Progression'], ['sales_deal_execution_proposals', 'Proposals'],
    ]],
    ['sales_commercial_operations', 'Commercial Operations', 'Owns sales operating discipline and commercial planning.', CORE, ACTIVE, [
      ['sales_commercial_operations_territory_design', 'Territory Design'], ['sales_commercial_operations_quota_management', 'Quota Management'], ['sales_commercial_operations_bookings_forecast', 'Bookings Forecast'], ['sales_commercial_operations_crm_governance', 'CRM Governance'],
    ]],
    ['sales_channel_revenue', 'Channel Revenue', 'Owns revenue-producing indirect sales channels.', CORE, ACTIVE, [
      ['sales_channel_revenue_resellers', 'Resellers'], ['sales_channel_revenue_distributors', 'Distributors'], ['sales_channel_revenue_referral_channels', 'Referral Channels'], ['sales_channel_revenue_channel_performance', 'Channel Performance'],
    ]],
  ]],
  ['Marketing', 'dept_marketing', [
    ['mkt_paid_acquisition', 'Paid Acquisition', 'Owns paid-media acquisition execution.', CORE, ACTIVE, [
      ['mkt_paid_acquisition_campaigns', 'Campaign Operations'], ['mkt_paid_acquisition_ad_performance', 'Ad Performance'], ['mkt_paid_acquisition_spend_reach', 'Spend & Reach'],
    ]],
    ['mkt_organic_growth', 'Organic Growth', 'Owns unpaid audience acquisition; integration is planned.', CORE, PLANNED, [
      ['mkt_organic_growth_seo_discovery', 'SEO Discovery'], ['mkt_organic_growth_content_distribution', 'Content Distribution'], ['mkt_organic_growth_owned_channel_conversion', 'Owned-Channel Conversion'],
    ]],
    ['mkt_demand_attribution', 'Demand Generation & Attribution', 'Owns marketing demand quality and attribution; integration is planned.', CORE, PLANNED, [
      ['mkt_demand_attribution_marketing_qualified_demand', 'Marketing-Qualified Demand'], ['mkt_demand_attribution_campaign_attribution', 'Campaign Attribution'], ['mkt_demand_attribution_pipeline_influence', 'Pipeline Influence'],
    ]],
    ['mkt_brand_activation', 'Brand Activation', 'Owns market-facing brand activation; integration is planned.', CORE, PLANNED, [
      ['mkt_brand_activation_brand_positioning', 'Brand Positioning'], ['mkt_brand_activation_audience_perception', 'Audience Perception'], ['mkt_brand_activation_campaign_resonance', 'Campaign Resonance'],
    ]],
  ]],
  ['People & HR', 'dept_hr', [
    ['hr_talent_acquisition', 'Talent Acquisition', 'Owns hiring from open position through offer.', CORE, ACTIVE, [
      ['hr_talent_acquisition_open_positions', 'Open Positions'], ['hr_talent_acquisition_candidate_pipeline', 'Candidate Pipeline'], ['hr_talent_acquisition_interview_process', 'Interview Process'], ['hr_talent_acquisition_offer_management', 'Offer Management'],
    ]],
    ['hr_people_operations', 'People Operations', 'Owns employee administration and employment lifecycle.', CORE, ACTIVE, [
      ['hr_people_operations_employee_records', 'Employee Records'], ['hr_people_operations_time_leave', 'Time & Leave'], ['hr_people_operations_benefits_payroll_inputs', 'Benefits & Payroll Inputs'], ['hr_people_operations_employment_lifecycle', 'Employment Lifecycle'],
    ]],
    ['hr_workforce_development', 'Workforce Development', 'Owns capability-building for the workforce.', CORE, ACTIVE, [
      ['hr_workforce_development_skills_inventory', 'Skills Inventory'], ['hr_workforce_development_learning_paths', 'Learning Paths'], ['hr_workforce_development_certifications', 'Certifications'], ['hr_workforce_development_leadership_development', 'Leadership Development'],
    ]],
    ['hr_workforce_health', 'Workforce Health', 'Owns workforce health, performance, and capacity signals.', CORE, ACTIVE, [
      ['hr_workforce_health_performance_reviews', 'Performance Reviews'], ['hr_workforce_health_engagement_signals', 'Engagement Signals'], ['hr_workforce_health_attrition_risk', 'Attrition Risk'], ['hr_workforce_health_capacity_planning', 'Capacity Planning'],
    ]],
  ]],
  ['Finance', 'dept_finance', [
    ['fin_accounting_receivables', 'Accounting & Receivables', 'Owns booked financial activity and money owed to the company.', CORE, ACTIVE, [
      ['fin_accounting_receivables_general_ledger', 'General Ledger'], ['fin_accounting_receivables_customer_invoicing', 'Customer Invoicing'], ['fin_accounting_receivables_collections', 'Collections'], ['fin_accounting_receivables_reconciliation_close', 'Reconciliation & Close'],
    ]],
    ['fin_financial_planning', 'Financial Planning', 'Owns forward-looking company financial plans.', CORE, ACTIVE, [
      ['fin_financial_planning_budget_planning', 'Budget Planning'], ['fin_financial_planning_financial_forecast', 'Financial Forecast'], ['fin_financial_planning_scenario_analysis', 'Scenario Analysis'], ['fin_financial_planning_unit_economics', 'Unit Economics'],
    ]],
    ['fin_treasury_capital', 'Treasury & Capital', 'Owns liquidity and capital sources.', CORE, ACTIVE, [
      ['fin_treasury_capital_cash_management', 'Cash Management'], ['fin_treasury_capital_banking', 'Banking'], ['fin_treasury_capital_capital_structure', 'Capital Structure'], ['fin_treasury_capital_funding', 'Funding'],
    ]],
    ['fin_financial_control', 'Financial Control', 'Owns financial safeguards and reporting obligations.', CORE, ACTIVE, [
      ['fin_financial_control_spend_approval', 'Spend Approval'], ['fin_financial_control_expense_control', 'Expense Control'], ['fin_financial_control_tax_audit', 'Tax & Audit'], ['fin_financial_control_financial_compliance', 'Financial Compliance'],
    ]],
  ]],
  ['Operations', 'dept_operations', [
    ['ops_service_fulfillment', 'Service Fulfillment', 'Owns delivery of operational services.', CORE, ACTIVE, [
      ['ops_service_fulfillment_service_requests', 'Service Requests'], ['ops_service_fulfillment_service_level_execution', 'Service-Level Execution'], ['ops_service_fulfillment_fulfillment_flow', 'Fulfillment Flow'], ['ops_service_fulfillment_field_delivery', 'Field Delivery'],
    ]],
    ['ops_supply_chain_execution', 'Supply Chain Execution', 'Owns movement and storage of operational goods.', CORE, ACTIVE, [
      ['ops_supply_chain_execution_inventory_control', 'Inventory Control'], ['ops_supply_chain_execution_logistics_routing', 'Logistics Routing'], ['ops_supply_chain_execution_shipping', 'Shipping'], ['ops_supply_chain_execution_warehouse_operations', 'Warehouse Operations'],
    ]],
    ['ops_supplier_operations', 'Supplier Operations', 'Owns operational supplier performance.', CORE, ACTIVE, [
      ['ops_supplier_operations_supplier_onboarding', 'Supplier Onboarding'], ['ops_supplier_operations_supplier_ordering', 'Supplier Ordering'], ['ops_supplier_operations_supplier_quality', 'Supplier Quality'], ['ops_supplier_operations_supplier_renewals', 'Supplier Renewals'],
    ]],
    ['ops_process_capacity', 'Process & Capacity', 'Owns operational process throughput and physical capacity.', CORE, ACTIVE, [
      ['ops_process_capacity_operating_procedures', 'Operating Procedures'], ['ops_process_capacity_workflow_automation', 'Workflow Automation'], ['ops_process_capacity_bottleneck_management', 'Bottleneck Management'], ['ops_process_capacity_asset_capacity', 'Asset Capacity'],
    ]],
  ]],
  ['Data & Analytics', 'dept_data', [
    ['data_platform', 'Data Platform', 'Owns durable data infrastructure.', CORE, ACTIVE, [
      ['data_platform_data_pipelines', 'Data Pipelines'], ['data_platform_warehousing', 'Warehousing'], ['data_platform_data_ingestion', 'Data Ingestion'], ['data_platform_data_modelling', 'Data Modelling'],
    ]],
    ['data_analytics_products', 'Analytics Products', 'Owns reusable business analytics surfaces.', CORE, ACTIVE, [
      ['data_analytics_products_executive_dashboards', 'Executive Dashboards'], ['data_analytics_products_operational_reports', 'Operational Reports'], ['data_analytics_products_metric_definitions', 'Metric Definitions'], ['data_analytics_products_self_service_analytics', 'Self-Service Analytics'],
    ]],
    ['data_decision_intelligence', 'Decision Intelligence', 'Owns analytical decision support.', CORE, ACTIVE, [
      ['data_decision_intelligence_cohort_analysis', 'Cohort Analysis'], ['data_decision_intelligence_experiment_analytics', 'Experiment Analytics'], ['data_decision_intelligence_predictive_forecasting', 'Predictive Forecasting'], ['data_decision_intelligence_decision_recommendations', 'Decision Recommendations'],
    ]],
    ['data_ai_systems', 'AI Systems', 'Owns production AI capability.', CORE, ACTIVE, [
      ['data_ai_systems_ml_models', 'ML Models'], ['data_ai_systems_recommendation_systems', 'Recommendation Systems'], ['data_ai_systems_llm_workflows', 'LLM Workflows'], ['data_ai_systems_model_monitoring', 'Model Monitoring'],
    ]],
    ['data_governance', 'Data Governance', 'Owns data stewardship and trust.', CORE, ACTIVE, [
      ['data_governance_data_stewardship', 'Data Stewardship'], ['data_governance_data_quality_policy', 'Data Quality Policy'], ['data_governance_lineage_catalogue', 'Lineage & Catalogue'], ['data_governance_master_data', 'Master Data'],
    ]],
  ]],
  ['Design', 'dept_design', [
    ['des_design_system', 'Design System', 'Owns reusable interface standards.', CORE, ACTIVE, [
      ['des_design_system_components', 'Components'], ['des_design_system_design_tokens', 'Design Tokens'], ['des_design_system_interaction_patterns', 'Interaction Patterns'], ['des_design_system_accessibility_standards', 'Accessibility Standards'],
    ]],
    ['des_experience_research', 'Experience Research', 'Owns human-centred experience research.', CORE, ACTIVE, [
      ['des_experience_research_usability_studies', 'Usability Studies'], ['des_experience_research_journeys_personas', 'Journeys & Personas'], ['des_experience_research_research_synthesis', 'Research Synthesis'], ['des_experience_research_research_library', 'Research Library'],
    ]],
    ['des_product_experience', 'Product Experience', 'Owns product interaction design.', CORE, ACTIVE, [
      ['des_product_experience_user_flows', 'User Flows'], ['des_product_experience_prototypes', 'Prototypes'], ['des_product_experience_interface_states', 'Interface States'], ['des_product_experience_interaction_design', 'Interaction Design'],
    ]],
    ['des_brand_craft', 'Brand Craft', 'Owns visual expression of the brand.', CORE, ACTIVE, [
      ['des_brand_craft_visual_identity', 'Visual Identity'], ['des_brand_craft_campaign_creative', 'Campaign Creative'], ['des_brand_craft_brand_collateral', 'Brand Collateral'], ['des_brand_craft_visual_quality', 'Visual Quality'],
    ]],
  ]],
  ['Security', 'dept_security', [
    ['sec_identity_access', 'Identity & Access', 'Owns identity security and access governance.', CORE, ACTIVE, [
      ['sec_identity_access_identity_lifecycle', 'Identity Lifecycle'], ['sec_identity_access_permission_controls', 'Permission Controls'], ['sec_identity_access_privileged_access', 'Privileged Access'], ['sec_identity_access_access_reviews', 'Access Reviews'],
    ]],
    ['sec_infrastructure_protection', 'Infrastructure Protection', 'Owns technical infrastructure security.', CORE, ACTIVE, [
      ['sec_infrastructure_protection_cloud_posture', 'Cloud Posture'], ['sec_infrastructure_protection_network_security', 'Network Security'], ['sec_infrastructure_protection_endpoint_hardening', 'Endpoint Hardening'], ['sec_infrastructure_protection_vulnerability_remediation', 'Vulnerability Remediation'],
    ]],
    ['sec_application_security', 'Application Security', 'Owns security of software delivery.', CORE, ACTIVE, [
      ['sec_application_security_secure_sdlc', 'Secure SDLC'], ['sec_application_security_code_security_testing', 'Code Security Testing'], ['sec_application_security_secret_management', 'Secret Management'], ['sec_application_security_api_security', 'API Security'],
    ]],
    ['sec_detection_response', 'Detection & Response', 'Owns cyber-threat detection and containment.', CORE, ACTIVE, [
      ['sec_detection_response_security_alerting', 'Security Alerting'], ['sec_detection_response_threat_investigation', 'Threat Investigation'], ['sec_detection_response_incident_containment', 'Incident Containment'], ['sec_detection_response_response_retrospectives', 'Response Retrospectives'],
    ]],
    ['sec_security_assurance', 'Security Assurance', 'Owns evidence that security controls work.', CORE, ACTIVE, [
      ['sec_security_assurance_security_control_baseline', 'Security Control Baseline'], ['sec_security_assurance_audit_readiness', 'Audit Readiness'], ['sec_security_assurance_cyber_risk_register', 'Cyber Risk Register'], ['sec_security_assurance_security_awareness', 'Security Awareness'],
    ]],
  ]],
  ['Customer Success', 'dept_customer_success', [
    ['cs_success_management', 'Customer Success Management', 'Owns ongoing customer value delivery.', CORE, ACTIVE, [
      ['cs_success_management_customer_portfolio', 'Customer Portfolio'], ['cs_success_management_stakeholder_mapping', 'Stakeholder Mapping'], ['cs_success_management_success_plans', 'Success Plans'], ['cs_success_management_account_health', 'Account Health'],
    ]],
    ['cs_implementation_adoption', 'Implementation & Adoption', 'Owns customer implementation and activation.', CORE, ACTIVE, [
      ['cs_implementation_adoption_implementation_delivery', 'Implementation Delivery'], ['cs_implementation_adoption_onboarding_plans', 'Onboarding Plans'], ['cs_implementation_adoption_activation_milestones', 'Activation Milestones'], ['cs_implementation_adoption_user_enablement', 'User Enablement'],
    ]],
    ['cs_support_resolution', 'Support Resolution', 'Owns resolution of customer support needs.', CORE, ACTIVE, [
      ['cs_support_resolution_support_tickets', 'Support Tickets'], ['cs_support_resolution_escalations', 'Escalations'], ['cs_support_resolution_support_workflows', 'Support Workflows'], ['cs_support_resolution_knowledge_base', 'Knowledge Base'],
    ]],
    ['cs_retention_expansion', 'Retention & Expansion', 'Owns retained and expanded customer value.', CORE, ACTIVE, [
      ['cs_retention_expansion_renewal_management', 'Renewal Management'], ['cs_retention_expansion_expansion_opportunities', 'Expansion Opportunities'], ['cs_retention_expansion_churn_prevention', 'Churn Prevention'], ['cs_retention_expansion_customer_advocacy', 'Customer Advocacy'],
    ]],
  ]],
  ['Legal & Compliance', 'dept_legal', [
    ['leg_commercial_agreements', 'Commercial Agreements', 'Owns legally binding commercial terms.', CORE, ACTIVE, [
      ['leg_commercial_agreements_customer_agreements', 'Customer Agreements'], ['leg_commercial_agreements_supplier_agreements', 'Supplier Agreements'], ['leg_commercial_agreements_ndas', 'NDAs'], ['leg_commercial_agreements_statements_of_work', 'Statements of Work'],
    ]],
    ['leg_regulatory_affairs', 'Regulatory Affairs', 'Owns legal interpretation of external obligations.', CORE, ACTIVE, [
      ['leg_regulatory_affairs_regulatory_obligations', 'Regulatory Obligations'], ['leg_regulatory_affairs_legal_filings', 'Legal Filings'], ['leg_regulatory_affairs_legal_licences', 'Legal Licences'], ['leg_regulatory_affairs_policy_interpretation', 'Policy Interpretation'],
    ]],
    ['leg_ip_data_rights', 'IP & Data Rights', 'Owns legal rights in intellectual property and data.', CORE, ACTIVE, [
      ['leg_ip_data_rights_intellectual_property', 'Intellectual Property'], ['leg_ip_data_rights_data_rights', 'Data Rights'], ['leg_ip_data_rights_licensing_rights', 'Licensing Rights'], ['leg_ip_data_rights_ownership_rights', 'Ownership Rights'],
    ]],
    ['leg_legal_advice_disputes', 'Legal Advice & Disputes', 'Owns legal guidance and contentious matters.', CORE, ACTIVE, [
      ['leg_legal_advice_disputes_advisory_requests', 'Advisory Requests'], ['leg_legal_advice_disputes_legal_opinions', 'Legal Opinions'], ['leg_legal_advice_disputes_notices', 'Notices'], ['leg_legal_advice_disputes_disputes', 'Disputes'],
    ]],
  ]],
  ['Strategy', 'dept_strategy', [
    ['str_corporate_direction', 'Corporate Direction', 'Owns enduring company direction.', CORE, ACTIVE, [
      ['str_corporate_direction_vision', 'Vision'], ['str_corporate_direction_strategic_priorities', 'Strategic Priorities'], ['str_corporate_direction_business_model', 'Business Model'], ['str_corporate_direction_annual_plan', 'Annual Plan'],
    ]],
    ['str_strategic_growth', 'Strategic Growth', 'Owns deliberate enterprise growth bets.', CORE, ACTIVE, [
      ['str_strategic_growth_market_entry', 'Market Entry'], ['str_strategic_growth_strategic_initiatives', 'Strategic Initiatives'], ['str_strategic_growth_transformation', 'Transformation'], ['str_strategic_growth_portfolio_bets', 'Portfolio Bets'],
    ]],
    ['str_market_intelligence', 'Market Intelligence', 'Owns external strategic signals.', CORE, ACTIVE, [
      ['str_market_intelligence_industry_trends', 'Industry Trends'], ['str_market_intelligence_competitor_moves', 'Competitor Moves'], ['str_market_intelligence_macro_signals', 'Macro Signals'], ['str_market_intelligence_customer_shifts', 'Customer Shifts'],
    ]],
    ['str_corporate_development', 'Corporate Development', 'Owns inorganic and ecosystem strategy.', CORE, ACTIVE, [
      ['str_corporate_development_acquisitions', 'Acquisitions'], ['str_corporate_development_investments', 'Investments'], ['str_corporate_development_deal_diligence', 'Deal Diligence'], ['str_corporate_development_ecosystem_strategy', 'Ecosystem Strategy'],
    ]],
  ]],
];

export const BDT_TAXONOMY: readonly BdtTaxonomyDepartment[] = RAW_TAXONOMY.map(department);
