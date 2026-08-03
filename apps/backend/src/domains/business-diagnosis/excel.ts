import * as XLSX from 'xlsx';
import {
  BUSINESS_DIAGNOSIS_PROFILE_QUESTIONS,
  businessDiagnosisQuestionsForSector,
  type BusinessDiagnosisAnswers,
  type BusinessDiagnosisDynamicQuestion,
  type BusinessDiagnosisQuestion,
  type BusinessDiagnosisReport,
} from '@cybranex/shared-types';

export interface BusinessDiagnosisExcelSource {
  answers: BusinessDiagnosisAnswers;
  dynamicQuestions: BusinessDiagnosisDynamicQuestion[];
  dynamicAnswers: BusinessDiagnosisAnswers;
  report: BusinessDiagnosisReport;
  completedAt: string;
  questionnaireVersion: string;
}

type CellValue = string | number;
type SheetRow = CellValue[];

/** Prevent a diagnosis answer or model output from becoming an Excel formula. */
function safeText(value: unknown): string {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function answerValue(value: BusinessDiagnosisAnswers[string] | undefined): string | number {
  return Array.isArray(value) ? value.join('; ') : typeof value === 'number' ? value : safeText(value);
}

function addSheet(workbook: XLSX.WorkBook, name: string, rows: SheetRow[], widths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows.map((row) => row.map((value) => typeof value === 'number' ? value : safeText(value))));
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  sheet['!autofilter'] = rows.length > 1 ? { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: Math.max(0, widths.length - 1), r: rows.length - 1 } }) } : undefined;
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function responseRows(
  answers: BusinessDiagnosisAnswers,
  dynamicQuestions: BusinessDiagnosisDynamicQuestion[],
  dynamicAnswers: BusinessDiagnosisAnswers,
): SheetRow[] {
  const sector = typeof answers.sector === 'string' ? answers.sector : '';
  const fixedQuestions: readonly BusinessDiagnosisQuestion[] = [
    ...BUSINESS_DIAGNOSIS_PROFILE_QUESTIONS,
    ...businessDiagnosisQuestionsForSector(sector),
  ];
  return [
    ['Section', 'Question', 'Response'],
    ...fixedQuestions.map((question) => [question.id === 'sector' || BUSINESS_DIAGNOSIS_PROFILE_QUESTIONS.some((profile) => profile.id === question.id) ? 'Business profile' : 'Business context', question.label, answerValue(answers[question.id])]),
    ...dynamicQuestions.map((question) => ['Targeted follow-up', question.label, answerValue(dynamicAnswers[question.id])]),
  ];
}

/** Builds a read-only export of the current saved diagnosis; it does not persist data. */
export function buildBusinessDiagnosisWorkbook(source: BusinessDiagnosisExcelSource): Buffer {
  const workbook = XLSX.utils.book_new();
  const { report } = source;

  addSheet(workbook, 'Overview', [
    ['Business Diagnosis'],
    ['Business name', answerValue(source.answers.business_name)],
    ['Sector', answerValue(source.answers.sector)],
    ['Completed at', safeText(source.completedAt)],
    ['Questionnaire version', safeText(source.questionnaireVersion)],
    [],
    ['Executive summary', safeText(report.executiveSummary)],
    ['Business context', safeText(report.businessContext)],
  ], [26, 110]);

  addSheet(workbook, 'Root Causes', [
    ['Root cause', 'Evidence', 'Impact', 'Urgency'],
    ...report.rootCauses.map((item) => [item.title, item.evidence, item.impact, item.urgency]),
  ], [30, 74, 14, 14]);

  addSheet(workbook, 'Priorities', [
    ['Rank', 'Priority', 'Why now'],
    ...report.priorities.map((item) => [item.rank, item.issue, item.whyNow]),
  ], [10, 38, 82]);

  addSheet(workbook, 'Recommendations', [
    ['Recommendation', 'Problem addressed', 'Why it fits', 'Expected benefit', 'Effort', 'Prerequisites', 'Implementation risks'],
    ...report.recommendations.map((item) => [item.title, item.problemAddressed, item.whyFit, item.expectedBenefit, item.effort, item.prerequisites.join('; '), item.implementationRisks.join('; ')]),
  ], [30, 32, 54, 42, 12, 40, 40]);

  addSheet(workbook, 'Roadmap', [
    ['Timeframe', 'Action'],
    ...report.roadmap.days0To30.map((item) => ['0–30 days', item]),
    ...report.roadmap.days31To90.map((item) => ['31–90 days', item]),
    ...report.roadmap.later.map((item) => ['Later', item]),
  ], [18, 100]);

  addSheet(workbook, 'Measures', [
    ['Measure', 'Why track it'],
    ...report.measures.map((item) => [item.name, item.reason]),
  ], [32, 100]);

  addSheet(workbook, 'Questionnaire Responses', responseRows(source.answers, source.dynamicQuestions, source.dynamicAnswers), [22, 68, 68]);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
}
