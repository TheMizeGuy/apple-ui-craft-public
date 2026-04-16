---
name: craft-ios-ui
description: |-
  Comprehensive multi-agent Apple UI improvement. Dispatches craft-team-lead which orchestrates all 5 review specialists (apple-ui-reviewer, animation-haptics-engineer, accessibility-engineer, performance-engineer, platform-engineer) for a full audit -> plan -> apply cycle. The heavy-hitter skill. Use when the user wants the complete treatment: "make this feel like Apple built it", "full UI pass", "craft this to Apple quality", "make this world-class iOS UI". Takes 10-30 minutes depending on project size. Read-only review by default; applies findings only on explicit user approval.
---

# Craft iOS UI

The full Apple UI treatment. 5 specialists review every dimension of your iOS app's user interface and produce a unified improvement plan.

## Dispatch

This skill dispatches a single orchestrator agent:

```
apple-ui-craft:craft-team-lead
```

The team lead then dispatches all 5 review specialists:
1. `apple-ui-reviewer` -- HIG, Liquid Glass, typography, color, navigation, layout
2. `animation-haptics-engineer` -- motion, springs, haptic design, Reduce Motion
3. `accessibility-engineer` -- VoiceOver, Dynamic Type, contrast, motor, cognitive
4. `performance-engineer` -- body evaluation, scroll, images, rendering, launch
5. `platform-engineer` -- widgets, Live Activities, App Intents, system integration

## Process

1. **Reconnaissance** -- team lead maps the project
2. **Parallel dispatch** -- up to 4 specialists at once (Max plan limit)
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
| **The full treatment** | **`craft-ios-ui`** | **6** | **10-30 min** |
