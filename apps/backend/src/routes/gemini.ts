import { Router } from 'express';
import { authJwt } from '../middleware/authJwt.js';
import { env } from '../config.js';

export const geminiRouter = Router();

// Returns the API key to authenticated users so the frontend can open a
// Gemini Live WebSocket directly. Safe because the route is protected by
// authJwt — only authenticated app users can obtain it.
geminiRouter.post('/token', authJwt, (_req, res) => {
  if (!env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'gemini_not_configured' });
  }
  return res.json({ token: env.GEMINI_API_KEY });
});
