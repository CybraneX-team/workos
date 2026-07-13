import { Router } from 'express';
import { authJwt } from '../middleware/authJwt.js';
import { pool, supabaseAdmin } from '../db.js';
import { env } from '../config.js';
import { requirePermission } from '../rbac.js';

export const metricsOnboardingRouter = Router();
metricsOnboardingRouter.use(authJwt);

/**
 * POST /generate-departments
 * Generates dynamic department suggestions using OpenAI API key stored securely on the backend.
 */
metricsOnboardingRouter.post('/generate-departments', async (req, res) => {
  try {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: 'missing_auth_context' });
    }

    const { name, industryName, description, businessModel, problemSolved, usp } = req.body;

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'openai_api_key_not_configured' });
    }

    const prompt = `Startup Name: ${name || 'N/A'}
        Industry: ${industryName || 'N/A'}
        Description: ${description || 'N/A'}
        Business Model: ${businessModel || 'N/A'}
        Problem Solved: ${problemSolved || 'N/A'}
        USP: ${usp || 'N/A'}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a startup organizational structure assistant. Based on the startup\'s name, industry, description, business model, and problem statement, suggest 5 to 7 relevant, short department names that this startup should have (e.g., "Engineering", "Marketing", "Sales", "Customer Success", "Product Management", "Operations"). Return ONLY a valid JSON array of strings containing the department names. Do not include any markdown code blocks, backticks, or extra text. Example output: ["Engineering", "Marketing"]'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[openai] api call failed', errorText);
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() ?? '';

    let jsonStr = content;
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    }

    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
      return res.json({ departments: parsed });
    } else {
      throw new Error('Invalid response structure from OpenAI completions');
    }
  } catch (err: any) {
    console.error('[metrics-onboarding] generate-departments failed', err);
    return res.status(500).json({ error: 'generation_failed', details: err.message });
  }
});

/**
 * POST /:companyId/initial
 * Saves the initial set of metrics collected during the onboarding form.
 * Inserts into `metric_snapshots` (integration_id = 'manual') and also
 * updates the core `companies` columns for the Overview fallback path.
 */
metricsOnboardingRouter.post('/:companyId/initial', requirePermission('data', 'write'), async (req, res) => {
  try {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: 'missing_auth_context' });
    }

    // User must belong to this company
    if (auth.companyId !== req.params.companyId) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const { companyId } = req.params;
    const {
      mrr = 0,
      cac = 0,
      ltv = 0,
      churn = 5,
      burn = 0,
      nps = 0,
      runway = 12,
      headcount = 1,
    } = req.body;

    // 1. Insert metric_snapshots row with integration_id = 'manual'
    await pool.query(
      `INSERT INTO public.metric_snapshots (company_id, integration_id, metrics)
       VALUES ($1, 'manual', $2::jsonb)`,
      [
        companyId,
        JSON.stringify({
          revenue: Number(mrr) || 0,
          burn: Number(burn) || 0,
          cpa: Number(cac) || 0,
          cltv: Number(ltv) || 0,
          headcount: Number(headcount) || 1,
          churn: Number(churn) || 5,
          nps: Number(nps) || 0,
          runway: Number(runway) || 12,
        }),
      ],
    );

    // 2. Also update the companies table columns so Overview fallback works
    await supabaseAdmin
      .from('companies')
      .update({
        mrr_usd: Number(mrr) || 0,
        burn_rate_usd: Number(burn) || 0,
        employees: Number(headcount) || 1,
        runway_months: Number(runway) || 12,
      })
      .eq('id', companyId);

    console.log(`[metrics-onboarding] saved initial metrics for company ${companyId}`);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[metrics-onboarding] failed', err);
    return res.status(500).json({ error: 'metrics_save_failed', details: err.message });
  }
});

/**
 * GET /:companyId/latest
 * Returns the most recent manual/simulator metric snapshot so the
 * Manual Input form can pre-fill with real saved values.
 */
metricsOnboardingRouter.get('/:companyId/latest', async (req, res) => {
  try {
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: 'missing_auth_context' });
    if (auth.companyId !== req.params.companyId) return res.status(403).json({ error: 'forbidden' });

    const { rows } = await pool.query(
      `SELECT metrics FROM public.metric_snapshots
       WHERE company_id = $1 AND integration_id IN ('manual', 'simulator')
       ORDER BY snapshot_at DESC LIMIT 1`,
      [req.params.companyId],
    );

    return res.json(rows[0]?.metrics ?? null);
  } catch (err: any) {
    console.error('[metrics-onboarding] latest fetch failed', err);
    return res.status(500).json({ error: 'fetch_failed' });
  }
});

/**
 * GET /:companyId/history
 * Returns up to 12 months of (month, mrr, burn) data points for the Revenue vs Burn chart.
 */
metricsOnboardingRouter.get('/:companyId/history', async (req, res) => {
  try {
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: 'missing_auth_context' });
    if (auth.companyId !== req.params.companyId) return res.status(403).json({ error: 'forbidden' });

    const { rows } = await pool.query(
      `SELECT
         to_char(snapshot_at, 'Mon') AS month,
         (metrics->>'revenue')::numeric AS mrr,
         (metrics->>'burn')::numeric    AS burn
       FROM public.metric_snapshots
       WHERE company_id = $1 AND integration_id IN ('manual', 'simulator')
       ORDER BY snapshot_at ASC
       LIMIT 12`,
      [req.params.companyId],
    );

    return res.json(rows.map(r => ({
      month: r.month as string,
      mrr: Number(r.mrr) || 0,
      burn: Number(r.burn) || 0,
    })));
  } catch (err: any) {
    console.error('[metrics-onboarding] history fetch failed', err);
    return res.status(500).json({ error: 'fetch_failed' });
  }
});

/**
 * GET /:companyId/has-metrics
 * Returns { hasMetrics: boolean } — whether the company has any metric_snapshots.
 */
metricsOnboardingRouter.get('/:companyId/has-metrics', async (req, res) => {
  try {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ error: 'missing_auth_context' });
    }
    if (auth.companyId !== req.params.companyId) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const { rows } = await pool.query(
      `SELECT EXISTS(
        SELECT 1 FROM public.metric_snapshots WHERE company_id = $1
      ) AS has_metrics`,
      [req.params.companyId],
    );

    return res.json({ hasMetrics: rows[0]?.has_metrics ?? false });
  } catch (err: any) {
    console.error('[metrics-onboarding] has-metrics check failed', err);
    return res.status(500).json({ error: 'check_failed' });
  }
});
