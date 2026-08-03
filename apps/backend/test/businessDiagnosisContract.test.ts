import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUSINESS_DIAGNOSIS_COMMON_QUESTIONS,
  BUSINESS_DIAGNOSIS_PROFILE_QUESTIONS,
  BUSINESS_DIAGNOSIS_SECTOR_QUESTIONS,
  businessDiagnosisQuestionsForSector,
} from '@cybranex/shared-types';
import { canAccessBusinessDiagnosis, dynamicQuestionsSchema, isCurrentDiagnosisVersion, normalizeDiagnosisCompletedAt, validateDynamicAnswers, validateFixedAnswers } from '../src/domains/business-diagnosis/service.js';
import { buildBusinessDiagnosisWorkbook } from '../src/domains/business-diagnosis/excel.js';
import * as XLSX from 'xlsx';

test('only founder and admin satisfy the business diagnosis role policy', () => {
  assert.equal(canAccessBusinessDiagnosis('founder'), true);
  assert.equal(canAccessBusinessDiagnosis('admin'), true);
  for (const role of ['super_admin', 'co_founder', 'viewer', 'analyst', 'custom_operator', null]) {
    assert.equal(canAccessBusinessDiagnosis(role), false);
  }
});

test('replacement only accepts the diagnosis version the user started from', () => {
  const original = '2026-08-03T07:00:00.000Z';
  assert.equal(normalizeDiagnosisCompletedAt(original), original);
  assert.equal(isCurrentDiagnosisVersion(original, original), true);
  assert.equal(isCurrentDiagnosisVersion(original, '2026-08-03T07:00:01.000Z'), false);
  assert.equal(isCurrentDiagnosisVersion(original, 'not-a-date'), false);
});

test('business diagnosis questionnaire has unique, selectable fixed questions', () => {
  const all = [
    ...BUSINESS_DIAGNOSIS_PROFILE_QUESTIONS,
    ...BUSINESS_DIAGNOSIS_COMMON_QUESTIONS,
    ...Object.values(BUSINESS_DIAGNOSIS_SECTOR_QUESTIONS).flat(),
  ];
  assert.equal(new Set(all.map((question) => question.id)).size, all.length);
  for (const question of all) {
    assert.ok(question.label.length > 0);
    if (question.type === 'select' || question.type === 'radio' || question.type === 'multiselect') assert.ok(question.options?.length);
  }
  assert.deepEqual(businessDiagnosisQuestionsForSector('Other').map((question) => question.id), BUSINESS_DIAGNOSIS_COMMON_QUESTIONS.map((question) => question.id));
});

test('fixed answers accept only the chosen sector question contract', () => {
  const answers = validateFixedAnswers({
    business_name: 'Example Works', sector: 'IT & Software Services', district: 'Pune, Maharashtra',
    years_in_operation: 4, employee_count: 18, annual_revenue: '₹1 - 5 crore',
    it_type: ['SaaS products'], it_challenges: ['Client acquisition'],
    main_problems: ['Technology adoption'], digital_tools: ['CRM system'],
    tech_comfort: 'Somewhat comfortable', growth_expectation: 'Moderate growth (10-25%)',
  });
  assert.equal(answers?.sector, 'IT & Software Services');
  assert.equal(validateFixedAnswers({ ...answers, it_type: ['not an option'] }), null);
});

test('dynamic questions require three to five safe, unique records and validate answers', () => {
  const questions = dynamicQuestionsSchema.parse([
    { id: 'main_constraint', label: 'What limits delivery most today?', type: 'text' },
    { id: 'review_cycle', label: 'How often do you review business performance?', type: 'radio', options: ['Daily', 'Weekly'] },
    { id: 'growth_constraints', label: 'Which constraints limit growth?', type: 'multiselect', options: ['Capital', 'Hiring'] },
  ]);
  assert.deepEqual(validateDynamicAnswers({ main_constraint: 'Limited visibility', review_cycle: 'Weekly', growth_constraints: ['Capital'] }, questions)?.review_cycle, 'Weekly');
  assert.equal(validateDynamicAnswers({ main_constraint: 'Limited visibility', review_cycle: 'Monthly', growth_constraints: ['Capital'] }, questions), null);
  assert.throws(() => dynamicQuestionsSchema.parse([{ id: 'x', label: 'too short', type: 'text' }]));
});

test('Excel export includes the current report and treats formula-looking content as text', () => {
  const workbook = XLSX.read(buildBusinessDiagnosisWorkbook({
    answers: { business_name: '=FORMULA()', sector: 'Other', district: 'Pune, Maharashtra', years_in_operation: 2, employee_count: 10, annual_revenue: '₹25 lakh - ₹1 crore', main_problems: ['Technology adoption'], digital_tools: ['None'], tech_comfort: 'Neutral', growth_expectation: 'Slow growth (up to 10%)' },
    dynamicQuestions: [{ id: 'key_blocker', label: 'What blocks growth today?', type: 'text' }, { id: 'review_frequency', label: 'How often do you review progress?', type: 'radio', options: ['Weekly', 'Monthly'] }, { id: 'priority_area', label: 'Which area needs attention?', type: 'multiselect', options: ['Sales', 'Operations'] }],
    dynamicAnswers: { key_blocker: 'Visibility', review_frequency: 'Weekly', priority_area: ['Sales'] },
    report: { executiveSummary: '=not a formula', businessContext: 'Current operating context for the business.', rootCauses: [{ title: 'Low visibility', evidence: 'The responses indicate limited operational visibility.', impact: 'high', urgency: 'high' }, { title: 'Manual process', evidence: 'The responses identify manual work across the business.', impact: 'medium', urgency: 'medium' }], priorities: [{ rank: 1, issue: 'Improve visibility', whyNow: 'It enables faster operating decisions.' }, { rank: 2, issue: 'Standardize work', whyNow: 'It reduces recurring manual effort.' }], recommendations: [{ title: 'Use a dashboard', problemAddressed: 'Low visibility', whyFit: 'It consolidates existing information.', expectedBenefit: 'Faster reviews and decisions.', effort: 'low', prerequisites: ['Owner'], implementationRisks: ['Adoption'] }, { title: 'Map processes', problemAddressed: 'Manual process', whyFit: 'It makes recurring work visible.', expectedBenefit: 'Fewer handoffs and errors.', effort: 'medium', prerequisites: ['Team time'], implementationRisks: ['Scope creep'] }], roadmap: { days0To30: ['Map current operating reviews.'], days31To90: ['Launch the first dashboard.'], later: ['Automate repeat reporting.'] }, measures: [{ name: 'Review cadence', reason: 'Shows whether management reviews occur.' }, { name: 'Manual hours', reason: 'Shows the burden of manual work.' }] },
    completedAt: '2026-08-03T07:00:00.000Z', questionnaireVersion: '2026-08-03',
  }));
  assert.deepEqual(workbook.SheetNames, ['Overview', 'Root Causes', 'Priorities', 'Recommendations', 'Roadmap', 'Measures', 'Questionnaire Responses']);
  assert.equal(workbook.Sheets.Overview.B2.v, "'=FORMULA()");
  assert.equal(workbook.Sheets.Overview.B7.v, "'=not a formula");
  assert.equal(workbook.Sheets['Questionnaire Responses'].C2.v, "'=FORMULA()");
});
