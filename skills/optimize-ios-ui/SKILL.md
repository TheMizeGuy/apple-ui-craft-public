---
name: optimize-ios-ui
description: |-
  Optimize iOS UI animations, haptics, and rendering performance. Dispatches animation-haptics-engineer (motion tuning + haptic placement) and performance-engineer (body evaluation, scroll, image handling, rendering) in parallel. Merges findings into a unified optimization report. Triggers on "optimize my animations", "improve haptics", "fix scroll jank", "optimize iOS UI performance", "make animations smoother", "add haptics", "tune springs". Also use proactively when a change touches animation, transition, gesture, haptic, or scroll code in an iOS project.
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

## Scope determination

| Arg | Meaning |
|---|---|
| empty / `diff` | Uncommitted + staged changes (default) |
| `staged` | Only staged files |
| `<file>` or `<directory>` | Specific target |
| `all` | Entire project (excluding generated code, Pods, build artifacts) |

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

## Execution mode

Every agent this skill dispatches inherits the session model -- always the strongest available Claude. When the session model is already the strongest tier and the optimization scope is small, the orchestrator may run a specialist's review inline in the main context (foreground) instead of dispatching a separate agent, without weakening the read-only guarantee the reviewer agents carry. Never block on, or call out to, a model that isn't the session model.

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor per `references/_scaffolding/conductor-dispatch-protocol.md` -- read that file before the first executor dispatch; it owns the dispatch mechanics, the fan-out doctrine (executor teams scale to natural breadth; the session-model agent caps do not apply to them), the executor prompt contract, and the validation gate. Without ultracode, run the standard 2-specialist dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Executor teams (Sonnet 5, ALWAYS `effort: xhigh`) |
|---|---|
| Animation/haptic/performance verdicts, spring-parameter judgment, conflict resolution (heavier spring vs hitch), apply/no-apply judgment, final report synthesis | Instrumentation sweeps: body-reevaluation candidates, animation inventory (curve/spring params per site), haptic-trigger inventory, scroll-container census; post-approval mechanical application of approved parameter changes |

**Executor scoping (on top of the protocol's prompt contract)**
- Reference set: absolute paths of `references/animation/*`, `references/interaction/*`, `references/haptics/*`, `references/performance/*` + `references/_scaffolding/version-floor-registry.md`.
- Inline the severity scale and the 11-row a11y/perf gate from `agents/apple-ui-reviewer.md` (rows 1-3 Reduce-Motion gating, row 5 compositor cost, rows 9-10 transition/flash safety -- the motion-relevant rows; sourced from `references/accessibility/05-motion-accessibility.md`, `references/patterns/01-gotchas-anti-patterns.md`, `references/performance/01-swiftui-rendering.md`).
- The `animation-haptics-engineer` / `performance-engineer` specialists stay on the session model -- judgment reviewers, never executors.
