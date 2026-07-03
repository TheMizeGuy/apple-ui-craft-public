# Screen Archetypes Index

> Owner: this file owns the archetype-to-reference routing map only. It introduces no new API guidance -- every cell links to the file that owns the real content. Read this first when starting a new screen; read the linked file(s) for the actual contract.
> Floors: none introduced here. Every floor citation lives in the linked file.

Twelve screen shapes cover nearly every iOS/iPadOS screen a craft review will encounter. This file maps each to the reference file(s) that build it and the core APIs involved -- it is a router, not a tutorial. Most real screens compose two or three archetypes: a paywall is a *form* wrapped in a *loading/error* shell, reached through an *auth* gate. Read every linked file a screen touches, not just the nearest single match.

## The map

| Archetype | Owning reference(s) | Core APIs |
|---|---|---|
| **List → detail** | `references/design/07-navigation-patterns.md`, `references/performance/02-scroll-list-performance.md`, `references/patterns/04-loading-empty-error.md` | `NavigationStack`/`NavigationSplitView`, `List`, `.navigationDestination`, `matchedTransitionSource`/`.navigationTransition(.zoom)` (iOS 18+) |
| **Form / data entry** | `references/patterns/02-forms-data-entry.md` (OWNER) | `Form`/`Section`, `TextField`/`SecureField`, `@FocusState`, `.submitLabel` |
| **Onboarding / first-run** | `references/patterns/03-onboarding-tipkit.md` (OWNER) | `@AppStorage` gate, `.fullScreenCover`, TipKit, permission priming |
| **Settings / preferences** | `references/patterns/06-settings.md` (OWNER) | `Form`, `Toggle`/`Picker`/`NavigationLink` row vocabulary, `@AppStorage` |
| **Feed / browse** | `references/performance/02-scroll-list-performance.md` (OWNER of scroll perf), `references/patterns/04-loading-empty-error.md` | `List`/`LazyVStack`, `.refreshable`, `AsyncImage` phases |
| **Dashboard / home** | `references/patterns/04-loading-empty-error.md#retry-affordances` (per-section failure), `references/performance/04-state-architecture.md` | independent per-section `LoadState`, `Grid`/`LazyVGrid` |
| **Paywall** | `references/patterns/08-paywall-storekit-applepay.md` | StoreKit views, `subscriptionStatusTask(for:)`, `.buttonStyle(.glassProminent)` |
| **Auth / account** | `references/patterns/09-auth-account.md` (OWNER) | Sign in with Apple, passkeys, `references/patterns/02-forms-data-entry.md#structure` for the surrounding `Form` shell |
| **Empty / loading / error** | `references/patterns/04-loading-empty-error.md` (OWNER) | `ContentUnavailableView`, `.redacted(reason:)`, `ProgressView` |
| **Media player** | `references/design/11-media-content.md` (OWNER) | `VideoPlayer`/AVKit, Picture in Picture, `.accessibilityIgnoresInvertColors` |
| **Map / location** | `references/platform/05-maps-location.md` (OWNER) | `Map`, `MapCameraPosition`, `references/accessibility/04-motor-interaction.md#native-voiceover-bridge-apis` |
| **Profile / account detail** | `references/patterns/06-settings.md#account-section-placement`, `references/patterns/02-forms-data-entry.md#structure` | `LabeledContent` read-only rows, edit-mode push into a `Form` |

## Cross-cutting layers every archetype inherits

No row above is exempt from these -- consult them regardless of which archetype you started from:

- **Motion**: any programmatic transition anywhere routes through `references/accessibility/05-motion-accessibility.md`'s double-gate.
- **Haptics**: any confirm/fail/select feedback routes through `references/haptics/02-swiftui-sensory-feedback.md`.
- **Dynamic Type / VoiceOver**: every screen, full stop -- `references/accessibility/02-dynamic-type-adaptation.md` and `references/accessibility/01-voiceover-fundamentals.md`.
- **Liquid Glass chrome**: any glass surface (toolbar, floating CTA, sheet) -- `references/design/02-liquid-glass.md`.
- **Recurring traps**: `references/patterns/01-gotchas-anti-patterns.md` collects the failure modes that cut across every archetype (the `#Preview` env-key trap, the RM double-gate, shadow-radius animation, a `Timer` alive behind a `.sheet`).

## When two rows both look right

- **List → detail vs. feed**: a scrollable list of many items with rare mutation, pushed to a detail screen, is a **list → detail**. Items that refresh constantly and are consumed in place (likes, chronological cards) are a **feed**.
- **Dashboard vs. feed**: a **dashboard** aggregates independent, differently-typed sections that can each fail on their own (`references/patterns/04-loading-empty-error.md`'s partial-failure model). A **feed** is one homogeneous, ever-scrolling list.
- **Settings vs. profile**: **settings** rows are `Toggle`/`Picker`/navigation into preference sub-screens (`references/patterns/06-settings.md#row-vocabulary`). A **profile** page is read-mostly `LabeledContent` with an edit affordance that pushes into a **form**.
- **Onboarding vs. permission priming**: onboarding is the one-time first-run FLOW; permission priming is a narrower soft-ask pattern that can fire during onboarding OR years later at point-of-need. Both live in `references/patterns/03-onboarding-tipkit.md`, in separate sections.

## Modal layer (not its own archetype)

Sheets, popovers, alerts, and confirmation dialogs are not a screen archetype on their own -- they're the presentation MECHANISM any archetype above uses to interrupt. `references/patterns/05-modality-sheets.md` owns the sheet-vs-cover-vs-alert decision and the drag-to-dismiss/haptic conventions; every archetype table row can present through it.

## Worked examples

`references/exemplars/01-glass-screen.md` and `references/exemplars/05-platform-integration.md` show two of these archetypes built end to end, wired to the surrounding chrome (Liquid Glass, widgets) rather than isolated per API. Read an exemplar when you need to see how three or four of the cross-cutting layers above compose in one real file, not just the API in isolation.

## See also

- `references/patterns/01-gotchas-anti-patterns.md` -- recurring traps that cut across every archetype above
- `references/patterns/05-modality-sheets.md` -- the modal layer any archetype can present from
- `references/_scaffolding/_TEMPLATE.md` -- the shape every linked file follows
