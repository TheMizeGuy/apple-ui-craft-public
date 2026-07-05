---
name: review-ios-ui
description: |-
  Review existing iOS UI code for Apple-native quality. Dispatches 3 specialists in parallel: apple-ui-reviewer (HIG + visual + Liquid Glass), animation-haptics-engineer (motion + tactile), and accessibility-engineer (VoiceOver + Dynamic Type + contrast + motor). Merges findings into a unified report with per-dimension verdicts. Triggers on "review my iOS UI", "check this screen", "does this feel Apple-native?", "audit the UI", "HIG review". Also use proactively after any work that built or modified SwiftUI/UIKit UI: run it on the diff before claiming done, even when nobody asked for a review. When accessibility is the whole ask ("is my app accessible?"), use audit-accessibility instead.
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
- If two specialists' recommendations conflict, present both with the trade-off named -- never silently pick one
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
- Per-dimension verdicts: HIG (APPLE-NATIVE/CLOSE/NEEDS WORK/GENERIC), Animation (FLUID/ADEQUATE/STIFF/BROKEN), Haptics (INTENTIONAL/SPARSE/ABSENT/NOISY), Accessibility (INCLUSIVE/ADEQUATE/GAPS/EXCLUDING) -- animation and haptics are two independent verdicts; report both, never collapse them into one label
- Findings organized by file/screen
- Concrete SwiftUI rewrites for every finding
- Top 3 priority actions

All findings are advisory. The user chooses what to apply.

## Execution mode

Every agent this skill dispatches inherits the session model -- always the strongest available Claude. When the session model is already the strongest tier and the review scope is small, the orchestrator may run a specialist's review inline in the main context (foreground) instead of dispatching a separate agent, without weakening the read-only guarantee the reviewer agents carry. Never block on, or call out to, a model that isn't the session model.

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor per `references/_scaffolding/conductor-dispatch-protocol.md` -- read that file before the first executor dispatch; it owns the dispatch mechanics, the fan-out doctrine (executor teams scale to natural breadth; the session-model agent caps do not apply to them), the executor prompt contract, and the validation gate. Without ultracode, run the standard 3-specialist dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Executor teams (conductor-selected: Sonnet 5 ALWAYS `effort: xhigh`, or Opus 4.8) |
|---|---|
| Per-dimension verdicts, severity grading, finding dedup across dimensions, final report synthesis | Per-screen evidence sweeps (one executor per screen group): HIG deviations, contrast pairs, touch-target measurements, Dynamic Type breakpoints -- raw evidence tables for the conductor and the 3 specialists to grade |

**Executor scoping (on top of the protocol's prompt contract)**
- Each executor owns one screen group (non-overlapping) and gets the evidence-table format inline.
- Reference set: absolute paths of the review dimension's reference files + `references/_scaffolding/version-floor-registry.md`.
- Inline the severity scale (CRITICAL/HIGH/MEDIUM/LOW/NIT) and the 11-row a11y/perf gate from `agents/apple-ui-reviewer.md` (sourced from `references/accessibility/05-motion-accessibility.md`, `references/patterns/01-gotchas-anti-patterns.md`, `references/performance/01-swiftui-rendering.md`).
- The `apple-ui-reviewer` / `animation-haptics-engineer` / `accessibility-engineer` specialists stay on the session model -- judgment reviewers, never executors.
