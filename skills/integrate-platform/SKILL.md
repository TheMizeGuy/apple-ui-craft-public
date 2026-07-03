---
name: integrate-platform
description: |-
  Deepen an iOS app's system integration. Dispatches the platform-engineer solo to audit existing integration and map what's missing: widgets, Live Activities, Dynamic Island, Control Center controls, App Intents, Siri and Apple Intelligence schemas, Spotlight, Quick Actions, StandBy, context menus, drag and drop, TipKit, keyboard shortcuts, plus cross-platform reach (iPadOS, watchOS, tvOS, macOS/Catalyst, visionOS, CarPlay). Triggers on "make my app feel more native beyond the UI", "add widgets", "should I build a Live Activity?", "App Intents audit", "platform integration", "system integration opportunities", "bring my app to [watch/Vision Pro/CarPlay]".
---

# Integrate Platform

## Dispatch

This skill dispatches one specialist, solo, with the full platform + cross-platform reference set:

```
apple-ui-craft:platform-engineer
   - Scope: entire project (integration is app-level, not per-file)
   - Must-read: references/platform/ (all files), references/cross-platform/ (all files),
     references/design/07 (navigation), references/_scaffolding/version-floor-registry.md
   - Audits: existing intents, widgets, activities, controls, extensions, entitlements
   - Maps: every untapped surface, ranked by user value vs build cost
```

## Process

1. **Census** -- inventory what the app already ships (extensions, Info.plist declarations,
   App Intents, widget bundles, activity types).
2. **Opportunity map** -- for each system surface the app does NOT use, state what it would
   do for THIS app specifically (not generic advice), with the required API family and floor.
3. **Ranked plan** -- order by user-visible value; each item names the reference file that
   specifies the implementation.

## Output

- Integration verdict: DEEPLY INTEGRATED / SURFACE-LEVEL / UNTAPPED
- Existing-surface audit (what ships today, with correctness findings, severity-tagged)
- Opportunity map (surface -> what it does for this app -> APIs + floor -> effort)
- Cross-platform reach assessment (which platforms this app should exist on, and why)
- Top 3 priority integrations

All findings are advisory. The user chooses what to build.

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor: the session model CONDUCTS -- Fable 5 or Opus 4.8, interchangeably (either model drives the workflow identically) -- and teams of Sonnet 5 executors at `xhigh` effort do the scoped grunt stages. Without ultracode, run the standard dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Executor teams (Sonnet 5, ALWAYS `effort: xhigh`) |
|---|---|
| Opportunity ranking, value-vs-cost judgment, integration plan synthesis, anything entitlement- or privacy-adjacent | Surface census (existing intents, widgets, activities, extensions, plist declarations); per-surface boilerplate scaffolding from the conductor-approved integration plan |

**Scoping contract -- every executor is scoped via this skill.** Each executor prompt MUST inline:
1. The exact surface set it owns (non-overlapping) and the deliverable format.
2. Absolute paths of `references/platform/` + `references/cross-platform/` + `references/_scaffolding/version-floor-registry.md`.
3. `BLACKBOARD: <path>` (first token = path) + the escalation rule (2 failed attempts or ambiguity -> `## ESCALATE` + early return).
4. The instruction that executors report evidence and scaffolds, never rankings -- the conductor ranks.

**Dispatch mechanics**
- `Agent({subagent_type: "general-purpose", model: "sonnet", prompt: <scoped briefing>})`; in Workflow scripts pass `{model: 'sonnet', effort: 'xhigh'}` explicitly.
- The `platform-engineer` specialist stays `model: fable` -- judgment reviewer, never an executor.
- Fan-out budget: <=10 executors per wave, <=20 per turn. Scaffolding executors writing files in parallel use `isolation: "worktree"`.
- Conductor gate before anything reaches the user: read blackboards, spot-check claims against the project, re-grade. One re-dispatch on failure, then the conductor takes over.
- Never Haiku. Never Sonnet below xhigh. Never a Sonnet verdict.
