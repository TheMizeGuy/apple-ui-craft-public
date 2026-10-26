#!/usr/bin/env node
// blind-copy.mjs -- a neutral copy of the corpus fixtures for a blind baseline.
//
// Every fixture's header says what it plants, and score-review.mjs credits a
// finding that repeats a ruleRef anywhere in its text, so a reviewer that reads
// the fixtures as they stand reads the answer key. This writes each listed
// fixture under a neutral name with the header and every answer-bearing comment
// removed, plus a map that turns the reviewer's findings back into corpus paths.
//
// Usage:
//   node blind-copy.mjs copy <outDir>
//       Writes <outDir>/file-NN.swift and, beside the directory, <outDir>.map.json.
//       <outDir> must be outside the repository and empty or absent. The map
//       names the fixtures, so it never sits inside the directory under review.
//   node blind-copy.mjs unmap <findings.json> <map.json>
//       Prints the findings with each `file` rewritten to
//       tests/corpus/fixtures/<fixture>, and a numeric `line` to the original line.
//
// Exit codes: 0 = done, 1 = a listed fixture could not be read,
// 2 = usage error or malformed input. Zero dependencies.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const LABELS = join(HERE, '..', 'corpus', 'labels.json');
const FIXTURES = join(HERE, '..', 'corpus', 'fixtures');

export const ANSWER_COMMENT = /\b(FIXTURE|planted|ruleRef|by-the-book|must produce|clean control)\b|\bPlants?:/i;
export const STUB_MARKER = /\bstubs?\b/i;
export const NEUTRAL_STUB_LINE = '// Stubs: implementations elided.';

// Returns the blind text and, for each of its lines, the original line number.
export function blindText(text) {
  const src = text.split('\n');
  let i = 0;
  while (i < src.length && src[i].trim().startsWith('//')) i++;
  while (i < src.length && src[i].trim() === '') i++;
  const out = [];
  const lines = [];
  for (; i < src.length; i++) {
    const line = src[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') && ANSWER_COMMENT.test(trimmed)) {
      if (!STUB_MARKER.test(trimmed)) continue;
      out.push(line.slice(0, line.indexOf('//')) + NEUTRAL_STUB_LINE);
    } else {
      out.push(line);
    }
    lines.push(i + 1);
  }
  return { text: out.join('\n'), lines };
}

export function insideRepo(path) {
  let probe = resolve(path);
  const rest = [];
  while (!existsSync(probe)) {
    rest.unshift(basename(probe));
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const real = join(realpathSync(probe), ...rest);
  const root = realpathSync(ROOT);
  return real === root || real.startsWith(root + sep);
}

function usage(message) {
  console.error(`usage error: ${message}`);
  console.error('usage: node blind-copy.mjs copy <outDir>');
  console.error('       node blind-copy.mjs unmap <findings.json> <map.json>');
  process.exit(2);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`malformed input: ${path}: ${e.message}`);
    process.exit(2);
  }
}

function copy(outDir) {
  if (insideRepo(outDir)) usage(`${outDir} is inside the repository; write the copy somewhere a reviewer cannot see the labels`);
  if (existsSync(outDir) && (!statSync(outDir).isDirectory() || readdirSync(outDir).length)) {
    usage(`${outDir} exists and is not an empty directory`);
  }
  const labels = readJson(LABELS);
  if (!Array.isArray(labels?.fixtures)) usage('labels file has no "fixtures" array');

  const sha = (s) => createHash('sha1').update(s).digest('hex');
  const ordered = labels.fixtures.map((f) => f.file).sort((a, b) => (sha(a) < sha(b) ? -1 : 1));
  const dir = resolve(outDir);
  const mapPath = `${dir}.map.json`;
  mkdirSync(dir, { recursive: true });

  const map = {};
  ordered.forEach((fixture, n) => {
    let text;
    try {
      text = readFileSync(join(FIXTURES, fixture), 'utf8');
    } catch (e) {
      console.error(`cannot read fixture ${fixture}: ${e.message}`);
      process.exit(1);
    }
    const name = `file-${String(n + 1).padStart(2, '0')}.swift`;
    const blind = blindText(text);
    writeFileSync(join(dir, name), blind.text);
    map[name] = { fixture, lines: blind.lines };
  });
  writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n');
  console.log(`wrote ${ordered.length} files to ${dir}; map at ${mapPath}`);
}

function unmap(findingsPath, mapPath) {
  const raw = readJson(findingsPath);
  const findings = Array.isArray(raw) ? raw : raw?.findings;
  if (!Array.isArray(findings)) usage('expected a findings array, or an object with a "findings" array');
  const map = readJson(mapPath);
  const unknown = new Set();
  for (const f of findings) {
    const key = basename(String(f.file || '')).replace(/:\d.*$/, '');
    const entry = map[key];
    if (!entry) {
      if (f.file) unknown.add(f.file);
      continue;
    }
    f.file = `tests/corpus/fixtures/${entry.fixture}`;
    if (Number.isInteger(f.line) && entry.lines[f.line - 1]) f.line = entry.lines[f.line - 1];
  }
  for (const u of unknown) console.error(`not in the map, left as is: ${u}`);
  console.log(JSON.stringify(raw, null, 2));
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'copy' && args.length === 1) copy(args[0]);
  else if (command === 'unmap' && args.length === 2) unmap(args[0], args[1]);
  else usage(command ? `bad arguments for ${command}` : 'missing command');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
