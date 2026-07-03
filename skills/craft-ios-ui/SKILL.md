---
name: craft-ios-ui
description: |-
  Comprehensive multi-agent Apple UI improvement. Dispatches craft-team-lead which orchestrates all 5 review specialists (apple-ui-reviewer, animation-haptics-engineer, accessibility-engineer, performance-engineer, platform-engineer) for a full audit -> plan -> apply cycle. The heavy-hitter skill. Use when the user wants the complete treatment: "make this feel like Apple built it", "full UI pass", "craft this to Apple quality", "make this world-class iOS UI". Takes 10-30 minutes depending on project size. Read-only review by default; applies findings only on explicit user approval.
---

# Craft iOS UI

The full Apple UI treatment. 5 specialists review every dimension of your iOS app's user interface and produce a unified improvement plan.

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

The team lead then dispatches all 5 review specialists (leaf specialists ARE safe to dispatch plugin-namespaced only if they never need the Agent tool; the team lead inlines each specialist's body into a `general-purpose` dispatch for uniformity):
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

## When to use this vs. other skills

| Goal | Skill | Agents | Time |
|---|---|---|---|
| Design new UI | `design-ios` | 1-2 | 5-10 min |
| Review visual + a11y | `review-ios-ui` | 3 | 5-15 min |
| Optimize motion + perf | `optimize-ios-ui` | 2 | 5-10 min |
| **The full treatment** | **`craft-ios-ui`** | **5 + lead** | **10-30 min** |

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor: the session model (Fable 5; Opus 4.8 only under Fable fallback) CONDUCTS, and teams of Sonnet 5 executors at `xhigh` effort do the scoped grunt stages. Without ultracode, run the standard dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Executor teams (Sonnet 5, ALWAYS `effort: xhigh`) |
|---|---|
| Scope decision, severity verdicts, finding dedup + conflict resolution, apply/no-apply judgment, final report synthesis, anything security- or accessibility-verdict-shaped | Recon inventory (map screens/views per scope, SwiftUI-vs-UIKit split, deployment target); per-screen evidence collection against each specialist's checklist; post-approval mechanical application of approved findings (worktree-isolated, one screen-set per executor) |

**Scoping contract -- every executor is scoped via this skill.** Each executor prompt MUST inline:
1. The exact file set it owns (non-overlapping) and the deliverable format.
2. Absolute paths of the reference files for its dimension (from the ARCHITECTURE reference<->agent matrix) + `references/_scaffolding/version-floor-registry.md`.
3. The severity scale (CRITICAL/HIGH/MEDIUM/LOW/NIT) and the 11-row a11y/perf checklist when reviewing.
4. `BLACKBOARD: <path>` line (first token = path) + the escalation rule (2 failed attempts or spec ambiguity -> `## ESCALATE` + early return).
5. The instruction that executors report evidence, never verdicts -- the conductor grades.

**Dispatch mechanics**
- Agent tool: `Agent({subagent_type: "general-purpose", model: "sonnet", prompt: <scoped briefing>})` -- session at xhigh means executors inherit xhigh; in Workflow scripts pass `{model: 'sonnet', effort: 'xhigh'}` explicitly.
- Plugin specialist agents (`apple-ui-craft:*`) stay `model: fable` -- they are judgment reviewers, never executors. Sonnet executors are always plain `general-purpose` with the scoped briefing inlined.
- The `craft-team-lead` orchestrator (dispatched as `general-purpose` with its body inlined -- see Dispatch above) runs Phase 1 recon and Phase 2 evidence as Sonnet-xhigh executor teams; the 5 specialist reviews stay `model: fable`; Phase 3-4 merge/report are conductor-only; Phase 5 apply fans out worktree-isolated Sonnet-xhigh executors.
- Fan-out budget: <=10 executors per wave, <=20 per turn. Parallel file WRITES require `isolation: "worktree"`; read-only sweeps do not.
- Validation gate before any executor output reaches the user: conductor reads the blackboard (not the truncated final message), spot-checks claims against the files, re-grades severity. One re-dispatch on failure, then the conductor takes the work over.
- Never Haiku. Never Sonnet below xhigh. Never a Sonnet verdict.
