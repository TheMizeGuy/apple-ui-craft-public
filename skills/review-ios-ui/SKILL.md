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

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor: the session model (Fable 5; Opus 4.8 only under Fable fallback) CONDUCTS, and teams of Sonnet 5 executors at `xhigh` effort do the scoped grunt stages. Without ultracode, run the standard 3-specialist dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Executor teams (Sonnet 5, ALWAYS `effort: xhigh`) |
|---|---|
| Per-dimension verdicts, severity grading, finding dedup across dimensions, final report synthesis | Per-screen evidence sweeps (one executor per screen group): HIG deviations, contrast pairs, touch-target measurements, Dynamic Type breakpoints -- raw evidence tables for the conductor and the 3 specialists to grade |

**Scoping contract -- every executor is scoped via this skill.** Each executor prompt MUST inline:
1. The exact screen/file set it owns (non-overlapping) and the evidence-table format.
2. Absolute paths of the review dimension's reference files + `references/_scaffolding/version-floor-registry.md`.
3. The severity scale (CRITICAL/HIGH/MEDIUM/LOW/NIT) and the 11-row a11y/perf checklist.
4. `BLACKBOARD: <path>` (first token = path) + the escalation rule (2 failed attempts or ambiguity -> `## ESCALATE` + early return).
5. The instruction that executors report evidence, never verdicts -- the conductor and specialists grade.

**Dispatch mechanics**
- `Agent({subagent_type: "general-purpose", model: "sonnet", prompt: <scoped briefing>})`; in Workflow scripts pass `{model: 'sonnet', effort: 'xhigh'}` explicitly.
- The `apple-ui-reviewer` / `animation-haptics-engineer` / `accessibility-engineer` specialists stay `model: fable` -- judgment reviewers, never executors.
- Fan-out budget: <=10 executors per wave, <=20 per turn. Read-only sweeps need no worktree isolation.
- Conductor gate before anything reaches the user: read blackboards, spot-check evidence against the files, re-grade severity. One re-dispatch on failure, then the conductor takes over.
- Never Haiku. Never Sonnet below xhigh. Never a Sonnet verdict.
