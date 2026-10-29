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

function runStdin(input, extra = []) {
  return spawnSync(process.execPath, [cli, 'audit', '-', '--format', 'json', ...extra], { input, encoding: 'utf8' });
}

test('strict fails on high severity even when --max-findings caps display (audit 1)', () => {
  const r = runStdin('thoughtfully designed revolutionary', ['--strict', '--max-findings', '1']);
  assert.equal(r.status, 1);
  const report = JSON.parse(r.stdout);
  assert.ok(report.summary.high >= 1);
  assert.equal(report.findings.length, 1);
});

test('invalid --max-findings is rejected (audit 1)', () => {
  for (const bad of ['-1', '0', 'abc', '1.5', '']) {
    const r = runStdin('revolutionary', ['--max-findings', bad]);
    assert.equal(r.status, 2, `cap ${JSON.stringify(bad)}`);
  }
});

test('HTML headings and links reach structural heuristics (audit 2)', () => {
  const h = '<!doctype html><html><body>' + Array.from({ length: 16 }, (_, i) => `<h2>Section ${i}</h2>`).join('') + '</body></html>';
  assert.ok(JSON.parse(runStdin(h).stdout).findings.some(f => f.id === 'X-S01'));
  const l = '<!doctype html><html><body>' + Array.from({ length: 36 }, (_, i) => `<a href="/p${i}">Page ${i}</a>`).join(' ') + '</body></html>';
  assert.ok(JSON.parse(runStdin(l).stdout).findings.some(f => f.id === 'X-S02'));
});

test('numeric and named entities cannot hide slop (audit 3)', () => {
  const r = runStdin('<!doctype html><html><body><p>An elev&#97;ted, revolution&#x61;ry stay &amp; more.</p></body></html>');
  const report = JSON.parse(r.stdout);
  assert.ok(report.summary.total >= 1);
});

test('prohibition and quoted-example context is not flagged (audit 4)', () => {
  for (const t of [
    'Do not claim our service is revolutionary or world-class.',
    'Never write "revolutionary" in headlines.',
    'Avoid words like revolutionary.'
  ]) {
    const r = runStdin(t, ['--strict']);
    assert.equal(r.status, 0, t);
    assert.equal(JSON.parse(r.stdout).summary.high, 0, t);
  }
  assert.equal(runStdin('Our revolutionary service.', ['--strict']).status, 1);
});

// antislop-inspired markers (X-U04..X-U12, X-C09..X-C10)
const NEW_UI = ['X-U04','X-U05','X-U06','X-U07','X-U08','X-U09','X-U10','X-U11','X-U12'];

test('antislop-inspired UI/copy rules fire on the slop HTML fixture', () => {
  const report = JSON.parse(run('tests/fixtures/ui-slop.html').stdout);
  const ids = new Set(report.findings.map(f => f.id));
  for (const id of [...NEW_UI, 'X-C09', 'X-C10']) assert.ok(ids.has(id), `${id} missing`);
});

test('antislop-inspired rules stay silent on the clean HTML fixture (no false positives)', () => {
  const report = JSON.parse(run('tests/fixtures/ui-clean.html').stdout);
  const ids = report.findings.map(f => f.id);
  for (const id of [...NEW_UI, 'X-C09', 'X-C10']) assert.ok(!ids.includes(id), `${id} fired on clean page`);
});

test('a real <button onclick> and an img with empty alt are not flagged', () => {
  const html = '<!doctype html><html lang="en"><body><button onclick="x()">Go</button><img src="a.png" alt=""></body></html>';
  const ids = JSON.parse(runStdin(html).stdout).findings.map(f => f.id);
  assert.ok(!ids.includes('X-U07'));
  assert.ok(!ids.includes('X-U08'));
});

test('prohibition sentences do not trigger the new copy rules', () => {
  const ids = JSON.parse(runStdin('Do not write "AI-powered" or "99.9% uptime" without a source.').stdout).findings.map(f => f.id);
  assert.ok(!ids.includes('X-C09'));
  assert.ok(!ids.includes('X-C10'));
});

test('existing fixtures keep their original findings (regression)', () => {
  const report = JSON.parse(run('tests/fixtures/slop.txt').stdout);
  for (const id of ['X-C01','X-C02']) assert.ok(report.findings.some(f => f.id === id));
});
