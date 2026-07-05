---
name: integrate-platform
description: |-
  Deepen an iOS app's system integration. Dispatches the platform-engineer solo to audit existing integration and map what's missing: widgets, Live Activities, Dynamic Island, Control Center controls, App Intents, Siri and Apple Intelligence schemas, Spotlight, Quick Actions, StandBy, context menus, drag and drop, TipKit, keyboard shortcuts, Maps, WebView, App Clips, app extensions, plus cross-platform reach (iPadOS, watchOS, tvOS, macOS/Catalyst, visionOS, CarPlay). Triggers on "make my app feel more native beyond the UI", "add widgets", "should I build a Live Activity?", "App Intents audit", "platform integration", "system integration opportunities", "bring my app to [watch/Vision Pro/CarPlay]".
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

- Integration verdict: DEEPLY INTEGRATED / SURFACE-LEVEL / UNTAPPED / NOT APPLICABLE
- Existing-surface audit (what ships today, with correctness findings, severity-tagged)
- Opportunity map (surface -> what it does for this app -> APIs + floor -> effort)
- Cross-platform reach assessment (which platforms this app should exist on, and why)
- Top 3 priority integrations

All findings are advisory. The user chooses what to build.

## Execution mode

The specialist this skill dispatches inherits the session model -- always the strongest available Claude. When the session model is already the strongest tier and the integration scope is small, the orchestrator may run the audit inline in the main context (foreground) instead of dispatching a separate agent, without weakening the platform-engineer's read-only guarantee. Never block on, or call out to, a model that isn't the session model.

## Ultracode conductor mode

When the harness announces ultracode, this skill runs conductor-executor per `references/_scaffolding/conductor-dispatch-protocol.md` -- read that file before the first executor dispatch; it owns the dispatch mechanics, the fan-out doctrine (executor teams scale to natural breadth; the session-model agent caps do not apply to them), the executor prompt contract, and the validation gate. Without ultracode, run the standard dispatch above unchanged.

**Split of labor**

| Conductor (session model -- never delegated) | Executor teams (Sonnet 5, ALWAYS `effort: xhigh`) |
|---|---|
| Opportunity ranking, value-vs-cost judgment, integration plan synthesis, anything entitlement- or privacy-adjacent | Surface census (existing intents, widgets, activities, extensions, plist declarations); per-surface API-shape research from the conductor-approved opportunity list (framework, floor, required entitlements, minimal adoption checklist) |

**Executor scoping (on top of the protocol's prompt contract)**
- Reference set: absolute paths of `references/platform/` + `references/cross-platform/` + `references/_scaffolding/version-floor-registry.md`.
- Executors report evidence and research, never rankings -- the conductor ranks. This skill stays advisory end to end: no executor writes project files. Scaffolding is a separate task the user must ask for after the report.
- The `platform-engineer` specialist stays on the session model -- judgment reviewer, never an executor.
