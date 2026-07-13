import { Router } from 'express';
import { pool } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { requireIncubator } from '../middleware/requireIncubator.js';

export const incubatorDiscoverRouter = Router();
incubatorDiscoverRouter.use(authJwt, requireIncubator);

// Search real, already-founder-owned companies (kind='active') that aren't
// managed by this incubator yet. This is deliberately public-fields-only —
// no mrr_usd/annual_revenue/burn_rate_usd/runway_months/incubator_notes —
// mirroring the D2a boundary elsewhere in this codebase (financials are only
// ever visible for companies this incubator actually manages).
incubatorDiscoverRouter.get('/', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;

    const search = typeof req.query.search === 'string' && req.query.search.trim() ? req.query.search.trim() : null;
    const stage = typeof req.query.stage === 'string' && req.query.stage.trim() ? req.query.stage.trim() : null;
    const sector = typeof req.query.sector === 'string' && req.query.sector.trim() ? req.query.sector.trim() : null;
    const country = typeof req.query.country === 'string' && req.query.country.trim() ? req.query.country.trim() : null;

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 24));
    const offset = (page - 1) * pageSize;

    const { rows } = await pool.query(
      `select
         c.id, c.name, c.slug, c.sector, c.stage, c.stage_label, c.country,
         c.founded_year, c.website, c.description, c.employees,
         coalesce(ccr.status, 'none') as connection_status,
         count(*) over() as total_count
       from public.companies c
       left join public.company_connection_requests ccr
         on ccr.company_id = c.id and ccr.incubator_id = $1
       where c.kind = 'active'
         and (c.managed_by_incubator_id is null or c.managed_by_incubator_id <> $1)
         and ($2::text is null or c.name ilike '%' || $2 || '%')
         and ($3::text is null or c.stage = $3::company_stage)
         and ($4::text is null or c.sector = $4)
         and ($5::text is null or c.country = $5)
       order by c.created_at desc
       limit $6 offset $7`,
      [incubatorId, search, stage, sector, country, pageSize, offset],
    );

    const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
    const companies = rows.map(({ total_count, ...rest }) => rest);

    return res.json({ companies, total, page, pageSize });
  } catch (err) {
    console.error('[incubatorDiscover] list unexpected error', err);
    return res.status(500).json({ error: 'discover_list_failed' });
  }
});

// Send a connection request to a real, independently-founded company.
// Idempotent: a pending/accepted request is reported, not duplicated; a
// declined one can be re-sent.
incubatorDiscoverRouter.post('/:companyId/connect', async (req, res) => {
  try {
    const incubatorId = req.incubator!.id;
    const companyId = req.params.companyId;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 500) || null : null;

    const { rows: companyRows } = await pool.query(
      `select id from public.companies
        where id = $1 and kind = 'active'
          and (managed_by_incubator_id is null or managed_by_incubator_id <> $2)`,
      [companyId, incubatorId],
    );
    if (companyRows.length === 0) {
      return res.status(404).json({ error: 'company_not_discoverable' });
    }

    const { rows: existing } = await pool.query(
      `select id, status from public.company_connection_requests where incubator_id = $1 and company_id = $2`,
      [incubatorId, companyId],
    );

    if (existing.length > 0) {
      const current = existing[0];
      if (current.status === 'pending') return res.json({ result: 'already_pending' });
      if (current.status === 'accepted') return res.json({ result: 'already_connected' });
      // declined -> allow a fresh request
      await pool.query(
        `update public.company_connection_requests
            set status = 'pending', message = $3, responded_at = null, created_at = now()
          where id = $1 and incubator_id = $2`,
        [current.id, incubatorId, message],
      );
      return res.json({ result: 're_sent' });
    }

    await pool.query(
      `insert into public.company_connection_requests (incubator_id, company_id, message)
       values ($1, $2, $3)`,
      [incubatorId, companyId, message],
    );
    return res.json({ result: 'sent' });
  } catch (err) {
    console.error('[incubatorDiscover] connect unexpected error', err);
    return res.status(500).json({ error: 'connect_failed' });
  }
});
