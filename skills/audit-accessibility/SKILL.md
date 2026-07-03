---
name: audit-accessibility
description: |-
  Deep standalone iOS accessibility audit. Dispatches the accessibility-engineer solo for the full treatment: VoiceOver semantics and reading order, Dynamic Type survival through AX5, color contrast, touch targets, Reduce Motion / Reduce Transparency, Switch Control, Voice Control, hearing and cognitive accessibility, WCAG 2.2 mapping. Triggers on "audit my app for accessibility", "accessibility audit", "VoiceOver review", "is my app accessible?", "WCAG check", "a11y pass", "test with Dynamic Type". Use this instead of review-ios-ui when accessibility is the whole ask -- it goes deeper than the 3-specialist review.
---

# Audit Accessibility

## Dispatch

This skill dispatches one specialist, solo, with the full accessibility reference set:

```
apple-ui-craft:accessibility-engineer
   - Scope: all files in the audit scope
   - Must-read: references/accessibility/ (all files), references/design/03 + 04 + 06,
     references/patterns/01 (env-key injectability), references/_scaffolding/version-floor-registry.md
   - Audits: VoiceOver (labels, traits, grouping, custom actions, rotor), Dynamic Type
     (through AX5, reflow at isAccessibilitySize), visual (contrast, Reduce Motion,
     Reduce Transparency, Smart Invert, Dim Flashing Lights), motor (44pt targets,
     Switch Control, Voice Control, drag alternatives), hearing (captions, Live
     Captions, Sound Recognition), cognitive (AssistiveAccess, plain language)
```

Solo dispatch goes deeper than the review-ios-ui a11y lane: the engineer runs the full
11-row a11y/perf checklist per screen, maps every finding to a WCAG 2.2 success
criterion with the correct level (2.5.8 Minimum AA 24px vs 2.5.5 Enhanced AAA 44px --
44pt stays the Apple HIG hard rule), and produces per-setting behavior tables
(what changes under each accessibility setting).

## Scope determination

| Arg | Meaning |
|---|---|
| empty / `diff` | Uncommitted + staged changes (default) |
| `<file>` or `<directory>` | Specific target |
| `all` | Entire project (excluding generated code, Pods, build artifacts) |

## Output

- Accessibility verdict: INCLUSIVE / ADEQUATE / GAPS / EXCLUDING
- Findings by screen, severity-tagged (CRITICAL = exclusion or WCAG A/AA violation)
- Per-finding: WCAG criterion + level, affected assistive technology, concrete SwiftUI rewrite
- Settings matrix: behavior under Reduce Motion, Reduce Transparency, Increase Contrast,
  Bold Text, AX text sizes, VoiceOver, Switch Control
- Top 3 priority actions

All findings are advisory. The user chooses what to apply.

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor: the session model CONDUCTS -- Fable 5 or Opus 4.8, interchangeably (either model drives the workflow identically) -- and teams of Sonnet 5 executors at `xhigh` effort do the scoped grunt stages. Without ultracode, run the standard dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Executor teams (Sonnet 5, ALWAYS `effort: xhigh`) |
|---|---|
| Scope decision, severity verdicts, WCAG-level grading, finding dedup, final report synthesis -- accessibility verdicts are always conductor-class | Per-screen a11y evidence collection against the 11-row checklist; VoiceOver label/trait/order inventory; contrast-pair computation sweeps; Dynamic Type breakpoint capture |

**Scoping contract -- every executor is scoped via this skill.** Each executor prompt MUST inline:
1. The exact file set it owns (non-overlapping) and the deliverable format.
2. Absolute paths of `references/accessibility/` + `references/_scaffolding/version-floor-registry.md`.
3. The severity scale and the 11-row a11y/perf checklist.
4. `BLACKBOARD: <path>` (first token = path) + the escalation rule (2 failed attempts or ambiguity -> `## ESCALATE` + early return).
5. The instruction that executors report evidence, never verdicts -- the conductor grades.

**Dispatch mechanics**
- `Agent({subagent_type: "general-purpose", model: "sonnet", prompt: <scoped briefing>})`; in Workflow scripts pass `{model: 'sonnet', effort: 'xhigh'}` explicitly.
- The `accessibility-engineer` specialist stays `model: fable` -- judgment reviewer, never an executor.
- Fan-out budget: <=10 executors per wave, <=20 per turn. Read-only sweeps need no worktree isolation.
- Conductor gate before anything reaches the user: read blackboards, spot-check evidence against the files, re-grade severity. One re-dispatch on failure, then the conductor takes over.
- Never Haiku. Never Sonnet below xhigh. Never a Sonnet verdict.
