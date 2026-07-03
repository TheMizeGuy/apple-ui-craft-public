---
name: design-ios
description: |-
  Design new iOS UI from scratch -- a screen, a flow, a component, or a full app interface. Dispatches the apple-ui-architect Fable 5 agent which produces production-grade SwiftUI with Liquid Glass, spring animations, semantic colors, SF Symbols, proper navigation hierarchy, intentional haptic feedback, and full accessibility from birth. Triggers on "design a [screen/flow/component]", "build me a [screen]", "create the UI for", "design the [dashboard/settings/onboarding]".
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

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor: the session model CONDUCTS -- Fable 5 or Opus 4.8, interchangeably (either model drives the workflow identically) -- and teams of Sonnet 5 executors at `xhigh` effort do the scoped grunt stages. Without ultracode, run the standard architect + accessibility-pass dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Executor teams (Sonnet 5, ALWAYS `effort: xhigh`) |
|---|---|
| The design itself (information hierarchy, aesthetic decisions, navigation model, animation/haptic choices), the accessibility verdict, final synthesis -- design is judgment-class and stays with the architect (`model: fable`) | Component scaffolding from the conductor/architect-approved design spec (one executor per component family); token/asset plumbing; preview-matrix generation (Dynamic Type x color scheme x Reduce Motion) |

Design origination is NOT an executor task -- the `apple-ui-architect` produces the design and the primary SwiftUI. Executors only fan out to scaffold approved component families and generate the preview matrix once the architecture is set, then the conductor and the accessibility pass gate the result.

**Scoping contract -- every executor is scoped via this skill.** Each executor prompt MUST inline:
1. The exact component/file set it owns (non-overlapping) and the approved spec.
2. Absolute paths of the relevant `references/design/*`, `references/animation/*`, `references/interaction/*` + `references/_scaffolding/version-floor-registry.md`.
3. The production-SwiftUI rules (system fonts/semantic colors/44pt/RM double-gate/#available gating/no phantom APIs).
4. `BLACKBOARD: <path>` (first token = path) + the escalation rule (2 failed attempts or ambiguity -> `## ESCALATE` + early return).

**Dispatch mechanics**
- `Agent({subagent_type: "general-purpose", model: "sonnet", prompt: <scoped briefing>})`; in Workflow scripts pass `{model: 'sonnet', effort: 'xhigh'}` explicitly.
- The `apple-ui-architect` / `accessibility-engineer` stay `model: fable` -- design + a11y verdicts are never executor work.
- Fan-out budget: <=10 executors per wave, <=20 per turn. Scaffolding executors writing files in parallel use `isolation: "worktree"`.
- Conductor gate before anything reaches the user: read blackboards, review `git diff`, check the design spec item by item. One re-dispatch on failure, then the conductor takes over.
- Never Haiku. Never Sonnet below xhigh. Never a Sonnet verdict.
