import { normalizeExcel } from './normalizeExcel.js';
import { normalizeRoster } from './normalizeRoster.js';

export const handlers: Record<string, (job: Record<string, any>) => Promise<number>> = {
  normalize: normalizeExcel,
  roster: normalizeRoster,
};

