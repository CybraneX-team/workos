import { Router } from 'express';
import { authJwt } from '../middleware/authJwt.js';
import { resolveErpNextCreds } from '../lib/erpnextConnection.js';
import { supabaseAdmin } from '../db.js';
import { BDT_TAXONOMY } from '../data/bdtTaxonomy.js';

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
  nodeSourceKey: string;
}

// Marketing's Meta-fed branches under Paid Acquisition — active only once int-meta is
// connected (mirrors the ERPNext departments' erpConnected gate below). Keyed by the
// immutable metadata.sourceKey, which every node under a branch shares. It is explicit
// in the V2 taxonomy and is not derived from a display label or positional DB key.
// Organic Growth, Demand & Attribution, and Brand & Intelligence are deliberately not listed
// here: they have no live data source yet, so their placeholder branches render locked/dimmed
// until a real integration exists for them.
const MARKETING_PAID_ACQUISITION_KEYS = [
  'mkt_paid_acquisition_ad_performance',
  'mkt_paid_acquisition_spend_reach',
  'mkt_paid_acquisition_campaigns',
];

function activeBranchesForDepartments(departmentKeys: readonly string[]): ActiveKey[] {
  return BDT_TAXONOMY
    .filter(department => departmentKeys.includes(department.sourceKey))
    .flatMap(department => department.capabilities.flatMap(capability =>
      capability.branches
        .filter(branch => branch.availability === 'active')
        .map(branch => ({ departmentSourceKey: department.sourceKey, nodeSourceKey: branch.sourceKey })),
    ));
}

bdtNodeActivationRouter.get('/active-nodes', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  let erpConnected = false;
  try {
    erpConnected = Boolean(await resolveErpNextCreds(companyId));
  } catch (error) {
    // ERPNext availability must not take down the BDT. The endpoint can still
    // report Meta-backed nodes while the control-plane is offline.
    console.warn('[bdt-node-activation] ERPNext status unavailable', {
      companyId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const active: ActiveKey[] = [];
  if (erpConnected) {
    active.push(...activeBranchesForDepartments(['dept_operations', 'dept_sales', 'dept_product']));
  }

  const { data: metaConnection } = await supabaseAdmin.from('integration_connections')
    .select('integration_id').eq('company_id', companyId).eq('integration_id', 'int-meta').maybeSingle();
  if (metaConnection) {
    active.push(...MARKETING_PAID_ACQUISITION_KEYS.map(nodeSourceKey => ({ departmentSourceKey: 'dept_marketing', nodeSourceKey })));
  }

  res.json({ active, erpConnected, metaConnected: Boolean(metaConnection) });
});
