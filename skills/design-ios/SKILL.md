---
name: design-ios
description: |-
  Design new iOS UI from scratch -- a screen, a flow, a component, or a full app interface. Dispatches the apple-ui-architect Fable 5 agent for production-grade SwiftUI with Liquid Glass, spring animations, semantic colors, SF Symbols, proper navigation hierarchy, intentional haptic feedback, and accessibility from birth -- then the accessibility-engineer to audit the fresh code before both reports return. Triggers on "design a [screen/flow/component]", "build me a [screen]", "create the UI for", "design the [dashboard/settings/onboarding]".
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
After the architect produces code, dispatch `apple-ui-craft:accessibility-engineer` to audit it. Inline the architect's full Stage 1 SwiftUI output -- or the absolute paths of the files it wrote, when a project exists -- directly into this dispatch prompt: the accessibility-engineer shares no conversation state with Stage 1 and can only Read what it is pointed at. It audits for:
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

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor per `references/_scaffolding/conductor-dispatch-protocol.md` -- read that file before the first executor dispatch; it owns the dispatch mechanics, the fan-out doctrine (executor teams scale to natural breadth; the session-model agent caps do not apply to them), the executor prompt contract, and the validation gate. Without ultracode, run the standard architect + accessibility-pass dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Executor teams (Sonnet 5, ALWAYS `effort: xhigh`) |
|---|---|
| The design itself (information hierarchy, aesthetic decisions, navigation model, animation/haptic choices) and final synthesis -- design is judgment-class and stays with the architect (`model: fable`); the accessibility verdict stays with the accessibility-engineer (Stage 2, also `model: fable`) | Component scaffolding from the conductor/architect-approved design spec (one executor per component family); token/asset plumbing; preview-matrix generation (Dynamic Type x color scheme x Reduce Motion) |

Design origination is NOT an executor task -- the `apple-ui-architect` produces the design and the primary SwiftUI. Executors only fan out to scaffold approved component families and generate the preview matrix once the architecture is set, then the conductor and the accessibility pass gate the result.

**Executor scoping (on top of the protocol's prompt contract)**
- Each executor owns one approved component family (non-overlapping) and gets the approved spec inline.
- Reference set: absolute paths of the relevant `references/design/*`, `references/animation/*`, `references/interaction/*` + `references/_scaffolding/version-floor-registry.md`.
- Inline the production-SwiftUI rules (system fonts/semantic colors/44pt/RM double-gate/#available gating/no phantom APIs).
- The `apple-ui-architect` / `accessibility-engineer` stay `model: fable` -- design + a11y verdicts are never executor work.
