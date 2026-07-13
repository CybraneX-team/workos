import type { AuthContext } from '../middleware/authJwt.js';

export interface IncubatorContext {
  id: string;
  name: string;
  onboardingCompleted: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      incubator?: IncubatorContext;
    }
  }
}

export {};
