# apple-ui-craft -- Usage Guide

The complete guide to driving `apple-ui-craft`: what each skill does, how to invoke it, what you get back, how to apply findings, and how the plugin behaves under ultracode. If you want the internal file map instead, read [`ARCHITECTURE.md`](ARCHITECTURE.md).


## What this plugin is for

`apple-ui-craft` is the **craft layer** for iOS UI. It answers "will users love this?" -- not "will Apple accept this?" (that is [`ios-code-review`](https://github.com/TheMizeGuy/ios-code-review)). It designs new SwiftUI, reviews existing UI against the Human Interface Guidelines and Liquid Glass, tunes animation and haptics, audits accessibility, and maps platform integration -- all in the voice of a principal Apple engineer, with every finding backed by a citable reference and verbatim-applicable code.

It targets **iOS 26** (Liquid Glass, `.sensoryFeedback`, `@Observable`, App Intents, Foundation Models) with iOS 27 beta APIs quarantined behind `#available` and an SDK-verify caveat. Availability floors are Context7-verified and centralized in `references/_scaffolding/version-floor-registry.md`.


## Installation

Clone this repository, then add it to Claude Code as a plugin:

```bash
git clone https://github.com/TheMizeGuy/apple-ui-craft-public.git
```

No build step, no configuration. The plugin is Markdown-only: skills, agents, and a reference library. It uses GoodMem, serena, and Context7 when they are available in your session and degrades gracefully when they are not.


## The six skills

Invoke a skill by describing your task in natural language, or by typing its `/`-name. Pick by intent:

| You want to... | Skill | Specialists | Typical time |
|---|---|---|---|
| Create new UI from scratch | `design-ios` | architect (+ a11y pass) | 5-10 min |
| Check existing UI quality | `review-ios-ui` | 3 (visual + motion + a11y) | 5-15 min |
| Make motion + performance better | `optimize-ios-ui` | 2 (animation-haptics + performance) | 5-10 min |
| The full multi-dimension pass | `craft-ios-ui` | 5 + team lead | 10-30 min |
| A deep accessibility audit only | `audit-accessibility` | accessibility (solo, deep) | 5-15 min |
| Find system-integration opportunities | `integrate-platform` | platform (solo) | 5-15 min |

### `design-ios` -- greenfield design

Use when you are creating something new: a screen, a flow, a component family, or a whole app's interface.

```
"design the settings screen for my habit tracker"
"build me a list-to-detail flow with a hero zoom transition"
"create the onboarding for a meditation app"
```

**What happens:** the `apple-ui-architect` produces production SwiftUI (Liquid Glass, semantic colors, SF Symbols, spring animation, intentional haptics, accessibility from birth), a design-decision rationale, an animation inventory, and Xcode previews. Then the `accessibility-engineer` audits the new code and returns immediate refinement feedback.

**You get:** compilable SwiftUI you can drop into Xcode, plus a short "why" for each decision and an accessibility audit table.

### `review-ios-ui` -- quality review

Use when you have UI and want to know how Apple-native it feels.

```
"review my iOS UI"
"does this screen feel like an Apple app?"
"HIG review of the checkout flow"
```

**What happens:** three specialists run in parallel -- `apple-ui-reviewer` (HIG, Liquid Glass, typography, color, SF Symbols, navigation, layout), `animation-haptics-engineer` (spring parameters, motion purpose, haptic placement, Reduce Motion), and `accessibility-engineer` (VoiceOver, Dynamic Type, contrast, touch targets, motor). Findings are deduplicated, severity-ordered, and grouped by screen.

**Scope:** defaults to your uncommitted + staged changes. Pass `staged`, a file, a directory, or `all` to change it.

### `optimize-ios-ui` -- motion + performance

Use when the app works but does not *feel* right, or scrolls poorly.

```
"my animations feel sluggish"
"fix the scroll jank in my feed"
"where should I add haptics?"
```

**What happens:** `animation-haptics-engineer` (feel: do animations communicate? are haptics intentional?) and `performance-engineer` (smoothness: 120fps, no hitches, efficient rendering) run in parallel. Conflicts are reconciled toward the smoother choice.

**You get:** a haptic coverage map, exact spring parameters, and concrete performance rewrites.

### `craft-ios-ui` -- the full treatment

Use when you want every dimension reviewed and a unified plan.

```
"make this feel like Apple built it"
"full UI craft pass"
"make this world-class iOS UI"
```

**What happens:** the `craft-team-lead` orchestrates all five review specialists (visual, animation-haptics, accessibility, performance, platform), then merges, deduplicates, resolves conflicts, and prioritizes into one report organized by screen -- with a per-dimension verdict and an improvement plan ordered by impact. It applies changes only after you approve them.

### `audit-accessibility` -- deep a11y

Use when accessibility is the whole ask. Goes deeper than the `review-ios-ui` a11y lane.

```
"audit my app for accessibility"
"is my app usable with VoiceOver?"
"WCAG check before submission"
```

**What happens:** the `accessibility-engineer` runs solo with the full accessibility reference set, runs its 5-dimension audit (VoiceOver, Dynamic Type, visual, motor, cognitive & hearing) per screen, maps every finding to a WCAG 2.2 success criterion with the correct level (2.5.8 Minimum AA 24px vs 2.5.5 Enhanced AAA 44px; 44pt stays the Apple HIG rule), and produces the Settings matrix (behavior under each accessibility setting).

### `integrate-platform` -- system reach

Use to find where the app should extend into the OS.

```
"how do I make my app feel more native beyond the UI?"
"should I build a Live Activity?"
"bring my app to the Vision Pro"
```

**What happens:** the `platform-engineer` inventories what ships today, then maps every untapped surface (widgets, Live Activities, Dynamic Island, App Intents, Apple Intelligence, controls, StandBy, Spotlight, WebView, maps) plus cross-platform reach (iPadOS, watchOS, tvOS, macOS/Catalyst, visionOS, CarPlay), ranked by user value vs build cost with the required API and floor for each.


## Reading a report

Every finding carries:

- **A severity tag** -- `CRITICAL` (breaks the experience: a11y blocker, <44pt target, nausea-inducing motion, Liquid Glass obscuring content) / `HIGH` (noticeable degradation) / `MEDIUM` (quality gap) / `LOW` (polish) / `NIT` (taste). Praise is tagged `[+]`.
- **A location** -- `file.swift:line-range`.
- **A reference citation** -- `references/<domain>/<file>.md#<slug>` or a vault path. No hand-waving; every claim is grounded.
- **Current -> suggested code** -- verbatim-applicable SwiftUI, not a description of what to do.

For example, one finding in a report reads:

> **CRITICAL -- Hero zoom runs with Reduce Motion enabled** -- `HomeView.swift:48-52`
>
> The expand animation fires unconditionally, so a user with Reduce Motion on gets a full vestibular-triggering scale. Gate both the `withAnimation(` and the `.animation(_:value:)` on a Reduce Motion accessor; substitute `nil` (or a crossfade) when it is enabled. Reference: `references/accessibility/05-motion-accessibility.md#the-apple-way`.

```swift
// current
withAnimation(.spring) { isExpanded.toggle() }

// suggested
@Environment(\.accessibilityReduceMotion) private var reduceMotion
withAnimation(reduceMotion ? nil : .spring) { isExpanded.toggle() }
```

Reviews are **read-only by default.** Findings are advisory. The orchestrator applies changes only when you explicitly approve them -- so you can run a review safely on any branch.


## How ultracode changes behavior

When your session is running under **ultracode**, every skill switches to conductor-executor mode automatically. You do not do anything differently; the split happens under the hood:

- **The session model conducts -- always the strongest available Claude, whichever model that is.** It decides scope, grades severity, deduplicates findings, resolves conflicts, and synthesizes the final report. Every verdict is the conductor's, and the workflow runs identically regardless of which model is currently strongest.
- **Conductor-selected executor teams (Sonnet 5 @ `xhigh` or Opus 4.8) do the grunt stages** -- reconnaissance inventory, per-screen evidence collection, instrumentation sweeps, component scaffolding, and post-approval mechanical application. Each executor is scoped through the skill: a non-overlapping file set, the dimension's reference paths plus the version-floor registry, the severity scale plus the skill's inlined check tables, and a blackboard + escalation contract. Executors report **evidence, never verdicts**. The shared dispatch mechanics, fan-out doctrine (executor teams scale to natural breadth), and validation gate live in `references/_scaffolding/conductor-dispatch-protocol.md`.
- **The specialist reviewers stay on the session model.** Judging Apple-native quality is never delegated to an executor.
- **Every executor result is gated** -- the conductor reads the durable blackboard (not the truncated final message), spot-checks claims against the actual files, and re-grades before anything reaches you.

Without ultracode, the skills run their standard direct dispatch. The model invariants hold either way: never Haiku, never Sonnet below `xhigh`, never an executor-authored verdict.


## The reference library

The plugin's knowledge lives in `references/` -- **82 files** across 11 content domains (design, animation, interaction, haptics, accessibility, patterns, performance, platform, cross-platform, exemplars, methodology) plus `_scaffolding/` (12 directories total). See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full tree, per-domain counts, and the reference-to-agent ownership matrix.

Two files anchor the whole library:

- **`_scaffolding/version-floor-registry.md`** -- the single source of truth for API availability floors, deprecated APIs, and the PHANTOM list (APIs that do not exist and must never be emitted, e.g. `Glass.thin`/`.thick`, `@Environment(\.tintMode)`). Every reference file cites it rather than restating floors.
- **`exemplars/`** -- end-to-end worked screens that compose the references. These are labeled **signature-drafted, build-pending**: they are written to compile at iOS 18 + iOS 26 targets but have not been run through Xcode in this repo, so treat them as high-fidelity drafts, not shipped binaries.


## Relationship to `ios-code-review`

They are complementary and non-overlapping:

| Run this... | ...to answer |
|---|---|
| `ios-code-review` | Will Apple accept this? (compliance, privacy, entitlements, security, Swift correctness, concurrency) |
| `apple-ui-craft` | Will users love this? (visual craft, motion feel, haptic design, accessibility excellence, performance smoothness, platform depth) |

Run both before shipping: one clears the gate, the other earns the delight.


## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `craft-ios-ui` produces nothing, or the team lead can't fan out to specialists | Dispatched via the plugin namespace, which silently strips the `Agent` tool at runtime | Dispatch `craft-team-lead` as `general-purpose` with its agent-file body inlined as the prompt prefix (see the RUNTIME DISPATCH NOTE in `agents/craft-team-lead.md` and the Dispatch section of `skills/craft-ios-ui/SKILL.md`) |
| The GoodMem search step is silently skipped | The GoodMem MCP is not configured, or is unreachable, in this session | Expected behavior -- no memory service is required. If you do run GoodMem, substitute your own space and reranker IDs into the `goodmem_memories_retrieve` call shown in the agent file |
| A finding or design suggests an API that does not compile | Training data is stale for iOS-26-era APIs (Liquid Glass, `.sensoryFeedback`, App Intents) | Check `references/_scaffolding/version-floor-registry.md`'s PHANTOM list, and verify the API shape with Context7 before applying the suggestion |
| Reviews run standard direct dispatch instead of conductor-executor with executor teams | The harness has not announced ultracode for this session, or ultracode is off | Expected fallback -- every skill runs its standard dispatch (see [How ultracode changes behavior](#how-ultracode-changes-behavior)) without executor teams; no action needed |
| `review-ios-ui` only runs 3 specialists, not all 5 | By design -- `review-ios-ui` scopes to visual + motion + accessibility only | Use `craft-ios-ui` for the full 5-specialist sweep that adds performance and platform-integration coverage |

## FAQ

**Does it modify my code?** Not without approval. Reviews are read-only; `design-ios` and the apply phase of `craft-ios-ui` write code only after you say yes.

**Do I need GoodMem / serena / Context7?** No. They sharpen retrieval, navigation, and API-currency when present, and the plugin degrades gracefully without them.

**Why does it target iOS 26?** The craft surface (Liquid Glass, sensory feedback, `@Observable`, App Intents, Foundation Models) is iOS-26-era. iOS 27 beta APIs are quarantined behind `#available(iOS 27, *)` and never appear in primary examples. Lower deployment targets are supported via `#available(iOS 26, *)` gates with Material fallbacks.

**Can it review UIKit?** Yes -- the reviewers read both SwiftUI and UIKit, though recommendations lead with the SwiftUI-native path.

**What if my app has a deliberate non-default design system?** The reviewers respect existing coherence. A consistent, working non-default system is not penalized for being non-default; findings flag only where a choice hurts the experience.

**How do I get the most out of a review?** Scope it. Point a skill at the screen or flow you care about rather than the whole project, and you get denser, more actionable findings.

**Which model runs this?** Under ultracode, whichever model your session is on conducts -- always the strongest available Claude, and the workflow runs identically regardless of which model that is. The grunt stages run on conductor-selected executors: Sonnet 5 at `xhigh` effort, or Opus 4.8 when the leg-work needs deeper judgment. Without ultracode, the session model runs the dispatch directly. The invariants never change: never Haiku, never Sonnet below `xhigh`, never an executor-authored verdict.
