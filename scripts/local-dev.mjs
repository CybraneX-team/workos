#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supabaseWorkdir = path.join(root, 'apps/frontend');
const optionalServices = 'edge-runtime,imgproxy,studio,vector';
const mode = process.argv[2] ?? 'both';

if (!['setup', 'backend', 'worker', 'frontend', 'both', 'test-native', 'test-sales', 'test-supercycle', 'verify-phase1', 'verify-phase2'].includes(mode)) {
  console.error('Usage: node scripts/local-dev.mjs <setup|backend|worker|frontend|both|test-native|test-sales|test-supercycle|verify-phase1|verify-phase2>');
  process.exit(1);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function redact(output) {
  return String(output).replace(/^([A-Z0-9_]*(?:KEY|SECRET|PASSWORD|TOKEN)[A-Z0-9_]*)=.*$/gm, '$1=<redacted>');
}

function ensureSupabase() {
  try {
    run('pnpm', [
      '--filter', 'backend', 'exec', 'supabase', 'start',
      '--exclude', optionalServices,
      '--workdir', supabaseWorkdir,
    ]);
  } catch (error) {
    const detail = redact(error.stderr || error.stdout || error.message);
    console.error('Could not start local Supabase. Ensure Docker/Colima is running.\n' + detail);
    process.exit(1);
  }
}

function localSupabaseEnv() {
  let output;
  try {
    output = run('pnpm', [
      '--filter', 'backend', 'exec', 'supabase', 'status',
      '--workdir', supabaseWorkdir,
      '--output', 'env',
    ]);
  } catch (error) {
    console.error('Could not read local Supabase status. Run pnpm local:setup first.');
    process.exit(1);
  }

  const values = Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^"|"$/g, '')]),
  );

  for (const name of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'DB_URL']) {
    if (!values[name]) {
      console.error(`Local Supabase did not provide ${name}. Run pnpm local:setup again.`);
      process.exit(1);
    }
  }
  return values;
}

function child(command, args, env) {
  return spawn(command, args, { cwd: root, env, stdio: 'inherit' });
}

ensureSupabase();
console.log('Local Supabase is ready (API :54321, database :54322).');

if (mode === 'setup') process.exit(0);

const local = localSupabaseEnv();
const shared = {
  ...process.env,
  SUPABASE_URL: local.API_URL,
  SUPABASE_ANON_KEY: local.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  DATABASE_URL: local.DB_URL,
};

const children = [];
if (mode === 'test-native') {
  const result = child('pnpm', ['--filter', 'backend', 'test:native-db'], shared);
  const code = await new Promise((resolve) => result.once('exit', (value) => resolve(value ?? 1)));
  process.exit(code);
}
if (mode === 'test-sales') {
  const result = child('pnpm', ['--filter', 'backend', 'test:sales-db'], shared);
  const code = await new Promise((resolve) => result.once('exit', (value) => resolve(value ?? 1)));
  process.exit(code);
}
if (mode === 'test-supercycle') {
  const result = child('pnpm', ['--filter', 'backend', 'test:bdt-supercycle-db'], { ...shared, BDT_SUPERCYCLE_DB_TESTS: '1' });
  const code = await new Promise((resolve) => result.once('exit', (value) => resolve(value ?? 1)));
  process.exit(code);
}
if (mode === 'verify-phase1' || mode === 'verify-phase2') {
  const commands = [
    ['pnpm', ['--filter', 'backend', 'typecheck']],
    ['pnpm', ['--filter', 'frontend', 'exec', 'tsc', '--noEmit']],
    ['pnpm', ['--filter', 'backend', 'test:native-architecture']],
    ['pnpm', ['--filter', 'backend', 'test:bdt']],
    ['pnpm', ['--filter', 'backend', 'test:meta-ads']],
    ['pnpm', ['--filter', 'backend', 'test:native-db']],
    ['pnpm', ['--filter', 'backend', 'test:meta-ads-authoring-db']],
    ...(mode === 'verify-phase2' ? [
      ['pnpm', ['--filter', 'backend', 'test:sales-architecture']],
      ['pnpm', ['--filter', 'backend', 'test:sales-db']],
    ] : []),
  ];
  for (const [command, args] of commands) {
    const spawned = child(command, args, shared);
    const code = await new Promise((resolve) => spawned.once('exit', (value) => resolve(value ?? 1)));
    if (code !== 0) process.exit(code);
  }
  process.exit(0);
}
if (mode === 'backend' || mode === 'worker' || mode === 'both') {
  children.push(child('pnpm', ['--filter', 'backend', 'dev'], { ...shared, RUN_WORKER: mode === 'worker' ? 'true' : 'false' }));
}
if (mode === 'frontend' || mode === 'both') {
  children.push(child('pnpm', ['--filter', 'frontend', 'dev', '--', '--host', '127.0.0.1'], {
    ...shared,
    VITE_SUPABASE_URL: local.API_URL,
    VITE_SUPABASE_ANON_KEY: local.ANON_KEY,
    VITE_BACKEND_URL: 'http://127.0.0.1:8080',
  }));
}

function stop(signal) {
  for (const process of children) process.kill(signal);
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

let exitCode = 0;
for (const process of children) {
  const code = await new Promise((resolve) => process.once('exit', (value) => resolve(value ?? 1)));
  if (code !== 0) exitCode = code;
}
process.exit(exitCode);
