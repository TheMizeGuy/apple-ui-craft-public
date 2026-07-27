# Changelog

All notable changes to `apple-ui-craft` are documented here.

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
