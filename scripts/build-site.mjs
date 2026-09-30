import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const out = path.join(root, 'dist');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
await fs.cp(path.join(root, 'site'), out, { recursive: true });
await fs.mkdir(path.join(out, 'docs'), { recursive: true });
await fs.copyFile(
  path.join(root, 'docs', 'CROWN-CORE-CASE-STUDY.md'),
  path.join(out, 'docs', 'CROWN-CORE-CASE-STUDY.md')
);
console.log('Built static site in dist/');
