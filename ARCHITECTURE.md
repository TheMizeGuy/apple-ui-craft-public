# apple-ui-craft -- Architecture

Internal map of files, responsibilities, and cross-references. Not loaded by Claude at runtime -- for human reading and build-time agent coordination. This tree is the single source of truth for the reference library; regenerate the counts from `ls references/**/*.md` if they drift.

## Mission

A team of seven specialist agents -- every one pinned to Opus 5 at dispatch, the session model conducting -- embodying a principal Apple UI engineer. Designs, reviews, optimizes, and crafts iOS/iPadOS UI so the result feels like Apple's own first-party apps -- not "good enough," but the kind of UI that makes users say "this feels right" without being able to articulate why. Liquid Glass done correctly. Springs that settle naturally and stay interruptible. Haptics that confirm without fatiguing. Accessibility built in, not bolted on. Platform integration that makes the app feel like it belongs on the home screen -- and reaches the wrist, the TV, the desktop, and the headset when it should.

## Layout

```
apple-ui-craft/
├── .claude-plugin/plugin.json
├── README.md
├── USAGE.md                     (how to drive every skill)
├── ARCHITECTURE.md              (this file)
├── skills/                      (6 user-invoked entry points)
│   ├── design-ios/SKILL.md          "design a [screen/flow/component]"
│   ├── review-ios-ui/SKILL.md       "review my iOS UI / check this screen"
│   ├── optimize-ios-ui/SKILL.md     "optimize animations / haptics / performance"
│   ├── craft-ios-ui/SKILL.md        "make this feel Apple-native" (full team)
│   ├── audit-accessibility/SKILL.md "audit my app for accessibility" (a11y solo, deep)
│   └── integrate-platform/SKILL.md  "make my app feel native beyond the UI" (platform solo)
├── agents/                      (7 agents, all pinned to Opus 5 at dispatch; the session model conducts)
│   ├── apple-ui-architect.md          greenfield design + production SwiftUI
│   ├── apple-ui-reviewer.md           HIG + visual + Liquid Glass audit
│   ├── animation-haptics-engineer.md  motion + interaction/feel + tactile feedback
│   ├── accessibility-engineer.md      VoiceOver, Dynamic Type, motion, localization, full a11y
│   ├── performance-engineer.md        SwiftUI perf, rendering, scroll, state, launch, memory
│   ├── platform-engineer.md           platform + cross-platform integration
│   └── craft-team-lead.md             orchestrator for craft-ios-ui multi-pass
└── references/                  (14 directories -- self-contained knowledge files)
    ├── _scaffolding/
    │   ├── _TEMPLATE.md                     reference-file skeleton (authoring-only)
    │   ├── conductor-dispatch-protocol.md   shared ultracode dispatch mechanics (all 6 skills point here)
    │   └── version-floor-registry.md        SINGLE source of availability floors + PHANTOM list
    ├── design/
    │   ├── 01-apple-design-philosophy.md    clarity, deference, depth
    │   ├── 02-liquid-glass.md               glassEffect API, variants, GlassEffectContainer, a11y auto-adapt
    │   ├── 03-typography-dynamic-type.md    system font styles, Dynamic Type, custom fonts
    │   ├── 04-color-system.md               semantic colors, dark mode, high contrast, tinted
    │   ├── 05-sf-symbols.md                 selection, rendering modes, variable values, effects, RM
    │   ├── 06-layout-spacing.md             margins, padding, safe areas, content insets
    │   ├── 07-navigation-patterns.md        NavigationStack, tabs, deep linking, hierarchy
    │   ├── 08-adaptive-layout-ipad.md       ViewThatFits, size classes, AnyLayout, reflow
    │   ├── 09-swift-charts.md               Chart marks, axes (one-axis rule), interactivity, Chart3D
    │   ├── 10-content-and-writing.md        microcopy, content design (P2)
    │   ├── 11-media-content.md              VideoPlayer, PhotosPicker, HDR, PiP, text-over-image scrims
    │   ├── 12-text-rendering.md             TextRenderer, Text.Layout, DrawingOptions (P2)
    │   └── 13-canvas-shaders.md             Canvas, Metal shaders in SwiftUI (P2)
    ├── animation/
    │   ├── 01-animation-fundamentals.md     implicit vs explicit, timing curves, cost table
    │   ├── 02-spring-physics.md             parameter guide, presets, settling, feel
    │   ├── 03-advanced-animators.md         PhaseAnimator, KeyframeAnimator, CustomAnimation
    │   ├── 04-transitions-geometry.md       matchedGeometryEffect, transitions, ContentTransition
    │   ├── 05-gesture-driven.md             DragGesture, rotation, magnify, interactive springs
    │   ├── 06-scroll-driven-effects.md      scrollTransition, visualEffect, parallax
    │   └── 07-motion-choreography.md        OWNER: motion palette lock, frequency budget, web-spec spring conversion, peer-arrival stagger rules
    ├── interaction/                         (the FEEL layer -- the craft thesis)
    │   ├── 01-fluid-smoothness-interruptible.md   OWNER: interruptibility, velocity handoff, 120fps
    │   ├── 02-fluid-transitions.md          shared-element continuity, hero transitions
    │   ├── 03-direct-manipulation-drag.md   OWNER: "never animate the follow", 1:1 tracking
    │   ├── 04-gesture-disambiguation.md     simultaneous/sequenced/exclusive, scroll-vs-drag
    │   ├── 05-press-feedback-states.md      press vs tap, hoverEffect, isPressed
    │   └── 06-custom-controls-reorderable.md  accessibilityRepresentation, reorderable (iOS 27)
    ├── haptics/
    │   ├── 01-haptic-design-principles.md   when/where, weight vs flexibility, anti-patterns
    │   ├── 02-swiftui-sensory-feedback.md   OWNER: .sensoryFeedback, triggers, platform matrix
    │   ├── 03-core-haptics-engine.md        CHHapticEngine, patterns, AHAP, audio sync
    │   └── 04-sound-audio-ux.md             sound/audio UX (P2)
    ├── accessibility/
    │   ├── 01-voiceover-fundamentals.md     labels, traits, grouping, custom actions, rotor
    │   ├── 02-dynamic-type-adaptation.md    text styles, scaling, AX sizes, scale factors
    │   ├── 03-visual-accessibility.md       contrast, Reduce Transparency, Smart Invert, env-key split
    │   ├── 04-motor-interaction.md          OWNER: 44pt/WCAG, Switch Control, Voice Control, drag alt
    │   ├── 05-motion-accessibility.md       OWNER: Reduce Motion double-gate (highest inbound)
    │   ├── 06-localization-rtl.md           String Catalogs, pluralization, layoutDirection, RTL
    │   ├── 07-cognitive-hearing-assistive.md  AssistiveAccess, captions, Live Captions (P2)
    │   └── 08-wcag-2-2-mapping.md          OWNER: every WCAG 2.2 A/AA criterion -> iOS mechanism + owning reference
    ├── patterns/                            (true HIG UX flows)
    │   ├── 00-screen-archetypes-index.md    map: ~12 archetypes -> files + APIs
    │   ├── 01-gotchas-anti-patterns.md      OWNER: #Preview env-key gotcha, RM double-gate idiom
    │   ├── 02-forms-data-entry.md           Form, TextField, focus, validation
    │   ├── 03-onboarding-tipkit.md          TipKit, permission priming, first-run
    │   ├── 04-loading-empty-error.md        OWNER: ContentUnavailableView, redacted, three states
    │   ├── 05-modality-sheets.md            sheet/cover/popover/alert/confirmationDialog, detents
    │   ├── 06-settings.md                   Form, @AppStorage, SettingsLink
    │   ├── 07-feedback-reviews-notifications.md  requestReview, notifications
    │   ├── 08-paywall-storekit-applepay.md  StoreKit, PayWithApplePayButton, AddPassToWallet (P2)
    │   ├── 09-auth-account.md               Sign in with Apple, passkeys, account UI
    │   └── 10-drag-drop.md                  draggable/dropDestination, Transferable
    ├── performance/
    │   ├── 01-swiftui-rendering.md          OWNER: animation cost table, body eval, Equatable
    │   ├── 02-scroll-list-performance.md    hitches, prefetching, image handling, drawingGroup
    │   ├── 03-launch-memory-instruments.md  launch phases, MetricKit, Instruments, jetsam
    │   ├── 04-state-architecture.md         @Observable, @State/@Bindable, observation granularity
    │   ├── 05-display-promotion-color.md    ProMotion 120Hz, wide gamut, HDR
    │   ├── 06-concurrency-ui.md             .task/.task(id:), @MainActor, Swift 6.2 concurrency
    │   ├── 07-build-performance.md          type-checker blowups, warn-long-* flags, CMO
    │   └── 08-swiftdata-ui.md               @Query/@Model UI, sectioned query (iOS 27)
    ├── platform/                            (iOS system integration)
    │   ├── 01-widgets-live-activities.md    OWNER: widget refresh budget, WidgetKit, Dynamic Island
    │   ├── 02-app-intents-system.md         OWNER: App Intents, Siri, Shortcuts, Spotlight, schemas
    │   ├── 03-controls-standby.md           ControlWidget, Control Center, Action Button, StandBy
    │   ├── 04-system-surfaces-notifications.md  notifications, alternate icons, launch screens
    │   ├── 05-maps-location.md              SwiftUI Map, Look Around, CLLocationManager UX
    │   ├── 06-apple-intelligence-ui.md      Foundation Models, Writing Tools, Genmoji, Image Playground
    │   ├── 07-webview-web-content.md        SwiftUI WebView/WebPage (iOS 26)
    │   ├── 08-app-clips-extensions.md       App Clips, extensions UI (P2)
    │   └── 09-scene-lifecycle.md            Scene/WindowGroup, scenePhase, @SceneStorage restoration
    ├── cross-platform/
    │   ├── 01-ipados-multiplatform.md       iPadOS windowing, pointer, multitasking, multiplatform
    │   ├── 02-watchos.md                    watchOS SwiftUI, digital crown, complications
    │   ├── 03-tvos.md                       focus engine, card styles, overscan
    │   ├── 04-macos-catalyst.md             Catalyst, macOS idioms, pointer/modifier keys, menus
    │   ├── 05-visionos.md                   OWNER: glassBackgroundEffect, volumetric, spatial
    │   └── 06-carplay.md                    CarPlay templates, haptic restrictions (P2)
    ├── exemplars/                           (end-to-end worked screens; build-pending)
    │   ├── 01-glass-screen.md               composes design + Liquid Glass
    │   ├── 02-motion-haptics.md             composes animation + interaction + haptics
    │   ├── 03-accessibility.md              composes the accessibility references
    │   ├── 04-perf-list.md                  composes the performance references
    │   └── 05-platform-integration.md       composes platform + widgets
    ├── methodology/                         (P2)
    │   ├── 01-component-api-design.md       reusable component API design
    │   ├── 02-previews-design-qa.md         #Preview matrices, design QA
    │   ├── 03-apple-samples-teardown.md     how Apple does it (sample teardowns)
    │   └── 04-whatsnew-sota-log.md          what's-new / SOTA delta log
    ├── usability/                           (0.3.0 -- can a person FINISH the task)
    │   ├── 01-task-flows-and-journeys.md    OWNER: flow map, entry inventory, step budgets, carried state, dead ends, break tests
    │   ├── 02-forms-and-error-recovery.md   OWNER: validation timing, error copy, focus on failure, confirm-vs-undo, partial failure, data loss
    │   ├── 03-navigation-and-information-architecture.md  OWNER: navigation models, depth/breadth, wayfinding, back semantics, deep-link survival
    │   ├── 04-states-feedback-and-affordances.md  OWNER: the 10-state set, latency budgets, silent success, affordances, disabled anti-patterns
    │   └── 05-adaptive-review-method.md     OWNER: sizing-strategy classification, the five axes, size matrix, ROBUST/ADEQUATE/FRAGILE/BROKEN rubric
    └── review/                              (0.3.0 -- HOW to review, shared by every agent)
        ├── 01-finding-format.md             OWNER: finding template, severity scale, confidence enum, dimension registry
        ├── 02-evidence-pipeline.md          OWNER: review modes, geometry evidence rule, configuration + state coverage
        └── 03-density-and-economy.md        OWNER: window utilisation, leftover sizing, length, distance -- the WASTE dimension
```

```
tests/                            (0.3.0 -- zero-dependency gates, Node >= 18 stdlib)
├── run-all.sh                    every gate; the definition of done
├── check-references.mjs          every references/...#anchor citation resolves
├── README.md                     the runbook
├── corpus/
│   ├── fixtures/*.swift          10 fixtures with planted defects + 1 clean control
│   └── labels.json               ground truth (16 labels, ruleRef -> owning reference)
└── harness/
    ├── score-review.mjs          recall + precision gate (floors 0.8)
    ├── selftest.mjs              46 cases verifying the scorer itself
    └── examples/sample-findings.json   a by-the-book run (16/16)

ci/                               (0.3.1 -- the verdict gate a reviewed repo runs)
├── gate.mjs                      consumes the artifact; binds to the last UI-touching sha, fails closed
├── verdict-artifact-schema.json  canonical; gate.mjs parses it at runtime
├── selftest.mjs                  30 cases, every fail-closed path pinned
└── README.md                     adoption guide for a reviewed repo
```

Tiering: Stage A (existing corrected + recreates) and the P0/P1 expansion ship the core; P2 files add depth. Exemplars are labeled "signature-drafted, build-pending" (no Xcode build in this repo). Some P2 files (design/12-13, methodology, carplay, cognitive/hearing) are depth-pass additions.

**Reference inventory (93 files, ~23,500 lines):** design 13, patterns 11, platform 9, performance 8, accessibility 8, animation 7, interaction 6, cross-platform 6, usability 5, exemplars 5, haptics 4, methodology 4, review 4, `_scaffolding` 3. That is 13 content domains plus `_scaffolding`. Regenerate with `for d in references/*/; do echo "$d $(find "$d" -name '*.md' | wc -l)"; done`.

## Agent <-> skill mapping

| Skill | Agents dispatched | Mode |
|---|---|---|
| `design-ios` | `apple-ui-architect` (then `accessibility-engineer` for an a11y pass) | Sequential |
| `review-ios-ui` | `apple-ui-reviewer` + `animation-haptics-engineer` + `accessibility-engineer` | Parallel, then merge |
| `optimize-ios-ui` | `animation-haptics-engineer` + `performance-engineer` | Parallel, then merge |
| `craft-ios-ui` | `craft-team-lead` orchestrates all 5 review specialists in phases (audit -> plan -> apply per user approval) | Multi-pass, team-lead owns dispatch |
| `audit-accessibility` | `accessibility-engineer` (solo, deep) | Single |
| `integrate-platform` | `platform-engineer` (solo) | Single |

`craft-team-lead` and the specialists it fans out are dispatched as `general-purpose` with the agent body inlined -- plugin-namespaced dispatch strips the Agent tool at runtime. Every dispatch carries `PLUGIN ROOT:` and `REFERENCES:` lines; the agents resolve `references/` from them, with `${CLAUDE_PLUGIN_ROOT}` and the plugin-cache glob as fallbacks.

## Reference <-> agent wiring (no orphan references)

Rule: **every knowledge file (`references/**/*.md` outside `_scaffolding/`) appears in at least one agent's read scope.** `_scaffolding/` holds process files, not knowledge: `version-floor-registry.md` is read first by every agent, `conductor-dispatch-protocol.md` is read by the ultracode conductor, `_TEMPLATE.md` is authoring-only. Agents read the floor registry first, then start-here files, then glob the rest of a domain when the task goes deep. Ownership below is the "who authors/owns this concept" map; reviewers read across domains.

| Agent | Owns / reads |
|---|---|
| `apple-ui-architect` | design/* (all), patterns/* (all), animation/*, interaction/*, haptics/01-02, accessibility/01-06, performance/04, platform/09, methodology/01-02, methodology/04, **usability/01 (step 3, task flow) + usability/02-05**, **review/03** (whether regular width is earned), exemplars/* (all -- worked screens to steal structure from). Start: design/01-02, patterns/00-01, usability/01 |
| `apple-ui-reviewer` | design/* (all), patterns/* (all), interaction/*, accessibility/01-05, methodology/03-04 (Apple-sample calibration + API currency), **review/01-03 (format, evidence, density)**, **usability/01-05 (dimensions 9-12)**. Start: review/01-02, design/01-02, design/07, patterns/01. Runs the 11-row a11y/perf gate |
| `animation-haptics-engineer` | animation/* (all), interaction/* (all), haptics/* (all), accessibility/05, **review/01-02**. Owns interaction/ + haptics/ |
| `accessibility-engineer` | accessibility/* (all, and **08-wcag-2-2-mapping.md is the audit checklist**), design/03-04, design/06, patterns/01, **review/01-02**, **usability/01-05** (the structural WCAG criteria: 3.3.x, 3.2.3, and the Dynamic Type analogues of 1.4.4/1.4.10). Owns accessibility/ |
| `performance-engineer` | performance/* (all), animation/01, interaction/01, **review/01-02**. Owns performance/ |
| `platform-engineer` | platform/* (all), cross-platform/* (all), design/07, patterns/03 + patterns/10 (TipKit, drag-drop surfaces in its matrix), **review/01-02**, **usability/01** (integrations are entry points into flows). Owns platform/ + cross-platform/ |
| `craft-team-lead` | Routes only; reads **review/01** deeply, because merge and dedup key on its dimension registry and field names. All other references reachable through the specialists above -- zero orphans |

`references/review/` is read by every agent: `01-finding-format.md` is the single source of truth for the finding template, severity scale, confidence enum, and dimension registry, and `02-evidence-pipeline.md` is the single source of truth for review modes and the geometry evidence rule. An agent that restates either is a bug in that agent file, since the merge gate follows only one copy.
| exemplars/ | Read by apple-ui-architect (all 5) and routed by team-lead to the owning specialist (01 architect/reviewer, 02 animation-haptics, 03 accessibility, 04 performance, 05 platform) |

## Hard rules baked into every agent

1. **Read-only review by default.** Findings advisory. Orchestrator applies on explicit user OK.
2. **Cite the reference.** Every finding points to a `references/` file:section; vault docs are cited only when they exist locally. No hand-waving.
3. **Show code.** Concrete current -> suggested rework. Verbatim-applicable SwiftUI.
4. **Severity tags.** CRITICAL / HIGH / MEDIUM / LOW / NIT -- same scale as ios-code-review.
5. **No AI slop.** No "Great work!", "Just a minor suggestion", "Hope this helps", hedging, trailing summaries.
6. **No defensive lower bounds.** Real values, not "at least N".
7. **Respect existing project patterns.** Read repo conventions before suggesting.
8. **Apple-native or nothing.** Every suggestion makes the app feel MORE first-party.
9. **Springs over curves.** Default recommendation is spring animation unless there's a specific reason for timing curves.
10. **Haptics are intentional.** Never recommend haptics as decoration.
11. **Availability discipline.** Floors come from `_scaffolding/version-floor-registry.md`; iOS-26-only APIs gate `#available(iOS 26,*)` + Material fallback; iOS-27 symbols carry `// SDK-verify` and stay out of primary examples; never emit a PHANTOM API.
12. **Reduce Motion double-gate.** Gate both `withAnimation(` and `.animation(_:value:)` via an `Animation?`/nil accessor; looping symbol/Phase/Keyframe effects are gated manually. Owner: `accessibility/05`.

## Severity scale (shared by all agents)

**Canonical since 0.3.0: `references/review/01-finding-format.md`.** Agents read
that file, not this section; the table below is the human-facing summary and the
reference wins on any disagreement. That file additionally owns the finding
template, the four-class confidence enum, and the dimension registry that merge
and dedup key on.

| Tag | Meaning |
|---|---|
| CRITICAL | Breaks user experience: crash, accessibility blocker, 44pt touch target violation, animation causing nausea, Liquid Glass misuse that obscures content, content unreachable in a supported configuration, irreversible destruction with neither confirmation nor undo |
| HIGH | Degrades experience noticeably: wrong navigation pattern, missing haptics on committed mutations, animation timing that fights the user, no Reduce Motion support, typed input lost on back or termination, a missing empty or error state, clipping at AX5, a stretched-phone iPad layout |
| MEDIUM | Quality gap: suboptimal spring parameters, generic spacing instead of Apple metrics, missing SF Symbol where appropriate, haptic on wrong trigger, label drift between tab/title/heading |
| LOW | Polish: slightly better timing, additional haptic surface, minor spacing refinement, could use newer API |
| NIT | Taste preference -- include sparingly. **Waste with no measurement attached belongs here**; with a measurement it is MEDIUM or HIGH |

## Data contracts

| Contract | Owner | Notes |
|---|---|---|
| Finding format, severity, confidence, dimension registry | `references/review/01-finding-format.md` | Every agent, skill, and the team-lead merge key on these exact strings |
| Evidence modes and the geometry evidence rule | `references/review/02-evidence-pipeline.md` | Bounds what each mode may claim; `NOT ASSESSED` is a legal verdict and is carried through unchanged |
| Corpus ground truth | `tests/corpus/labels.json` | Each label's `ruleRef` must be defined in the reference named in its `owner` field |
| Review ledger (schema v1) | `references/review/04-run-artifacts.md` | `.claude/apple-ui-craft/last-review.json` in the REVIEWED repo; informational version, powers the delta report |
| CI verdict artifact (schema v1) | `ci/verdict-artifact-schema.json` | `gate.mjs` parses the schema at runtime and HARD-REJECTS a `schemaVersion` mismatch |
| WCAG 2.2 A/AA coverage | `references/accessibility/08-wcag-2-2-mapping.md` | The audit checklist; an uncited criterion is otherwise indistinguishable from an unmet one |

## Ultracode conductor mode

Under ultracode, every skill runs conductor-executor: the session model conducts, conductor-selected executors (Opus 5 @ `xhigh` for every dispatched agent, Sonnet 5 @ `xhigh` for non-coding collection) run the scoped grunt stages, and verdicts are never delegated. Each skill carries only its split-of-labor table and dimension-specific executor scoping; the lanes, the shared dispatch mechanics, fan-out doctrine, executor prompt contract, validation gate, and hard model invariants (never Haiku; never Sonnet below xhigh; never a specialist below the Opus lane) live in ONE place: `references/_scaffolding/conductor-dispatch-protocol.md#model-lanes`. The user-facing explanation is [`USAGE.md`](USAGE.md#how-ultracode-changes-behavior).

## Relationship to ios-code-review

`ios-code-review` covers App Store compliance, privacy, entitlements, security, Swift quality, concurrency, and engineering correctness. `apple-ui-craft` covers the CRAFT layer: visual design quality, animation feel, haptic design, accessibility excellence, performance smoothness, and platform integration depth. Run `ios-code-review` for "will Apple accept this?" and `apple-ui-craft` for "will users love this?"

## Cross-references

Reference-to-reference (canon form; a resolver in the build checks these):
```
references/<topic>/<file>.md#<heading-slug>
```

Agent-to-reference (distinct context -- relative from the agent file):
```
../references/<topic>/<file>.md
```

Vault citations (authoring-time provenance only -- shipped findings cite `references/`):
```
```
