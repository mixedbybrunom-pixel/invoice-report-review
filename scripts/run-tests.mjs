// Runs the rule tests with Node's built-in test runner. No extra packages needed:
// esbuild already comes with vite, and it handles the "@/" import shortcut.
import { build } from 'esbuild';
import { readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const testsDir = path.join(root, 'tests');
const outDir = path.join(root, 'node_modules', '.cache', 'rule-tests');
mkdirSync(outDir, { recursive: true });

const entries = readdirSync(testsDir).filter((f) => f.endsWith('.test.ts')).map((f) => path.join(testsDir, f));
await build({
  entryPoints: entries,
  outdir: outDir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  alias: { '@': path.join(root, 'src') },
  logLevel: 'error',
});

const files = [
  ...readdirSync(outDir).filter((f) => f.endsWith('.mjs')).map((f) => path.join(outDir, f)),
  ...readdirSync(testsDir).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join(testsDir, f)),
];
const run = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(run.status ?? 1);
