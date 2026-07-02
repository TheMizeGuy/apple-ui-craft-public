# apple-ui-craft

A team of 7 Fable 5 specialists embodying a 40-year principal Apple UI engineer. Designs, reviews, optimizes, and crafts iOS UI so it feels like Apple built it. Liquid Glass done correctly. Springs that settle naturally. Haptics that confirm without fatiguing. Accessibility built in. Platform integration that makes the app feel like it belongs on the home screen.

## What this plugin does

Bridges the gap between "code that compiles" and "UI that feels right." Existing iOS review tools cover App Store compliance, privacy, security, and engineering correctness. This plugin covers the CRAFT layer:

- Visual design quality (HIG, Liquid Glass, typography, color, navigation)
- Animation feel (spring physics, timing, purpose)
- Haptic design (when, where, what type, intensity)
- Accessibility excellence (VoiceOver, Dynamic Type, contrast, motor)
- Performance smoothness (60-120fps, no hitches, efficient rendering)
- Platform integration depth (widgets, Live Activities, App Intents, Spotlight)

Run standard code review tools for "will Apple accept this?" Run `apple-ui-craft` for "will users love this?"

## Installation

Install this plugin into Claude Code via the plugin marketplace system, or clone directly:

```bash
git clone https://github.com/TheMizeGuy/apple-ui-craft-public.git
```

Then add it as a Claude Code plugin using the plugin configuration mechanism.

## Skills

| Skill | Triggers | Agents | Scope |
|---|---|---|---|
| `apple-ui-craft:design-ios` | "design a [screen/flow/component]" | 1-2 | Greenfield creation |
| `apple-ui-craft:review-ios-ui` | "review my iOS UI", "check this screen" | 3 | Visual + animation + a11y audit |
| `apple-ui-craft:optimize-ios-ui` | "optimize animations", "fix scroll jank", "add haptics" | 2 | Motion + performance tuning |
| `apple-ui-craft:craft-ios-ui` | "make this feel Apple-native", "full UI pass", "make this god tier" | 6 | Full multi-agent team sweep |

## Specialist agents

| Agent | Domain |
|---|---|
| `apple-ui-architect` | Greenfield design + production SwiftUI |
| `apple-ui-reviewer` | HIG + visual + Liquid Glass audit |
| `animation-haptics-engineer` | Motion + tactile feedback |
| `accessibility-engineer` | VoiceOver, Dynamic Type, full a11y |
| `performance-engineer` | SwiftUI rendering, scroll, memory |
| `platform-engineer` | Widgets, Live Activities, App Intents, system depth |
| `craft-team-lead` | Multi-agent orchestrator |

## Reference library

23 self-contained reference files covering every dimension of Apple UI craft:

```
references/
  design/         (7 files: philosophy, Liquid Glass, typography, color, SF Symbols, layout, navigation)
  animation/      (5 files: fundamentals, spring physics, advanced animators, transitions, gestures)
  haptics/        (3 files: design principles, SwiftUI sensory feedback, Core Haptics engine)
  accessibility/  (4 files: VoiceOver, Dynamic Type, visual, motor)
  performance/    (2 files: SwiftUI rendering, scroll/list)
  platform/       (2 files: widgets/Live Activities, App Intents/system)
```

## Severity scale

| Tag | Meaning |
|---|---|
| CRITICAL | Breaks user experience (a11y blocker, < 44pt touch target, missing Reduce Motion) |
| HIGH | Degrades experience noticeably (wrong navigation, missing haptics, animation fights user) |
| MEDIUM | Quality gap (suboptimal spring, generic spacing, missing SF Symbol) |
| LOW | Polish (slightly better timing, additional haptic surface) |
| NIT | Taste preference (sparing) |

## Hard rules

1. Read-only review by default. Findings advisory; orchestrator applies on user OK.
2. Cite references. Every finding points to file:section.
3. Show code. Concrete current -> suggested rework, verbatim-applicable.
4. Apple-native or nothing. Every suggestion makes the app feel MORE first-party.
5. Springs over curves. Default spring; justify any timing curve.
6. Haptics are intentional. Never decoration.
7. No AI slop. Direct, specific, authoritative.

## Example invocations

```
"design the settings screen for my app"
-> design-ios skill -> apple-ui-architect

"review my iOS UI"
-> review-ios-ui skill -> 3 specialists in parallel

"my animations feel sluggish"
-> optimize-ios-ui skill -> animation-haptics-engineer + performance-engineer

"make this feel like Apple built it"
-> craft-ios-ui skill -> craft-team-lead orchestrates all 6 specialists
```

## Backed by

- Fable 5 for every agent by default; Sonnet 5 only for multi-agent workflows at `xhigh` effort; never Haiku
- 23 self-contained reference files covering design, animation, haptics, accessibility, performance, and platform integration
- serena for symbol-level project navigation
- Context7 for live Apple framework docs (training data is stale)

## Contributing

Pull requests welcome. Keep the anti-AI-slop bar high: no emojis, no hedge words, no trailing summaries, no generic transitions. If adding a new reference file, mirror the existing structure (heading hierarchy, tables over prose, concrete code, cross-references).

## License

MIT -- see [LICENSE](./LICENSE)
