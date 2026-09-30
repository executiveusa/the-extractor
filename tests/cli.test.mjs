import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync } from 'node:fs';

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


test('UI source rules survive HTML text extraction', () => {
  const file = path.join(tmpdir(), `extractor-ui-${Date.now()}.html`);
  writeFileSync(file, '<!doctype html><html><body><section class="rounded-3xl bg-gradient-to-r">Specific copy.</section></body></html>');
  const out = execFileSync(process.execPath, [cli, 'audit', file, '--format', 'json'], { encoding: 'utf8' });
  const report = JSON.parse(out);
  assert.ok(report.findings.some(f => f.id === 'X-U01'));
  assert.ok(report.findings.some(f => f.id === 'X-U02'));
});
