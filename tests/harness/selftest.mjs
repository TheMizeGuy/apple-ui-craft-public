#!/usr/bin/env node
// selftest.mjs -- verify the scorer itself.
//
// A scoring harness nobody tests is a gate that can silently pass everything.
// These cases pin the behaviours the gate depends on: substance floors, one
// finding claiming at most one label, clean-control accounting, precision as a
// gated metric rather than a printed one, the exit-code contract, and the blind
// copy that keeps answer-bearing comments out of a baseline.
//
// Run: node tests/harness/selftest.mjs      Exit 0 all pass, 1 any fail.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokenize, overlap, hasSubstance, mentionsRule, score } from './score-review.mjs';
import { ANSWER_COMMENT, STUB_MARKER, NEUTRAL_STUB_LINE, blindText } from './blind-copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCORER = join(HERE, 'score-review.mjs');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
}

function checkTrue(name, value) {
  check(name, !!value, true);
}

// ---------------------------------------------------------------- tokenize

check('tokenize drops stopwords', tokenize('the fixed frame on a row'), ['fixed', 'frame', 'row']);
check('tokenize drops sub-3-char tokens', tokenize('a ab abc abcd'), ['abc', 'abcd']);
check('tokenize is case and punctuation insensitive', tokenize('Fixed-Frame, TRUNCATES!'), ['fixed', 'frame', 'truncates']);
check('tokenize drops platform noise words', tokenize('SwiftUI view truncates'), ['truncates']);
check('tokenize handles empty', tokenize(''), []);
check('tokenize handles null', tokenize(null), []);

// ----------------------------------------------------------------- overlap

check('overlap identical is 1', overlap('fixed frame truncates', 'fixed frame truncates'), 1);
check('overlap disjoint is 0', overlap('fixed frame', 'delete confirmation'), 0);
checkTrue('overlap partial is between', overlap('fixed frame truncates', 'fixed frame') > 0.5);
check('overlap with empty is 0', overlap('', 'fixed frame'), 0);

// ------------------------------------------------------------- hasSubstance

check('hasSubstance rejects one meaningful token', hasSubstance({ title: 'the truncation' }), false);
check('hasSubstance rejects a bare ruleRef title', hasSubstance({ title: 'adaptive' }), false);
check('hasSubstance accepts two meaningful tokens', hasSubstance({ title: 'fixed frame' }), true);
check('hasSubstance rejects a missing title', hasSubstance({}), false);

// ------------------------------------------------------------- mentionsRule

check('mentionsRule matches explicit field', mentionsRule({ ruleRef: 'adaptive/fixed-frame' }, 'adaptive/fixed-frame'), true);
check('mentionsRule matches ref inside evidence', mentionsRule({ evidence: 'see adaptive/fixed-frame' }, 'adaptive/fixed-frame'), true);
check('mentionsRule matches ref inside id', mentionsRule({ id: 'x-adaptive/fixed-frame' }, 'adaptive/fixed-frame'), true);
check('mentionsRule rejects a different ref', mentionsRule({ ruleRef: 'density/stretched-phone' }, 'adaptive/fixed-frame'), false);
check('mentionsRule on an empty finding', mentionsRule({}, 'adaptive/fixed-frame'), false);

// ---------------------------------------------------------------- scoring

const LABELS = {
  fixtures: [
    {
      file: 'a.swift',
      expected: [
        { id: 'l1', ruleRef: 'adaptive/fixed-frame', dimension: 'Adaptive layout and Dynamic Type', title: 'Fixed frame truncates at accessibility sizes' },
        { id: 'l2', ruleRef: 'density/leftover-sizing', dimension: 'Density and economy', title: 'Value sized by the leftover' }
      ]
    },
    { file: 'clean.swift', expected: [], maxIncidentalFindings: 1 }
  ]
};

const good = (over = {}) => ({
  dimension: 'Adaptive layout and Dynamic Type',
  file: 'tests/corpus/fixtures/a.swift',
  title: 'Fixed frame truncates at accessibility sizes',
  ruleRef: 'adaptive/fixed-frame',
  ...over
});

const both = [good(), good({ dimension: 'Density and economy', title: 'Value sized by the leftover', ruleRef: 'density/leftover-sizing' })];

check('perfect run scores 1.0 recall', score(both, LABELS).totals.recall, 1);
check('perfect run scores 1.0 precision', score(both, LABELS).totals.precision, 1);
check('one of two labels found halves recall', score([good()], LABELS).totals.recall, 0.5);
check('no findings scores 0 recall', score([], LABELS).totals.recall, 0);

const withNoise = [...both, good({ ruleRef: 'made/up', title: 'Something else entirely here' })];
check('an unmatched extra lowers precision', Number(score(withNoise, LABELS).totals.precision.toFixed(3)), 0.667);
check('an unmatched extra keeps recall at 1', score(withNoise, LABELS).totals.recall, 1);

check(
  'a substanceless finding does not score a hit',
  score([good({ title: 'frame' })], LABELS).totals.hits,
  0
);

// One finding must not satisfy two labels, or a single vague report scores full
// marks on a fixture with several planted defects.
const ambiguous = [good({ ruleRef: undefined, title: 'Fixed frame truncates at accessibility sizes' })];
check('one finding claims at most one label', score(ambiguous, LABELS).totals.hits, 1);

// Title-overlap fallback: no ruleRef, right dimension, close enough title.
check(
  'fuzzy title match works without a ruleRef',
  score([good({ ruleRef: undefined, title: 'Fixed frame truncates at large accessibility sizes' })], LABELS).totals.hits,
  1
);
check(
  'fuzzy match requires the same dimension',
  score([good({ ruleRef: undefined, dimension: 'Task flow and journey' })], LABELS).totals.hits,
  0
);

// Owner-section pass: a finding that cites the label's owner section and sits
// on the labelled construct pairs even when its title shares too few words.
// Two labels sharing one owner section are told apart by line, nearest first.
const OWNER = 'references/usability/02-forms-and-error-recovery.md#7-destructive-actions-confirm-or-undo-or-both';
const OWNED = {
  fixtures: [
    {
      file: 'd.swift',
      expected: [
        { id: 'u', ruleRef: 'forms/destructive-unguarded', dimension: 'Error recovery and state integrity', line: 20, title: 'Irreversible delete with neither confirmation nor undo', owner: OWNER },
        { id: 'b', ruleRef: 'forms/bulk-without-count', dimension: 'Error recovery and state integrity', line: 27, title: 'Delete All does not state how many records it destroys', owner: OWNER }
      ]
    }
  ]
};
const owned = (over = {}) => ({
  dimension: 'Error recovery and state integrity',
  file: 'tests/corpus/fixtures/d.swift',
  line: 26,
  title: 'Delete All erases every workout on one unconfirmed tap',
  ruleRef: OWNER,
  evidence: 'Button("Delete All") runs removeAll on one tap.',
  ...over
});
const swipe = owned({ line: 19, title: 'Swipe-delete is permanent, with no undo or rollback' });
const pairsOf = (findings) => score(findings, OWNED).perFixture[0].pairs.map((p) => `${p.label}<-${p.by}`);

check('owner citation pairs a finding whose title shares too few words', score([owned()], OWNED).totals.hits, 1);
check('owner pairing takes the nearest label, not the first', pairsOf([owned()]), ['forms/bulk-without-count<-Delete All erases every workout on one unconfirmed tap']);
check('two labels sharing an owner section each get their own construct', pairsOf([owned(), swipe]), [
  'forms/destructive-unguarded<-Swipe-delete is permanent, with no undo or rollback',
  'forms/bulk-without-count<-Delete All erases every workout on one unconfirmed tap'
]);
check('owner pairing records its pass', score([owned()], OWNED).perFixture[0].pairs[0].pass, 'owner');
check('owner citation outside the line window does not pair', score([owned({ line: 60 })], OWNED).totals.hits, 0);
check('a different section of the owner file does not pair', score([owned({ ruleRef: 'references/usability/02-forms-and-error-recovery.md#10-submission-state' })], OWNED).totals.hits, 0);
check('owner citation inside the evidence pairs', score([owned({ ruleRef: undefined, evidence: `see ${OWNER}` })], OWNED).totals.hits, 1);
check('an absolute citation path pairs by its references/ suffix', score([owned({ ruleRef: `/opt/plugin/${OWNER}` })], OWNED).totals.hits, 1);
check('a finding with no line never pairs by owner', score([owned({ line: undefined })], OWNED).totals.hits, 0);
check('a label with no line never pairs by owner', score([owned()], { fixtures: [{ file: 'd.swift', expected: [{ ...OWNED.fixtures[0].expected[1], line: undefined }] }] }).totals.hits, 0);
check('an exact ruleRef still wins before the owner pass', pairsOf([owned({ line: 19, ruleRef: 'forms/bulk-without-count' }), swipe]), [
  'forms/destructive-unguarded<-Swipe-delete is permanent, with no undo or rollback',
  'forms/bulk-without-count<-Delete All erases every workout on one unconfirmed tap'
]);

// ---------------------------------------------------------- clean controls

const cleanHit = [...both, good({ file: 'tests/corpus/fixtures/clean.swift', ruleRef: 'x/y', title: 'Prescribed construct wrongly flagged' })];
check('one finding on a clean control is within tolerance', score(cleanHit, LABELS).controlFailures.length, 0);

const cleanHit2 = [
  ...both,
  good({ file: 'tests/corpus/fixtures/clean.swift', ruleRef: 'x/y', title: 'First wrongly flagged construct' }),
  good({ file: 'tests/corpus/fixtures/clean.swift', ruleRef: 'x/z', title: 'Second wrongly flagged construct' })
];
check('two findings on a clean control fail it', score(cleanHit2, LABELS).controlFailures.length, 1);
check('a clean-control finding counts against precision', score(cleanHit, LABELS).totals.precision < 1, true);

// ------------------------------------------------------------- arg handling

check('fixture filter narrows the corpus', score(both, LABELS, 'a.swift').perFixture.length, 1);
check('unknown fixture is an error', !!score(both, LABELS, 'nope.swift').error, true);
check(
  'findings outside the corpus are ignored, not counted',
  score([...both, good({ file: 'src/SomeApp.swift', ruleRef: 'q/r', title: 'Unrelated production finding' })], LABELS).totals.precision,
  1
);
check(
  'ignored findings are reported',
  score([...both, good({ file: 'src/SomeApp.swift', ruleRef: 'q/r', title: 'Unrelated production finding' })], LABELS).ignoredFindings,
  1
);

// -------------------------------------------------------------- exit codes

const tmp = mkdtempSync(join(tmpdir(), 'auc-selftest-'));
function runScorer(args) {
  try {
    execFileSync(process.execPath, [SCORER, ...args], { stdio: 'pipe' });
    return 0;
  } catch (e) {
    return e.status;
  }
}

const realFindings = join(HERE, 'examples', 'sample-findings.json');
check('exit 0 on a passing run', runScorer([realFindings]), 0);
check('exit 0 on a single fully-matched fixture', runScorer([realFindings, '--min-recall', '1', '--min-precision', '1', '--fixture', 'draft-in-sheet.swift']), 0);

// A genuine threshold failure: one of the two labels on fixed-frame-row, scored
// against a recall floor of 1.
const partial = join(tmp, 'partial.json');
writeFileSync(
  partial,
  JSON.stringify([
    {
      dimension: 'Adaptive layout and Dynamic Type',
      file: 'tests/corpus/fixtures/fixed-frame-row.swift',
      title: 'Fixed 120pt title frame truncates at accessibility sizes',
      ruleRef: 'adaptive/fixed-frame'
    }
  ])
);
check('exit 1 when recall is below the floor', runScorer([partial, '--fixture', 'fixed-frame-row.swift', '--min-recall', '1']), 1);
check('exit 0 when that same run clears a lower floor', runScorer([partial, '--fixture', 'fixed-frame-row.swift', '--min-recall', '0.5']), 0);

const emptyFile = join(tmp, 'empty.json');
writeFileSync(emptyFile, '[]');
check('exit 1 when nothing is found', runScorer([emptyFile]), 1);

const badFile = join(tmp, 'bad.json');
writeFileSync(badFile, '{not json');
check('exit 2 on malformed json', runScorer([badFile]), 2);

const notArray = join(tmp, 'notarray.json');
writeFileSync(notArray, '{"nope": 1}');
check('exit 2 when findings is not an array', runScorer([notArray]), 2);

check('exit 2 on missing argument', runScorer([]), 2);
check('exit 2 on unknown option', runScorer([realFindings, '--bogus']), 2);
check('exit 2 on an out-of-range threshold', runScorer([realFindings, '--min-recall', '0']), 2);

// -------------------------------------------------------------- blind copy

// A blind baseline is only blind if no fixture comment names its answer.
check('answer regex catches "Plants:" with a space after the colon', ANSWER_COMMENT.test('// Plants: flow/x'), true);
check('answer regex leaves an ordinary code comment alone', ANSWER_COMMENT.test('// Joins the safe area'), false);

const synthetic = [
  '// FIXTURE: x', '// Plants: a/b', '//', '// why it fails', '',
  'import SwiftUI', '',
  '// Minimal stubs so the fixture stands alone. Not part of the planted defect.',
  'struct A {}',
  '    // the planted bug lives here',
  'let x = 1   // reading measure',
  '// MARK: - Root', ''
].join('\n');
const blinded = blindText(synthetic);
check(
  'blindText drops the header and answer comments and neutralises the stub marker',
  blinded.text,
  ['import SwiftUI', '', NEUTRAL_STUB_LINE, 'struct A {}', 'let x = 1   // reading measure', '// MARK: - Root', ''].join('\n')
);
check('blindText maps each kept line to its original line', blinded.lines, [6, 7, 8, 9, 11, 12, 13]);

const BLIND = join(HERE, 'blind-copy.mjs');
const FIXTURE_DIR = join(HERE, '..', 'corpus', 'fixtures');
function runBlind(args) {
  try {
    return { status: 0, out: execFileSync(process.execPath, [BLIND, ...args], { stdio: 'pipe' }).toString() };
  } catch (e) {
    return { status: e.status, out: String(e.stdout || '') };
  }
}

const blindDir = join(mkdtempSync(join(tmpdir(), 'auc-blind-')), 'review');
check('blind copy succeeds outside the repo', runBlind(['copy', blindDir]).status, 0);
const blindMapPath = `${blindDir}.map.json`;
const blindMap = JSON.parse(readFileSync(blindMapPath, 'utf8'));
const listedFixtures = JSON.parse(readFileSync(join(HERE, '..', 'corpus', 'labels.json'), 'utf8')).fixtures.map((f) => f.file);
check('blind copy writes every listed fixture once', Object.values(blindMap).map((m) => m.fixture).sort(), [...listedFixtures].sort());

const leaks = [];
const lost = [];
const drifted = [];
const headed = [];
for (const [name, { fixture, lines }] of Object.entries(blindMap)) {
  const blind = readFileSync(join(blindDir, name), 'utf8').split('\n');
  const original = readFileSync(join(FIXTURE_DIR, fixture), 'utf8').split('\n');
  if (blind[0].trim().startsWith('//')) headed.push(name);
  blind.forEach((line, i) => {
    if (ANSWER_COMMENT.test(line)) leaks.push(`${name}:${i + 1}`);
    const from = original[lines[i] - 1];
    const same = line === from || (line.trim() === NEUTRAL_STUB_LINE && STUB_MARKER.test(from));
    if (!same) drifted.push(`${name}:${i + 1}`);
  });
  const kept = new Set(lines);
  let start = 0;
  while (start < original.length && original[start].trim().startsWith('//')) start++;
  while (start < original.length && original[start].trim() === '') start++;
  original.forEach((line, j) => {
    if (j >= start && !line.trim().startsWith('//') && !kept.has(j + 1)) lost.push(`${fixture}:${j + 1}`);
  });
}
check('the reviewed directory holds only the neutral files', readdirSync(blindDir).sort(), Object.keys(blindMap).sort());
check('blind copy removes every fixture header', headed, []);
check('blind copy leaves no answer-bearing comment', leaks, []);
check('blind copy keeps every code line', lost, []);
check('blind copy line map points at the original text', drifted, []);

const insideRepo = join(HERE, 'blind-out-must-not-exist');
check('blind copy refuses an outDir inside the repo (exit 2)', runBlind(['copy', insideRepo]).status, 2);
check('a refused blind copy writes nothing', existsSync(insideRepo), false);
check('blind copy refuses a non-empty outDir (exit 2)', runBlind(['copy', blindDir]).status, 2);

const blindFindings = join(tmp, 'blind-findings.json');
writeFileSync(
  blindFindings,
  JSON.stringify(Object.keys(blindMap).map((name) => ({ file: join(blindDir, name), line: 1, title: 'Blind finding title' })))
);
const unmapped = runBlind(['unmap', blindFindings, blindMapPath]);
check('unmap exits 0', unmapped.status, 0);
const roundTrip = unmapped.status === 0 ? JSON.parse(unmapped.out) : [];
check(
  'copy then unmap round-trips file names',
  roundTrip.map((f) => f.file),
  Object.values(blindMap).map((m) => `tests/corpus/fixtures/${m.fixture}`)
);
check('unmap rewrites a line to the original line', roundTrip.map((f) => f.line), Object.values(blindMap).map((m) => m.lines[0]));
check('unmap exits 2 on a missing argument', runBlind(['unmap', blindFindings]).status, 2);

// ------------------------------------------------------------------ report

console.log(`${passed}/${passed + failures.length} selftest cases passed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
