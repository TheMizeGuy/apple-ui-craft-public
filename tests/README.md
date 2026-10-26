# tests

The gates have zero dependencies: Node >= 18 stdlib only. Run them all:

```bash
bash tests/run-all.sh
```

| Gate | Command | What it protects |
|---|---|---|
| Reference and label-owner integrity | `node tests/check-references.mjs` | Every `references/<path>.md#anchor` citation in shipped content resolves, and so does every corpus label owner, fixture file and ruleRef area. Also warns about reference files nothing cites |
| Scorer selftest | `node tests/harness/selftest.mjs` | The scoring harness itself: substance floors, one-finding-one-label, the owner-section pass, clean-control accounting, exit codes, and the blind copy |
| Corpus recall | `node tests/harness/score-review.mjs <findings.json>` | A review run against labelled fixtures: recall >= 0.8 and precision >= 0.8, with at most one incidental finding on each clean control (`maxIncidentalFindings` in labels.json) |

`run-all.sh` also runs the CI gate selftest, the manifest version lockstep, the
model-naming check, and the answer key described below.

## Why a reference-integrity gate exists

A citation that does not resolve is a **silent** capability loss. The agent
follows the pointer, finds nothing, and continues with less knowledge than the
plugin claims to have -- and nothing in the output says so. That failure mode
sank a sibling plugin: 84 citations pointed at an external vault that resolved on
one machine and nowhere else, and because no agent had any instruction for what
to do when a source was missing, the degradation was never reported. This gate
makes the internal version of that failure a test failure instead.

Corpus label owners resolve the same way, so a heading renamed in an owner file
fails here instead of leaving a label that points at nothing.

It runs in milliseconds and needs no judgement, so there is no reason to skip it.

## The corpus

`tests/corpus/fixtures/` holds SwiftUI files with deliberately planted defects,
and `tests/corpus/labels.json` records what a by-the-book review should find in
each. Labels cover task flow, information architecture, error recovery and state
integrity, adaptive layout and Dynamic Type, density and economy, and the
platform-conformance checks inside Navigation patterns, Micro-interactions,
Layout and spacing, Color system and SF Symbols. Liquid Glass, Typography
hierarchy, App icon, Animation, Haptics, VoiceOver and the other accessibility
dimensions, performance and platform integration have **no labels here**; read
any recall number as recall over the labelled dimensions, never as coverage of
the registry.

**Fixtures are read, not compiled.** There is no Xcode target, so an editor
resolving them against the host macOS SDK will flag iOS-only API
(`navigationBarTitleDisplayMode`, `topBarLeading`, `keyboardType`,
`ContentUnavailableView.search`). Those diagnostics are an artifact of having no
iOS target, not defects to fix. Several of them **are** the planted defect, and
"fixing" one destroys the fixture. Each fixture does typecheck on its own against
the iOS Simulator SDK, which is the check to run after editing one:
`xcrun --sdk iphonesimulator swiftc -typecheck -target arm64-apple-ios26.0-simulator <file>`.

`adaptive-clean-control.swift` is the mirror guard: it uses what the references
prescribe, and a correct review files nothing there. The scorer allows at most
one incidental finding (`maxIncidentalFindings` in labels.json) before it fails
the control. A reviewer that flags `AnyLayout`, `@ScaledMetric`,
`interactiveDismissDisabled`, or a reading-measure `maxWidth` there has learned
to match constructs rather than defects, and the gate fails it.

`conformance-clean-control.swift` does the same for the platform-conformance
checks, with the same tolerance. It holds the prescribed counterpart of every
conformance plant and the exemptions those checks carry: a drag held in
`@GestureState` with its outcome written in `.onEnded`, a required consent sheet
that locks dismissal with a comment saying why, `ignoresSafeArea()` on a camera
preview alone, a `.sidebarAdaptable` `TabView`, a `Toggle` restyled through
`ToggleStyle`, a `Menu` whose label is a row's text block restyled through
`.menuStyle(.button)` and `.buttonStyle(.plain)` beside a toolbar `Menu` that
keeps the system chrome on its short `Label`, a custom dial bridged with
`accessibilityRepresentation`, and a custom symbol beside SF Symbols. Each
exemption has its should-flag twin in a positive fixture.

### Clean-control re-audits

When a release widens what the reviewer checks, the existing clean controls are
re-read against the new rows. A clean control found to carry a real defect is
corrected in the fixture, never relabelled.

| Release | Clean control | Read against | Fires |
|---|---|---|---|
| 0.7.0 | `adaptive-clean-control.swift` | The new apple-ui-reviewer rows in dimensions 4 to 7 and the new severities in interaction/03, interaction/06, patterns/05, usability/03, usability/05, design/04 and design/05 | Nothing. The dismiss lock is bound to `draft.hasUnsavedContent` beside a real Cancel; every icon is an SF Symbol; text uses `.secondary` and the icon `.orange`, both adaptive; there is no drag gesture and no shape-drawn control; the custom bar uses `safeAreaInset` and nothing ignores the safe area; navigation is a `NavigationSplitView` |

## Producing a findings file

Scoring is a two-step loop, because the reviewer is a model and the scorer is a
program:

1. Dispatch `apple-ui-reviewer` over `tests/corpus/fixtures/`, telling it that
   each file is a standalone snippet whose type names repeat across files, and
   instructing it to emit its findings as a JSON array in the canonical shape
   from `references/review/01-finding-format.md` -- one object per finding with
   `id`, `dimension`, `severity`, `confidence`, `file`, `line`, `title`,
   `evidence`, and optionally `ruleRef`.
2. Save that array and score it.

```bash
node tests/harness/score-review.mjs findings.json
node tests/harness/score-review.mjs findings.json --fixture six-tabs.swift --format json
node tests/harness/score-review.mjs findings.json --min-recall 0.9
```

Exit `0` pass, `1` below threshold or a failed clean control, `2` usage or
malformed input.

The scorer pairs each finding with at most one label, in three passes over a
fixture, each pass running for every label before the next starts: by
`ruleRef`; then by the label's `owner` section cited in the finding (its
`ruleRef` or any free-text field) with the finding within eight lines of the
labelled line, nearest line first, so two labels that share an owner section
each get the finding on their own construct; then by dimension with a title
overlap of at least 0.34. A blind reviewer writes its own titles and cites
reference sections rather than corpus ruleRefs, so the second pass is the one
that carries a blind run.

`tests/harness/examples/sample-findings.json` is a by-the-book run: every label,
recall 1.000, precision 1.000, both clean controls at zero. It is what a correct
review looks like. `run-all.sh` scores it at recall and precision 1 (the "answer
key covers every label" row), so a label added without its by-the-book finding
fails there, and the selftest exercises the exit-code contract against it.

## Blind baselines

**The example file measures the harness, not the reviewer.** It was written
alongside the labels, so do not quote 1.000 as a detection rate -- it is an
answer-key ceiling. A blind baseline dispatches the reviewer over fixtures it
cannot read the answers from and records what it actually finds. The fixtures as
they stand cannot give one: every header names its answer, and the scorer credits
a finding that repeats a ruleRef anywhere in its text.

1. Copy. `node tests/harness/blind-copy.mjs copy <dir>`, with `<dir>` outside the
   repository and given a neutral name (the tool refuses a path inside the
   repository or a non-empty directory). It writes every listed fixture to
   `<dir>/file-NN.swift`, ordered by a hash of the fixture name, with the header
   removed, every comment that names a fixture, a planted defect, a ruleRef or a
   clean control removed, and each stub-marker comment replaced by
   `// Stubs: implementations elided.` The map back to the fixtures is written
   beside the directory, as `<dir>.map.json`, so the review never sees it.
2. Review. Dispatch `apple-ui-reviewer` over `<dir>` as an ordinary iOS code
   review, with no mention of a corpus, labels, ruleRefs or planted defects, and
   a `REFERENCES:` line pointing at a copy of `references/` outside the
   repository so nothing under `tests/` is in reach:

   > Review every Swift file in `<dir>`. Each file is a standalone snippet;
   > type names repeat across files and do not share a module. Emit your
   > findings as one JSON array in the canonical shape from
   > `references/review/01-finding-format.md`: one object per finding with `id`,
   > `dimension`, `severity`, `confidence`, `file`, `line`, `title` and
   > `evidence`.

3. Unmap and score. `unmap` rewrites each `file` and `line` to the corpus
   fixture:

   ```bash
   node tests/harness/blind-copy.mjs unmap findings.json <dir>.map.json > mapped.json
   node tests/harness/score-review.mjs mapped.json --format json
   ```

The clean controls' explanatory code comments survive the copy as ordinary code
comments: in `adaptive-clean-control.swift` the notes on the split view, the
reflow, the reading measure, the safe-area inset, the dismiss guard and the
double-submit guard, and in `conformance-clean-control.swift` the required-step
note and the `MARK` lines. They describe a construct, not a verdict.

**Every blind run is recorded, in order, never replaced.** Record each here and
in the CHANGELOG as a measurement, not a gate: the date, the fixture set and
label count, the reviewer's model class, recall, precision, the incidental
findings on each clean control, and what changed since the previous run. A run
is blind when nothing in the reviewer, the scorer or the labels was edited in
response to an earlier run's misses on these fixtures. The reviewer may still
change for other reasons (a rule added with its own fixture, a clean control
corrected), and the next run then measures the new state. A run after a
dimension row was sharpened against misses on these fixtures is reported as
`not blind (fixtures seen)`, because that fits the reviewer to the test set,
and a fresh blind number then needs fresh fixtures. A miss is reported and its
dimension row sharpened, never a label edited; a sequence of runs with a
climbing number over unchanged fixtures is the record of exactly that. The
baseline a future fresh-fixture run compares against is the latest blind run
over the shipped corpus.

### Run 1, 2026-10-26 (17 fixtures, 23 labels, blind)

`tests/corpus/blind-2026-10-26.json` is the findings array, mapped back to the
fixtures, of one `apple-ui-reviewer` dispatch (model class opus, Source mode)
over the blind copy of all 17 fixtures, with `labels.json`, the answer key and
this file out of reach. It is a measurement, not a gate.

| Number | Value |
|---|---|
| Labels | 23 |
| Findings emitted | 30 |
| Matched | 14 |
| Recall | 0.609 |
| Precision | 0.467 |
| Incidental findings on `adaptive-clean-control.swift` | 2 (tolerance 1) |
| Incidental findings on `conformance-clean-control.swift` | 2 (tolerance 1) |

Those are the numbers under the scorer of the day, which paired by `ruleRef`
and then by title overlap. Re-scored with the owner-section pass that run 2
added, the same findings pair 19 of its 23 labels (recall 0.826, precision
0.633); the five extra pairs are detections the title matcher could not pair.

Reading the misses as scored that day, because the raw numbers describe the
matcher as much as the reviewer:

- Five misses are detections the scorer could not pair with their label: four by
  title vocabulary under the same dimension (`six-tabs` navigation title,
  `fixed-frame-row` 120pt frame at 0.33 overlap against the 0.34 bar,
  `numberpad-trap` keyboard trap, `conformance-icon-drift` web icon set) and one
  by dimension placement (`broken-back-gesture`, filed under Navigation patterns,
  where the reviewer's own dimension 5 table carries the back-button row, while
  the label sits under Task flow and journey). The reviewer found all five defects.
- Three misses are one finding covering two labels (`missing-empty-state`,
  `viewthatfits-no-fit`, `destructive-no-confirm`): the second label's defect is
  named inside the first finding's evidence or fix, not filed on its own.
- One miss is real: `fixed-frame-row`'s density label (the value column sized by
  the leftover at regular width) was not found.
- All four incidental findings on the clean controls were real defects in the
  fixtures and were corrected in the same change: the adaptive control's search
  field left the hierarchy on zero results and its workout title carried
  `.textContentType(.name)`; the conformance control's volume dial assigned the
  raw angle (wrapping between 0% and 100% at the top) and its `@ScaledMetric`
  diameter was unbounded (374pt at AX5). The corrected fixtures were not re-run;
  any later run over these fixtures is `not blind (fixtures seen)`. The
  `conformance/menu-chrome-on-content` label and its clean-control twin were
  added after this run and are not in it.

What the number says about the reviewer: it finds the planted defects (22 of 23
named somewhere in its output) and it files them under its own dimension table and
vocabulary, which the one-finding-one-label matcher reads as misses. The 16
unmatched findings outside the clean controls are real defects the fixtures carry
without a label (payment submit path, swipe-delete without undo, duplicated large
titles, row padding over list insets and kin); whether to label them is a corpus
decision, not a reviewer defect.

### Run 2, 2026-10-26 (17 fixtures, 24 labels, blind)

`tests/corpus/blind-2026-10-26-run2.json` is the findings array, mapped back to
the fixtures, of a second `apple-ui-reviewer` dispatch (model class opus, Source
mode) over a fresh blind copy with the same prompt as run 1. Since run 1 the two
clean controls were corrected, the web-controls fixture gained the
`conformance/menu-chrome-on-content` plant, and the reviewer gained that one
row; nothing was edited against run 1's misses, so the run is blind. It is the
baseline for the shipped 0.7.0 corpus.

| Number | Value |
|---|---|
| Labels | 24 |
| Findings emitted | 27 |
| Matched, scorer of run 1 (ruleRef, then title overlap) | 17 (recall 0.708, precision 0.630) |
| Matched, current scorer (owner-section pass added) | 21 (recall 0.875, precision 0.778) |
| Incidental findings on `adaptive-clean-control.swift` | 0 (tolerance 1) |
| Incidental findings on `conformance-clean-control.swift` | 0 (tolerance 1) |

The owner-section pass was added after this run, from its pairing failures: in
six of the seven misses the reviewer had cited the label's owner section on the
labelled line and the title matcher could not pair them. It changes how findings
pair with labels, not what the reviewer found, both runs are re-scored with it
here, and the reviewer was not edited. The three misses that remain:

- `fixed-frame-row`'s adaptive label was found (`Workout name pinned to a fixed
  120pt column`, on the labelled line) but filed under
  `usability/05#4-dynamic-type-is-the-platforms-zoom`, where the label's owner
  is `#1-classify-the-sizing-strategy-first`, at 0.33 title overlap. Both runs
  cite section 4. Whether the label's owner should move is a corpus decision,
  not a reviewer defect, and it is not made against a run.
- `missing-empty-state`'s second label and `viewthatfits-no-fit`'s icon label:
  one finding covers two labels (`Search has no zero-results, empty or loading
  state`; the fixed 32pt icon named inside the ViewThatFits finding). The
  one-finding-one-label rule counts the second as a miss by design.

The five other findings outside the clean controls that match no label are real
defects the fixtures carry unlabelled: row padding over list insets, a
duplicated large title, a case-sensitive search filter, a workout list with no
empty state in the stretched-phone fixture, and a send that dismisses before
its result. The menu-chrome plant was filed on its labelled line with the
prescribed fix, and both corrected clean controls read clean, which is what the
corrections were for.

## Changing the corpus

`labels.json` and the references move together. A `ruleRef` here whose defect is
not defined in the reference named in its `owner` field is a corpus that tests
nothing, and a doctrine change that alters what should be flagged needs a fixture
added or relabelled in the same commit -- not just a paragraph edited.
`tests/check-references.mjs` fails on an owner anchor that does not resolve, an
undeclared ruleRef area, or a fixture with no labels entry. An exemption a check
carries ships with its should-flag twin in a positive fixture and its prescribed
form in a clean control, and every new label ships with its by-the-book finding
in `examples/sample-findings.json`.
