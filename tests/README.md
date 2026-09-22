# tests

Three gates, zero dependencies, Node >= 18 stdlib only. Run them all:

```bash
bash tests/run-all.sh
```

| Gate | Command | What it protects |
|---|---|---|
| Reference integrity | `node tests/check-references.mjs` | Every `references/<path>.md#anchor` citation in shipped content resolves. Also warns about reference files nothing cites |
| Scorer selftest | `node tests/harness/selftest.mjs` | The scoring harness itself: substance floors, one-finding-one-label, clean-control accounting, exit codes |
| Corpus recall | `node tests/harness/score-review.mjs <findings.json>` | A review run against labelled fixtures: recall >= 0.8 and precision >= 0.8, with the clean control at zero |

## Why a reference-integrity gate exists

A citation that does not resolve is a **silent** capability loss. The agent
follows the pointer, finds nothing, and continues with less knowledge than the
plugin claims to have -- and nothing in the output says so. That failure mode
sank a sibling plugin: 84 citations pointed at an external vault that resolved on
one machine and nowhere else, and because no agent had any instruction for what
to do when a source was missing, the degradation was never reported. This gate
makes the internal version of that failure a test failure instead.

It runs in milliseconds and needs no judgement, so there is no reason to skip it.

## The corpus

`tests/corpus/fixtures/` holds SwiftUI files with deliberately planted defects,
and `tests/corpus/labels.json` records what a by-the-book review should find in
each. Coverage is concentrated on the dimensions added in 0.3.0 -- task flow,
information architecture, error recovery, adaptive layout, density -- because
those had no regression protection at all. The visual dimensions, animation,
haptics, VoiceOver, performance and platform integration have **no labels here**;
read any recall number as recall over the labelled dimensions, never as coverage
of the plugin's twenty-five.

**Fixtures are read, not compiled.** There is no Xcode target, so an editor
resolving them against the host macOS SDK will flag iOS-only API
(`navigationBarTitleDisplayMode`, `topBarLeading`, `keyboardType`,
`ContentUnavailableView.search`). Those diagnostics are an artifact of having no
iOS target, not defects to fix. Several of them **are** the planted defect, and
"fixing" one destroys the fixture.

`adaptive-clean-control.swift` is the mirror guard: it uses what the references
prescribe and must produce **zero** findings. A reviewer that flags `AnyLayout`,
`@ScaledMetric`, `interactiveDismissDisabled`, or a reading-measure `maxWidth`
there has learned to match constructs rather than defects, and the gate fails it.

## Producing a findings file

Scoring is a two-step loop, because the reviewer is a model and the scorer is a
program:

1. Dispatch `apple-ui-reviewer` over `tests/corpus/fixtures/`, instructing it to
   emit its findings as a JSON array in the canonical shape from
   `references/review/01-finding-format.md` -- one object per finding with
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

`tests/harness/examples/sample-findings.json` is a by-the-book run: 16 of 16
labels, recall 1.000, precision 1.000, clean control at zero. It is what a
correct review looks like, and it is what the selftest exercises the exit-code
contract against.

**Blind baselines are a different measurement and this repo does not have one
yet.** The example file was written alongside the labels, so it measures the
harness, not the reviewer. A real baseline means dispatching the reviewer over
the fixtures with no sight of `labels.json` and recording what it actually finds.
Until that exists, do not quote 1.000 as a detection rate -- it is an answer-key
ceiling. Producing the first blind baseline is tracked work.

## Changing the corpus

`labels.json` and the references move together. A `ruleRef` here whose defect is
not defined in the reference named in its `owner` field is a corpus that tests
nothing, and a doctrine change that alters what should be flagged needs a fixture
added or relabelled in the same commit -- not just a paragraph edited.
