---
name: craft-ios-ui
description: |-
  Comprehensive multi-agent Apple UI improvement. Dispatches craft-team-lead which orchestrates all 5 review specialists (apple-ui-reviewer, animation-haptics-engineer, accessibility-engineer, performance-engineer, platform-engineer) for a full audit -> plan -> apply cycle. The heavy-hitter skill. Use when the user wants the complete treatment: "make this feel like Apple built it", "full UI pass", "craft this to Apple quality", "make this world-class iOS UI". Takes 10-30 minutes depending on project size. Read-only review by default; applies findings only on explicit user approval.
---

# Craft iOS UI

The full Apple UI treatment. Five specialists review every dimension of the app's user interface and produce a unified improvement plan.

## Dispatch

This skill dispatches a single orchestrator. **Do NOT dispatch it via the plugin namespace** -- plugin-namespaced dispatch silently strips the `Agent` tool at runtime, so the team lead cannot fan out and the workflow degrades to nothing.

Resolve the plugin root first: `${CLAUDE_PLUGIN_ROOT}` is substituted with this plugin's install root when the skill loads (fallback: the parent of this skill's base directory, two levels up from `skills/craft-ios-ui/SKILL.md`). Every agent body and every `references/...` path the team lead and its specialists read resolves against that root, so pass it explicitly. Then dispatch:

```
Agent({
  subagent_type: "general-purpose",
  model: "fable",
  prompt: "FABLE-ESCALATION: ui-ux-frontend -- Apple UI craft review orchestration
           PLUGIN ROOT: <plugin root>
           REFERENCES: <plugin root>/references/
           <full contents of <plugin root>/agents/craft-team-lead.md>
           SCOPE: <the user's scope: files/screens or whole project>"
})
```

The team lead then dispatches all 5 review specialists, each in the Fable lane (`model: "fable"` + the attestation line). It inlines each specialist's body into a `general-purpose` dispatch because that is the only shape verified to preserve tools -- the same plugin-namespace limitation above makes namespaced sub-dispatch from inside a subagent unreliable (see the RUNTIME DISPATCH NOTE in `agents/craft-team-lead.md`). Inlining is required, not stylistic:
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
- The evidence mode and coverage as the report's first line -- it bounds every verdict below it
- Per-dimension verdicts (visual, density and economy, usability and flow, adaptive layout, animation+haptics, accessibility, performance, platform)
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
3. The verdict table has all 10 rows (visual design, density and economy, usability and flow, adaptive layout, animation, haptics, accessibility, performance, platform integration, Overall), each with a verdict from that dimension's fixed vocabulary. Animation and haptics are two rows because they are two verdicts with two vocabularies. `NOT ASSESSED` is a legal value on the six evidence-bounded rows (usability and flow, adaptive layout, animation, haptics, accessibility, performance) and is carried through from the specialist unchanged -- never promoted to a clean verdict during synthesis.
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

The session model conducts. The `craft-team-lead` orchestrator and its 5 specialist reviews run in the Fable lane: `model: "fable"` (Fable 5.1) at dispatch plus the prompt line `FABLE-ESCALATION: ui-ux-frontend -- <one-line reason>` (owner directive 2026-09-01; supersedes the Opus 5 pin of 2026-07-24). UI/UX judgment is never run inline in a deep session and never downgraded to an executor-class model. If your harness has no `fable` alias, fall back to `model: "opus"`, never lower; nothing here blocks on a model. Lanes, the Fable fan-out budget, and the fallback rule: `references/_scaffolding/conductor-dispatch-protocol.md#model-lanes`.


## Review ledger (write it, without asking)

At the end of every run, write `.claude/apple-ui-craft/last-review.json` in the
REVIEWED repo, and read any existing one first to produce a delta report (NEW /
RESOLVED / STILL OPEN / REGRESSED / IMPROVED). Schema, matching rules, and the
two fields that stop a narrow run from erasing a wide one (`dimensions` and
`notAssessed`): `references/review/04-run-artifacts.md#review-ledger-schema-v1`.

A missing or unreadable ledger is an empty prior run, never an error. A ledger
from a different scope is not a prior run for this scope.

## CI verdict artifact (on request only)

`craft-ios-ui` is the ONLY skill that may write the CI artifact, because it is
the only one that runs every specialist and can therefore fill the required
verdict set honestly. Write it when the user asks for it, to
`.claude/apple-ui-craft-artifacts/<short-sha>.json`, bound to the last commit
that touched a UI-adjacent path and NOT to HEAD.

Never pad an artifact with invented verdicts to satisfy the schema. A dimension
the evidence could not reach is `NOT_ASSESSED`, which fails the gate on purpose.
Contract: `references/review/04-run-artifacts.md#ci-verdict-artifact-schema-v1`;
adoption guide: `ci/README.md`.

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor per `references/_scaffolding/conductor-dispatch-protocol.md` -- read that file before the first executor dispatch; it owns the dispatch mechanics, the fan-out doctrine (executor teams scale to natural breadth; the session-model agent caps do not apply to them), the executor prompt contract, and the validation gate. Without ultracode, run the standard dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Conductor-selected executors (lanes per `references/_scaffolding/conductor-dispatch-protocol.md#model-lanes`: Fable 5.1 for the specialist reviews, design, and UI code changes, Opus 5 @ `xhigh` for recon, evidence collection, and other code, Sonnet 5 @ `xhigh` for non-coding collection) |
|---|---|
| Scope decision, severity verdicts, finding dedup + conflict resolution, apply/no-apply judgment, final report synthesis, anything security- or accessibility-verdict-shaped | Recon inventory (map screens/views per scope, SwiftUI-vs-UIKit split, deployment target); per-screen evidence collection against each specialist's checklist; post-approval mechanical application of approved findings (worktree-isolated, one screen-set per executor) |

**Executor scoping (on top of the protocol's prompt contract)**
- Reference set per dimension from the ARCHITECTURE reference<->agent matrix + `references/_scaffolding/version-floor-registry.md`.
- When reviewing motion, translucency, or custom controls, inline the severity scale (CRITICAL/HIGH/MEDIUM/LOW/NIT) and the 11-row a11y/perf gate from `agents/apple-ui-reviewer.md` (sourced from `references/accessibility/05-motion-accessibility.md`, `references/patterns/01-gotchas-anti-patterns.md`, `references/performance/01-swiftui-rendering.md`).
- Stage-tier map for the `craft-team-lead` orchestrator (dispatched as `general-purpose` with its body inlined -- see Dispatch above): Phase 1 recon and Phase 2 evidence collection run on Opus-lane or Sonnet-lane executors; the 5 specialist reviews are pinned to the Fable lane at dispatch; merge and report (Process steps 3-4) are conductor-only; the apply step (Process step 6, after user approval in step 5) fans out worktree-isolated Fable-lane executors.
