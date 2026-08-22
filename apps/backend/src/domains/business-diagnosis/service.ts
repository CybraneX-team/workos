import {
  BUSINESS_DIAGNOSIS_PROMPT_VERSION,
  BUSINESS_DIAGNOSIS_QUESTIONNAIRE_VERSION,
  SAFE_TEXT,
  businessDiagnosisReportSchema,
  dynamicQuestionsSchema,
  generateBusinessDiagnosis as generateBusinessDiagnosisCore,
  generateFollowUpQuestions as generateFollowUpQuestionsCore,
  validateDynamicAnswers,
  validateFixedAnswers,
  type DiagnosisGenerationOptions,
} from '@cybranex/business-diagnosis';
import {
  BUSINESS_DIAGNOSIS_COMMON_QUESTIONS,
  BUSINESS_DIAGNOSIS_SECTOR_QUESTIONS,
  type BusinessDiagnosisAnswers,
  type BusinessDiagnosisDynamicQuestion,
} from '@cybranex/shared-types';
import { geminiJson, toGeminiSchema } from '../../lib/gemini.js';

/** Deliberately narrower than general administrative permissions. */
export function canAccessBusinessDiagnosis(role: string | null | undefined): boolean {
  return role === 'founder' || role === 'admin';
}

export function normalizeDiagnosisCompletedAt(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 80) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

export function isCurrentDiagnosisVersion(current: unknown, expected: unknown): boolean {
  const currentTimestamp = normalizeDiagnosisCompletedAt(current);
  const expectedTimestamp = normalizeDiagnosisCompletedAt(expected);
  return Boolean(currentTimestamp && expectedTimestamp && currentTimestamp === expectedTimestamp);
}

async function generateJson(prompt: string, options: DiagnosisGenerationOptions) {
  return geminiJson(prompt, { ...options, responseSchema: toGeminiSchema(options.responseSchema) });
}

export function generateFollowUpQuestions(answers: BusinessDiagnosisAnswers): Promise<BusinessDiagnosisDynamicQuestion[]> {
  return generateFollowUpQuestionsCore(answers, generateJson);
}

export function generateBusinessDiagnosis(answers: BusinessDiagnosisAnswers, dynamicQuestions: BusinessDiagnosisDynamicQuestion[], dynamicAnswers: BusinessDiagnosisAnswers) {
  return generateBusinessDiagnosisCore(answers, dynamicQuestions, dynamicAnswers, generateJson);
}

export {
  BUSINESS_DIAGNOSIS_COMMON_QUESTIONS,
  BUSINESS_DIAGNOSIS_PROMPT_VERSION,
  BUSINESS_DIAGNOSIS_QUESTIONNAIRE_VERSION,
  BUSINESS_DIAGNOSIS_SECTOR_QUESTIONS,
  SAFE_TEXT,
  businessDiagnosisReportSchema,
  dynamicQuestionsSchema,
  validateDynamicAnswers,
  validateFixedAnswers,
};
