---
name: design-ios
description: |-
  Design new iOS UI from scratch -- a screen, a flow, a component, or a full app interface. Dispatches the apple-ui-architect agent, which maps the user's task flow before any screen exists, states an explicit adaptive contract per component, ships every state rather than only the loaded one, and produces production-grade SwiftUI with Liquid Glass, spring animations, semantic colors, SF Symbols, proper navigation hierarchy, intentional haptic feedback, and accessibility from birth -- then the accessibility-engineer to audit the fresh code before both reports return. Triggers on "design a [screen/flow/component]", "build me a [screen]", "create the UI for", "design the [dashboard/settings/onboarding]", "design an app icon", "make our app icon better" (an icon request produces an Icon Composer-ready layered package). Also use proactively: any new screen, view, or component in an iOS/SwiftUI project starts here, even when the request is just "add a settings page" and never says design.
---

# Design iOS UI

## Dispatch

This skill dispatches agents in two stages:

### Stage 1: Design

Resolve the plugin root first: `${CLAUDE_PLUGIN_ROOT}` is substituted with this plugin's install root when the skill loads (fallback: the parent of this skill's base directory, two levels up from `skills/design-ios/SKILL.md`). Dispatch `apple-ui-craft:apple-ui-architect` with the `PLUGIN ROOT: <root>` and `REFERENCES: <root>/references/` lines (the architect resolves every `references/...` path from them), and:
- The user's design request
- Project context (if a project exists: deployment target, existing navigation, design patterns, color conventions)
- Instruction to read relevant reference files before designing

Gather project context BEFORE dispatching -- the architect designs against these facts, and a dispatch without them produces generic output:

| Fact | Where to find it |
|---|---|
| Deployment target | `IPHONEOS_DEPLOYMENT_TARGET` in `project.pbxproj`, or `platforms:` in `Package.swift` |
| Navigation model | Grep for `NavigationStack` / `NavigationSplitView` / `TabView`; match the dominant one |
| Color + type conventions | `Assets.xcassets` color sets; any DesignSystem/Theme/Tokens file |
| Component conventions | Existing reusable views -- new components copy their API shape |

No project (greenfield): default to an iOS 26 deployment target (the Liquid Glass floor, which reaches iOS 26 and 27 devices) with iOS 27 APIs behind `#available(iOS 27, *)` where they are the better tool, `NavigationStack`, semantic colors only -- and state those assumptions explicitly in the dispatch. A user who names iOS 27 as the target gets the iOS 27 APIs directly, with no fallbacks.

### Stage 2: Accessibility pass
After the architect produces code, dispatch `apple-ui-craft:accessibility-engineer` (with the same `PLUGIN ROOT:` and `REFERENCES:` lines) to audit it. Inline the architect's full Stage 1 SwiftUI output -- or the absolute paths of the files it wrote, when a project exists -- directly into this dispatch prompt: the accessibility-engineer shares no conversation state with Stage 1 and can only Read what it is pointed at. It audits for:
- VoiceOver labels and reading order
- Dynamic Type survival at AX sizes
- Touch target compliance (44x44pt)
- Reduce Motion fallback
- Color contrast

Example Stage 2 prompt (the audit silently reviews nothing without the inlined code -- this handoff is the step most often botched):

```
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

## App icon requests

When the request is the app icon, the architect follows its icon workflow (`references/design/14-app-icons.md`) and delivers a concept, the directions it weighed, a layer inventory, one SVG per layer, an `icon.json`, and an appearance plan -- written into the project as an `.icon` package when a project exists. Skip Stage 2's accessibility pass; verify with the icon checks below instead.

| Check | Pass condition |
|---|---|
| Package complete | Every layer in the inventory has its SVG, and `icon.json` references only files that exist |
| Schema honest | `icon.json` uses only keys `references/design/14-app-icons.md` documents; compiled with `xcrun actool` when Xcode is available, otherwise the `Validation` line says not run |
| Renditions considered | The appearance plan covers light, dark, clear and tinted, and names what changes per appearance |
| Smallest size | The rationale says how the mark reads at the smallest system size and in mono |

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

The session picks the model for each dispatch; the plugin sets no model or effort level. When the design scope is small, produce the design inline in the main context instead of dispatching a separate agent -- without weakening the accessibility-engineer's read-only guarantee in Stage 2. Shared mechanics: `references/_scaffolding/dispatch-protocol.md`.

## Fanning out on a wide scope

A design spanning several component families can be scaffolded in parallel once the architecture is set. Dispatch mechanics: `references/_scaffolding/dispatch-protocol.md`. On an ordinary scope, run the standard architect + accessibility-pass dispatch above unchanged.

**Split of labor**

| Stays with the architect and the session | Fans out well |
|---|---|
| The design itself (information hierarchy, aesthetic decisions, navigation model, animation/haptic choices) and final synthesis; the accessibility verdict stays with the accessibility-engineer in Stage 2 | Component scaffolding from the approved design spec (one agent per component family); token/asset plumbing; preview-matrix generation (Dynamic Type x color scheme x Reduce Motion) |

Design origination does not fan out -- the `apple-ui-architect` produces the design and the primary SwiftUI. Parallel agents only scaffold approved component families and generate the preview matrix once the architecture is set; the session and the accessibility pass then check the result.

**Scoping the fan-out (on top of what the protocol says a prompt carries)**
- Each agent owns one approved component family (non-overlapping) and gets the approved spec inline.
- Reference set: absolute paths of the relevant `references/design/*`, `references/animation/*`, `references/interaction/*` + `references/_scaffolding/version-floor-registry.md`.
- Inline the production-SwiftUI rules (system fonts/semantic colors/44pt/RM double-gate/#available gating/no phantom APIs).

## No review ledger

`design-ios` generates rather than reviews, so it has no prior run to diff
against and writes no review ledger and no CI artifact. Every reviewing skill
does: `references/review/04-run-artifacts.md#which-skill-writes-what`.

