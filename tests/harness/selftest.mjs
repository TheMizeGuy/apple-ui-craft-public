#!/usr/bin/env node
// selftest.mjs -- verify the scorer itself.
//
// A scoring harness nobody tests is a gate that can silently pass everything.
// These cases pin the behaviours the gate depends on: substance floors, one
// finding claiming at most one label, clean-control accounting, precision as a
// gated metric rather than a printed one, and the exit-code contract.
//
// Run: node tests/harness/selftest.mjs      Exit 0 all pass, 1 any fail.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokenize, overlap, hasSubstance, mentionsRule, score } from './score-review.mjs';

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

// ------------------------------------------------------------------ report

console.log(`${passed}/${passed + failures.length} selftest cases passed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
