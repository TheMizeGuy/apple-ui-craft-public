---
name: optimize-ios-ui
description: |-
  Optimize iOS UI animations, haptics, and rendering performance. Dispatches animation-haptics-engineer (motion tuning + haptic placement) and performance-engineer (body evaluation, scroll, image handling, rendering) in parallel. Merges findings into a unified optimization report. Triggers on "optimize my animations", "improve haptics", "fix scroll jank", "optimize iOS UI performance", "make animations smoother", "add haptics", "tune springs".
---

# Optimize iOS UI

## Dispatch

This skill dispatches 2 specialist agents in parallel:

```
1. apple-ui-craft:animation-haptics-engineer
   - Scope: all files in the optimization scope
   - Reviews: spring parameters, animation timing, haptic coverage, Reduce Motion
   - Focus: FEEL -- do animations communicate? Are haptics intentional?

2. apple-ui-craft:performance-engineer
   - Scope: same files
   - Reviews: body evaluation, lazy loading, image handling, rendering, scroll, animation frame rate
   - Focus: SMOOTHNESS -- 60fps sustained, no hitches, efficient rendering
```

After both complete, merge findings:
- Cross-reference: if animation-haptics-engineer suggests a heavier spring that performance-engineer flags as causing hitches, note the conflict and suggest a compromise
- Order by impact (most noticeable improvement first)
- Group by screen/flow

## When to use this vs. review-ios-ui

| Goal | Skill |
|---|---|
| "Does this look/feel Apple-native?" | `review-ios-ui` (visual design + a11y) |
| "Make animations smoother and add haptics" | `optimize-ios-ui` (motion + performance) |
| "The full treatment" | `craft-ios-ui` (all specialists) |

## Output

Unified report with:
- Animation verdict (FLUID / ADEQUATE / STIFF / BROKEN)
- Haptic verdict (INTENTIONAL / SPARSE / ABSENT / NOISY)
- Performance verdict (SMOOTH / ADEQUATE / JANKY / BROKEN)
- Haptic coverage map (every interaction surface mapped to recommended haptic)
- Spring parameter recommendations (exact values)
- Performance fixes (concrete rewrites)
- Top 3 priority actions

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor: the session model (Fable 5; Opus 4.8 only under Fable fallback) CONDUCTS, and teams of Sonnet 5 executors at `xhigh` effort do the scoped grunt stages. Without ultracode, run the standard 2-specialist dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Executor teams (Sonnet 5, ALWAYS `effort: xhigh`) |
|---|---|
| Animation/haptic/performance verdicts, spring-parameter judgment, conflict resolution (heavier spring vs hitch), apply/no-apply judgment, final report synthesis | Instrumentation sweeps: body-reevaluation candidates, animation inventory (curve/spring params per site), haptic-trigger inventory, scroll-container census; post-approval mechanical application of approved parameter changes |

**Scoping contract -- every executor is scoped via this skill.** Each executor prompt MUST inline:
1. The exact file set it owns (non-overlapping) and the inventory/deliverable format.
2. Absolute paths of `references/animation/*`, `references/interaction/*`, `references/haptics/*`, `references/performance/*` + `references/_scaffolding/version-floor-registry.md`.
3. The severity scale and the 11-row a11y/perf checklist (rows 1-5 are the motion-safety core).
4. `BLACKBOARD: <path>` (first token = path) + the escalation rule (2 failed attempts or ambiguity -> `## ESCALATE` + early return).
5. The instruction that executors report evidence/inventory, never verdicts -- the conductor grades.

**Dispatch mechanics**
- `Agent({subagent_type: "general-purpose", model: "sonnet", prompt: <scoped briefing>})`; in Workflow scripts pass `{model: 'sonnet', effort: 'xhigh'}` explicitly.
- The `animation-haptics-engineer` / `performance-engineer` specialists stay `model: fable` -- judgment reviewers, never executors.
- Fan-out budget: <=10 executors per wave, <=20 per turn. Application executors writing files in parallel use `isolation: "worktree"`.
- Conductor gate before anything reaches the user: read blackboards, spot-check against the files, re-grade. One re-dispatch on failure, then the conductor takes over.
- Never Haiku. Never Sonnet below xhigh. Never a Sonnet verdict.
