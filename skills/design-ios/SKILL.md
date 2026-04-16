---
name: design-ios
description: |-
  Design new iOS UI from scratch -- a screen, a flow, a component, or a full app interface. Dispatches the apple-ui-architect Opus 4.7 agent which produces production-grade SwiftUI with Liquid Glass, spring animations, semantic colors, SF Symbols, proper navigation hierarchy, intentional haptic feedback, and full accessibility from birth. Triggers on "design a [screen/flow/component]", "build me a [screen]", "create the UI for", "design the [dashboard/settings/onboarding]".
---

# Design iOS UI

## Dispatch

This skill dispatches agents in two stages:

### Stage 1: Design
Dispatch `apple-ui-craft:apple-ui-architect` with:
- The user's design request
- Project context (if a project exists: deployment target, existing navigation, design patterns, color conventions)
- Instruction to read relevant reference files before designing
- Instruction to search GoodMem for prior learnings

### Stage 2: Accessibility pass
After the architect produces code, dispatch `apple-ui-craft:accessibility-engineer` to audit the new code for:
- VoiceOver labels and reading order
- Dynamic Type survival at AX sizes
- Touch target compliance (44x44pt)
- Reduce Motion fallback
- Color contrast

Present both outputs to the user. The architect's code is the primary deliverable; the accessibility findings are immediate feedback for refinement.

## What the architect produces

- Full production SwiftUI code (compilable)
- Design decision rationale
- Animation inventory (what animates, spring params, haptic pairing)
- Accessibility audit (built-in, not afterthought)
- Xcode previews (default + edge case)

## Scope determination

| User says | Scope |
|---|---|
| "design a screen" | Single view + supporting types |
| "design a flow" | Multiple views + navigation between them |
| "design a component" | Reusable view + API surface |
| "design the app" | Tab structure + key screens (start with structure, iterate) |

If scope is unclear, ask. Don't guess.
