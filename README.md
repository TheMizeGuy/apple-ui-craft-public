# apple-ui-craft

A team of seven specialist agents embodying a principal Apple UI engineer. Designs, reviews, optimizes, and crafts iOS UI so it feels like Apple built it. Liquid Glass done correctly. Springs that settle naturally. Haptics that confirm without fatiguing. Accessibility built in. Platform integration that makes the app feel like it belongs on the home screen.

New here? The [Usage Guide](USAGE.md) walks through every skill with worked invocations. The [Architecture](ARCHITECTURE.md) has the full file map.

## What this plugin does

Bridges the gap between "code that compiles" and "UI that feels right." Existing iOS review tools (including [`ios-code-review`](https://github.com/TheMizeGuy/ios-code-review)) cover App Store compliance, privacy, security, and engineering correctness. This plugin covers the CRAFT layer:

- Visual design quality (HIG, Liquid Glass, typography, color, navigation)
- Animation feel (spring physics, interruptibility, timing, purpose)
- Haptic design (when, where, what type, intensity)
- Accessibility excellence (VoiceOver, Dynamic Type, contrast, motor, motion, localization, cognitive/hearing)
- Performance smoothness (60-120fps, no hitches, efficient rendering, launch cost)
- Platform integration depth (widgets, Live Activities, App Intents, Apple Intelligence, WebView) and cross-platform reach (iPadOS, watchOS, tvOS, macOS/Catalyst, visionOS, CarPlay)

Run `ios-code-review` for "will Apple accept this?" Run `apple-ui-craft` for "will users love this?"

Targets **iOS 26 and iOS 27** (Liquid Glass, `.sensoryFeedback`, `@Observable`, App Intents, Foundation Models, and the iOS 27 toolbar, reorder, Siri AI and MetricKit surfaces). iOS 27.0 APIs lead where they are the right tool, gated with an iOS 26 fallback; only still-beta point-release symbols (iOS 27.1/27.2) are fenced. Availability floors are Context7-verified and centralized in `references/_scaffolding/version-floor-registry.md`.

## Installation

```bash
# 1. Add this repo as a marketplace
claude plugin marketplace add https://github.com/TheMizeGuy/apple-ui-craft-public.git

# 2. Install the plugin
claude plugin install apple-ui-craft@apple-ui-craft-public

# 3. Restart Claude Code for the plugin to load
```

After restart, verify with `claude plugin list`. Updates ship through the same channel: when a new release lands, run `claude plugin marketplace update apple-ui-craft-public` then `claude plugin update apple-ui-craft@apple-ui-craft-public`, or accept the update prompt in `/plugin`.

Manual alternative: `git clone https://github.com/TheMizeGuy/apple-ui-craft-public.git` and load with `claude --plugin-dir <path>`.

## Skills

| Skill | Triggers | Specialists |
|---|---|---|
| `apple-ui-craft:design-ios` | "design a [screen/flow/component]", "build me a [screen]" | architect (+ a11y pass) |
| `apple-ui-craft:review-ios-ui` | "review my iOS UI", "check this screen", "HIG review" | 3 (visual + motion + a11y) |
| `apple-ui-craft:optimize-ios-ui` | "optimize animations", "fix scroll jank", "add haptics" | 2 (animation-haptics + performance) |
| `apple-ui-craft:craft-ios-ui` | "make this feel Apple-native", "full UI pass", "make this god tier" | 5 + team lead |
| `apple-ui-craft:audit-accessibility` | "audit my app for accessibility", "VoiceOver review", "WCAG check" | accessibility (solo, deep) |
| `apple-ui-craft:integrate-platform` | "make my app feel native beyond the UI", "should I build a widget/Live Activity?" | platform (solo) |

## Specialist agents

| Agent | Domain |
|---|---|
| `apple-ui-architect` | Greenfield design + production SwiftUI |
| `apple-ui-reviewer` | HIG + visual + Liquid Glass audit |
| `animation-haptics-engineer` | Motion, interaction/feel, tactile feedback |
| `accessibility-engineer` | VoiceOver, Dynamic Type, motion, localization, full a11y, App Store Accessibility Nutrition Label readiness |
| `performance-engineer` | SwiftUI rendering, scroll, state, launch, memory |
| `platform-engineer` | Widgets, Live Activities, App Intents and Siri AI, Apple Intelligence + cross-platform |
| `craft-team-lead` | Inlined `general-purpose` orchestrator for `craft-ios-ui`; Agent access depends on runtime grants and nesting depth |

## Reference library

**94 reference files** in a self-contained library distilled from an 88-document iOS knowledge base (~103,000 lines), organized into 13 content domains plus `_scaffolding` (14 directories total). The [`ARCHITECTURE.md`](ARCHITECTURE.md) tree is the authoritative file list.

```
references/
├── design/          philosophy, Liquid Glass, typography, color, SF Symbols, layout,
│                    navigation, adaptive-iPad, Swift Charts, media, text/canvas
├── animation/       fundamentals, spring physics, advanced animators, transitions,
│                    gesture-driven, scroll-driven effects, motion choreography
├── interaction/     the FEEL layer: interruptibility, fluid transitions, direct
│                    manipulation, gesture disambiguation, press feedback, custom controls
├── haptics/         design principles, SensoryFeedback, Core Haptics, sound/audio UX
├── accessibility/   VoiceOver, Dynamic Type, visual, motor, motion, localization/RTL,
│                    cognitive/hearing/assistive, the WCAG 2.2 A/AA mapping
├── patterns/        screen archetypes, gotchas, forms, onboarding, loading/empty/error,
│                    modality, settings, feedback, paywall/StoreKit, auth, drag-drop
├── performance/     rendering, scroll/list, launch/memory, state architecture,
│                    display/ProMotion, concurrency, build performance, SwiftData UI
├── platform/        widgets/Live Activities, App Intents, controls/StandBy, system
│                    surfaces, maps, Apple Intelligence, WebView, app clips, scene lifecycle
├── cross-platform/  iPadOS, watchOS, tvOS, macOS/Catalyst, visionOS, CarPlay
├── usability/       can a person FINISH the task: task flows and journeys, forms and
│                    error recovery, navigation and information architecture, states/
│                    feedback/affordances, the adaptive review method
├── review/          HOW to review: the canonical finding format, the evidence pipeline,
│                    density and economy (the waste dimension), and the run-artifact
│                    contracts (review ledger + CI verdict)
├── exemplars/       end-to-end worked screens (glass, motion+haptics, a11y, perf, platform)
├── methodology/     component API design, previews/QA, Apple sample teardowns, what's-new log
└── _scaffolding/    file template, the single version-floor registry, and the shared
                     dispatch protocol
```

Per-domain file counts:

| Domain | Files | Domain | Files |
|---|--:|---|--:|
| design | 14 | interaction | 6 |
| patterns | 11 | cross-platform | 6 |
| platform | 9 | usability | 5 |
| performance | 8 | exemplars | 5 |
| accessibility | 8 | haptics | 4 |
| animation | 7 | methodology | 4 |
| | | review | 4 |
| | | `_scaffolding` | 3 |

**Total: 94 files** across 13 content domains plus `_scaffolding`.

The **version-floor registry** (`_scaffolding/version-floor-registry.md`) is the single source of truth for availability floors, deprecated APIs, and the PHANTOM list -- APIs that do not exist and must never be emitted. Every reference file cites it rather than restating floors.

## Severity scale

Canonical definition, along with the finding template, the confidence enum, and
the dimension registry: `references/review/01-finding-format.md`.

| Tag | Meaning |
|---|---|
| CRITICAL | Breaks user experience (a11y blocker, < 44pt touch target, ungated looping or vestibular-trigger motion, Liquid Glass obscuring content, content unreachable in a supported configuration, irreversible destruction with no confirmation and no undo) |
| HIGH | Degrades experience noticeably (wrong navigation, missing haptics, animation fights user, no Reduce Motion support on a transition, input lost on back or termination, a missing empty or error state, clipping at accessibility text sizes, an iPad running a stretched phone layout) |
| MEDIUM | Quality gap (suboptimal spring, generic spacing, missing SF Symbol) |
| LOW | Polish (slightly better timing, additional haptic surface) |
| NIT | Taste preference (sparing). Waste with no measurement attached belongs here |

Findings also carry a confidence class -- Hard defect, Quality defect, Pattern
smell, or Taste note -- because severity and confidence are different questions.
A hard defect can be LOW, and a quality defect can be HIGH.

## Some dimensions cannot be judged from one screenshot

Task flow, information architecture, error recovery, adaptive layout under
Dynamic Type, animation feel, and performance need a sequence, a configuration
change, or a measurement. When the available evidence cannot show them, the
review returns **NOT ASSESSED** for those dimensions rather than a clean verdict.
A clean verdict from a single static frame is a false negative on exactly the
defect class a static frame cannot contain, so the plugin declines to give one.
Every report states its evidence mode and coverage as its first line.

## Hard rules

1. Read-only review by default. Findings advisory; orchestrator applies on user OK.
2. Cite the reference. Every finding points to a `references/` file:section (vault docs only when they exist locally).
3. Show code. Concrete current -> suggested rework, verbatim-applicable.
4. Apple-native or nothing. Every suggestion makes the app feel MORE first-party.
5. Springs over curves. Default spring; justify any timing curve.
6. Haptics are intentional. Never decoration.
7. Never a clean verdict on a dimension the evidence could not see.
8. Measured claims carry the measurement. Geometry from element frames, contrast from resolved colour values, performance from Instruments -- never a pixel estimate or a sampled screenshot colour.
9. No AI slop. Direct, specific, authoritative.

## Dispatch

The session that runs a skill chooses the model for each agent it dispatches (Opus 5 is the usual default for design, review and implementation); nothing here pins a model or an effort level. On a wide scope, the skills split evidence collection from grading and fan out the collection. The shared dispatch mechanics live in `references/_scaffolding/conductor-dispatch-protocol.md`; the user-facing explanation is [`USAGE.md` -- How the skills fan out](USAGE.md#how-the-skills-fan-out).

## Backed by

- 88-file iOS Development vault (~103,000 lines), distilled into the reference library
- A version-floor registry verified against Apple's symbol metadata (iOS 13 through iOS 27, with the 27.1/27.2 beta tier fenced)
- GoodMem Learnings for prior debugging and audit findings
- serena for symbol-level project navigation
- Context7 for live Apple framework docs
- XcodeBuildMCP, when available, for the Runtime evidence mode: build, run, `snapshot_ui` geometry, driven sequences

## License

MIT
