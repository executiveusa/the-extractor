#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_INPUT_BYTES = 2_000_000;
// Context exclusion: ignore copy matches in prohibition sentences or quoted example text.
const PROHIBITION_RX = /\b(do not|don't|dont|never|avoid|must not|mustn't|should not|shouldn't|stop (?:using|saying|writing)|banned|forbidden|no (?:more )?(?:use of)?)\b/i;
const NAMED_ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '\u2013', mdash: '\u2014', lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d', hellip: '\u2026', shy: '' };

const args = process.argv.slice(2);
const command = args[0];

if (!command || ['-h', '--help', 'help'].includes(command)) {
  printHelp();
  process.exit(0);
}

if (command === '--version' || command === 'version') {
  const pkg = JSON.parse(await fs.readFile(path.join(__dirname, 'package.json'), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

if (command !== 'audit') {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(2);
}

const target = args[1];
if (!target) {
  console.error('Missing audit target. Pass a file, URL, or - for stdin.');
  process.exit(2);
}

const format = valueAfter('--format') || 'text';
const strict = args.includes('--strict');
const maxFindingsRaw = valueAfter('--max-findings');
const maxFindings = maxFindingsRaw === null ? 40 : Number(maxFindingsRaw);
if (!Number.isInteger(maxFindings) || maxFindings < 1 || !/^\d+$/.test(String(maxFindingsRaw ?? '40'))) {
  console.error(`Invalid --max-findings: ${maxFindingsRaw}. Use a positive integer.`);
  process.exit(2);
}

const raw = await readTarget(target);
const content = looksLikeHtml(raw) ? htmlToText(raw) : raw;
const rules = await loadRules();
const report = audit(content, raw, rules, { target, maxFindings });

if (format === 'json') {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderText(report));
}

if (strict && report.summary.high >= 1) process.exit(1);

function valueAfter(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

async function readTarget(target) {
  if (target === '-') {
    let text = '';
    for await (const chunk of process.stdin) {
      text += chunk;
      if (Buffer.byteLength(text, 'utf8') > MAX_INPUT_BYTES) throw new Error('Input exceeds 2 MB safety limit.');
    }
    return text;
  }
  if (/^https?:\/\//i.test(target)) {
    const res = await fetch(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'the-extractor/0.1' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${target}`);
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_INPUT_BYTES) throw new Error('Remote input exceeds 2 MB safety limit.');
    const text = await res.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_INPUT_BYTES) throw new Error('Remote input exceeds 2 MB safety limit.');
    return text;
  }
  const file = path.resolve(target);
  const stat = await fs.stat(file);
  if (stat.size > MAX_INPUT_BYTES) throw new Error('File exceeds 2 MB safety limit.');
  return await fs.readFile(file, 'utf8');
}

async function loadRules() {
  const [copy, ui] = await Promise.all([
    fs.readFile(path.join(__dirname, 'rules/copy.json'), 'utf8'),
    fs.readFile(path.join(__dirname, 'rules/ui.json'), 'utf8')
  ]);
  return [...JSON.parse(copy), ...JSON.parse(ui)];
}

function audit(content, rawSource, rules, { target, maxFindings }) {
  const normalized = content.replace(/\r\n/g, '\n');
  const sourceNormalized = rawSource.replace(/\r\n/g, '\n');
  const findings = [];

  for (const rule of rules) {
    const haystack = ['ui', 'motion', 'code'].includes(rule.category) ? sourceNormalized : normalized;
    const rx = new RegExp(rule.pattern, rule.flags || 'gi');
    let match;
    let count = 0;
    while ((match = rx.exec(haystack))) {
      if (!['ui', 'motion', 'code'].includes(rule.category) && isExcludedContext(haystack, match.index, match[0].length)) {
        if (!rx.global) break;
        continue;
      }
      count++;
      const start = Math.max(0, match.index - 60);
      const end = Math.min(haystack.length, match.index + match[0].length + 90);
      if (count === 1) {
        findings.push({
          id: rule.id,
          category: rule.category,
          severity: rule.severity,
          label: rule.label,
          evidence: oneLine(haystack.slice(start, end)),
          occurrences: 1,
          why: rule.why,
          action: rule.action
        });
      } else {
        const existing = findings.find(f => f.id === rule.id);
        if (existing) existing.occurrences = count;
      }
      if (!rx.global || count >= (rule.maxMatches || 4)) break;
    }
  }

  findings.push(...structuralSignals(normalized));
  // Severity totals (and therefore --strict) cover ALL findings. The cap only limits what is displayed.
  const summary = {
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    total: findings.length,
    shown: Math.min(findings.length, maxFindings)
  };
  const rank = { high: 0, medium: 1, low: 2 };
  const capped = findings
    .map((f, i) => [f, i])
    .sort((a, b) => (rank[a[0].severity] ?? 3) - (rank[b[0].severity] ?? 3) || a[1] - b[1])
    .map(x => x[0])
    .slice(0, maxFindings);

  return {
    tool: 'The Extractor',
    version: '0.1.0',
    target,
    provenance: 'origin unknown unless independently established; slop signals are not proof of AI authorship',
    summary,
    findings: capped,
    reduction: buildReduction(capped),
    stopRule: 'Stop when another removal would make the human less successful.'
  };
}

// Context exclusion for copy rules: a match is ignored when it sits in a prohibition/negation
// sentence ("Do not claim ... revolutionary") or inside quoted example text.
function isExcludedContext(text, index, length) {
  let start = index;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) start--;
  let end = index + length;
  while (end < text.length && !/[.!?\n]/.test(text[end])) end++;
  const before = text.slice(start, index);
  const after = text.slice(index + length, end);
  if (PROHIBITION_RX.test(before)) return true;
  const openers = (before.match(/["\u201c\u2018]/g) || []).length;
  if (openers % 2 === 1 && /["\u201d\u2019]/.test(after)) return true;
  return false;
}

function structuralSignals(text) {
  const findings = [];
  const headings = [...text.matchAll(/^#{1,3}\s+(.+)$/gm)].map(m => m[1].trim());
  const links = [...text.matchAll(/\[[^\]]+\]\([^\)]+\)/g)].length;
  const ctas = [...text.matchAll(/\b(book now|book an experience|explore services|explore experience|discover|learn more|contact us|get started)\b/gi)].map(m => m[0].toLowerCase());
  const uniqueCtas = new Set(ctas);

  if (headings.length > 14) findings.push(signal('X-S01','structure','medium','Long-page hierarchy burden',`Detected ${headings.length} headings.`, 'A long page is not automatically bad, but users may be asked to hold too many section concepts.', 'Reduce or progressively disclose sections around the primary human task.'));
  if (links > 35) findings.push(signal('X-S02','cognitive','medium','Choice density',`Detected ${links} markdown links.`, 'High choice density can turn navigation into a menu-reading task.', 'Prioritize one current action; move secondary choices behind clear category paths.'));
  if (uniqueCtas.size >= 4) findings.push(signal('X-S03','conversion','high','Competing CTA vocabulary',`Detected CTA variants: ${[...uniqueCtas].slice(0,8).join(', ')}.`, 'Multiple labels for similar actions increase decision friction and dilute the primary route.', 'Choose one primary CTA label and one secondary action.'));

  const genericNouns = ['experience','wellness','elevated','personalized','tailored','thoughtfully designed'];
  const counts = genericNouns.map(term => [term, countTerm(text, term)]).filter(([,count]) => count >= 3);
  if (counts.length) findings.push(signal('X-S04','copy','medium','Repeated abstraction', counts.map(([t,c])=>`${t}×${c}`).join(', '), 'Repeated abstract language can crowd out concrete service, proof, price, timing, or next-step information.', 'Replace repetitions with specific facts or delete them.'));
  return findings;
}

function signal(id, category, severity, label, evidence, why, action) {
  return { id, category, severity, label, evidence, why, action };
}

function buildReduction(findings) {
  const high = findings.filter(f => f.severity === 'high').slice(0,4).map(f => f.action);
  const medium = findings.filter(f => f.severity === 'medium').slice(0,4).map(f => f.action);
  return {
    r0: 'Freeze the current source and rendered state.',
    r1: [...new Set([...high, ...medium])],
    r2: 'Humanize only what survives R1; preserve facts, voice, legal language and evidence.',
    r3: 'Recompose around one dominant human task, one primary action and progressive disclosure.',
    r4: 'Remove one more element at a time until the next deletion harms meaning, trust, identity, accessibility or task completion.'
  };
}

function renderText(report) {
  const lines = [];
  lines.push('THE EXTRACTOR');
  lines.push('Destruction-first anti-slop audit');
  lines.push('');
  lines.push(`Target: ${report.target}`);
  lines.push(`Signals: ${report.summary.total}${report.summary.shown < report.summary.total ? ` (showing ${report.summary.shown})` : ""}  high:${report.summary.high} medium:${report.summary.medium} low:${report.summary.low}`);
  lines.push(`Provenance: ${report.provenance}`);
  lines.push('');
  for (const f of report.findings) {
    lines.push(`[${f.severity.toUpperCase()}] ${f.id} · ${f.label}`);
    lines.push(`  Evidence: ${f.evidence}${f.occurrences > 1 ? `  [${f.occurrences} matches]` : ''}`);
    lines.push(`  Why: ${f.why}`);
    lines.push(`  Action: ${f.action}`);
    lines.push('');
  }
  lines.push('REDUCTION');
  lines.push(`R0 · ${report.reduction.r0}`);
  report.reduction.r1.forEach(x => lines.push(`R1 · ${x}`));
  lines.push(`R2 · ${report.reduction.r2}`);
  lines.push(`R3 · ${report.reduction.r3}`);
  lines.push(`R4 · ${report.reduction.r4}`);
  lines.push('');
  lines.push(report.stopRule);
  return lines.join('\n');
}

function looksLikeHtml(text) {
  return /<html|<body|<!doctype/i.test(text.slice(0, 5000));
}

function htmlToText(html) {
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, inner) => `\n${'#'.repeat(Math.min(Number(n), 3))} ${inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\n`)
    .replace(/<a\b[^>]*?href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi, (_, _q, d, sq, u, inner) => {
      const label = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'link';
      return `[${label.replace(/[\[\]]/g, '')}](${(d ?? sq ?? u ?? '').replace(/[()\s]/g, '')})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|nav|li|h1|h2|h3|h4)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return decodeEntities(text);
}

// Single pass, so "&amp;#97;" decodes to "&#97;" and not to "a".
function decodeEntities(s) {
  return s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g, (m, dec, hex, name) => {
    if (name) return Object.hasOwn(NAMED_ENTITIES, name.toLowerCase()) ? NAMED_ENTITIES[name.toLowerCase()] : m;
    const cp = dec !== undefined ? Number(dec) : parseInt(hex, 16);
    if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return m;
    return String.fromCodePoint(cp);
  });
}

function oneLine(s) { return s.replace(/\s+/g, ' ').trim().slice(0, 240); }
function countTerm(text, term) { return (text.match(new RegExp(escapeRx(term), 'gi')) || []).length; }
function escapeRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function printHelp() {
  console.log(`The Extractor 0.1.0\n\nUsage:\n  extractor audit <file|url|-> [--format text|json] [--strict] [--max-findings N]\n  extractor version\n\nThe CLI flags anti-slop signals. It does not determine whether a human or model authored the material.`);
}
