---
name: review-ios-ui
description: |-
  Review existing iOS UI code for Apple-native quality. Dispatches 3 specialists in parallel: apple-ui-reviewer (HIG + visual + Liquid Glass), animation-haptics-engineer (motion + tactile), and accessibility-engineer (VoiceOver + Dynamic Type + contrast + motor). Merges findings into a unified report with per-dimension verdicts. Triggers on "review my iOS UI", "check this screen", "does this feel Apple-native?", "audit the UI", "HIG review", "is this accessible?".
---

# Review iOS UI

## Dispatch

This skill dispatches 3 specialist agents in parallel:

```
1. apple-ui-craft:apple-ui-reviewer
   - Scope: all files in the review scope
   - Reviews: HIG, Liquid Glass, typography, color, SF Symbols, navigation, layout, micro-interactions

2. apple-ui-craft:animation-haptics-engineer
   - Scope: same files
   - Reviews: spring parameters, animation purpose, haptic placement, Reduce Motion

3. apple-ui-craft:accessibility-engineer
   - Scope: same files
   - Reviews: VoiceOver, Dynamic Type, contrast, touch targets, motor accessibility
```

After all 3 complete, merge findings:
- Deduplicate (e.g., touch targets flagged by both accessibility and UI reviewer)
- Order by severity (CRITICAL -> HIGH -> MEDIUM -> LOW -> NIT)
- Group by screen/file
- Present unified report with per-dimension verdicts

## Scope determination

| Arg | Meaning |
|---|---|
| empty / `diff` | Uncommitted + staged changes (default) |
| `staged` | Only staged files |
| `<file>` or `<directory>` | Specific target |
| `all` | Entire project (excluding generated code, Pods, build artifacts) |

## Output

Unified report with:
- Per-dimension verdict (HIG, Animation+Haptics, Accessibility)
- Findings organized by file/screen
- Concrete SwiftUI rewrites for every finding
- Top 3 priority actions

All findings are advisory. The user chooses what to apply.
