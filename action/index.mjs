import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const file = process.env.INPUT_PATH;
const strict = String(process.env.INPUT_STRICT).toLowerCase() === 'true';
if (!file || !fs.existsSync(file)) {
  console.error(`::error::The Extractor could not find: ${file || '(empty path)'}`);
  process.exit(1);
}
const root = path.resolve(import.meta.dirname, '..');
const args = [path.join(root, 'extractor.mjs'), 'audit', file, '--format', 'text'];
if (strict) args.push('--strict');
const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
process.exit(run.status ?? 1);
