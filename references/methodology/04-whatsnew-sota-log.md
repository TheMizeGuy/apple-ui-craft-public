# What's New: iOS 26.x -> WWDC 2026 Delta Log

> Owner: `references/methodology/04-whatsnew-sota-log.md` owns the DATED narrative of what changed in iOS UI craft since Liquid Glass shipped -- why an API arrived when it did, and what to verify before shipping an iOS 27 symbol. `references/_scaffolding/version-floor-registry.md` owns the authoritative floor numbers themselves; this file cites them, never restates the matrices.
> Floors: current shipping baseline as of this log's last update is iOS 26.x; iOS 27 (WWDC 2026) is developer beta. Every floor named below is cited against `version-floor-registry.md`.

An agent that only reads the per-API reference files can't tell "shipped last year" from "announced last month, still in beta." This log fills that gap: read it to answer "is this current," then go to the owning file for the API itself. Entries are dated oldest-first per OS; anything still in developer beta is marked and gated, never promoted to a primary example.

## How to read this log

- **Shipped** entries (iOS 26.0-26.5) need no version gate in a 26+-floor app; cite the owning file for the API and this log only for the WHEN and WHY.
- **Beta** entries (iOS 27) are session coverage or early SDK behavior -- every one needs `#available(iOS 27, *)` plus `// SDK-verify`, and none belongs in a primary shipping example anywhere in this reference set.
- Explicitly out of scope for this log and the plugin's reference library as a whole: `DocumentGroup` document-based apps and SharePlay/GroupActivities. Neither is silently omitted -- both were evaluated and deferred, not overlooked.

## iOS 26.0 -- Liquid Glass ships (September 2025)

Apple's most significant visual redesign since iOS 7, and immediate legibility criticism followed (Music, Control Center, notifications, transparent menus over busy content) -- the multi-release walkback below is the direct response. Base surface: `Glass.regular/.clear/.identity`, `GlassEffectContainer`, `.buttonStyle(.glass)`/`.glassProminent` -- owner `references/design/02-liquid-glass.md`. Same release: `TabBarMinimizeBehavior.onScrollDown`, `tabViewBottomAccessory`, `ToolbarSpacer`, `.symbolEffect(.drawOn/.drawOff)`, the Foundation Models framework, `WebView`/`WebPage` (WebKit module), and the `Chart3D` family. Also 26.0: the `@Animatable` MACRO -- distinct from the pre-existing `Animatable` protocol owned by `references/animation/03-advanced-animators.md#animatable-for-custom-shapes` -- do not describe it as "iOS 18 macro era," a garbled claim seen in prior research passes. Full list: `version-floor-registry.md#ios-26x`.

## iOS 26.1 (~November 2025) -- Clear vs. Tinted is a Settings toggle, not an API

Settings > Display & Brightness > Liquid Glass: **Clear** (original see-through) vs. **Tinted** (higher opacity/contrast), system-wide. Glass inherits the choice with ZERO code -- the same contract the reference set already documents for Reduce Transparency and Increased Contrast. There is no `@Environment(\.tintMode)`; do not invent one (`version-floor-registry.md`'s PHANTOM list). The parameterized `.buttonStyle(.glass(_:))` / `.glass(.clear)` also lands 26.1+ -- `#available(iOS 26.0, *)` alone is not sufficient to compile the parameterized form.

## iOS 26.2 (~December 2025)

Further lock-screen-specific glass opacity adjustments (no API, Settings-level only) and an unrelated notification screen-flash accessibility option. `.assistant.activate` -- plausible 26.2+, SDK-verify before shipping.

## iOS 26.3 (~January/February 2026)

Privacy, carrier, and wallpaper features only ("Limit Precise Location," a Weather wallpaper section, carrier RCS groundwork). No UI-framework API changes -- nothing in this reference library gates on 26.3.

## iOS 26.4 (Spring 2026) -- Siri becomes the app's front door

The revamped Siri ships: onscreen awareness plus in-app actions routed through App Intents. This is the release where **App Intents assistant schemas become the price of Siri actionability** -- `@AssistantIntent(schema:)` / `@AssistantEntity(schema:)`, owner `references/platform/02-app-intents-system.md#assistant-schemas-ios-26`. Two other floors land here in the same release: `accessibilityPrefersCrossFadeTransitions` and `.task(name:file:line:)` both reach their 26.4 floor -- owners `references/accessibility/05-motion-accessibility.md` and `references/performance/06-concurrency-ui.md#task-and-taskid` respectively.

## iOS 26.5 (~mid-2026)

Incremental; published release notes, no craft-relevant API surface. iOS 26.x remains the shipping baseline as of this log's last update -- update this entry, don't let it silently drift, when a later point release lands.

## iOS 27 -- developer beta, gate everything

iOS 27 (WWDC 2026) is in developer beta as of this log; iOS 26.x is still what ships to users. Everything below is "adopt now behind `#available(iOS 27, *)` with a `// SDK-verify` comment," never the primary example -- full floor table in `version-floor-registry.md`'s iOS 27.0+ Beta section (read the section directly; its heading's punctuation makes the anchor unstable, so it isn't linked here).

- **Toolbar overflow control** (owner `references/design/07-navigation-patterns.md`): `ToolbarMinimizeBehavior.onScrollDown` -- a DIFFERENT type from the 26.0 `TabBarMinimizeBehavior.onScrollDown`; split the gates, never share one `#available` block. Plus `.visibilityPriority(_:)`, `ToolbarOverflowMenu`, `.topBarPinnedTrailing`.
- **Lists and swipe actions escape `List`** (owner `references/performance/02-scroll-list-performance.md`): `.reorderable()` on any `ForEach`, `.reorderContainer(for:)`, `.swipeActions` outside `List`. iOS 26 fallback: `List.onMove` or manual `.draggable` + `.dropDestination`.
- **SwiftData sectioned queries**: `@Query(sort:sectionBy:)` is iOS 27.0+ Beta, NOT iOS 26 -- and never conflate it with Core Data's unrelated iOS-15 `SectionedFetchRequest`, eleven major versions apart. `ResultsSectionCollection`'s exact name is unconfirmed in public docs.
- **`@State` becomes a lazy macro** (cross-cutting, back-ported to iOS 17+): the initial value computes once for the view's lifetime. This is a genuine breaking change -- assigning a default value AND a different value to the same `@State` in `init` is now a compiler error. Audit any snippet in this library that does both.
- **Resizable iPhone windows**: apps resize under mirroring and iPad multitasking -- layouts must not assume a fixed iPhone width, reinforcing the size-class guidance already in `references/cross-platform/01-ipados-multiplatform.md`.
- **`AsyncImage`** honors standard HTTP cache headers by default with no code change; `.asyncImageURLSession(_:)` attaches a custom session -- owner `references/performance/02-scroll-list-performance.md`.
- **Item-binding presentations**: `.confirmationDialog(item:)` and `.alert(item:)` join `.sheet(item:)`'s item-driven presentation style, replacing the two-property `isPresented` Bool plus separate data pattern -- owner `references/patterns/05-modality-sheets.md`. Prefer these going forward; less state to keep in sync.
- **Documents** (footnote, only if the app is document-based): `WritableDocument`/`DocumentWriter` and `ReadableDocument`/`DocumentReader` protocols supersede the monolithic `FileDocument.fileWrapper` path with async, incremental, snapshot-diffed I/O. `DocumentGroup` apps are otherwise explicitly out of scope for this reference library -- see "How to read this log," above.

## Verify-before-shipping (SDK-unconfirmed as of this log)

These symbol names come from WWDC 2026 session coverage, not yet a Context7- or SDK-confirmed signature. Quarantine behind `#available(iOS 27, *)` plus `// SDK-verify`; do not ship as a primary example until confirmed against the installed iOS 27 SDK.

| Symbol | Where it would land | Status |
|---|---|---|
| `.visibilityPriority(_:)`, `ToolbarOverflowMenu`, `Tab(role: .prominent)` | `design/07-navigation-patterns.md` | Session coverage only |
| `@ContentBuilder`, `appearsActive` | Cross-cutting | Session coverage only |
| SwiftData `ResultsSectionCollection` | `performance/02-scroll-list-performance.md` | Name unconfirmed in public docs |
| `ToolbarMinimizeBehavior.onScrollDown` | `design/07-navigation-patterns.md` | Type/floor plausible, exact signature SDK-verify |
| `.assistant.activate` | `platform/02-app-intents-system.md` | Plausible 26.2+, SDK-verify |

## Apple Intelligence -- the iOS 26 surface most under-adopted

Foundation Models (`LanguageModelSession`, `@Generable` / `@Guide`), assistant schemas, Writing Tools, and Genmoji/Image Playground are fully owned by `references/platform/06-apple-intelligence-ui.md#foundation-models-sessions-streaming-and-tool-calling-ui` -- this log's entry is only the WHEN: base framework at 26.0, the Siri actionability payoff at 26.4 (above), and WWDC 2026 additions previewed for a later point release -- any-provider model swap (Apple's model, Private Cloud Compute, or a third-party model via the same `LanguageModelSession` API), multimodal prompts, on-device vision tool-calling, and Dynamic Profiles that swap model/tools/instructions mid-session. Apple also announced free Private Cloud Compute for developers under 2M first-time downloads. None of these WWDC-2026 additions are SDK-confirmed as of this log; treat them the same as the iOS 27 verify-before-shipping list above -- always show a graceful non-AI fallback for hardware or region where the model is unavailable, per `SystemLanguageModel.default.availability`.

## The Liquid Glass walkback -- a design lesson, not just a version note

Apple spent five point releases (26.1-26.5) plus a WWDC-2026 foundational material rebuild trading transparency for readability; Nielsen Norman Group had documented measurable contrast failures in the 26.0 implementation. None of it changed a single `.glassEffect()` / `Glass` / `GlassEffectContainer` call site -- keep authoring `.glassEffect(.regular ...)` normally and trust the system to apply the user's Clear/Tinted/slider choice; never read or branch on the setting in code. WWDC 2026 previewed the same "zero code" contract continuing forward: an updated system-wide transparency slider (macOS 27 "Golden Gate" ships a matching global opacity slider) and refreshed, more dimensional app icons via an updated Icon Composer -- neither changes a SwiftUI call site. Apple's own framing: "a bold leap forward, and then we continue to iterate" -- the readability walkback is narrated as iteration, not reversal. The craft lesson for `references/design/01-apple-design-philosophy.md`: when glass and readability conflict, readability wins -- this is Apple's own revealed preference across five releases, not just guidance.

## Reference-library currency note

2026-07-03: this log and its companion `references/methodology/03-apple-samples-teardown.md` were last checked against Apple's HIG five-axis IA (Foundations / Patterns / Components / Inputs / Technologies) and the current sample-code corpus (Landmarks, Backyard Birds, Destination Video, Fruta, Food Truck). Extend this note, don't replace it, on the next verification pass.

## Availability + fallbacks

```swift
if #available(iOS 27, *) {
    ForEach(items) { item in ItemRow(item) }
        .reorderable()                                    // SDK-verify: iOS 27.0+ Beta
} else {
    List {
        ForEach(items) { item in ItemRow(item) }
            .onMove(perform: move)                         // iOS 26 and earlier fallback
    }
}
```

Every API in the iOS 27 section above needs this shape: the gated branch behind `#available(iOS 27, *)` with `// SDK-verify`, and a real iOS-26-or-earlier fallback shown, never "left as an exercise." Nothing in the iOS 26.0-26.5 entries needs a version branch in a 26+-floor app -- they are either already-shipped APIs or zero-code Settings-inherited behavior.

## Accessibility contract

This file is a changelog, not a UI surface -- it carries no motion or VoiceOver obligation of its own. Every accessibility-relevant delta logged above (`accessibilityPrefersCrossFadeTransitions` at 26.4, the Tinted-Mode Settings inheritance at 26.1) points to its owning file rather than being re-taught here; see `references/accessibility/05-motion-accessibility.md` for the canonical Reduce Motion contract.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Gating `ToolbarMinimizeBehavior.onScrollDown` under the same `#available(iOS 26, *)` as `TabBarMinimizeBehavior.onScrollDown` | Different types, different floors (27 Beta vs. 26.0) -- compiles wrong or crashes on 26.x | Split the gates; see the iOS 27 section above |
| Treating SwiftData `@Query(sort:sectionBy:)` as an iOS 26 API | It's iOS 27.0+ Beta, conflated with Core Data's iOS-15 `SectionedFetchRequest` eleven major versions apart | Gate `#available(iOS 27, *)`, fall back to `Dictionary(grouping:)` |
| Reading or branching on the Liquid Glass Tinted-Mode Settings toggle in code | No such environment key exists -- `@Environment(\.tintMode)` is fabricated | Do nothing; glass inherits the setting automatically |
| Shipping a WWDC-2026 session-coverage symbol as the primary example | Not yet Context7- or SDK-confirmed | Quarantine behind `#available(iOS 27, *)` + `// SDK-verify`, per the verify-before-shipping list above |

## Severity guide

CRITICAL: an iOS-27-beta-only symbol shipped ungated as the primary example -- won't compile against the App-Store-eligible SDK for anyone still targeting 26.x. HIGH: two distinct APIs sharing a similar name or floor conflated (`ToolbarMinimizeBehavior` vs. `TabBarMinimizeBehavior`, SwiftData sectioning vs. Core Data `SectionedFetchRequest`). MEDIUM: a stale "iOS 26 NEW" label on something that actually shipped a later point release. LOW: this log itself drifting behind the current point release without an update.

## Source sessions and durable citations

Cite these by name rather than an internal file path so a citation never 404s for an agent that can't open the author's private notes:

- WWDC25 "Get to know the new design system" (session #356) -- the Liquid Glass design-system introduction behind the iOS 26.0 entry above.
- WWDC25 "Meet Liquid Glass," "Build a SwiftUI app with Liquid Glass," "Applying Liquid Glass to custom views" -- the API sessions `design/02-liquid-glass.md` and this log's 26.0 entry draw from.
- WWDC26 "What's new in SwiftUI" -- source for the entire iOS 27 delta section above; the authority to re-check when the iOS 27 SDK ships.
- Apple Newsroom, June 2026, "Apple aids app development with new intelligence frameworks" -- source for the Apple Intelligence WWDC-2026 additions.
- Apple Developer iOS/iPadOS 26.4 and 26.5 release notes, Apple Support "About iOS 26 Updates" -- source for the 26.3-26.5 point-release entries.

## See also

- `references/_scaffolding/version-floor-registry.md` -- the authoritative floor tables this log narrates but never restates
- `references/design/02-liquid-glass.md` -- the Liquid Glass API surface this log's 26.0-26.5 entries track
- `references/platform/06-apple-intelligence-ui.md#foundation-models-sessions-streaming-and-tool-calling-ui` -- the Apple Intelligence surfaces this log only dates
- `references/platform/02-app-intents-system.md#assistant-schemas-ios-26` -- the assistant-schema requirement introduced by the 26.4 Siri revamp
- `references/methodology/03-apple-samples-teardown.md` -- companion file: how these APIs compose into screens, extracted from real sample code
