# Changelog

All notable changes to `apple-ui-craft` are documented here.

## 0.2.7 -- 2026-07-16

- `references/design/11-media-content.md` gains a "Text over images: scrim and progressive blur" section: bottom-weighted `LinearGradient` scrim as the default treatment, masked-material progressive blur (`Rectangle().fill(.regularMaterial).mask { LinearGradient }`, the Apple media-catalog sample pattern -- no public variable-blur modifier exists) as the premium layer, contrast checked against the darkest converged region, gradient onset kept below the focal subject, and the Reduce Transparency degradation note. Matching anti-pattern row and severity entries (text-on-raw-photo HIGH; full-frame dim where a scrim was warranted MEDIUM).

## 0.2.6 -- 2026-07-05

- Executor model selection v2 (tracks the private source): executor-class dispatches are conductor-selected -- Sonnet 5 at `xhigh` for mechanical, well-specified stages, or Opus 4.8 when the leg-work needs deeper judgment. Replaced every Sonnet-only executor phrasing across README, USAGE, ARCHITECTURE, the conductor dispatch protocol, the team lead, and all six skill split-of-labor tables; invariants now read "Never Haiku. Never Sonnet below `xhigh`. Never an executor verdict." More than 20 Opus executors in one turn still needs explicit user sign-off.

## 0.2.5 -- 2026-07-05

- Un-pinned every agent's `model: fable` frontmatter; agents now inherit the session model (always the strongest available Claude) instead of a named model, so the plugin keeps working across model transitions.
- Rewrote every "Fable 5" / "Fable 5 or Opus 4.8" reference in agent descriptions, skill bodies, and docs to session-model language.
- Added an "Execution mode" note to all 6 skills clarifying that agents inherit the session model and may run inline (foreground) instead of dispatching when the session model is already the strongest tier.
- `craft-ios-ui`: added a worked finding-format example and a 6-point report-acceptance gate for the merged team-lead report.
- `design-ios`: added a project-context-gathering table (deployment target, navigation model, color/type conventions, component conventions) before dispatch, a worked Stage-2 accessibility-handoff prompt, and a pre-presentation verification checklist (phantom APIs, hard-coded colors/fonts, Reduce Motion gating, Stage 2 completion).
- Simplified the ultracode conductor-mode sections in `ARCHITECTURE.md`, `README.md`, and `craft-team-lead.md` to point at the single shared dispatch-protocol file instead of restating its rules.
- Docs refresh: `USAGE.md` gained a troubleshooting table; README/USAGE model-policy language brought current.

## 0.2.4 -- 2026-07-03

- Added proactive trigger descriptions to `design-ios`, `review-ios-ui`, and `optimize-ios-ui` so the skills fire from natural-language requests that don't name the skill.

## 0.2.3 -- 2026-07-03

- Applied a 12-executor skill-layer quality audit (29 confirmed findings) across skills and agents.

## 0.2.2 -- 2026-07-03

- Set the plugin author to TheMizeGuy with the `ben@meipath.com` contact.

## 0.2.1 -- 2026-07-03

- Documented the session model as a co-equal Fable 5 / Opus 4.8 conductor under ultracode (superseded in 0.2.5 by fully model-agnostic language).
- Thorough documentation pass across README/ARCHITECTURE/USAGE.

## 0.2.0 -- 2026-07-03

- Initial structured release: 7 agents, 6 skills, and the 82-file, 12-domain reference library (design, animation, interaction, haptics, accessibility, patterns, performance, platform, cross-platform, exemplars, methodology, `_scaffolding`).
- Added the ultracode conductor-executor mode to all 6 skills and the `craft-team-lead` orchestrator.
- Regenerated README/ARCHITECTURE and added the USAGE guide.
