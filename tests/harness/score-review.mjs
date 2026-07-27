#!/usr/bin/env node
// score-review.mjs -- score an apple-ui-craft review's findings against the
// labeled regression corpus (tests/corpus/labels.json).
//
// Usage:
//   node score-review.mjs <findings.json> [--fixture <name>] [--format text|json]
//                         [--min-recall <0..1>] [--min-precision <0..1>]
//                         [--labels <path>]
//
//   <findings.json>   A canonical finding array (whole corpus or one fixture),
//                     or an object { "findings": [ ... ] }. Each finding:
//                     { id, dimension, severity, confidence, file, line?, title, evidence? }
//                     An optional "ruleRef" field, when present, makes matching
//                     deterministic.
//   --fixture <name>  Score only this fixture (basename, e.g. fixed-frame-row.swift).
//   --format          text (default) or json.
//   --min-recall      Pass threshold for recall (default 0.8; must be > 0).
//   --min-precision   Pass threshold for precision (default 0.8).
//   --labels <path>   Override the labels file (default ../corpus/labels.json).
//
// Matching: by ruleRef first (explicit finding.ruleRef, or the label's ruleRef
// mentioned in the finding's id/title/evidence), else by (fixture, dimension)
// with fuzzy title overlap. Either way the finding must carry substance: a title
// with at least MIN_TITLE_TOKENS meaningful tokens. Without that floor the gate
// is satisfiable by naming ruleRefs and nothing else, which measures whether the
// reviewer memorised the corpus rather than whether it located the defects.
//
// Precision is gated, not just printed. Recall alone rewards spraying findings,
// and the clean control exists precisely because over-flagging is the mirror
// failure, so a regression there has to be visible here.
//
// Exit codes: 0 = pass (recall >= threshold AND precision >= threshold AND every
// clean control within tolerance), 1 = fail, 2 = usage error or malformed input.
// Zero dependencies.

import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MIN_RECALL = 0.8;
const DEFAULT_MIN_PRECISION = 0.8;
const MIN_TITLE_TOKENS = 2;
const TITLE_OVERLAP_THRESHOLD = 0.34;

const HERE = dirname(fileURLToPath(import.meta.url));

// Words that carry no discriminating signal in a finding title.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
  'is', 'are', 'was', 'be', 'it', 'its', 'this', 'that', 'has', 'have', 'no',
  'not', 'but', 'by', 'as', 'from', 'into', 'view', 'swiftui', 'ios'
]);

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export function overlap(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

export function hasSubstance(finding) {
  return tokenize(finding.title).length >= MIN_TITLE_TOKENS;
}

// A finding names a ruleRef if it says so explicitly, or if the ref appears in
// any of its free-text fields.
export function mentionsRule(finding, ruleRef) {
  if (finding.ruleRef === ruleRef) return true;
  const haystack = `${finding.id || ''} ${finding.title || ''} ${finding.evidence || ''}`.toLowerCase();
  return haystack.includes(ruleRef.toLowerCase());
}

export function fixtureOf(finding) {
  return basename(finding.file || '');
}

export function score(findings, labels, only) {
  const fixtures = labels.fixtures.filter((f) => !only || f.file === only);
  if (!fixtures.length) return { error: `no such fixture: ${only}` };

  const scoped = findings.filter((f) => fixtures.some((x) => x.file === fixtureOf(f)));
  const claimed = new Set();
  const perFixture = [];
  let hits = 0;
  let expectedTotal = 0;
  const controlFailures = [];

  for (const fixture of fixtures) {
    const mine = scoped.filter((f) => fixtureOf(f) === fixture.file);
    const expected = fixture.expected || [];
    expectedTotal += expected.length;

    const matched = [];
    const missed = [];

    for (const label of expected) {
      // Pass 1: deterministic, by ruleRef.
      let hit = mine.find((f) => !claimed.has(f) && hasSubstance(f) && mentionsRule(f, label.ruleRef));
      // Pass 2: same dimension, fuzzy title overlap.
      if (!hit) {
        hit = mine.find(
          (f) =>
            !claimed.has(f) &&
            hasSubstance(f) &&
            f.dimension === label.dimension &&
            overlap(f.title, label.title) >= TITLE_OVERLAP_THRESHOLD
        );
      }
      if (hit) {
        claimed.add(hit);
        matched.push({ label: label.ruleRef, by: hit.id || hit.title });
        hits++;
      } else {
        missed.push({ label: label.ruleRef, title: label.title });
      }
    }

    const incidental = mine.filter((f) => !claimed.has(f));

    if (expected.length === 0) {
      const tolerance = fixture.maxIncidentalFindings ?? 0;
      if (incidental.length > tolerance) {
        controlFailures.push({
          fixture: fixture.file,
          found: incidental.length,
          tolerance,
          findings: incidental.map((f) => f.title || f.id)
        });
      }
    }

    perFixture.push({
      fixture: fixture.file,
      isCleanControl: expected.length === 0,
      expected: expected.length,
      matched: matched.length,
      missed,
      incidental: incidental.length,
      incidentalTitles: incidental.map((f) => f.title || f.id)
    });
  }

  const emitted = scoped.length;
  const recall = expectedTotal === 0 ? 1 : hits / expectedTotal;
  // Precision counts a finding on a clean control as a false positive, which is
  // the whole point of having one.
  const precision = emitted === 0 ? (expectedTotal === 0 ? 1 : 0) : hits / emitted;

  return {
    totals: { expected: expectedTotal, emitted, hits, recall, precision },
    perFixture,
    controlFailures,
    ignoredFindings: findings.length - scoped.length
  };
}

function parseArgs(argv) {
  const opts = {
    file: null,
    fixture: null,
    format: 'text',
    minRecall: DEFAULT_MIN_RECALL,
    minPrecision: DEFAULT_MIN_PRECISION,
    labels: join(HERE, '..', 'corpus', 'labels.json')
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fixture') opts.fixture = argv[++i];
    else if (a === '--format') opts.format = argv[++i];
    else if (a === '--min-recall') opts.minRecall = Number(argv[++i]);
    else if (a === '--min-precision') opts.minPrecision = Number(argv[++i]);
    else if (a === '--labels') opts.labels = argv[++i];
    else if (a.startsWith('--')) return { error: `unknown option: ${a}` };
    else if (!opts.file) opts.file = a;
    else return { error: `unexpected argument: ${a}` };
  }
  if (!opts.file) return { error: 'missing <findings.json>' };
  if (!(opts.minRecall > 0) || opts.minRecall > 1) return { error: '--min-recall must be in (0, 1]' };
  if (!(opts.minPrecision >= 0) || opts.minPrecision > 1) return { error: '--min-precision must be in [0, 1]' };
  if (!['text', 'json'].includes(opts.format)) return { error: `--format must be text or json` };
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.error) {
    console.error(`usage error: ${opts.error}`);
    console.error('usage: node score-review.mjs <findings.json> [--fixture <name>] [--format text|json]');
    console.error('                             [--min-recall <0..1>] [--min-precision <0..1>] [--labels <path>]');
    process.exit(2);
  }

  let findings;
  let labels;
  try {
    const raw = JSON.parse(readFileSync(opts.file, 'utf8'));
    findings = Array.isArray(raw) ? raw : raw.findings;
    if (!Array.isArray(findings)) throw new Error('expected an array, or an object with a "findings" array');
    labels = JSON.parse(readFileSync(opts.labels, 'utf8'));
    if (!Array.isArray(labels?.fixtures)) throw new Error('labels file has no "fixtures" array');
  } catch (e) {
    console.error(`malformed input: ${e.message}`);
    process.exit(2);
  }

  const result = score(findings, labels, opts.fixture);
  if (result.error) {
    console.error(`usage error: ${result.error}`);
    process.exit(2);
  }

  const { recall, precision } = result.totals;
  const pass = recall >= opts.minRecall && precision >= opts.minPrecision && result.controlFailures.length === 0;

  if (opts.format === 'json') {
    console.log(JSON.stringify({ ...result, thresholds: { recall: opts.minRecall, precision: opts.minPrecision }, pass }, null, 2));
    process.exit(pass ? 0 : 1);
  }

  const { expected, emitted, hits } = result.totals;
  console.log(`corpus: ${result.perFixture.length} fixture(s)`);
  console.log(`expected labels: ${expected}   emitted findings: ${emitted}   matched: ${hits}`);
  console.log(`recall:    ${recall.toFixed(3)}  (threshold ${opts.minRecall})`);
  console.log(`precision: ${precision.toFixed(3)}  (threshold ${opts.minPrecision})`);
  if (result.ignoredFindings) console.log(`ignored ${result.ignoredFindings} finding(s) not on any corpus fixture`);

  console.log('\nper fixture:');
  for (const f of result.perFixture) {
    const tag = f.isCleanControl ? 'CLEAN CONTROL' : `${f.matched}/${f.expected}`;
    console.log(`  ${f.fixture.padEnd(34)} ${tag}${f.incidental ? `  (+${f.incidental} incidental)` : ''}`);
    for (const m of f.missed) console.log(`      MISS  ${m.label} -- ${m.title}`);
    if (f.isCleanControl) for (const t of f.incidentalTitles) console.log(`      FLAGGED  ${t}`);
  }

  if (result.controlFailures.length) {
    console.log('\nCLEAN CONTROL FAILURES:');
    for (const c of result.controlFailures) {
      console.log(`  ${c.fixture}: ${c.found} finding(s), tolerance ${c.tolerance}`);
    }
  }

  console.log(`\n${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
