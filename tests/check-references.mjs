#!/usr/bin/env node
// Link integrity for the reference library.
//
// Every `references/<path>.md` citation in shipped content must resolve to a
// real file, and every `#anchor` on one must resolve to a real heading in that
// file. A citation that does not resolve is a silent capability loss: the agent
// follows the pointer, finds nothing, and degrades without reporting it.
//
// Every corpus label's `owner` must resolve the same way, every label's ruleRef
// area must be declared in labels.json meta.ruleRefAreas, and every fixture file
// must exist and be listed.
//
// Usage: node tests/check-references.mjs [--labels <path>]
//
// Zero dependencies, Node >= 18 stdlib only. Exit 0 pass, 1 fail, 2 usage.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function usage(message) {
  console.error(`usage error: ${message}`);
  console.error('usage: node tests/check-references.mjs [--labels <path>]');
  process.exit(2);
}

let labelsPath = join(ROOT, 'tests', 'corpus', 'labels.json');
let labelsExplicit = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--labels') {
    if (!argv[i + 1]) usage('--labels needs a path');
    labelsPath = resolve(argv[++i]);
    labelsExplicit = true;
  } else {
    usage(`unknown argument: ${argv[i]}`);
  }
}
if (labelsExplicit && !existsSync(labelsPath)) usage(`no such labels file: ${labelsPath}`);

// Scratch and machine-written state. Not shipped, not our contract to keep.
const SKIP_DIRS = new Set(['.git', '.serena', '.claude', '.anti-slop', '.remember', 'node_modules']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

// GitHub-flavoured heading slug: lowercase, strip punctuation, spaces to dashes.
function slugify(heading) {
  return heading
    .replace(/`/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function headingSlugs(text) {
  const slugs = new Set();
  for (const line of text.split('\n')) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (m) slugs.add(slugify(m[1].trim()));
  }
  return slugs;
}

const files = walk(ROOT);
const slugIndex = new Map();
for (const f of files) slugIndex.set(relative(ROOT, f), headingSlugs(readFileSync(f, 'utf8')));

const CITATION = /references\/[A-Za-z0-9_\-/]+\.md(#[A-Za-z0-9-]+)?/g;
const failures = [];
let citations = 0;

// Release history records what a PAST release said, so a heading renamed since
// then is expected, not a regression -- and rewriting the entry to satisfy the
// link check would make the changelog wrong. The file must still exist: a
// changelog pointing at a deleted reference is a real broken pointer.
const ANCHOR_EXEMPT = new Set(['CHANGELOG.md']);

// A reference renamed after a release shipped it. Release history keeps the
// name that release used, and its pointer resolves through the successor, which
// must exist. Only release history gets this: live docs must cite the new name.
const RENAMED = new Map([
  ['references/_scaffolding/conductor-dispatch-protocol.md', 'references/_scaffolding/dispatch-protocol.md'],
]);

for (const f of files) {
  const rel = relative(ROOT, f);
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(CITATION)) {
      citations++;
      const [ref, anchor] = [m[0], m[1]];
      const cited = ref.split('#')[0];
      const path = ANCHOR_EXEMPT.has(rel) && RENAMED.has(cited) ? RENAMED.get(cited) : cited;
      if (!existsSync(join(ROOT, path))) {
        failures.push({ file: rel, line: i + 1, ref, why: 'file does not exist' });
      } else if (anchor && !ANCHOR_EXEMPT.has(rel) && !slugIndex.get(path)?.has(anchor.slice(1))) {
        failures.push({ file: rel, line: i + 1, ref, why: 'anchor does not exist in that file' });
      }
    }
  });
}

// Label owners resolve like citations, so a renamed heading fails here rather than
// orphaning a label. Idea from impeccable rule-id tagging (scripts/lib/utils.js, Apache-2.0).
let ownersChecked = 0;
let fixturesChecked = 0;
if (existsSync(labelsPath)) {
  const rel = relative(ROOT, labelsPath);
  const shown = !rel.startsWith('..') && !isAbsolute(rel) ? rel : labelsPath;
  const raw = readFileSync(labelsPath, 'utf8');
  const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lineOf = (key, value) => {
    const m = new RegExp(`"${key}"\\s*:\\s*"${escape(value)}"`).exec(raw);
    return m ? raw.slice(0, m.index).split('\n').length : 1;
  };
  const fail = (line, ref, why) => failures.push({ file: shown, line, ref, why });

  let labels = null;
  try {
    labels = JSON.parse(raw);
  } catch (e) {
    fail(1, shown, `labels file does not parse: ${e.message}`);
  }
  if (labels && !Array.isArray(labels.meta?.ruleRefAreas)) {
    fail(1, 'meta.ruleRefAreas', 'labels file declares no ruleRefAreas array');
  } else if (labels && !Array.isArray(labels.fixtures)) {
    fail(1, 'fixtures', 'labels file has no fixtures array');
  } else if (labels) {
    const areas = new Set(labels.meta.ruleRefAreas);
    const fixtureDir = join(ROOT, 'tests', 'corpus', 'fixtures');
    const listed = new Set();
    for (const fixture of labels.fixtures) {
      fixturesChecked++;
      listed.add(fixture.file);
      if (!fixture.file || !existsSync(join(fixtureDir, fixture.file))) {
        fail(lineOf('file', fixture.file ?? ''), `tests/corpus/fixtures/${fixture.file ?? ''}`, 'fixture file does not exist');
      }
      for (const label of fixture.expected || []) {
        ownersChecked++;
        const line = lineOf('id', label.id ?? '');
        const owner = label.owner || '';
        const [path, anchor] = owner.split('#');
        if (!owner) fail(line, label.id || '(no id)', 'label has no owner');
        else if (!existsSync(join(ROOT, path))) fail(line, owner, 'owner file does not exist');
        else if (!anchor) fail(line, owner, 'owner has no #anchor');
        else if (!slugIndex.get(path)?.has(anchor)) fail(line, owner, 'owner anchor does not exist in that file');
        const area = (label.ruleRef || '').split('/')[0];
        if (!areas.has(area)) fail(line, label.ruleRef || '(no ruleRef)', `ruleRef area "${area}" is not in meta.ruleRefAreas`);
      }
    }
    if (existsSync(fixtureDir)) {
      for (const f of readdirSync(fixtureDir).filter((n) => n.endsWith('.swift')).sort()) {
        if (!listed.has(f)) fail(1, `tests/corpus/fixtures/${f}`, 'fixture not listed in labels.json');
      }
    }
  }
}

// An orphan reference is the mirror failure: a file nothing points at is a file
// no agent will ever read. Warn rather than fail -- a newly added reference is
// legitimately unwired for one commit.
//
// Agents also cite whole ranges of a domain (`design/03`..`design/13`,
// `exemplars/02`..`05`) to mean "glob the rest of this directory". Those are
// real citations, so expand them before deciding what is unreachable.
const RANGE = /`?([a-z-]+)\/(\d{2})`?\s*\.\.\s*`?(?:[a-z-]+\/)?(\d{2})`?/g;
const referenced = new Set();
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(CITATION)) referenced.add(m[0].split('#')[0]);
  for (const [, domain, lo, hi] of text.matchAll(RANGE)) {
    for (const rel of slugIndex.keys()) {
      const hit = new RegExp(`^references/${domain}/(\\d{2})-`).exec(rel);
      if (hit && +hit[1] >= +lo && +hit[1] <= +hi) referenced.add(rel);
    }
  }
}
const orphans = files
  .map((f) => relative(ROOT, f))
  .filter((r) => r.startsWith('references/') && !r.includes('_TEMPLATE') && !referenced.has(r));

console.log(`checked ${citations} citations across ${files.length} markdown files`);
if (fixturesChecked) console.log(`checked ${ownersChecked} label owners across ${fixturesChecked} fixtures`);
if (orphans.length) {
  console.log(`\nWARN: ${orphans.length} reference file(s) nothing cites (unreachable to agents):`);
  for (const o of orphans) console.log(`  ${o}`);
}
if (failures.length) {
  console.log(`\nFAIL: ${failures.length} broken citation(s) or label owner(s):`);
  for (const f of failures) console.log(`  ${f.file}:${f.line}  ${f.ref}  -- ${f.why}`);
  process.exit(1);
}
console.log('\nPASS: every reference citation and label owner resolves.');
