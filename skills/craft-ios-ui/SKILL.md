---
name: craft-ios-ui
description: |-
  Comprehensive multi-agent Apple UI improvement. Dispatches craft-team-lead which orchestrates all 5 review specialists (apple-ui-reviewer, animation-haptics-engineer, accessibility-engineer, performance-engineer, platform-engineer) for a full audit -> plan -> apply cycle. The heavy-hitter skill. Use when the user wants the complete treatment: "make this feel like Apple built it", "full UI pass", "craft this to Apple quality", "make this world-class iOS UI". Takes 10-30 minutes depending on project size. Read-only review by default; applies findings only on explicit user approval.
---

# Craft iOS UI

The full Apple UI treatment. Five specialists review every dimension of the app's user interface and produce a unified improvement plan.

## Dispatch

This skill dispatches a single orchestrator. **Do NOT dispatch it via the plugin namespace** -- plugin-namespaced dispatch silently strips the `Agent` tool at runtime, so the team lead cannot fan out and the workflow degrades to nothing. Dispatch it like this:

```
Agent({
  subagent_type: "general-purpose",
  prompt: "<full contents of agents/craft-team-lead.md from this plugin's install directory>
           + ABSOLUTE path to this plugin's references/ directory
           + the user's scope (files/screens or whole project)"
})
```

The team lead then dispatches all 5 review specialists. It inlines each specialist's body into a `general-purpose` dispatch because that is the only shape verified to preserve tools -- the same plugin-namespace limitation above makes namespaced sub-dispatch from inside a subagent unreliable (see the RUNTIME DISPATCH NOTE in `agents/craft-team-lead.md`). Inlining is required, not stylistic:
1. `apple-ui-reviewer` -- HIG, Liquid Glass, typography, color, navigation, layout
2. `animation-haptics-engineer` -- motion, springs, haptic design, Reduce Motion
3. `accessibility-engineer` -- VoiceOver, Dynamic Type, contrast, motor, cognitive
4. `performance-engineer` -- body evaluation, scroll, images, rendering, launch
5. `platform-engineer` -- widgets, Live Activities, App Intents, system integration

## Process

1. **Reconnaissance** -- team lead maps the project
2. **Parallel dispatch** -- all 5 review specialists in parallel (within the ≤10/wave fan-out budget)
3. **Merge** -- deduplicate, resolve conflicts, prioritize
4. **Report** -- unified findings organized by screen, with improvement plan
5. **User approval** -- user picks which findings to apply
6. **Apply** -- orchestrator applies approved changes (only with explicit OK)

## Scope

Defaults to the entire project. Can be scoped to specific screens/directories.

## Output

Comprehensive report with:
- Executive summary
- Per-dimension verdicts (visual, animation+haptics, accessibility, performance, platform)
- Findings organized by screen/flow
- Cross-cutting findings
- Platform integration opportunity map
- Prioritized improvement plan
- Praise for well-implemented patterns

## Finding format (worked example)

Every finding in the merged report carries four parts: a severity tag, a `file:line` location, a `references/` citation, and a current -> suggested rewrite in verbatim-applicable SwiftUI. This is what a correct finding looks like:

> **HIGH -- Favorite toggle gives no tactile confirmation** -- `RecipeCard.swift:31-36`
>
> The heart animates visually but fires no haptic, so the action feels weightless -- and the hard-coded `easeInOut` fights the toggle's snap. Pair the state change with `.sensoryFeedback` and let the default spring carry the motion. Reference: `references/haptics/02-swiftui-sensory-feedback.md#toggle`.

```swift
// current
Button { isFavorite.toggle() } label: {
    Image(systemName: isFavorite ? "heart.fill" : "heart")
}
.animation(.easeInOut(duration: 0.3), value: isFavorite)

// suggested
Button { isFavorite.toggle() } label: {
    Image(systemName: isFavorite ? "heart.fill" : "heart")
}
.animation(.spring, value: isFavorite)
.sensoryFeedback(.impact(weight: .light), trigger: isFavorite)
```

A finding missing any of the four parts fails the report gate below -- send it back to the producing specialist, never patch it up silently.

## Report acceptance gate

Check the team lead's merged report against each item before presenting it to the user:

1. All 5 specialists reported -- a blackboard file exists per specialist and is >100 bytes.
2. Every finding carries all four parts of the format above.
3. The verdict table has all 6 rows (5 dimensions + Overall), each with a verdict from that dimension's fixed vocabulary.
4. No finding appears twice -- duplicates flagged by multiple specialists are merged with both credited.
5. The improvement plan is ordered by severity, then effort; every plan item names the finding(s) it addresses.
6. Praise section present (empty is acceptable only for a genuinely weak codebase -- say so).

One failed item -> one re-dispatch to the offending agent with the concrete gap named; a second failure -> fix the report directly and note the correction.

## When to use this vs. other skills

| Goal | Skill | Agents | Time |
|---|---|---|---|
| Design new UI | `design-ios` | 2 | 5-10 min |
| Review visual + motion + a11y | `review-ios-ui` | 3 | 5-15 min |
| Optimize motion + perf | `optimize-ios-ui` | 2 | 5-10 min |
| Deep accessibility-only audit | `audit-accessibility` | 1 | 5-10 min |
| System-integration audit | `integrate-platform` | 1 | 5-10 min |
| **The full treatment** | **`craft-ios-ui`** | **5 + lead** | **10-30 min** |

## Execution mode

Every agent this skill dispatches -- the orchestrator and its 5 specialists -- inherits the session model, always the strongest available Claude. When the session model is already the strongest tier and the review scope is small, the orchestrator may run a specialist's review inline in the main context (foreground) instead of dispatching a separate agent, without weakening the read-only guarantee the reviewer agents carry. Never block on, or call out to, a model that isn't the session model.

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor per `references/_scaffolding/conductor-dispatch-protocol.md` -- read that file before the first executor dispatch; it owns the dispatch mechanics, the fan-out doctrine (executor teams scale to natural breadth; the session-model agent caps do not apply to them), the executor prompt contract, and the validation gate. Without ultracode, run the standard dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Executor teams (conductor-selected: Sonnet 5 ALWAYS `effort: xhigh`, or Opus 4.8) |
|---|---|
| Scope decision, severity verdicts, finding dedup + conflict resolution, apply/no-apply judgment, final report synthesis, anything security- or accessibility-verdict-shaped | Recon inventory (map screens/views per scope, SwiftUI-vs-UIKit split, deployment target); per-screen evidence collection against each specialist's checklist; post-approval mechanical application of approved findings (worktree-isolated, one screen-set per executor) |

**Executor scoping (on top of the protocol's prompt contract)**
- Reference set per dimension from the ARCHITECTURE reference<->agent matrix + `references/_scaffolding/version-floor-registry.md`.
- When reviewing motion, translucency, or custom controls, inline the severity scale (CRITICAL/HIGH/MEDIUM/LOW/NIT) and the 11-row a11y/perf gate from `agents/apple-ui-reviewer.md` (sourced from `references/accessibility/05-motion-accessibility.md`, `references/patterns/01-gotchas-anti-patterns.md`, `references/performance/01-swiftui-rendering.md`).
- Stage-tier map for the `craft-team-lead` orchestrator (dispatched as `general-purpose` with its body inlined -- see Dispatch above): Phase 1 recon and Phase 2 evidence collection run as conductor-selected executor teams (Sonnet-xhigh or Opus 4.8); the 5 specialist reviews stay on the session model; merge and report (Process steps 3-4) are conductor-only; the apply step (Process step 6, after user approval in step 5) fans out worktree-isolated Sonnet-xhigh executors.
