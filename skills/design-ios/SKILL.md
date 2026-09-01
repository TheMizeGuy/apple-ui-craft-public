---
name: design-ios
description: |-
  Design new iOS UI from scratch -- a screen, a flow, a component, or a full app interface. Dispatches the apple-ui-architect agent, pinned to the Fable lane at dispatch, which maps the user's task flow before any screen exists, states an explicit adaptive contract per component, ships every state rather than only the loaded one, and produces production-grade SwiftUI with Liquid Glass, spring animations, semantic colors, SF Symbols, proper navigation hierarchy, intentional haptic feedback, and accessibility from birth -- then the accessibility-engineer to audit the fresh code before both reports return. Triggers on "design a [screen/flow/component]", "build me a [screen]", "create the UI for", "design the [dashboard/settings/onboarding]". Also use proactively: any new screen, view, or component in an iOS/SwiftUI project starts here, even when the request is just "add a settings page" and never says design.
---

# Design iOS UI

## Dispatch

This skill dispatches agents in two stages:

### Stage 1: Design

Resolve the plugin root first: `${CLAUDE_PLUGIN_ROOT}` is substituted with this plugin's install root when the skill loads (fallback: the parent of this skill's base directory, two levels up from `skills/design-ios/SKILL.md`). Dispatch `apple-ui-craft:apple-ui-architect` with `model: "fable"`, a first prompt line `FABLE-ESCALATION: ui-ux-frontend -- greenfield iOS design`, the `PLUGIN ROOT: <root>` and `REFERENCES: <root>/references/` lines (the architect resolves every `references/...` path from them), and:
- The user's design request
- Project context (if a project exists: deployment target, existing navigation, design patterns, color conventions)
- Instruction to read relevant reference files before designing
- Instruction to search GoodMem for prior learnings

Gather project context BEFORE dispatching -- the architect designs against these facts, and a dispatch without them produces generic output:

| Fact | Where to find it |
|---|---|
| Deployment target | `IPHONEOS_DEPLOYMENT_TARGET` in `project.pbxproj`, or `platforms:` in `Package.swift` |
| Navigation model | Grep for `NavigationStack` / `NavigationSplitView` / `TabView`; match the dominant one |
| Color + type conventions | `Assets.xcassets` color sets; any DesignSystem/Theme/Tokens file |
| Component conventions | Existing reusable views -- new components copy their API shape |

No project (greenfield): default to the current iOS target, `NavigationStack`, semantic colors only -- and state those assumptions explicitly in the dispatch.

### Stage 2: Accessibility pass
After the architect produces code, dispatch `apple-ui-craft:accessibility-engineer` (`model: "fable"`, first line `FABLE-ESCALATION: ui-ux-frontend -- accessibility pass on fresh SwiftUI`, plus the same `PLUGIN ROOT:` and `REFERENCES:` lines) to audit it. Inline the architect's full Stage 1 SwiftUI output -- or the absolute paths of the files it wrote, when a project exists -- directly into this dispatch prompt: the accessibility-engineer shares no conversation state with Stage 1 and can only Read what it is pointed at. It audits for:
- VoiceOver labels and reading order
- Dynamic Type survival at AX sizes
- Touch target compliance (44x44pt)
- Reduce Motion fallback
- Color contrast

Example Stage 2 prompt (the audit silently reviews nothing without the inlined code -- this handoff is the step most often botched):

```
FABLE-ESCALATION: ui-ux-frontend -- accessibility pass on fresh SwiftUI
PLUGIN ROOT: <root>
REFERENCES: <root>/references/
Audit the SwiftUI below for accessibility. It was designed moments ago in a session
you cannot see; the code below is your ONLY input.
DEPLOYMENT TARGET: iOS 26. SCOPE: 3 views (SettingsView, ProfileRow, PlanPicker).
<architect's full Stage 1 SwiftUI, pasted verbatim -- or absolute file paths when
the code was written to disk>
Return severity-tagged findings (CRITICAL/HIGH/MEDIUM/LOW/NIT) per dimension:
VoiceOver, Dynamic Type, touch targets, Reduce Motion, contrast.
```

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

## Verification before presenting

Run every check against the architect's output; do not present the deliverable until each passes. Grep the files when the code was written to disk; scan the inlined output otherwise.

| Check | How | Pass condition |
|---|---|---|
| All 5 deliverables present | Scan output sections | Code + decision rationale + animation inventory + a11y audit + previews |
| No phantom APIs | Check output against the PHANTOM list in `references/_scaffolding/version-floor-registry.md` | Zero hits |
| No hard-coded colors | `grep -n "Color(red:"` and hex initializers | Zero hits -- semantic or asset-catalog colors only |
| No fixed font sizes | `grep -n "font(.system(size:"` | Zero hits, or each carries a `relativeTo:` and a rationale line |
| Reduce Motion gated | Every `withAnimation(` / `.animation(` site | Each paired with a Reduce Motion accessor, or listed in the rationale as motion-safe |
| Stage 2 ran | Accessibility report present | Findings, or an explicit pass, for all 5 audit dimensions |
| Task frame stated | Stage 1 output has a Task frame section | Task, observable success condition, entry points, frequency -- or one line saying it is a standalone component with no task around it |
| Flow map present | Stage 1 output has a Flow map table | No empty `State carried in`, `Failure modes`, or `Exit paths` cell; each empty cell is a defect being designed in |
| Adaptive contract stated | Stage 1 output has an Adaptive contract table | A sizing strategy per component, and it is never "fixed" for content |
| States shipped | Stage 1 output has a State coverage table | Loading, loaded, empty, and error all rendered; zero-results wherever there is a filter; every terminal state carries an onward action |

Any failed check goes back to the producing stage with the concrete gap named -- one re-dispatch, then escalate to the user rather than shipping a known miss.

## Execution mode

Every agent this skill dispatches runs in the Fable lane: `model: "fable"` (Fable 5.1) at dispatch plus the prompt line `FABLE-ESCALATION: ui-ux-frontend -- <one-line reason>` (owner directive 2026-09-01; supersedes the Opus 5 pin of 2026-07-24); the session conductor stays orchestrator-only. UI/UX judgment is never run inline in a deep session and never downgraded to an executor-class model. If your harness has no `fable` alias, fall back to `model: "opus"`, never lower; nothing here blocks on a model. Lanes, the Fable fan-out budget, and the fallback rule: `references/_scaffolding/conductor-dispatch-protocol.md#model-lanes`.

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor per `references/_scaffolding/conductor-dispatch-protocol.md` -- read that file before the first executor dispatch; it owns the dispatch mechanics, the fan-out doctrine (executor teams scale to natural breadth; the session-model agent caps do not apply to them), the executor prompt contract, and the validation gate. Without ultracode, run the standard architect + accessibility-pass dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Conductor-selected executors (lanes per `references/_scaffolding/conductor-dispatch-protocol.md#model-lanes`: Fable 5.1 for the specialist reviews, design, and UI code changes, Opus 5 @ `xhigh` for recon, evidence collection, and other code, Sonnet 5 @ `xhigh` for non-coding collection) |
|---|---|
| The design itself (information hierarchy, aesthetic decisions, navigation model, animation/haptic choices) and final synthesis -- design is judgment-class and stays with the architect (Fable lane, pinned at dispatch); the accessibility verdict stays with the accessibility-engineer (Stage 2, also the Fable lane) | Component scaffolding from the conductor/architect-approved design spec (one executor per component family); token/asset plumbing; preview-matrix generation (Dynamic Type x color scheme x Reduce Motion) |

Design origination is NOT an executor task -- the `apple-ui-architect` produces the design and the primary SwiftUI. Executors only fan out to scaffold approved component families and generate the preview matrix once the architecture is set, then the conductor and the accessibility pass gate the result.

**Executor scoping (on top of the protocol's prompt contract)**
- Each executor owns one approved component family (non-overlapping) and gets the approved spec inline.
- Reference set: absolute paths of the relevant `references/design/*`, `references/animation/*`, `references/interaction/*` + `references/_scaffolding/version-floor-registry.md`.
- Inline the production-SwiftUI rules (system fonts/semantic colors/44pt/RM double-gate/#available gating/no phantom APIs).
- The `apple-ui-architect` / `accessibility-engineer` are pinned to the Fable lane at dispatch -- design + a11y verdicts are never grunt-executor work.

## No review ledger

`design-ios` generates rather than reviews, so it has no prior run to diff
against and writes no review ledger and no CI artifact. Every reviewing skill
does: `references/review/04-run-artifacts.md#which-skill-writes-what`.

