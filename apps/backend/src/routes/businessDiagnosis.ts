import { Router } from 'express';
import { pool } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { env } from '../config.js';
import {
  BUSINESS_DIAGNOSIS_QUESTIONNAIRE_VERSION,
  canAccessBusinessDiagnosis,
  dynamicQuestionsSchema,
  generateBusinessDiagnosis,
  generateFollowUpQuestions,
  isCurrentDiagnosisVersion,
  normalizeDiagnosisCompletedAt,
  validateDynamicAnswers,
  validateFixedAnswers,
} from '../domains/business-diagnosis/service.js';
import { buildBusinessDiagnosisWorkbook } from '../domains/business-diagnosis/excel.js';

export const businessDiagnosisRouter = Router();
businessDiagnosisRouter.use(authJwt);

function requireDiagnosisAccess(req: any, res: any): { companyId: string; userId: string } | null {
  if (!req.auth?.companyId) {
    res.status(403).json({ error: 'no_workspace' });
    return null;
  }
  if (!canAccessBusinessDiagnosis(req.auth.role)) {
    res.status(403).json({ error: 'business_diagnosis_forbidden' });
    return null;
  }
  return { companyId: req.auth.companyId, userId: req.auth.userId };
}

function shape(row: any) {
  return {
    status: 'completed' as const,
    completedAt: row.completed_at,
    questionnaireVersion: row.questionnaire_version,
    answers: row.answers,
    report: row.report,
  };
}

businessDiagnosisRouter.get('/', async (req, res) => {
  try {
    const auth = requireDiagnosisAccess(req, res);
    if (!auth) return;
    const { rows } = await pool.query('SELECT answers, report, questionnaire_version, completed_at FROM public.business_diagnoses WHERE company_id = $1', [auth.companyId]);
    return res.json(rows[0] ? shape(rows[0]) : { status: 'not_started' });
  } catch (error) {
    console.error('[business-diagnosis] status failed', error);
    return res.status(500).json({ error: 'business_diagnosis_unavailable' });
  }
});

businessDiagnosisRouter.get('/export.xlsx', async (req, res) => {
  try {
    const auth = requireDiagnosisAccess(req, res);
    if (!auth) return;
    const { rows } = await pool.query(
      `SELECT answers, dynamic_questions, dynamic_answers, report, questionnaire_version, completed_at
         FROM public.business_diagnoses WHERE company_id = $1`,
      [auth.companyId],
    );
    const diagnosis = rows[0];
    if (!diagnosis) return res.status(404).json({ error: 'business_diagnosis_not_found' });
    const workbook = buildBusinessDiagnosisWorkbook({
      answers: diagnosis.answers,
      dynamicQuestions: diagnosis.dynamic_questions,
      dynamicAnswers: diagnosis.dynamic_answers,
      report: diagnosis.report,
      questionnaireVersion: diagnosis.questionnaire_version,
      completedAt: new Date(diagnosis.completed_at).toISOString(),
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="business-diagnosis.xlsx"');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(workbook);
  } catch (_error) {
    console.error('[business-diagnosis] Excel export failed');
    return res.status(500).json({ error: 'business_diagnosis_export_failed' });
  }
});

businessDiagnosisRouter.post('/follow-up-questions', async (req, res) => {
  try {
    const auth = requireDiagnosisAccess(req, res);
    if (!auth) return;
    if (!env.GEMINI_API_KEY) return res.status(503).json({ error: 'business_diagnosis_not_configured' });
    const answers = validateFixedAnswers(req.body?.answers);
    const replaceCurrent = req.body?.replaceCurrent === true;
    const expected = normalizeDiagnosisCompletedAt(req.body?.expectedCompletedAt);
    if (!answers) return res.status(400).json({ error: 'invalid_business_answers' });
    const { rows } = await pool.query('SELECT answers, report, questionnaire_version, completed_at FROM public.business_diagnoses WHERE company_id = $1', [auth.companyId]);
    if (rows[0] && !replaceCurrent) return res.status(409).json({ error: 'business_diagnosis_completed', diagnosis: shape(rows[0]) });
    if (replaceCurrent && (!expected || !rows[0] || !isCurrentDiagnosisVersion(rows[0].completed_at, expected))) {
      return res.status(409).json({ error: 'diagnosis_changed', diagnosis: rows[0] ? shape(rows[0]) : null });
    }
    return res.json({ questions: await generateFollowUpQuestions(answers) });
  } catch (error) {
    // Gemini may include provider diagnostics in its thrown message. Do not log
    // that raw response beside a company's assessment request.
    console.error('[business-diagnosis] follow-up generation failed');
    return res.status(503).json({ error: env.GEMINI_API_KEY ? 'business_diagnosis_generation_failed' : 'business_diagnosis_not_configured' });
  }
});

businessDiagnosisRouter.post('/complete', async (req, res) => {
  try {
    const auth = requireDiagnosisAccess(req, res);
    if (!auth) return;
    const answers = validateFixedAnswers(req.body?.answers);
    const questionsResult = dynamicQuestionsSchema.safeParse(req.body?.dynamicQuestions);
    const dynamicAnswers = questionsResult.success ? validateDynamicAnswers(req.body?.dynamicAnswers, questionsResult.data) : null;
    const replaceCurrent = req.body?.replaceCurrent === true;
    const expected = normalizeDiagnosisCompletedAt(req.body?.expectedCompletedAt);
    if (!answers || !questionsResult.success || !dynamicAnswers) return res.status(400).json({ error: 'invalid_business_diagnosis_submission' });
    const existing = await pool.query('SELECT answers, report, questionnaire_version, completed_at FROM public.business_diagnoses WHERE company_id = $1', [auth.companyId]);
    if (existing.rows[0] && !replaceCurrent) return res.status(409).json({ error: 'business_diagnosis_completed', diagnosis: shape(existing.rows[0]) });
    if (replaceCurrent && (!expected || !existing.rows[0] || !isCurrentDiagnosisVersion(existing.rows[0].completed_at, expected))) {
      return res.status(409).json({ error: 'diagnosis_changed', diagnosis: existing.rows[0] ? shape(existing.rows[0]) : null });
    }
    if (!env.GEMINI_API_KEY) return res.status(503).json({ error: 'business_diagnosis_not_configured' });
    const report = await generateBusinessDiagnosis(answers, questionsResult.data, dynamicAnswers);
    if (replaceCurrent) {
      const updated = await pool.query(
        `UPDATE public.business_diagnoses
         SET answers = $2::jsonb, dynamic_questions = $3::jsonb, dynamic_answers = $4::jsonb,
             report = $5::jsonb, questionnaire_version = $6, prompt_version = $7,
             model = $8, completed_by = $9, completed_at = NOW()
         -- pg serializes timestamptz to JavaScript Date milliseconds for the
         -- browser. Compare at that same precision for optimistic replacement.
         WHERE company_id = $1 AND date_trunc('milliseconds', completed_at) = $10::timestamptz
         RETURNING answers, report, questionnaire_version, completed_at`,
        [auth.companyId, JSON.stringify(answers), JSON.stringify(questionsResult.data), JSON.stringify(dynamicAnswers), JSON.stringify(report), BUSINESS_DIAGNOSIS_QUESTIONNAIRE_VERSION, 'v1', env.GEMINI_MODEL, auth.userId, expected],
      );
      if (updated.rows[0]) return res.json(shape(updated.rows[0]));
      const current = await pool.query('SELECT answers, report, questionnaire_version, completed_at FROM public.business_diagnoses WHERE company_id = $1', [auth.companyId]);
      return res.status(409).json({ error: 'diagnosis_changed', diagnosis: current.rows[0] ? shape(current.rows[0]) : null });
    }
    const inserted = await pool.query(
      `INSERT INTO public.business_diagnoses (company_id, answers, dynamic_questions, dynamic_answers, report, questionnaire_version, prompt_version, model, completed_by)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
       ON CONFLICT (company_id) DO NOTHING
       RETURNING answers, report, questionnaire_version, completed_at`,
      [auth.companyId, JSON.stringify(answers), JSON.stringify(questionsResult.data), JSON.stringify(dynamicAnswers), JSON.stringify(report), BUSINESS_DIAGNOSIS_QUESTIONNAIRE_VERSION, 'v1', env.GEMINI_MODEL, auth.userId],
    );
    if (inserted.rows[0]) return res.status(201).json(shape(inserted.rows[0]));
    const concurrent = await pool.query('SELECT answers, report, questionnaire_version, completed_at FROM public.business_diagnoses WHERE company_id = $1', [auth.companyId]);
    return res.status(409).json({ error: 'business_diagnosis_completed', diagnosis: shape(concurrent.rows[0]) });
  } catch (error) {
    // The report and provider diagnostics are intentionally never logged.
    console.error('[business-diagnosis] completion generation failed');
    return res.status(503).json({ error: 'business_diagnosis_generation_failed' });
  }
});
