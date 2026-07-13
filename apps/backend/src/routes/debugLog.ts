import { Router } from 'express';

// Temporary diagnostic endpoint — logs frontend-reported auth outcomes to the backend
// console so they're visible without browser devtools access. Remove once the Supabase
// signup-email issue is root-caused.
export const debugLogRouter = Router();

debugLogRouter.post('/log', (req, res) => {
  console.log('[debug-log]', JSON.stringify(req.body, null, 2));
  res.json({ ok: true });
});
