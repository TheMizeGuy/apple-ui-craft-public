---
name: integrate-platform
description: |-
  Deepen an iOS app's system integration. Dispatches the platform-engineer solo to audit existing integration and map what's missing: widgets, Live Activities, Dynamic Island, Control Center controls, App Intents, Siri and Apple Intelligence schemas, Spotlight, Quick Actions, StandBy, context menus, drag and drop, TipKit, keyboard shortcuts, Maps, WebView, App Clips, app extensions, plus cross-platform reach (iPadOS, watchOS, tvOS, macOS/Catalyst, visionOS, CarPlay). Triggers on "make my app feel more native beyond the UI", "add widgets", "should I build a Live Activity?", "App Intents audit", "platform integration", "system integration opportunities", "bring my app to [watch/Vision Pro/CarPlay]".
---

# Integrate Platform

## Dispatch

This skill dispatches one specialist, solo, with the full platform + cross-platform reference set. Resolve the plugin root first: `${CLAUDE_PLUGIN_ROOT}` is substituted with this plugin's install root when the skill loads (fallback: the parent of this skill's base directory, two levels up from `skills/integrate-platform/SKILL.md`). Every dispatch pins `model: "fable"`, opens its prompt with `FABLE-ESCALATION: ui-ux-frontend -- <specialist> review of <scope>`, and carries `PLUGIN ROOT: <root>` and `REFERENCES: <root>/references/` so the specialist can resolve every `references/...` path it is told to read -- without those lines it reviews from memory and says so.

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

- Integration verdict: DEEPLY INTEGRATED / SURFACE-LEVEL / UNTAPPED / NOT APPLICABLE
- Findings in the canonical format (`references/review/01-finding-format.md`), each carrying its `Platform:` and `Availability:` lines. A MISSING integration is a recommendation, never a defect -- an app without a widget is not broken. HIGH is reserved for integration that exists and is wrong
- Where an integration is an ENTRY POINT, its correctness is a flow question: does the widget, Siri phrase, or Spotlight result land somewhere coherent when signed out or when the entity was deleted? (`references/usability/01-task-flows-and-journeys.md#1-name-the-task-before-reviewing-anything`)
- Existing-surface audit (what ships today, with correctness findings, severity-tagged)
- Opportunity map (surface -> what it does for this app -> APIs + floor -> effort)
- Cross-platform reach assessment (which platforms this app should exist on, and why)
- Top 3 priority integrations

All findings are advisory. The user chooses what to build.

## Execution mode

Every agent this skill dispatches runs in the Fable lane: `model: "fable"` (Fable 5.1) at dispatch plus the prompt line `FABLE-ESCALATION: ui-ux-frontend -- <one-line reason>` (owner directive 2026-09-01; supersedes the Opus 5 pin of 2026-07-24); the session conductor stays orchestrator-only. UI/UX judgment is never run inline in a deep session and never downgraded to an executor-class model. If your harness has no `fable` alias, fall back to `model: "opus"`, never lower; nothing here blocks on a model. Lanes, the Fable fan-out budget, and the fallback rule: `references/_scaffolding/conductor-dispatch-protocol.md#model-lanes`.


## Review ledger (write it, without asking)

At the end of every run, write `.claude/apple-ui-craft/last-review.json` in the
REVIEWED repo, and read any existing one first to produce a delta report (NEW /
RESOLVED / STILL OPEN / REGRESSED / IMPROVED). Schema, matching rules, and the
two fields that stop a narrow run from erasing a wide one (`dimensions` and
`notAssessed`): `references/review/04-run-artifacts.md#review-ledger-schema-v1`.

A missing or unreadable ledger is an empty prior run, never an error. A ledger
from a different scope is not a prior run for this scope.

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor per `references/_scaffolding/conductor-dispatch-protocol.md` -- read that file before the first executor dispatch; it owns the dispatch mechanics, the fan-out doctrine (executor teams scale to natural breadth; the session-model agent caps do not apply to them), the executor prompt contract, and the validation gate. Without ultracode, run the standard dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Conductor-selected executors (lanes per `references/_scaffolding/conductor-dispatch-protocol.md#model-lanes`: Fable 5.1 for the specialist reviews, design, and UI code changes, Opus 5 @ `xhigh` for recon, evidence collection, and other code, Sonnet 5 @ `xhigh` for non-coding collection) |
|---|---|
| Opportunity ranking, value-vs-cost judgment, integration plan synthesis, anything entitlement- or privacy-adjacent | Surface census (existing intents, widgets, activities, extensions, plist declarations); per-surface API-shape research from the conductor-approved opportunity list (framework, floor, required entitlements, minimal adoption checklist) |

**Executor scoping (on top of the protocol's prompt contract)**
- Reference set: absolute paths of `references/platform/` + `references/cross-platform/` + `references/_scaffolding/version-floor-registry.md`.
- Executors report evidence and research, never rankings -- the conductor ranks. This skill stays advisory end to end: no executor writes project files. Scaffolding is a separate task the user must ask for after the report.
- The `platform-engineer` specialist is pinned to the Fable lane at dispatch -- judgment reviewer, never a grunt executor.
