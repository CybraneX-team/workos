import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FALLBACK_DYNAMIC_QUESTIONS,
  businessDiagnosisReportSchema,
  dynamicQuestionsSchema,
  generateBusinessDiagnosis,
  generateFollowUpQuestions,
  validateDynamicAnswers,
  validateFixedAnswers,
} from '../src/index.js';

const fixedInput = {
  business_name: 'Example Works',
  sector: 'IT & Software Services',
  district: 'Pune, Maharashtra',
  years_in_operation: 4,
  employee_count: 18,
  annual_revenue: '₹1 - 5 crore',
  it_type: ['SaaS products'],
  it_challenges: ['Client acquisition'],
  main_problems: ['Technology adoption'],
  digital_tools: ['CRM system'],
  tech_comfort: 'Somewhat comfortable',
  growth_expectation: 'Moderate growth (10-25%)',
};

const report = {
  executiveSummary: 'The business has a viable service base but needs clearer operating visibility and a repeatable growth process.',
  businessContext: 'The company is an established software services business operating from Pune with a small delivery team.',
  rootCauses: [
    { title: 'Limited visibility', evidence: 'The submitted responses indicate fragmented operational reporting across the business.', impact: 'high', urgency: 'high' },
    { title: 'Manual growth process', evidence: 'Client acquisition is identified as a challenge without a repeatable digital workflow.', impact: 'medium', urgency: 'medium' },
  ],
  priorities: [
    { rank: 1, issue: 'Create operating visibility', whyNow: 'A common view is needed before the business can improve execution.' },
    { rank: 2, issue: 'Standardize acquisition', whyNow: 'A repeatable process will reduce dependency on ad hoc founder effort.' },
  ],
  recommendations: [
    { title: 'Operating dashboard', problemAddressed: 'Limited visibility', whyFit: 'It can consolidate the tools already in use.', expectedBenefit: 'Faster weekly decisions and earlier issue detection.', effort: 'low', prerequisites: ['Metric owner'], implementationRisks: ['Inconsistent source data'] },
    { title: 'Acquisition workflow', problemAddressed: 'Manual growth process', whyFit: 'It creates a repeatable path for a small team.', expectedBenefit: 'More consistent follow-up and pipeline visibility.', effort: 'medium', prerequisites: ['Defined stages'], implementationRisks: ['Low adoption'] },
  ],
  roadmap: { days0To30: ['Define operating measures.'], days31To90: ['Launch the first dashboard.'], later: ['Automate recurring reporting.'] },
  measures: [{ name: 'Review cadence', reason: 'Shows whether the operating rhythm is being followed.' }, { name: 'Qualified pipeline', reason: 'Shows whether acquisition is becoming repeatable.' }],
};

test('fixed and dynamic answers are bounded and normalized', () => {
  const fixed = validateFixedAnswers(fixedInput);
  assert.equal(fixed?.business_name, 'Example Works');
  assert.equal(validateFixedAnswers({ ...fixedInput, employee_count: 1_000_000_000 }), null);
  assert.equal(validateFixedAnswers({ ...fixedInput, business_name: 'x'.repeat(1_001) }), null);
  assert.deepEqual(validateDynamicAnswers({ key_challenge: 'Visibility', tech_barrier: 'Cost', growth_limit: ['Capital constraints'] }, FALLBACK_DYNAMIC_QUESTIONS)?.growth_limit, ['Capital constraints']);
});

test('dynamic questions reject duplicate and fixed-question identifiers', () => {
  assert.throws(() => dynamicQuestionsSchema.parse([
    { id: 'business_name', label: 'What business name should be used?', type: 'text' },
    ...FALLBACK_DYNAMIC_QUESTIONS.slice(0, 2),
  ]));
  assert.throws(() => dynamicQuestionsSchema.parse([FALLBACK_DYNAMIC_QUESTIONS[0], FALLBACK_DYNAMIC_QUESTIONS[0], FALLBACK_DYNAMIC_QUESTIONS[1]]));
});

test('malformed follow-up output uses the validated fallback', async () => {
  const fixed = validateFixedAnswers(fixedInput)!;
  const questions = await generateFollowUpQuestions(fixed, async () => ({ invalid: true }));
  assert.deepEqual(questions, FALLBACK_DYNAMIC_QUESTIONS);
  assert.equal(dynamicQuestionsSchema.safeParse(questions).success, true);
});

test('report generation uses injected transport and rejects malformed output', async () => {
  const fixed = validateFixedAnswers(fixedInput)!;
  const dynamic = { key_challenge: 'Visibility', tech_barrier: 'Cost', growth_limit: ['Capital constraints'] };
  const generated = await generateBusinessDiagnosis(fixed, FALLBACK_DYNAMIC_QUESTIONS, dynamic, async (prompt, options) => {
    assert.match(prompt, /untrusted data/);
    assert.match(options.system, /structured JSON/);
    return report;
  });
  assert.equal(generated.executiveSummary, report.executiveSummary);
  await assert.rejects(() => generateBusinessDiagnosis(fixed, FALLBACK_DYNAMIC_QUESTIONS, dynamic, async () => ({ executiveSummary: 'incomplete' })));
  assert.equal(businessDiagnosisReportSchema.safeParse(report).success, true);
});
