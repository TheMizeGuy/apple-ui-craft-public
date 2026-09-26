---
name: optimize-ios-ui
description: |-
  Optimize iOS UI animations, haptics, and rendering performance. Dispatches animation-haptics-engineer (motion tuning + haptic placement) and performance-engineer (body evaluation, scroll, image handling, rendering) in parallel. Merges findings into a unified optimization report. Triggers on "optimize my animations", "improve haptics", "fix scroll jank", "optimize iOS UI performance", "make animations smoother", "add haptics", "tune springs". Also use proactively when a change touches animation, transition, gesture, haptic, or scroll code in an iOS project.
---

# Optimize iOS UI

## Dispatch

This skill dispatches 2 specialist agents in parallel. Resolve the plugin root first: `${CLAUDE_PLUGIN_ROOT}` is substituted with this plugin's install root when the skill loads (fallback: the parent of this skill's base directory, two levels up from `skills/optimize-ios-ui/SKILL.md`). Every dispatch carries `PLUGIN ROOT: <root>` and `REFERENCES: <root>/references/` so the specialist can resolve every `references/...` path it is told to read -- without those lines it reviews from memory and says so.

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
- Animation verdict (FLUID / ADEQUATE / STIFF / BROKEN / NOT ASSESSED)
- Haptic verdict (INTENTIONAL / SPARSE / ABSENT / NOISY / NOT ASSESSED)
- Performance verdict (SMOOTH / ADEQUATE / JANKY / BROKEN / NOT ASSESSED)
- The evidence mode, and whether Instruments actually ran. Every performance finding carries an `Impact:` line with a metric and a delta, labelled measured or estimated -- an unmeasured performance claim sends someone optimising the wrong thing (`references/review/02-evidence-pipeline.md`)
- Findings in the canonical format (`references/review/01-finding-format.md`); feel cannot be judged from a screenshot, so in Screenshots mode the animation and haptic verdicts are NOT ASSESSED
- Haptic coverage map (every interaction surface mapped to recommended haptic)
- Spring parameter recommendations (exact values)
- Performance fixes (concrete rewrites)
- Top 3 priority actions

## Execution mode

The session picks the model for each dispatch; the plugin sets no model or effort level. When the optimization scope is small, run a specialist's review inline in the main context instead of dispatching a separate agent -- without weakening the read-only guarantee the reviewer agents carry. Shared mechanics: `references/_scaffolding/dispatch-protocol.md`.


## Review ledger (write it, without asking)

At the end of every run, write `.claude/apple-ui-craft/last-review.json` in the
REVIEWED repo, and read any existing one first to produce a delta report (NEW /
RESOLVED / STILL OPEN / REGRESSED / IMPROVED). Schema, matching rules, and the
two fields that stop a narrow run from erasing a wide one (`dimensions` and
`notAssessed`): `references/review/04-run-artifacts.md#review-ledger-schema-v1`.

A missing or unreadable ledger is an empty prior run, never an error. A ledger
from a different scope is not a prior run for this scope.

## Fanning out on a wide scope

A codebase-wide motion and performance sweep splits into inventory and judgment. Dispatch mechanics: `references/_scaffolding/dispatch-protocol.md`. On an ordinary scope, run the standard 2-specialist dispatch above unchanged.

**Split of labor**

| Needs the whole scope in view | Fans out well |
|---|---|
| Animation/haptic/performance verdicts, spring-parameter judgment, conflict resolution (heavier spring vs hitch), apply/no-apply judgment, final report synthesis | Instrumentation sweeps: body-reevaluation candidates, animation inventory (curve/spring params per site), haptic-trigger inventory, scroll-container census; post-approval mechanical application of approved parameter changes |

**Scoping the sweep (on top of what the protocol says a prompt carries)**
- Reference set: absolute paths of `references/animation/*`, `references/interaction/*`, `references/haptics/*`, `references/performance/*` + `references/_scaffolding/version-floor-registry.md`.
- Inline the severity scale and the 11-row a11y/perf gate from `agents/apple-ui-reviewer.md` (rows 1-3 Reduce-Motion gating, row 5 compositor cost, rows 9-10 transition/flash safety -- the motion-relevant rows; sourced from `references/accessibility/05-motion-accessibility.md`, `references/patterns/01-gotchas-anti-patterns.md`, `references/performance/01-swiftui-rendering.md`).
- A sweep returns an inventory. The `animation-haptics-engineer` and `performance-engineer` form the verdicts.
