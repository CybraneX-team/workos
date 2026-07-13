import cors from 'cors';
import express from 'express';
import { env } from './config.js';
import { startWorker } from './jobs/runner.js';
import { startErpnextProvisionWorker } from './jobs/erpnextProvision.js';
import { startErpnextRoleReconciliationWorker } from './lib/erpnextRoleSync.js';
import { ingestionRouter } from './routes/ingestion.js';
import { metricsRouter } from './routes/metrics.js';
import { integrationsRouter } from './routes/integrations.js';
import { provisionRouter } from './routes/provision.js';
import { metricsOnboardingRouter } from './routes/metricsOnboarding.js';
import { geminiRouter } from './routes/gemini.js';
import { joinRequestsRouter } from './routes/joinRequests.js';
import { companyInvitesRouter } from './routes/companyInvites.js';
import { companiesRouter } from './routes/companies.js';
import { ecosystemRouter } from './routes/ecosystem.js';
import { meRouter } from './routes/me.js';
import { profileRouter } from './routes/profile.js';
import { teamRouter } from './routes/team.js';
import { rbacRouter } from './routes/rbac.js';
import { departmentsRouter } from './routes/departments.js';
import { referenceCompaniesRouter } from './routes/referenceCompanies.js';
import { bdtCatalogRouter } from './routes/bdtCatalog.js';
import { erpnextChatRouter } from './routes/erpnextChat.js';
import { erpnextOperationsRouter } from './routes/erpnextOperations.js';
import { erpnextSupplyChainRouter } from './routes/erpnextSupplyChain.js';
import { erpnextSalesRouter } from './routes/erpnextSales.js';
import { erpnextProductsRouter } from './routes/erpnextProducts.js';
import { bdtNodeActivationRouter } from './routes/bdtNodeActivation.js';
import { debugLogRouter } from './routes/debugLog.js';
import { oidcRouter } from './routes/oidc.js';
import { incubatorRouter } from './routes/incubator.js';
import { incubatorRosterRouter } from './routes/incubatorRoster.js';
import { incubatorInvitesRouter } from './routes/incubatorInvites.js';
import { publicInvitesRouter } from './routes/publicInvites.js';
import { incubatorPortfolioRouter } from './routes/incubatorPortfolio.js';
import { incubatorCohortsRouter } from './routes/incubatorCohorts.js';
import { incubatorDashboardRouter } from './routes/incubatorDashboard.js';
import { incubatorDiscoverRouter } from './routes/incubatorDiscover.js';
import { initializeRbac } from './rbac.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/test', (_req, res) => {
  res.json({ test: 'ok test test', 'ci-cd another test': true, deployed: 'azure-actions' });
});

app.use('/api/ingestion', ingestionRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/simulator', provisionRouter);
app.use('/api/metrics-onboarding', metricsOnboardingRouter);
app.use('/api/gemini', geminiRouter);
app.use('/api/join-requests', joinRequestsRouter);
app.use('/api/company-invites', companyInvitesRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/ecosystem', ecosystemRouter);
app.use('/api/me', meRouter);
app.use('/api/profile', profileRouter);
app.use('/api/team', teamRouter);
app.use('/api/rbac', rbacRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/reference-companies', referenceCompaniesRouter);
app.use('/api/bdt/catalog', bdtCatalogRouter);
app.use('/api/erpnext/operations', erpnextOperationsRouter);
app.use('/api/erpnext/supply-chain', erpnextSupplyChainRouter);
app.use('/api/erpnext/sales', erpnextSalesRouter);
app.use('/api/erpnext/products', erpnextProductsRouter);
app.use('/api/bdt', bdtNodeActivationRouter);
app.use('/api/debug', debugLogRouter);
app.use('/api/erpnext', erpnextChatRouter);
app.use('/api/oidc', oidcRouter);
app.use('/api/incubators', incubatorRouter);
app.use('/api/incubator/roster', incubatorRosterRouter);
app.use('/api/incubator/invites', incubatorInvitesRouter);
app.use('/api/invites', publicInvitesRouter);
app.use('/api/incubator/portfolio', incubatorPortfolioRouter);
app.use('/api/incubator/cohorts', incubatorCohortsRouter);
app.use('/api/incubator/dashboard', incubatorDashboardRouter);
app.use('/api/incubator/discover', incubatorDiscoverRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error('[server] unhandled route error', err);
  return res.status(500).json({ error: 'internal_error' });
});

initializeRbac()
  .then(() => {
    app.listen(Number(env.PORT), () => {
      console.log(`[backend] listening on :${env.PORT}`);
      if (env.RUN_WORKER) {
        startWorker();
        startErpnextProvisionWorker();
        startErpnextRoleReconciliationWorker();
        console.log(`[backend] worker started (${env.WORKER_ID})`);
      }
    });
  })
  .catch((err) => {
    console.error('[server] startup failed', err);
    process.exit(1);
  });
