#!/usr/bin/env node
// apple-ui-craft CI verdict gate.
//
// Fails a build when the craft review that covers the current UI change is
// missing, stale, unreadable, or not green. It does not review anything itself:
// it consumes the artifact `craft-ios-ui` writes.
//
// Usage:
//   node ci/gate.mjs [--artifact-dir <dir>] [--repo <dir>] [--sha <sha>]
//                    [--paths <glob,glob>] [--schema <path>] [--format text|json]
//
// Exit: 0 pass, 1 fail (the gate's verdict), 2 usage or internal error.
//
// TWO DESIGN RULES, both learned from a sibling plugin's gate that shipped
// broken in exactly these ways:
//
//   1. Bind to the last UI-touching commit, NOT HEAD. An artifact can never name
//      the commit it is committed into, so a HEAD-bound gate makes its own
//      documented happy path (write artifact, commit, push) unsatisfiable.
//   2. FAIL CLOSED. If git errors, or the path list is empty, or the artifact
//      cannot be read, the gate FAILS. A gate that passes when its own inputs
//      are broken reports safety it never checked.
//
// Zero dependencies, Node >= 18 stdlib only.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Paths whose change requires a fresh craft review. Deliberately broad: a
// missed path means a UI change ships ungated, which is the failure that
// matters. Narrow it per-repo with --paths.
const DEFAULT_UI_PATHS = [
  '*.swift',
  '*.xib',
  '*.storyboard',
  '*.xcassets',
  '*.strings',
  '*.stringsdict'
];

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const o = {
    repo: process.cwd(),
    artifactDir: null,
    sha: null,
    paths: DEFAULT_UI_PATHS,
    schema: join(HERE, 'verdict-artifact-schema.json'),
    format: 'text'
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') o.repo = argv[++i];
    else if (a === '--artifact-dir') o.artifactDir = argv[++i];
    else if (a === '--sha') o.sha = argv[++i];
    else if (a === '--paths') o.paths = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--schema') o.schema = argv[++i];
    else if (a === '--format') o.format = argv[++i];
    else return { error: `unknown option: ${a}` };
  }
  if (!o.artifactDir) o.artifactDir = join(o.repo, '.claude', 'apple-ui-craft-artifacts');
  if (!['text', 'json'].includes(o.format)) return { error: '--format must be text or json' };
  // Fail closed: an empty path list would make "nothing to review" the answer to
  // every question, which is a silent pass.
  if (!o.paths.length) return { error: '--paths resolved to an empty list; refusing to gate on nothing' };
  return o;
}

// The reviewed sha: the last commit that touched a UI-adjacent path.
function lastUiSha(repo, paths) {
  try {
    const out = execFileSync(
      'git',
      ['-C', repo, 'log', '-1', '--format=%H', '--', ...paths],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
    return out || null;
  } catch (e) {
    // Fail closed rather than treating a broken git query as "no UI changes".
    throw new Error(`git log failed while resolving the reviewed sha: ${e.message}`);
  }
}

// Minimal JSON Schema validation, covering exactly the keywords this schema
// uses. Not a general validator; it refuses to silently ignore a keyword it
// does not implement, so the schema cannot quietly outgrow it.
const SUPPORTED = new Set([
  '$schema', '$id', 'title', 'description', 'definitions', '$ref',
  'type', 'const', 'enum', 'pattern', 'minLength', 'minimum', 'format',
  'properties', 'required', 'additionalProperties', 'items'
]);

function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref: ${ref}`);
  return ref
    .slice(2)
    .split('/')
    .reduce((acc, k) => {
      if (acc === undefined) throw new Error(`unresolvable $ref: ${ref}`);
      return acc[k];
    }, root);
}

function validate(value, schema, root, path, errors) {
  for (const k of Object.keys(schema)) {
    if (!SUPPORTED.has(k)) throw new Error(`schema uses unsupported keyword "${k}" at ${path}`);
  }
  if (schema.$ref) return validate(value, resolveRef(schema.$ref, root), root, path, errors);

  const types = schema.type ? [].concat(schema.type) : null;
  if (types) {
    const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    const ok = types.some((t) =>
      t === 'integer' ? Number.isInteger(value) : t === 'number' ? typeof value === 'number' : t === actual
    );
    if (!ok) {
      errors.push(`${path}: expected ${types.join('|')}, got ${actual}`);
      return;
    }
  }
  if ('const' in schema && value !== schema.const) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  }
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
  }
  if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
    errors.push(`${path}: shorter than minLength ${schema.minLength}`);
  }
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
    errors.push(`${path}: ${value} is below minimum ${schema.minimum}`);
  }
  if (schema.items && Array.isArray(value)) {
    value.forEach((v, i) => validate(v, schema.items, root, `${path}[${i}]`, errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const req of schema.required || []) {
      if (!(req in value)) errors.push(`${path}: missing required property "${req}"`);
    }
    for (const [k, v] of Object.entries(value)) {
      const sub = schema.properties?.[k];
      if (sub) validate(v, sub, root, `${path}.${k}`, errors);
      else if (schema.additionalProperties === false && schema.properties) {
        errors.push(`${path}: unexpected property "${k}"`);
      }
    }
  }
}

function findArtifact(dir, sha) {
  if (!existsSync(dir)) return { error: `artifact directory not found: ${dir}` };
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (!files.length) return { error: `no artifacts in ${dir}` };
  // Prefer a filename naming the sha; otherwise read them all and match on the
  // sha FIELD, which is the binding key. Never fall back to "the newest one".
  const candidates = files.filter((f) => sha.startsWith(f.replace(/\.json$/, '')));
  for (const f of [...candidates, ...files]) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (typeof parsed?.sha === 'string' && (sha.startsWith(parsed.sha) || parsed.sha.startsWith(sha))) {
        return { file: join(dir, f), artifact: parsed };
      }
    } catch {
      /* a malformed sibling is not this artifact's problem; a malformed MATCH is caught below */
    }
  }
  return { error: `no artifact in ${dir} is bound to the reviewed sha ${sha.slice(0, 12)}` };
}

export function evaluate(artifact) {
  const problems = [];
  const verdicts = artifact.verdicts || {};
  for (const [k, v] of Object.entries(verdicts)) {
    if (v !== 'GREEN') problems.push(`verdict "${k}" is ${v}, not GREEN`);
  }
  if (artifact.overall !== 'GREEN') problems.push(`overall is ${artifact.overall}, not GREEN`);

  const blockers = artifact.blocker_findings || [];
  if (blockers.length) problems.push(`${blockers.length} blocker finding(s)`);

  // A CRITICAL filed in the wrong array is still a blocker. A GREEN verdict
  // shipped alongside one is a self-contradicting artifact, not a judgement.
  const misfiled = (artifact.high_findings || []).filter((f) => f.severity === 'CRITICAL');
  if (misfiled.length) {
    problems.push(`${misfiled.length} CRITICAL finding(s) filed under high_findings`);
  }
  return problems;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.error) {
    console.error(`usage error: ${o.error}`);
    console.error('usage: node ci/gate.mjs [--artifact-dir <dir>] [--repo <dir>] [--sha <sha>]');
    console.error('                        [--paths <glob,glob>] [--schema <path>] [--format text|json]');
    process.exit(2);
  }

  let schema;
  try {
    schema = JSON.parse(readFileSync(o.schema, 'utf8'));
  } catch (e) {
    fail(`could not read the schema at ${o.schema}: ${e.message}`, 2);
  }

  let sha = o.sha;
  if (!sha) {
    try {
      sha = lastUiSha(o.repo, o.paths);
    } catch (e) {
      fail(`FAIL: ${e.message}\n  The gate fails closed: a broken git query is not evidence that nothing changed.`);
    }
    if (!sha) {
      fail(
        'FAIL: no commit in history touches a UI-adjacent path.\n' +
          `  Searched: ${o.paths.join(', ')}\n` +
          '  If that is genuinely correct for this repo, do not run this gate on it; ' +
          'if it is not, pass --paths. The gate does not pass on an empty search.'
      );
    }
  }

  const found = findArtifact(o.artifactDir, sha);
  if (found.error) {
    fail(
      `FAIL: ${found.error}\n` +
        `  Reviewed sha: ${sha.slice(0, 12)} (last commit touching ${o.paths.join(', ')})\n` +
        '  Run the craft-ios-ui skill and commit the artifact it writes.'
    );
  }

  const errors = [];
  try {
    validate(found.artifact, schema, schema, 'artifact', errors);
  } catch (e) {
    fail(`FAIL: schema could not be applied: ${e.message}`, 2);
  }
  if (errors.length) {
    fail(`FAIL: ${found.file} does not match the artifact schema:\n` + errors.map((e) => `  ${e}`).join('\n'));
  }

  const problems = evaluate(found.artifact);
  const pass = problems.length === 0;

  if (o.format === 'json') {
    console.log(JSON.stringify({ pass, sha, artifact: found.file, problems }, null, 2));
    process.exit(pass ? 0 : 1);
  }

  console.log(`artifact:     ${found.file}`);
  console.log(`reviewed sha: ${sha.slice(0, 12)}`);
  console.log(`scope:        ${found.artifact.scope}`);
  if (found.artifact.evidenceMode) console.log(`evidence:     ${found.artifact.evidenceMode}`);
  console.log('verdicts:');
  for (const [k, v] of Object.entries(found.artifact.verdicts)) {
    console.log(`  ${k.padEnd(15)} ${v}`);
  }
  console.log(`  ${'overall'.padEnd(15)} ${found.artifact.overall}`);

  if (pass) {
    console.log('\nPASS');
    process.exit(0);
  }
  console.log('\nFAIL:');
  for (const p of problems) console.log(`  ${p}`);
  console.log(
    '\nThere is no soft pass. YELLOW fails, NOT_ASSESSED fails, and a CRITICAL\n' +
      'finding fails whichever array it was filed in.'
  );
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
