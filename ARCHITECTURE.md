# apple-ui-craft -- Architecture

Internal map of files, responsibilities, and cross-references. Not loaded by Claude -- for human reading and build-time agent coordination.

## Mission

A team of Fable 5 specialists embodying a 40-year principal Apple UI engineer. Designs, reviews, optimizes, and crafts iOS/iPadOS UI so the result feels like Apple's own first-party apps -- not "good enough," but the kind of UI that makes users say "this feels right" without being able to articulate why. Liquid Glass done correctly. Springs that settle naturally. Haptics that confirm without fatiguing. Accessibility that's built in, not bolted on. Platform integration that makes the app feel like it belongs on the home screen.

## Layout

```
apple-ui-craft/
├── .claude-plugin/plugin.json
├── README.md
├── ARCHITECTURE.md              (this file)
├── skills/                      (4 user-invoked entry points)
│   ├── design-ios/SKILL.md      "design a [screen/flow/component]"
│   ├── review-ios-ui/SKILL.md   "review my iOS UI / check this screen"
│   ├── optimize-ios-ui/SKILL.md "optimize animations / haptics / performance"
│   └── craft-ios-ui/SKILL.md    "make this feel Apple-native" (full team)
├── agents/                      (7 Fable 5 specialists)
│   ├── apple-ui-architect.md          greenfield design + production SwiftUI
│   ├── apple-ui-reviewer.md           HIG + visual + Liquid Glass audit
│   ├── animation-haptics-engineer.md  motion + tactile feedback specialist
│   ├── accessibility-engineer.md      VoiceOver, Dynamic Type, full a11y
│   ├── performance-engineer.md        SwiftUI perf, rendering, scroll, memory
│   ├── platform-engineer.md           widgets, Live Activities, App Intents, system depth
│   └── craft-team-lead.md             orchestrator for craft-ios-ui multi-pass
└── references/                  (23 self-contained knowledge files)
    ├── design/
    │   ├── 01-apple-design-philosophy.md    clarity, deference, depth + design pillars
    │   ├── 02-liquid-glass.md               glassEffect API, variants, accessibility auto-adaptation
    │   ├── 03-typography-dynamic-type.md    system font styles, Dynamic Type, custom fonts
    │   ├── 04-color-system.md               semantic colors, dark mode, high contrast, tinted
    │   ├── 05-sf-symbols.md                 selection, rendering modes, variable values, effects
    │   ├── 06-layout-spacing.md             margins, padding, safe areas, content insets
    │   └── 07-navigation-patterns.md        NavigationStack, tabs, sheets, popovers, hierarchy
    ├── animation/
    │   ├── 01-animation-fundamentals.md     implicit vs explicit, timing curves, Transaction
    │   ├── 02-spring-physics.md             parameter guide, presets, settling, feel
    │   ├── 03-advanced-animators.md         PhaseAnimator, KeyframeAnimator, CustomAnimation
    │   ├── 04-transitions-geometry.md       matchedGeometryEffect, transitions, ContentTransition
    │   └── 05-gesture-driven.md             DragGesture, rotation, magnify, interactive springs
    ├── haptics/
    │   ├── 01-haptic-design-principles.md   when/where, intensity, anti-patterns, Apple philosophy
    │   ├── 02-swiftui-sensory-feedback.md   .sensoryFeedback modifier, triggers, platform matrix
    │   └── 03-core-haptics-engine.md        CHHapticEngine, patterns, AHAP, audio sync
    ├── accessibility/
    │   ├── 01-voiceover-fundamentals.md     labels, traits, grouping, custom actions, rotor
    │   ├── 02-dynamic-type-adaptation.md    text styles, scaling, layout, AX sizes
    │   ├── 03-visual-accessibility.md       contrast, Reduce Motion, Reduce Transparency, Smart Invert
    │   └── 04-motor-interaction.md          touch targets, Switch Control, Voice Control, drag alt
    ├── performance/
    │   ├── 01-swiftui-rendering.md          body evaluation, Equatable, @Observable, LazyStacks
    │   └── 02-scroll-list-performance.md    hitches, prefetching, image handling, drawingGroup
    └── platform/
        ├── 01-widgets-live-activities.md    WidgetKit, timelines, interactive, Dynamic Island
        └── 02-app-intents-system.md         App Intents, Siri, Shortcuts, Spotlight, Quick Actions
```

## Agent <-> skill mapping

| Skill | Agents dispatched | Mode |
|---|---|---|
| `design-ios` | `apple-ui-architect` (then `accessibility-engineer` for a11y pass) | Sequential |
| `review-ios-ui` | `apple-ui-reviewer` + `animation-haptics-engineer` + `accessibility-engineer` | Parallel, then merge |
| `optimize-ios-ui` | `animation-haptics-engineer` + `performance-engineer` | Parallel, then merge |
| `craft-ios-ui` | `craft-team-lead` orchestrates all 6 specialists in 3 phases (audit -> plan -> apply per user approval) | Multi-pass, team-lead owns dispatch |

## Reference <-> agent mapping

| Agent | Reads (must) |
|---|---|
| `apple-ui-architect` | design/* (all), animation/01-02, haptics/01, accessibility/01-03 |
| `apple-ui-reviewer` | design/* (all), animation/01-02, haptics/01, accessibility/01-03 |
| `animation-haptics-engineer` | animation/* (all), haptics/* (all), accessibility/03 (Reduce Motion) |
| `accessibility-engineer` | accessibility/* (all), design/03-04 (typography, color), design/06 (layout/spacing) |
| `performance-engineer` | performance/* (all), animation/01 (layout vs render cost) |
| `platform-engineer` | platform/* (all), design/07 (navigation) |
| `craft-team-lead` | All references (routes; doesn't do deep work itself) |

## Hard rules baked into every agent

1. **Read-only review by default.** Findings are advisory. Orchestrator applies on explicit user OK.
2. **Cite references + vault.** Every finding points to a reference file:section or vault path. No hand-waving.
3. **Show code.** Concrete current -> suggested rework. Verbatim-applicable SwiftUI.
4. **Severity tags.** CRITICAL / HIGH / MEDIUM / LOW / NIT -- same scale as ios-code-review.
5. **No AI slop.** No "Great work!", "Just a minor suggestion", "Hope this helps", hedging, trailing summaries.
6. **No defensive lower bounds.** Real values, not "at least N".
7. **Respect existing project patterns.** Read repo conventions before suggesting; don't impose a different design language on top of a coherent one.
8. **Apple-native or nothing.** Every suggestion must make the app feel MORE like a first-party Apple app, not less.
9. **Springs over curves.** Default recommendation is spring animation unless there's a specific reason for timing curves.
10. **Haptics are intentional.** Never recommend haptics as decoration. Every haptic must communicate something the user needs to feel.

## Severity scale (shared by all agents)

| Tag | Meaning |
|---|---|
| CRITICAL | Breaks user experience: crash, accessibility blocker, 44pt touch target violation, animation causing nausea, Liquid Glass misuse that obscures content |
| HIGH | Degrades experience noticeably: wrong navigation pattern, missing haptics on committed mutations, animation timing that fights the user, no Reduce Motion support |
| MEDIUM | Quality gap: suboptimal spring parameters, generic spacing instead of Apple metrics, missing SF Symbol where appropriate, haptic on wrong trigger |
| LOW | Polish: slightly better timing, additional haptic surface, minor spacing refinement, could use newer API |
| NIT | Taste preference -- include sparingly |

## Relationship to ios-code-review

`ios-code-review` covers App Store compliance, privacy, entitlements, security, Swift quality, concurrency, and engineering correctness. `apple-ui-craft` covers the CRAFT layer: visual design quality, animation feel, haptic design, accessibility excellence, performance smoothness, and platform integration depth. They complement each other. Run `ios-code-review` for "will Apple accept this?" and `apple-ui-craft` for "will users love this?"

## Cross-references

Reference-to-reference:
```
See `references/<topic>/<file>.md#<heading-slug>`
```

Vault citations:
```
See `~/Claude/vault/iOS Development/<file>.md#section`
```
