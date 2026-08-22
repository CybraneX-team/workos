import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(backendRoot, 'dist');
if (path.dirname(dist) !== backendRoot || path.basename(dist) !== 'dist') {
  throw new Error('refusing_to_clean_unexpected_path');
}
await rm(dist, { recursive: true, force: true });
