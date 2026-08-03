import type {
  BusinessDiagnosisAnswers,
  BusinessDiagnosisCompleted,
  BusinessDiagnosisDynamicQuestion,
} from '@cybranex/shared-types';
import { api } from '../api';

export type BusinessDiagnosisStatus = { status: 'not_started' } | BusinessDiagnosisCompleted;

export const fetchBusinessDiagnosis = () => api.get<BusinessDiagnosisStatus>('/api/business-diagnosis');

export const fetchBusinessDiagnosisFollowUps = (
  answers: BusinessDiagnosisAnswers,
  replacement?: { expectedCompletedAt: string },
) => api.post<{ questions: BusinessDiagnosisDynamicQuestion[] }>('/api/business-diagnosis/follow-up-questions', {
  answers,
  replaceCurrent: Boolean(replacement),
  expectedCompletedAt: replacement?.expectedCompletedAt,
});

export const completeBusinessDiagnosis = (
  answers: BusinessDiagnosisAnswers,
  dynamicQuestions: BusinessDiagnosisDynamicQuestion[],
  dynamicAnswers: BusinessDiagnosisAnswers,
  replacement?: { expectedCompletedAt: string },
) => api.post<BusinessDiagnosisCompleted>('/api/business-diagnosis/complete', {
  answers,
  dynamicQuestions,
  dynamicAnswers,
  replaceCurrent: Boolean(replacement),
  expectedCompletedAt: replacement?.expectedCompletedAt,
});

export const downloadBusinessDiagnosisExcel = () => api.getBlob('/api/business-diagnosis/export.xlsx');
