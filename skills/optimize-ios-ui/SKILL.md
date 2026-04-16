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
