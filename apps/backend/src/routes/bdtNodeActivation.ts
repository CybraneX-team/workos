import { Router } from 'express';
import { authJwt } from '../middleware/authJwt.js';
import { resolveErpNextCreds } from '../lib/erpnextConnection.js';
import { listActiveBranchKeys as listOperationsActiveBranchKeys } from '../domains/workos-erp/erpnextOperations.js';
import { listActiveBranchKeys as listSalesActiveBranchKeys } from '../domains/workos-erp/erpnextSales.js';
import { listActiveBranchKeys as listProductsActiveBranchKeys } from '../domains/workos-erp/erpnextProducts.js';
import { supabaseAdmin } from '../db.js';

// Returns the set of active BDT branches for a company. New bindings use the stable branch
// source key (rather than display labels); legacy ERP/demo bindings retain their label pair
// until those adapters are migrated. The frontend accepts both forms during that transition.
//
// Deliberately a separate, lightweight endpoint rather than embedded in departments.ts's
// listDepartments() — that endpoint is hot/frequently-called and has no ERPNext awareness
// today; adding a credential lookup there would add latency to a call site that doesn't
// otherwise need it.

export const bdtNodeActivationRouter = Router();

interface ActiveKey {
  departmentSourceKey: string;
  nodeSourceKey?: string;
  level1Label?: string;
  branchLabel?: string;
}

// Marketing's Meta-fed branches under Paid Acquisition — active only once int-meta is
// connected (mirrors the ERPNext departments' erpConnected gate below). Keyed by the
// content-derived metadata.sourceKey (see genBdtSeed.ts's buildMetadata), which every node
// under a branch shares, not the positional department_bdt_nodes.source_key column — stable
// across future tree reorders, unlike the old mkt_l1_4_b2/b3/b4 positional keys this replaces.
// Organic Growth, Demand & Attribution, and Brand & Intelligence are deliberately not listed
// here: they have no live data source yet, so their placeholder branches render locked/dimmed
// until a real integration exists for them.
const MARKETING_PAID_ACQUISITION_KEYS = [
  'mkt_paid_acquisition_ad_performance',
  'mkt_paid_acquisition_spend_reach',
  'mkt_paid_acquisition_campaigns',
];

bdtNodeActivationRouter.get('/active-nodes', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const erpConnected = Boolean(await resolveErpNextCreds(companyId));

  const active: ActiveKey[] = [];
  if (erpConnected) {
    active.push(...listOperationsActiveBranchKeys().map(k => ({ departmentSourceKey: 'dept_operations', ...k })));
    active.push(...listSalesActiveBranchKeys().map(k => ({ departmentSourceKey: 'dept_sales', ...k })));
    active.push(...listProductsActiveBranchKeys().map(k => ({ departmentSourceKey: 'dept_product', ...k })));
  }

  const { data: metaConnection } = await supabaseAdmin.from('integration_connections')
    .select('integration_id').eq('company_id', companyId).eq('integration_id', 'int-meta').maybeSingle();
  if (metaConnection) {
    active.push(...MARKETING_PAID_ACQUISITION_KEYS.map(nodeSourceKey => ({ departmentSourceKey: 'dept_marketing', nodeSourceKey })));
  }

  res.json({ active, erpConnected, metaConnected: Boolean(metaConnection) });
});
