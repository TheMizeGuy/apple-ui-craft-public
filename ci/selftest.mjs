#!/usr/bin/env node
// selftest.mjs -- verify ci/gate.mjs.
//
// A gate nobody tests can silently pass everything, which is strictly worse
// than no gate: it reports safety it never checked. These cases pin the
// behaviours that matter, especially the fail-closed ones.
//
// Run: node ci/selftest.mjs      Exit 0 all pass, 1 any fail.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluate } from './gate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, 'gate.mjs');
const SCHEMA = join(HERE, 'verdict-artifact-schema.json');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

const GREEN_VERDICTS = {
  visual: 'GREEN',
  usability: 'GREEN',
  adaptive: 'GREEN',
  accessibility: 'GREEN',
  motion: 'GREEN',
  performance: 'GREEN'
};

function artifact(over = {}) {
  return {
    schemaVersion: 1,
    sha: 'abc1234',
    timestamp: '2026-07-27T12:00:00Z',
    reviewer: 'craft-team-lead',
    scope: 'Sources/UI',
    evidenceMode: 'Runtime',
    verdicts: { ...GREEN_VERDICTS },
    overall: 'GREEN',
    blocker_findings: [],
    high_findings: [],
    ...over
  };
}

const finding = (over = {}) => ({
  id: 'task-flow-back-discards-input',
  dimension: 'Task flow and journey',
  severity: 'HIGH',
  confidence: 'Hard defect',
  file: 'Sources/UI/Invite.swift',
  line: 18,
  title: 'Back at step 2 discards addresses',
  ...over
});

// ------------------------------------------------------------- evaluate()

check('all green passes', evaluate(artifact()), []);
check(
  'a YELLOW verdict fails',
  evaluate(artifact({ verdicts: { ...GREEN_VERDICTS, motion: 'YELLOW' } })).length,
  1
);
check(
  'a RED verdict fails',
  evaluate(artifact({ verdicts: { ...GREEN_VERDICTS, accessibility: 'RED' } })).length,
  1
);
check(
  'NOT_ASSESSED fails, it is not a pass',
  evaluate(artifact({ verdicts: { ...GREEN_VERDICTS, usability: 'NOT_ASSESSED' } })).length,
  1
);
check('a non-green overall fails', evaluate(artifact({ overall: 'YELLOW' })).length, 1);
check(
  'a blocker finding fails',
  evaluate(artifact({ blocker_findings: [finding({ severity: 'CRITICAL' })] })).length,
  1
);
check(
  'a CRITICAL misfiled under high_findings still fails',
  evaluate(artifact({ high_findings: [finding({ severity: 'CRITICAL' })] })).length,
  1
);
check(
  'a genuine HIGH under high_findings does not fail',
  evaluate(artifact({ high_findings: [finding()] })),
  []
);
check(
  'multiple problems are all reported',
  evaluate(artifact({ overall: 'RED', verdicts: { ...GREEN_VERDICTS, motion: 'RED' } })).length,
  2
);

// ------------------------------------------------------------ end to end

const tmp = mkdtempSync(join(tmpdir(), 'auc-ci-'));
const repo = join(tmp, 'repo');
mkdirSync(repo, { recursive: true });

function git(...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

git('init', '-q', '-b', 'main');
git('config', 'user.email', 'test@example.com');
git('config', 'user.name', 'test');
git('config', 'commit.gpgsign', 'false');
writeFileSync(join(repo, 'View.swift'), 'import SwiftUI\n');
git('add', '-A');
git('commit', '-q', '-m', 'ui');
const uiSha = git('rev-parse', 'HEAD').trim();

// A later NON-UI commit, so HEAD != the reviewed sha. This is the case a
// HEAD-bound gate gets wrong.
writeFileSync(join(repo, 'README.md'), 'docs\n');
git('add', '-A');
git('commit', '-q', '-m', 'docs');
const headSha = git('rev-parse', 'HEAD').trim();
check('the test repo really has HEAD != last UI sha', headSha !== uiSha, true);

const artDir = join(repo, '.claude', 'apple-ui-craft-artifacts');
mkdirSync(artDir, { recursive: true });

function writeArtifact(obj, name = `${uiSha.slice(0, 7)}.json`) {
  writeFileSync(join(artDir, name), JSON.stringify(obj, null, 2));
}

function runGate(extra = []) {
  try {
    execFileSync(process.execPath, [GATE, '--repo', repo, '--artifact-dir', artDir, '--schema', SCHEMA, ...extra], {
      stdio: 'pipe'
    });
    return 0;
  } catch (e) {
    return e.status;
  }
}

writeArtifact(artifact({ sha: uiSha }));
check('exit 0 on a green artifact bound to the last UI sha', runGate(), 0);

// The regression that made a sibling gate unpassable: binding to HEAD.
check('the artifact need NOT name HEAD', runGate(['--sha', uiSha]), 0);
check('an artifact bound to HEAD instead does not satisfy the gate', runGate(['--sha', headSha]), 1);

writeArtifact(artifact({ sha: uiSha, overall: 'YELLOW' }));
check('exit 1 on YELLOW overall', runGate(), 1);

writeArtifact(artifact({ sha: uiSha, verdicts: { ...GREEN_VERDICTS, adaptive: 'NOT_ASSESSED' } }));
check('exit 1 on NOT_ASSESSED', runGate(), 1);

writeArtifact(artifact({ sha: uiSha, blocker_findings: [finding({ severity: 'CRITICAL' })] }));
check('exit 1 on a blocker', runGate(), 1);

writeArtifact(artifact({ sha: uiSha, schemaVersion: 2 }));
check('exit 1 on a wrong schemaVersion', runGate(), 1);

writeArtifact(artifact({ sha: uiSha, verdicts: { ...GREEN_VERDICTS, motion: 'MOSTLY_FINE' } }));
check('exit 1 on a verdict outside the enum', runGate(), 1);

const partial = artifact({ sha: uiSha });
delete partial.verdicts.accessibility;
writeArtifact(partial);
check('exit 1 when a required verdict is missing', runGate(), 1);

writeArtifact(artifact({ sha: uiSha, blocker_findings: [finding({ severity: 'CRITICAL', line: 0 })] }));
check('exit 1 on line: 0 (omit the key instead)', runGate(), 1);

writeArtifact(artifact({ sha: uiSha, blocker_findings: [finding({ severity: 'CRITICAL', dimension: 'Vibes' })] }));
check('exit 1 on a dimension outside the registry', runGate(), 1);

// density and platform are the only optional verdicts.
const withOptional = artifact({ sha: uiSha });
withOptional.verdicts.density = 'GREEN';
withOptional.verdicts.platform = 'GREEN';
writeArtifact(withOptional);
check('exit 0 with the optional verdicts present and green', runGate(), 0);

withOptional.verdicts.density = 'RED';
writeArtifact(withOptional);
check('exit 1 when an optional verdict is present and not green', runGate(), 1);

// ----------------------------------------------------------- fail closed

writeArtifact(artifact({ sha: uiSha }));
check('exit 1 when no artifact is bound to the sha', runGate(['--sha', 'deadbee']), 1);
check('exit 1 on a missing artifact directory', runGate(['--artifact-dir', join(tmp, 'nope')]), 1);
check('exit 2 on an empty --paths list', runGate(['--paths', ',']), 2);
check('exit 2 on an unknown option', runGate(['--bogus']), 2);
check('exit 2 on an unreadable schema', runGate(['--schema', join(tmp, 'missing.json')]), 2);

writeFileSync(join(artDir, `${uiSha.slice(0, 7)}.json`), '{not json');
check('exit 1 on a malformed artifact', runGate(), 1);

// A repo whose history has no UI-adjacent commit must FAIL, not pass silently.
const bare = join(tmp, 'bare');
mkdirSync(bare, { recursive: true });
execFileSync('git', ['-C', bare, 'init', '-q', '-b', 'main']);
execFileSync('git', ['-C', bare, 'config', 'user.email', 'test@example.com']);
execFileSync('git', ['-C', bare, 'config', 'user.name', 'test']);
execFileSync('git', ['-C', bare, 'config', 'commit.gpgsign', 'false']);
writeFileSync(join(bare, 'README.md'), 'x\n');
execFileSync('git', ['-C', bare, 'add', '-A']);
execFileSync('git', ['-C', bare, 'commit', '-q', '-m', 'docs only']);
try {
  execFileSync(process.execPath, [GATE, '--repo', bare, '--artifact-dir', artDir, '--schema', SCHEMA], { stdio: 'pipe' });
  check('a repo with no UI commit fails rather than passing', 0, 1);
} catch (e) {
  check('a repo with no UI commit fails rather than passing', e.status, 1);
}

rmSync(tmp, { recursive: true, force: true });

// ------------------------------------------------------------------ report

console.log(`${passed}/${passed + failures.length} CI selftest cases passed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
