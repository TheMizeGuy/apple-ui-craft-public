# apple-ui-craft

A team of seven Fable 5 specialists embodying a principal Apple UI engineer. Designs, reviews, optimizes, and crafts iOS UI so it feels like Apple built it. Liquid Glass done correctly. Springs that settle naturally. Haptics that confirm without fatiguing. Accessibility built in. Platform integration that makes the app feel like it belongs on the home screen.

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

Targets **iOS 26** (Liquid Glass, `.sensoryFeedback`, `@Observable`, App Intents, Foundation Models). iOS 27 beta APIs are quarantined behind `#available` + an SDK-verify caveat. Availability floors are Context7-verified and centralized in `references/_scaffolding/version-floor-registry.md`.

## Installation

Clone this repository, then add it to Claude Code as a plugin:

```bash
git clone https://github.com/TheMizeGuy/apple-ui-craft-public.git
```

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
| `accessibility-engineer` | VoiceOver, Dynamic Type, motion, localization, full a11y |
| `performance-engineer` | SwiftUI rendering, scroll, state, launch, memory |
| `platform-engineer` | Widgets, Live Activities, App Intents, Apple Intelligence + cross-platform |
| `craft-team-lead` | Multi-agent orchestrator for `craft-ios-ui` |

## Reference library

**81 reference files** in a self-contained library distilled from an 88-document iOS knowledge base (102,900+ lines), organized into 11 content domains plus `_scaffolding` (12 directories total). The [`ARCHITECTURE.md`](ARCHITECTURE.md) tree is the authoritative file list.

```
references/
├── design/          philosophy, Liquid Glass, typography, color, SF Symbols, layout,
│                    navigation, adaptive-iPad, Swift Charts, media, text/canvas
├── animation/       fundamentals, spring physics, advanced animators, transitions,
│                    gesture-driven, scroll-driven effects
├── interaction/     the FEEL layer: interruptibility, fluid transitions, direct
│                    manipulation, gesture disambiguation, press feedback, custom controls
├── haptics/         design principles, SensoryFeedback, Core Haptics, sound/audio UX
├── accessibility/   VoiceOver, Dynamic Type, visual, motor, motion, localization/RTL,
│                    cognitive/hearing/assistive
├── patterns/        screen archetypes, gotchas, forms, onboarding, loading/empty/error,
│                    modality, settings, feedback, paywall/StoreKit, auth, drag-drop
├── performance/     rendering, scroll/list, launch/memory, state architecture,
│                    display/ProMotion, concurrency, build performance, SwiftData UI
├── platform/        widgets/Live Activities, App Intents, controls/StandBy, system
│                    surfaces, maps, Apple Intelligence, WebView, app clips, scene lifecycle
├── cross-platform/  iPadOS, watchOS, tvOS, macOS/Catalyst, visionOS, CarPlay
├── exemplars/       end-to-end worked screens (glass, motion+haptics, a11y, perf, platform)
├── methodology/     component API design, previews/QA, Apple sample teardowns, what's-new log
└── _scaffolding/    file template + the single version-floor registry
```

Per-domain file counts:

| Domain | Files | Domain | Files |
|---|--:|---|--:|
| design | 13 | animation | 6 |
| patterns | 11 | interaction | 6 |
| platform | 9 | cross-platform | 6 |
| performance | 8 | exemplars | 5 |
| accessibility | 7 | haptics | 4 |
| | | methodology | 4 |
| | | `_scaffolding` | 2 |

**Total: 81 files** across 11 content domains plus `_scaffolding`.

The **version-floor registry** (`_scaffolding/version-floor-registry.md`) is the single source of truth for availability floors, deprecated APIs, and the PHANTOM list -- APIs that do not exist and must never be emitted. Every reference file cites it rather than restating floors.

## Severity scale

| Tag | Meaning |
|---|---|
| CRITICAL | Breaks user experience (a11y blocker, < 44pt touch target, missing Reduce Motion, Liquid Glass obscuring content) |
| HIGH | Degrades experience noticeably (wrong navigation, missing haptics, animation fights user) |
| MEDIUM | Quality gap (suboptimal spring, generic spacing, missing SF Symbol) |
| LOW | Polish (slightly better timing, additional haptic surface) |
| NIT | Taste preference (sparing) |

## Hard rules

1. Read-only review by default. Findings advisory; orchestrator applies on user OK.
2. Cite references + vault. Every finding points to file:section.
3. Show code. Concrete current -> suggested rework, verbatim-applicable.
4. Apple-native or nothing. Every suggestion makes the app feel MORE first-party.
5. Springs over curves. Default spring; justify any timing curve.
6. Haptics are intentional. Never decoration.
7. No AI slop. Direct, specific, authoritative.

## Ultracode

Under ultracode, every skill runs conductor-executor: the session model -- Fable 5 or Opus 4.8, interchangeably -- conducts (scope, verdicts, dedup, synthesis) and teams of Sonnet-5 executors at `xhigh` effort run the scoped grunt stages (recon, evidence sweeps, instrumentation inventory, component scaffolding, post-approval application). Specialists stay on the session model; verdicts are never delegated. See [`USAGE.md`](USAGE.md#how-ultracode-changes-behavior).

## Backed by

- Fable 5 or Opus 4.8 as the ultracode conductor -- interchangeable, either drives the workflow identically
- Fable 5 for every agent by default; Sonnet 5 only as conductor-managed executors at `xhigh` effort; never Haiku
- 88-file iOS Development vault (102,900+ lines), distilled into the reference library
- A Context7-verified version-floor registry (iOS 16 through iOS 27 beta)
- GoodMem Learnings for prior debugging and audit findings
- serena for symbol-level project navigation
- Context7 for live Apple framework docs

## License

MIT
