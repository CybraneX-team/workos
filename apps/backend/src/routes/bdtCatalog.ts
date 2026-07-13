import { Router } from 'express';
import { authJwt } from '../middleware/authJwt.js';
import { buildBdtCatalog } from '../data/bdtCatalog.js';

export const bdtCatalogRouter = Router();

// Auth only — NO company / permission gate: onboarding calls this before a
// company exists. The payload is static framework taxonomy, not company data.
bdtCatalogRouter.use(authJwt);

bdtCatalogRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  return res.json(buildBdtCatalog());
});
