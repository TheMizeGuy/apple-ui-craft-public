---
name: review-ios-ui
description: |-
  Review existing iOS UI code for Apple-native quality. Dispatches 3 specialists in parallel: apple-ui-reviewer (HIG + visual + Liquid Glass + window economy + task flow + information architecture + error recovery + adaptive layout), animation-haptics-engineer (motion + tactile), and accessibility-engineer (VoiceOver + Dynamic Type + contrast + motor). Merges findings into a unified report with per-dimension verdicts. Triggers on "review my iOS UI", "check this screen", "does this feel Apple-native?", "audit the UI", "HIG review", "can a user actually finish this flow?", "why does my iPad build waste the screen?", "it breaks at large text sizes". Also use proactively after any work that built or modified SwiftUI/UIKit UI: run it on the diff before claiming done, even when nobody asked for a review. When accessibility is the whole ask ("is my app accessible?"), use audit-accessibility instead.
---

# Review iOS UI

## Dispatch

This skill dispatches 3 specialist agents in parallel. Resolve the plugin root first: `${CLAUDE_PLUGIN_ROOT}` is substituted with this plugin's install root when the skill loads (fallback: the parent of this skill's base directory, two levels up from `skills/review-ios-ui/SKILL.md`). Every dispatch carries `PLUGIN ROOT: <root>` and `REFERENCES: <root>/references/` so the specialist can resolve every `references/...` path it is told to read -- without those lines it reviews from memory and says so.

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
- Validate the format first: every finding uses the field names and dimension
  strings in `references/review/01-finding-format.md`. Dedup and the verdict
  table both key on `<Dimension>`, so a paraphrased dimension becomes an orphan
  with no verdict row. Re-dispatch a non-conforming specialist rather than
  repairing its output by hand
- Deduplicate (e.g., touch targets flagged by both accessibility and UI reviewer)
- Order by severity (CRITICAL -> HIGH -> MEDIUM -> LOW -> NIT)
- Group by screen/file
- If two specialists' recommendations conflict, present both with the trade-off named -- never silently pick one
- Present unified report with per-dimension verdicts

**Carry NOT ASSESSED through unchanged.** `apple-ui-reviewer` covers four
dimensions that need a sequence, a configuration change, or a measurement (task
flow, information architecture, error recovery, adaptive layout). When the
evidence mode could not show them it returns NOT ASSESSED, and that value belongs
in the report verbatim. Promoting it to a clean verdict during the merge turns an
honest gap into a false assurance on exactly the class the evidence could not
cover.

## Scope determination

| Arg | Meaning |
|---|---|
| empty / `diff` | Uncommitted + staged changes (default) |
| `staged` | Only staged files |
| `<file>` or `<directory>` | Specific target |
| `all` | Entire project (excluding generated code, Pods, build artifacts) |

## Output

Unified report with:
- The evidence mode and the coverage it produced (screens reached, states forced, configurations exercised) as the first line -- it bounds every verdict below it
- Per-dimension verdicts: HIG (APPLE-NATIVE/CLOSE/NEEDS WORK/GENERIC), Density and economy (EARNED/ACCEPTABLE/WASTEFUL/STRETCHED-PHONE), Usability and flow (COMPLETABLE/WORKABLE/OBSTRUCTED/BROKEN/NOT ASSESSED), Adaptive layout (ROBUST/ADEQUATE/FRAGILE/BROKEN/NOT ASSESSED), Animation (FLUID/ADEQUATE/STIFF/BROKEN/NOT ASSESSED), Haptics (INTENTIONAL/SPARSE/ABSENT/NOISY/NOT ASSESSED), Accessibility (INCLUSIVE/ADEQUATE/GAPS/EXCLUDING/NOT ASSESSED) -- animation and haptics are two independent verdicts; report both, never collapse them into one label; NOT ASSESSED on any of the three when the evidence mode could not reach it
- Findings organized by file/screen
- Concrete SwiftUI rewrites for every finding
- Top 3 priority actions

All findings are advisory. The user chooses what to apply.

## Execution mode

Dispatch on the model the session chooses (Opus 5 is the usual default for design, review and implementation); never pin `model:` or `effort:`. When the review scope is small, run a specialist's review inline in the main context instead of dispatching a separate agent -- without weakening the read-only guarantee the reviewer agents carry. Shared mechanics: `references/_scaffolding/conductor-dispatch-protocol.md#dispatch-policy`.


## Review ledger (write it, without asking)

At the end of every run, write `.claude/apple-ui-craft/last-review.json` in the
REVIEWED repo, and read any existing one first to produce a delta report (NEW /
RESOLVED / STILL OPEN / REGRESSED / IMPROVED). Schema, matching rules, and the
two fields that stop a narrow run from erasing a wide one (`dimensions` and
`notAssessed`): `references/review/04-run-artifacts.md#review-ledger-schema-v1`.

A missing or unreadable ledger is an empty prior run, never an error. A ledger
from a different scope is not a prior run for this scope.

## Fanning out on a wide scope

A scope too wide for one pass per dimension splits into an evidence sweep and a grading pass. Dispatch mechanics: `references/_scaffolding/conductor-dispatch-protocol.md`. On an ordinary scope, run the standard 3-specialist dispatch above unchanged.

**Split of labor**

| Stays with the session | Fans out well |
|---|---|
| Per-dimension verdicts, severity grading, finding dedup across dimensions, final report synthesis | Per-screen evidence sweeps (one agent per screen group): HIG deviations, contrast pairs, touch-target measurements, Dynamic Type breakpoints -- raw evidence tables for the session and the 3 specialists to grade |

**Scoping the sweep (on top of what the protocol says a prompt carries)**
- Each agent owns one screen group (non-overlapping) and gets the evidence-table format inline.
- Reference set: absolute paths of the review dimension's reference files + `references/_scaffolding/version-floor-registry.md`.
- Inline the severity scale (CRITICAL/HIGH/MEDIUM/LOW/NIT) and the 11-row a11y/perf gate from `agents/apple-ui-reviewer.md` (sourced from `references/accessibility/05-motion-accessibility.md`, `references/patterns/01-gotchas-anti-patterns.md`, `references/performance/01-swiftui-rendering.md`).
- An evidence sweep returns evidence. The verdict is the specialist's and the severity is the session's.
