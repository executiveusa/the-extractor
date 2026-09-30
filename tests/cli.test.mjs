import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'extractor.mjs');

function run(file, extra=[]) {
  return spawnSync(process.execPath, [cli, 'audit', path.join(root, file), '--format', 'json', ...extra], { encoding: 'utf8' });
}

test('slop fixture produces high and medium findings', () => {
  const r = run('tests/fixtures/slop.txt');
  assert.equal(r.status, 0);
  const report = JSON.parse(r.stdout);
  assert.ok(report.summary.total >= 5);
  assert.ok(report.findings.some(f => f.id === 'X-C01'));
  assert.match(report.provenance, /not proof of AI authorship/);
});

test('clean fixture is materially quieter', () => {
  const slop = JSON.parse(run('tests/fixtures/slop.txt').stdout);
  const clean = JSON.parse(run('tests/fixtures/clean.txt').stdout);
  assert.ok(clean.summary.total < slop.summary.total);
});

test('strict mode fails on high severity', () => {
  const r = run('tests/fixtures/slop.txt', ['--strict']);
  assert.equal(r.status, 1);
});
