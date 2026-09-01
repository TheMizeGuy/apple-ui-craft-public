# Changelog

All notable changes to `apple-ui-craft` are documented here.

## 0.5.1 -- 2026-09-01

Reference-library corrections from the adversarial pass that 0.5.0 announced: five
Opus 5 executors read every file in five of the six domain clusters (motion,
accessibility + usability + review, design + methodology, patterns + exemplars,
performance) against the version-floor registry and Context7, and returned 72
evidence-backed findings; 140 edits across 55 files land here. The platform +
cross-platform cluster was not audited in this pass (its executor was cut off by the
account usage limit) and is the next pass.

### Examples that could not compile or did not do what their prose said

- `accessibility/05` -- the matchedGeometryEffect crossfade fallback was a ternary between
  two View types; the 26.4 availability block declared an `@Environment` property inside
  `if #available`. Both rewritten (if/else per branch; an `@available` wrapper view plus the
  UIKit static).
- `accessibility/03` -- the Reduce Transparency fallback put a bare `Material` in a
  ViewBuilder branch. Now one `.background(_:)` with an `AnyShapeStyle` ternary.
- `interaction/03` -- the momentum-throw example committed `position` outside an empty
  `withAnimation {}`, so the flick teleported. `interaction/02` -- `withAnimation` called
  with a `value:` label. `haptics/02` -- `Tab(...).tag(0) { }` (value-typed `Tab` takes
  `value:`). `interaction/05` and `/06` -- four unlabeled `.impact(...)` factory calls, the
  exact shape `haptics/01` says does not compile. `interaction/06` -- the segmented-pill
  example drove selection with `.onTapGesture`; it is a `Button` now.
- `performance/01` -- the "precompute" remedy rendered an empty list until `trips` next
  changed (`initial: true`); `performance/02` -- the "absolute heights" snippet set no
  height and the "prefetch" snippet loaded the appearing row; `performance/05` -- the
  `UIUpdateLink` example never enabled the link; `performance/08` -- the "off-main" pager
  fetched synchronously on `@MainActor` (now a `@ModelActor` returning `Sendable`
  snapshots).
- `design/06` -- `HStack(alignment: .leading)` in the RTL table; `design/11` -- a
  `PhotosPicker` with no label and a filter that admitted everything but videos, and the
  Objective-C spelling `PHLivePhotoViewPlaybackStyle`; `design/12` -- a `.middle`
  truncation comment showing head-truncated output; `methodology/01` -- a generic slot
  named `Body`; `methodology/03` -- an iOS 17 label on a recipe using the iOS 18
  `matchedTransitionSource`, with its `@Namespace` undeclared.
- `patterns/01` -- both "RIGHT" snippets: the shadow fix faded the whole card, the
  translucent fix filled with `.clear.opacity(0.9)`; `patterns/05` -- `.bar` and `.small`
  presented as built-in detents, and a dialog title interpolating an out-of-scope `item`;
  `patterns/07` -- `@State var body` beside `var body: some View`; `patterns/08` --
  `subscriptionStatusTask` documented with a product-id label and a `.userInitiated`
  default (it is a group id and `.medium`); `patterns/09` -- `.whiteOutlined`.
- Exemplars -- `01`: the indefinite `.variableColor` symbol effect ran ungated under
  Reduce Motion and the promised `.isHeader` trait was absent; `02`: the reorder
  "make-way" spring was the one ungated `withAnimation` in the file, the zoom hero claimed
  the system gates it, and the matchedGeometry toggle eased under Reduce Motion where the
  contract says `nil`; `03`: a memberwise call out of declaration order, two haptics bound
  to model state, and a pulse-ring indicator `patterns/01` bans by default; `04`: the
  fling gate called a method that did not exist and its environment key had no reader;
  `05`: three iOS-26 call sites at a stated iOS-18 floor, graded NIT where exemplar 01
  grades the same defect HIGH.

### Contradictions between files, resolved toward the owner

- Reduce Motion severity: `accessibility/05` grounded its CRITICAL on 2.3.3 (AAA, which
  `accessibility/08` forbids citing as required) and graded ungated parallax, zoom, and
  rotation MEDIUM while its own vestibular table calls them HIGH-risk and the scale owner
  calls them CRITICAL. The guide now grounds on 2.2.2 (A), keeps the HIGH-risk classes out
  of MEDIUM, and `interaction/01` defers the animated-drag grade to `interaction/03` (HIGH).
- "Never animate the follow": `animation/05` and `interaction/01` prescribed
  `.interactiveSpring` on the tracked drag value that `interaction/03` calls the number-one
  drag bug. The owner now states the carve-out once (a property that trails the gesture may
  carry it; the tracked value never does) and both files cite it.
- Animation cost table: two files each claimed OWNER with different rows. `performance/01`
  owns it (as `ARCHITECTURE.md` says), carries the animated-blur/shadow and `.fixedSize`
  rows it was missing, and `animation/01` and `/06` point there.
- Image memory: `AsyncImage` + `.frame()` was labelled the GOOD memory fix in
  `performance/01` while `performance/03` lists it as an anti-pattern; the 48 MB figure in
  two files ignored the Display P3 default `performance/03` puts at ~97 MB. Hitch bands in
  `performance/02` now carry their 60 Hz regime. The SwiftUI shadow rule is one sentence
  (`.clipShape` then `.shadow()`; the layer split is the UIKit fix).
- `accessibility/02` prescribed `.large` titles for AX5 truncation, the change
  `usability/03` files as a depth-cue defect; `patterns/05` and `/07` said sheets are
  "Reduce-Motion-safe with zero code", the claim the motion owner calls false; `patterns/06`
  rendered Sign Out destructive-red against `patterns/09`; `haptics/01` forbade a
  pull-to-refresh threshold haptic that `animation/06` requires for a custom pull, and
  called Vision Pro "None" where the registry lists visionOS 26 `.impact`;
  `methodology/02` called `legibilityWeight` get-only (it is writable, so the Bold Text
  preview the library recommends compiles).
- Floors and counts: `accessibilityScrollAction` is iOS 13 (was 16 in its owner),
  `accessibilityZoomAction` is iOS 16 (was 13 in `animation/05`) -- both registered;
  `.task(id:name:)`'s `name:` is 26.4 in `performance/04` as in `/06`; the custom hover
  effect closure family is visionOS 2 only, not iPadOS; `review/04` said four
  NOT_ASSESSED keys where the schema has five; `review/01` counted nine sequence
  dimensions where its registry marks ten; `usability/04` "other seven" states and
  `usability/01` "one of eleven" entrances recounted from their tables; the
  SwiftData-versus-Core-Data gap is twelve versions, not eleven; WCAG 2.2 added nine
  criteria, not seven.

### Pointers that led nowhere

`accessibility/08` sent 2.2.1 Timing Adjustable, 3.2.1 On Focus, 3.2.2 On Input, Bold Text,
and the Large Content Viewer to files that did not contain them (the focus/input rule now
lives in `usability/02`); `interaction/04` claimed `interaction/03` owns the
alternative-action catalog it forwards elsewhere; `animation/06` cited a pull-to-refresh
section for a `condition:` overload that lives under conditional feedback;
`methodology/04` named owners for iOS 27 symbols that carry none of them; `design/07`'s
pitfall named an `authChecker` its router never declared. Two self-containment leaks are
closed: `performance/08` delegated persistence internals to "the vault SwiftData note", and
`animation/05` offered only a vault path for `Transferable` conformance where
`patterns/10` owns it.

## 0.5.0 -- 2026-09-01

A review of the plugin's operative layer -- agents, skills, dispatch policy, docs --
for anything that degrades output quality, plus a bounded adversarial pass over the
reference library (its corrections follow in 0.5.1). No new domain ships; what ships is
made to function.

### The specialists move to the Fable lane

Owner directive 2026-09-01: UI/UX, frontend, and design work (build, modify, review,
verify, apply) and coding of sufficient criticality or high-or-above difficulty dispatch a
Fable 5.1 subagent (`model: "fable"` plus `FABLE-ESCALATION: ui-ux-frontend -- <reason>`
as the first prompt line), never Opus 5, even under a Fable conductor. Every specialist
reviewer, the architect, and `craft-team-lead` when dispatched now pin that lane; recon,
evidence collection, and other non-UI grunt stay on Opus 5 @ xhigh (Sonnet 5 @ xhigh for
non-coding collection). The lane table, the Fable fan-out budget (10 per wave, 20 per
turn), and the no-`fable`-alias fallback (`opus`, never lower) live once, in
`references/_scaffolding/conductor-dispatch-protocol.md#model-lanes`; the six skills, the
team lead, and the docs point there instead of restating a rubric. The clause that let an
orchestrator run a specialist review inline "when the session model is strongest" is gone:
UI/UX judgment is never run inline in a deep session.

### Runtime evidence mode was unreachable by the reviewers

`references/review/02-evidence-pipeline.md` defines Mode A (Runtime) on XcodeBuildMCP and
calls `snapshot_ui` the single highest-value capture in an iOS review, but no reviewer
agent declared a single XcodeBuildMCP tool. A specialist dispatched through the plugin
namespace could therefore never enter the mode its own pipeline ranks first, and fell back
to Source mode without saying why. The five reviewers now carry the simulator set (build,
run, install, launch, stop, test, screenshot, `snapshot_ui`, tap / swipe / long-press /
type / key / button / gesture, `wait_for_ui`, `set_sim_appearance`), each with a
one-paragraph Runtime recipe. The architect carries the build set and a new step 5a that
builds what it wrote and reports `Build:` on the output header. The capture table gains the
`xcrun simctl ui` switches for Dynamic Type, appearance, and Increase Contrast, names the
settings that have no switch, and lists the sequence-driving tools.

### `references/` was unresolvable from a namespaced dispatch

Every agent told to read `references/_scaffolding/version-floor-registry.md` first was
handed a path relative to a plugin root it had no way to know: the reviewed repo is the
working directory. Only `craft-ios-ui` passed an absolute path. Each skill now resolves the
root from `${CLAUDE_PLUGIN_ROOT}` (substituted at skill load) and passes `PLUGIN ROOT:` and
`REFERENCES:` lines in every dispatch; each agent carries the same three-step ladder (the
prompt line, `${CLAUDE_PLUGIN_ROOT}`, the plugin-cache glob) and reports `References:
unresolved` rather than degrading silently.

### Dispatch blocks carry the pin the prose promised

The `craft-ios-ui` dispatch block and the team lead's Phase 2 block named no `model`, so on
a guarded machine the first dispatch was denied and elsewhere the pin depended on the
orchestrator re-deriving it from a paragraph. Both blocks, and the dispatch lists of the
other five skills, now carry the pin and the attestation line. The team lead's description
says outright that namespaced dispatch strips its Agent tool.

### Verdicts

- The craft report collapsed two specialist verdicts into one "Animation + Haptics" row
  carrying the animation vocabulary, which dropped the haptic verdict `review-ios-ui`
  forbids collapsing. Two rows now; the acceptance gate counts ten; the CI `motion` key maps
  each verdict through its own family and the lower colour wins.
- `NOT ASSESSED` was a legal value in the team lead's table and absent from the enums of
  the specialists that have to emit it. The animation, haptic, accessibility, and
  performance verdicts carry it, with the condition, in the agents and the skill outputs.
- Reduce Motion severity was "always CRITICAL" in two agents while the canonical scale
  grades "no Reduce Motion support" HIGH and reserves CRITICAL for nausea-trigger motion,
  and the owner's severity guide steps it CRITICAL / HIGH / MEDIUM. The merge keeps the
  higher grade, so the inflation stuck. Both agents and the README now follow the owner.
- The motion agent's spring table recommended a 0.15 s spring for "following the finger",
  the exact thing `references/interaction/03-direct-manipulation-drag.md` forbids. The row
  now names the gesture-coupled retarget case and points at the law.

### Also

- Context7 verification uses the verified library IDs directly in every agent
  (`/websites/developer_apple_swiftui`, `/websites/developer_apple_accessibility`,
  `/websites/developer_apple_updates`), scoped to APIs newer than iOS 17, absent from the
  registry, or uncertain to compile; the architect no longer resolves the library on every
  call.
- `USAGE.md` still described 82 files in 11 domains; the library is 93 in 13 plus
  `_scaffolding`. `.coderabbit.yaml` said ~95 across 14 domains. Both corrected.
- The architect's description advertised the author's 88-file vault as a backing source in
  the public mirror; it now names the vault as optional.
- `USAGE.md` troubleshooting covers the two new failure signatures: `References:
  unresolved`, and reviews that never reach Runtime mode.

## 0.4.1 -- 2026-08-24

Adversarial cohesion review of the 0.4.0 motion-choreography integration. No new
capability ships here; what shipped in 0.4.0 is made to agree with the files it
cites.

### Stagger numbers go back to their owner

`references/animation/07-motion-choreography.md` published 80-120ms stagger
increments and an ~800ms wave while naming
`references/interaction/02-fluid-transitions.md` -- which owns hero-then-secondary
tier timing at 40-60ms per tier, wave under ~150ms -- as the owner in the same
sentence. `animation-haptics-engineer` reads both files in one scope, so both
numbers were citable and mutually exclusive. The section now defers tier timing
to the owner and scopes its own rules to the case that file does not cover: N
peer elements arriving with no hero to trail (40-60ms increments, 6-8 staggered
then batch, entry inside ~800ms, once per arrival, above ~150ms per item reads
as buffering). The cinematic reveal keeps the slower ~80-120ms increment as a
named lane, capped at 4-6 items so it still lands inside the same budget. The
exemplar moves to `min(index, 5) * 0.06` -- 0.70s to last settle, where the old
`min(index, 7) * 0.08` breached the file's own 800ms rule at 0.96s.

### The three-spring cap is scoped to discrete-state motion

"A fourth spring means one of the first three was chosen wrong" condemned four
springs this library's own owner files mandate: the gesture-tracking interactive
spring (`animation/05`), the asymmetric press-in/press-out pair
(`interaction/05`), and the background depth variant demonstrated in
`animation/02#composing-springs` -- the section 07 cited as proof of containment.
Applied literally it would raise a MEDIUM finding against code that follows this
library correctly. The cap now governs discrete-state springs only, with those
exemptions enumerated in the same bullet and `#composing-springs` cited as their
precedent. Related: the frequency budget no longer hands press states a symmetric
`Motion.quick`, and the utility personality's compressed tuples now live in
`references/animation/02-spring-physics.md`'s house table -- the tuple owner --
as a utility row (0.2-0.3 duration, 0.0-0.1 bounce) that 07 cites instead of
restating.

### Wiring correction

`agents/apple-ui-architect.md` enumerated `animation/03`..`animation/06`, a closed
range that never reached the new file. The 0.4.0 note that "the agent reference
matrices already reach the file through `animation/*`" was therefore true for the
reviewer's glob and false for the architect -- the one agent that writes greenfield
screens, and so the one that most needs the personality lock before any spring
exists. The range now ends at `animation/07`, and
`agents/animation-haptics-engineer.md`'s directory enumeration names motion
choreography.

Also corrected: `ARCHITECTURE.md`'s tree line carries the `OWNER:` marker its
concept-owning siblings use; the reference line count reads ~23,500 (actual
23,510) in `ARCHITECTURE.md` and `README.md`; the bounce-ceiling citation reads
"guides production UI under bounce 0.5", matching the anti-pattern cell it cites;
the 400/30 overshoot figure is ~3% (2.84%, was ~2%); and the hold-to-delete
snap-back is ~250ms, matching `Motion.quick`'s 0.25s duration.

## 0.4.0 -- 2026-08-24

### Motion choreography reference (new)

`references/animation/07-motion-choreography.md` -- system-level motion doctrine
adapted from [VibeCurb](https://github.com/Yu-369/VibeCurb) (MIT, Copyright (c)
2026 Yu-369) and merged with this library's conventions: the locked motion
palette (three-spring maximum, personality lock, palette-as-tokens), the
frequency-gated motion budget (100+/day surfaces and hardware-keyboard paths
never animate; the delight budget is reserved for rare moments), the
asymmetric-timing principle (deliberate action slow, system response fast),
numeric stagger rules (80-120ms increments, hierarchy order, 6-8 cap, entry
under 800ms), and a verified web-spec conversion bridge: designer/Framer
mass-stiffness-damping triads to SwiftUI via `Spring(mass:stiffness:damping:)`,
checksummed against Apple's documented `(100, 10) -> (0.63, 0.5)` example. The
one imported triad that lands above this library's bounce-0.5 production
ceiling is flagged rather than silently adopted.

Wiring: `Spring` type registered in the iOS 17.0 floor section of the
version-floor registry; ARCHITECTURE tree, inventory (92 -> 93 files,
animation 6 -> 7), and README tables updated; the agent reference matrices
already reach the file through `animation/*`. Manifest descriptions corrected
from a stale "90 files" to 93.

## 0.3.1 -- 2026-07-27

Completes 0.3.0. Three items were deferred there on a judgement call about
value-per-effort; this release takes all three, because two were real gaps and
one was a half-finished audit.

### WCAG 2.2 coverage was uncountable

The plugin cited 29 distinct success criteria scattered across seven references
with no index, so `accessibility-engineer`'s standing instruction to "cite the
WCAG criterion where applicable" could not be discharged: **there was no way to
tell an unmet criterion from an uncited one.** Several of the most iOS-central
criteria were covered in prose and mapped to nothing at all -- `accessibilityLabel`
(1.1.1), `navigationTitle` (2.4.2), Voice Control naming (2.5.3), status changes
announced only visually (4.1.3), and `textContentType` (1.3.5).

New `references/accessibility/08-wcag-2-2-mapping.md` maps **every** Level A and
AA criterion to its iOS mechanism and its owning reference, and is now the
audit's checklist. It also records the three places WCAG and iOS genuinely
disagree, which is where wrong citations come from:

- **2.5.8 Target Size (Minimum) is AA and asks for 24pt, not 44.** 2.5.5
  Enhanced is the AAA criterion asking for 44. Apple's 44pt HIG rule is
  independent of both and is what this plugin enforces.
- **The keyboard criteria (2.1.1, 2.1.2) are real on iOS**, not web-only: iPad
  hardware keyboards, Full Keyboard Access and Switch Control drive the same
  focus system. The number-pad-with-no-dismissal trap is a genuine 2.1.2 failure.
- **4.1.1 Parsing was removed in WCAG 2.2.** Do not cite it.

### The review ledger

Every reviewing skill now writes `.claude/apple-ui-craft/last-review.json` in the
reviewed repo and reads any prior one first, so a repeat review answers the
second-most-useful question a user asks -- not "what is wrong" but **"what
changed since last time"**: NEW, RESOLVED, STILL OPEN, REGRESSED, IMPROVED.

Two fields keep a narrow run from lying about a wide one. `dimensions` carries
forward any prior finding whose dimension nobody looked at this run, rather than
counting it RESOLVED; without it, running `optimize-ios-ui` after `craft-ios-ui`
would report every accessibility finding as fixed. `notAssessed` does the same
for a dimension the evidence mode could not reach. `design-ios` writes no ledger
and says so: it generates rather than reviews, so it has no prior run to diff.

### The CI verdict gate

`ci/` is new: a gate a reviewed repo runs to fail a build when the craft review
covering the current UI change is missing, stale, unreadable, or not green.

Two design rules, both taken from watching a sibling plugin's gate ship broken
in exactly these ways:

- **The artifact binds to the last UI-touching commit, not `HEAD`.** An artifact
  can never name the commit it is committed into, so a `HEAD`-bound gate is
  unsatisfiable by its own documented happy path. The selftest pins this with a
  repo whose `HEAD` is deliberately a docs commit.
- **The gate fails closed.** A broken `git` query, an empty path list, a missing
  directory, a malformed artifact, or a history with no UI-adjacent commit all
  fail. "No UI-adjacent files changed, PASS" means a gate reports safety
  whenever its own inputs break.

`NOT_ASSESSED` is a first-class verdict value and it **fails**. Treating it as a
pass would make reviewing less the cheapest route to a green build, inverting the
evidence rule 0.3.0 just established.

`ci/gate.mjs` parses `ci/verdict-artifact-schema.json` at runtime rather than
reimplementing it, so the schema is the single source of truth for the enums.
`ci/selftest.mjs` is 30 cases and is now part of `tests/run-all.sh`.

Only `craft-ios-ui` may write the artifact, because it is the only skill that
runs every specialist and can fill the required verdict set honestly. A partial
pass points the user at it rather than writing invented verdicts -- which is the
entire reason the required set can be trusted.

### Counts

References 91 to 92. Gates: 1,140 reference citations, 46 scorer selftests, 30
CI selftests, 16 of 16 corpus labels.

## 0.3.0 -- 2026-07-27

Usability, adaptation, economy, and the plugin's first test surface. This
release ports what a 205-finding adversarial audit of the sibling `ui-craft`
plugin proved, applying only the parts that hold for iOS and re-deriving them
against SwiftUI rather than translating web copy.

### The structural gap: every review dimension was decidable from one screenshot

`apple-ui-reviewer` audited seven dimensions -- Liquid Glass, typography, color,
SF Symbols, navigation patterns, layout and spacing, micro-interactions -- and
all seven could be judged from a single rendered frame. A flow defect is not in
any frame: a three-step sheet whose step 2 discards step 1's input renders
identically to one that keeps it, so a screen-perfect app could pass every
dimension and still be a product nobody can finish a task in. Repo-wide, "flow
map", "wayfinding" and "viewport utilisation" appeared in zero files, and "task
flow" in one, incidentally, about CarPlay.

The reviewer now audits **twelve** dimensions. Five are new:

- **Density and economy** (dimension 8) -- the only rule against WASTE rather
  than excess, with thresholds and measurement recipes. `references/design/06`
  has listed "Same layout iPhone + iPad -- wastes iPad screen" as an
  anti-pattern for eight releases; with no number attached it never once
  produced a finding, because a reviewer with no measurement cannot rank a
  well-rendered screen as broken.
- **Task flow and journey** (9) -- needs a sequence.
- **Information architecture and navigation structure** (10) -- needs a sequence.
- **Error recovery and state integrity** (11) -- needs a sequence.
- **Adaptive layout and Dynamic Type** (12) -- needs a configuration change.

### Two new reference domains, and one new discipline

- **`references/usability/` (5 files, ~1,800 lines).** Task flows and journeys,
  forms and error recovery, navigation and information architecture, states and
  feedback and affordances, and the adaptive review method. Written against
  SwiftUI, not ported: the eleven break tests are iOS-specific (terminate the
  app from Xcode, swipe the sheet down, trigger a system permission sheet
  mid-flow, enter by widget or Siri or Handoff), because on iOS the system is a
  participant in every flow -- it backgrounds the app, terminates it under
  memory pressure, and hands it eleven entry points that land mid-task rather
  than at the front door.
- **`references/review/` (3 files, ~600 lines).** The finding format, the
  evidence pipeline, and density and economy.

### The evidence rule

Reviews now declare their evidence mode and coverage as the first line of the
report, and **return `NOT ASSESSED` rather than a clean verdict on a dimension
the evidence could not reach.** A clean flow or adaptive verdict from a static
screenshot is a false negative on precisely the class a screenshot cannot
contain. `craft-team-lead` and `review-ios-ui` carry that value through the
merge unchanged; promoting it during synthesis is now called out as the worst
thing the orchestrator can do.

Measured claims carry their measurement: geometry from element frames in the
accessibility hierarchy, never a pixel estimate; contrast from resolved colour
values against the trait collection they render in, never a colour sampled from
an image, because semantic colours resolve differently per appearance and per
Increase Contrast.

### One canonical finding format

Five agents write findings and one merges them, and only two of the seven agent
files defined a template -- so the merge keyed on field names three agents never
declared. `references/review/01-finding-format.md` is now the single source of
truth for the template, the severity scale, a four-class confidence enum, and
the dimension registry that dedup and the verdict table key on. Every agent
points at it instead of restating it, and `craft-team-lead` gained a
format-validation step before the merge plus an overlap-ownership table for the
collisions the new dimensions create by design.

The three agents that emitted no summary block now have one.

### The architect designs the flow before the screen

`apple-ui-architect` went from philosophy straight to components. It now maps
the task first (actor, trigger, task, observable success condition, every entry
surface, exits, frequency) and writes a flow map whose empty cells are defects
being designed in; states an explicit adaptive contract per component before
writing the layout; ships every reachable state rather than only the loaded one;
and emits previews for its states and hard configurations rather than two token
ones. Fixed geometry on content, `UIScreen.main.bounds`, and idiom branching are
now hard rules against, and user input must outlive the view.

### The plugin's first test surface

The stated definition of done was "manifest JSON valid, cross-file consistency,
cache sync" -- there was no quality gate at all, and no `tests/` directory.
`bash tests/run-all.sh` is now the definition of done. Zero dependencies, Node
>= 18 stdlib only.

- **`tests/check-references.mjs`** -- all 1,105 `references/...#anchor`
  citations resolve, and it warns about reference files nothing cites. It caught
  two broken citations on its first run, one of them pre-existing. A citation
  that does not resolve is a silent capability loss: the agent follows the
  pointer, finds nothing, and degrades without reporting it.
- **`tests/corpus/`** -- 10 SwiftUI fixtures with planted defects plus a clean
  control, and `labels.json` with 16 labels, each naming the reference that
  defines it. The clean control is the mirror guard: it uses what the references
  prescribe and must produce zero findings, so a reviewer that learns to match
  constructs rather than defects fails there.
- **`tests/harness/score-review.mjs`** -- recall and precision floors of 0.8,
  with clean-control findings counting against precision.
- **`tests/harness/selftest.mjs`** -- 46 cases verifying the scorer itself,
  because a gate nobody tests can silently pass everything.

Coverage is concentrated on the five new dimensions, which had no regression
protection. The visual dimensions, animation, haptics, VoiceOver, performance
and platform integration have **no labels**; read any recall number as recall
over the labelled dimensions. The example findings file was written alongside
the labels, so it measures the harness, not the reviewer -- **there is no blind
baseline yet**, and 1.000 is an answer-key ceiling rather than a detection rate.
Producing the first blind baseline is tracked in `tests/README.md`.

### Repo hygiene

- `CLAUDE.md` gained the fleet-standard `**Extends ~/.claude/CLAUDE.md**` header
  and a real commands table; "No build/test toolchain" is no longer true.
- `.coderabbit.yaml` added, encoding every repo invariant as a BLOCKING rule and
  excluding the intentionally-defective corpus fixtures from review.
- The one place an agent depended on the external vault now states a
  graceful-degradation rule, and self-containment is a documented constraint.
  The plugin's depth must live inside the plugin.

## 0.2.8 -- 2026-07-16

- `references/design/09-swift-charts.md` gains the one-axis rule: a dual-axis anti-pattern row (two y-scales overlaid via stacked `Chart`s or a rescaled second `yStart` -- the alignment of two scales is arbitrary, so the chart invents a correlation; the fix is two stacked charts sharing an x-domain, small multiples, or indexing both series to a common base) and a matching HIGH severity note. Closes the one gap found when auditing the chart-craft references against the dataviz method now owned by ui-craft 0.2.0.

## 0.2.7 -- 2026-07-16

- `references/design/11-media-content.md` gains a "Text over images: scrim and progressive blur" section (from the UI/UX fundamentals analysis in vault `UI Design/13`): bottom-weighted `LinearGradient` scrim as the default treatment, masked-material progressive blur (`Rectangle().fill(.regularMaterial).mask { LinearGradient }`, the Apple media-catalog sample pattern -- context7-verified; no public variable-blur modifier exists) as the premium layer, contrast checked against the darkest converged region, gradient onset kept below the focal subject, and the Reduce Transparency degradation note. Matching anti-pattern row and severity entries (text-on-raw-photo HIGH; full-frame dim where a scrim was warranted MEDIUM).

## 0.2.6 -- 2026-07-05

- Executor model selection v2: executors are conductor-selected Sonnet-5-xhigh or Opus 4.8 per rules/conductor.md rubric. Replaced every "Sonnet-5-xhigh executor(s)" / "Sonnet 5, ALWAYS `effort: xhigh`" phrasing across CLAUDE.md, README.md, ARCHITECTURE.md, USAGE.md, `references/_scaffolding/conductor-dispatch-protocol.md`, `agents/craft-team-lead.md`, all 6 skill split-of-labor tables, and the plugin manifest description.
- Dispatch mechanics now show `model: "opus"` as the conductor's alternative to `model: "sonnet"` alongside the existing `xhigh`-effort example.
- Fan-out exemption text updated: conductor-managed executors (Sonnet or Opus) are exempt from the session-model agent caps; more than 20 Opus executors in one turn still needs user sign-off.
- Invariant lines updated to "Never Haiku. Never Sonnet below `xhigh`. Never an executor verdict."

## 0.2.5 -- 2026-07-05

- Un-pinned every agent's `model: fable` frontmatter; agents now inherit the session model (always the strongest available Claude) instead of a named model, so the plugin keeps working across model transitions.
- Rewrote every "Fable 5" / "Fable 5 or Opus 4.8" reference in agent descriptions, skill bodies, and docs to session-model language.
- Added an "Execution mode" note to all 6 skills clarifying that agents inherit the session model and may run inline (foreground) instead of dispatching when the session model is already the strongest tier.
- `craft-ios-ui`: added a worked finding-format example and a 6-point report-acceptance gate for the merged team-lead report.
- `design-ios`: added a project-context-gathering table (deployment target, navigation model, color/type conventions, component conventions) before dispatch, a worked Stage-2 accessibility-handoff prompt, and a pre-presentation verification checklist (phantom APIs, hard-coded colors/fonts, Reduce Motion gating, Stage 2 completion).
- Simplified the ultracode conductor-mode sections in `ARCHITECTURE.md`, `README.md`, and `craft-team-lead.md` to point at the single shared dispatch-protocol file instead of restating its rules.
- Docs refresh: `USAGE.md` gained a troubleshooting table; README/USAGE model-policy language brought current.

## 0.2.4 -- 2026-07-03

- Added proactive trigger descriptions to `design-ios`, `review-ios-ui`, and `optimize-ios-ui` so the skills fire from natural-language requests that don't name the skill.

## 0.2.3 -- 2026-07-03

- Applied a 12-executor skill-layer quality audit (29 confirmed findings) across skills and agents.

## 0.2.2 -- 2026-07-03

- Set the plugin author to TheMizeGuy with the `ben@meipath.com` contact.

## 0.2.1 -- 2026-07-03

- Documented the session model as a co-equal Fable 5 / Opus 4.8 conductor under ultracode (superseded in 0.2.5 by fully model-agnostic language).
- Thorough documentation pass across README/ARCHITECTURE/USAGE.

## 0.2.0 -- 2026-07-03

- Initial structured release: 7 agents, 6 skills, and the 82-file, 12-domain reference library (design, animation, interaction, haptics, accessibility, patterns, performance, platform, cross-platform, exemplars, methodology, `_scaffolding`).
- Added the ultracode conductor-executor mode to all 6 skills and the `craft-team-lead` orchestrator.
- Regenerated README/ARCHITECTURE and added the USAGE guide.
