# What's New: iOS 26.0 -> iOS 27 Delta Log

> Owner: `references/methodology/04-whatsnew-sota-log.md` owns the DATED narrative of what changed in iOS UI craft since Liquid Glass shipped -- why an API arrived when it did, what changed between WWDC and release, and what still sits in beta. `references/_scaffolding/version-floor-registry.md` owns the authoritative floor numbers themselves; this file cites them, never restates the matrices.
> Floors: the shipping baseline as of this log's last update (2026-09-22) is **iOS 27.0**, released 2026-09-14 with Xcode 27 and Swift 6.4 alongside iPadOS, macOS 27 ("Golden Gate"), watchOS, tvOS and visionOS 27. iOS 27.1 (the iPhone Duo surface) and iOS 27.2 are in developer beta. Every floor named below is cited against `version-floor-registry.md`.

An agent that only reads the per-API reference files can't tell "shipped last year" from "announced at WWDC, renamed before release." This log fills that gap: read it to answer "is this current," then go to the owning file for the API itself.

## How to read this log

- **Shipped** entries (iOS 26.0 through 27.0) are ordinary availability floors. Gate on the app's deployment target: an app that still supports iOS 26 wraps an iOS 27 call in `#available(iOS 27, *)` and ships the iOS 26 fallback beside it; an iOS-27-minimum app uses it directly.
- **Toolchain** entries need Xcode 27 to compile and have no runtime gate (the `@State` macro, `ContentBuilder`, item and error alerts).
- **Rebuild** entries change behavior the moment an app is built with the iOS 27 SDK, whatever its deployment target. A project moving to Xcode 27 checks these first.
- **Beta** entries (iOS 27.1, 27.2) are symbols Apple's documentation still flags beta. They gate on their own minor, carry a `// beta: verify against the installed SDK` comment, and never lead an example.

### Scope boundary

This library covers UI craft. Evaluated and deliberately out of scope, so their absence is a decision rather than a gap: `DocumentGroup` document-based apps (including iOS 27's `Document` / `ReadableDocument` / `WritableDocument` model), SharePlay/GroupActivities, printing, and domain frameworks whose UI is either system-owned or product-specific -- HealthKit, HomeKit, Game Center, ARKit/RealityKit on iPhone, NFC, Tap to Pay on iPhone, and ID Verifier.

## iOS 26.0 -- Liquid Glass ships (September 2025)

Apple's most significant visual redesign since iOS 7, and immediate legibility criticism followed (Music, Control Center, notifications, transparent menus over busy content) -- the walkback below is the direct response. Base surface: `Glass.regular/.clear/.identity`, `GlassEffectContainer`, `.buttonStyle(.glass)`/`.glassProminent` and the parameterized `.buttonStyle(.glass(_:))` -- owner `references/design/02-liquid-glass.md`. Same release: `TabBarMinimizeBehavior.onScrollDown`, `tabViewBottomAccessory`, `ToolbarSpacer`, `.symbolEffect(.drawOn/.drawOff)`, the Foundation Models framework, `WebView`/`WebPage` (WebKit module), the `Chart3D` family, and `UndoableIntent`. Also 26.0: the `@Animatable` MACRO -- distinct from the pre-existing `Animatable` protocol owned by `references/animation/03-advanced-animators.md#animatable-for-custom-shapes`. Full list: `version-floor-registry.md#ios-26x`.

## iOS 26.1 (~November 2025) -- Clear vs. Tinted is a Settings toggle, not an API

Settings > Display & Brightness > Liquid Glass: **Clear** (original see-through) vs. **Tinted** (higher opacity/contrast), system-wide. Glass inherits the choice with ZERO code -- the same contract the reference set documents for Reduce Transparency and Increased Contrast. There is no `@Environment(\.tintMode)`; do not invent one (`version-floor-registry.md`'s PHANTOM list). An earlier version of this log dated the whole parameterized glass button surface to 26.1; Apple's symbol metadata puts `.buttonStyle(.glass(_:))` and `.glass(.clear)` at 26.0 and only the explicit `GlassButtonStyle.init(_:)` at 26.1.

## iOS 26.2 (~December 2025)

Further lock-screen glass opacity adjustments (Settings only) and a notification screen-flash accessibility option. The `.assistant.activate` schema lands at 26.2 -- iPhone in Japan only, behind the `com.apple.developer.side-button-access.allow` entitlement.

## iOS 26.3 (~January/February 2026)

Privacy, carrier, and wallpaper features only. No UI-framework API changes -- nothing in this reference library gates on 26.3.

## iOS 26.4 (Spring 2026) -- cross-fade preference, cancellable intents

`accessibilityPrefersCrossFadeTransitions` and the `executorPreference:` overload of `.task` reach their 26.4 floor (the `name:`/`file:`/`line:` overload is iOS 15.0 and back-deploys; an earlier version of this log had that backwards) -- owners `references/accessibility/05-motion-accessibility.md` and `references/performance/06-concurrency-ui.md#task-and-taskid`. App Intents gains `CancellableIntent` and `IntentValueRepresentation`; Image Playground gains `.imagePlaygroundOptions(_:)`; two CarPlay categories gain a third level of push depth. An earlier version of this log said the revamped Siri shipped here. It did not: it shipped with iOS 27 (below).

## iOS 26.5 (~mid-2026)

Incremental; no craft-relevant API surface.

## iOS 27.0 -- shipped 2026-09-14

### Rebuild with Xcode 27 first

These change behavior on rebuild, at any deployment target (full table: `version-floor-registry.md`):

- The scene-based life cycle is mandatory -- an app without it fails to launch. A launch screen key is required.
- `UIDesignRequiresCompatibility` is ignored: the Liquid Glass opt-out is gone and every app adopts the new design.
- A `TabView` whose selection points at a hidden tab can crash; clamp the selection when the visible set changes.
- `controlSize`, `buttonSizing`, `ButtonBorderShape` and siblings reset inside sheets and popovers.
- iPad apps resize continuously whatever orientations they declare, and so do iPhone apps under iPhone Mirroring. Portrait-only is no longer an escape from adaptive layout.
- `AsyncImage` caches by HTTP headers; retroactive `Equatable` conformances of SwiftUI types are consulted; Neural Engine memory is attributed to the app.

### The toolchain

- **`@State` is a lazy macro.** `@State private var model = Model()` builds the model once for the view's lifetime instead of on every re-instantiation, which retires the oldest SwiftUI performance footgun and makes that line the recommended shape for a view-owned `@Observable` model. Assigning a declaration-site value and an `init` value to the same property no longer compiles. Owner: `references/performance/04-state-architecture.md`.
- **`ContentBuilder`** is `typealias ContentBuilder = ViewBuilder`, the unified builder at call sites; not an iOS 27 runtime API.
- **Item- and error-driven `alert` / `confirmationDialog`** compile with Xcode 27 and run back to iOS 15 -- the highest-leverage adoption in the release. Owner: `references/patterns/05-modality-sheets.md`.
- **Approachable concurrency**: an unannotated `nonisolated async` function runs on the main actor; `@concurrent` is the off-main annotation. Owner: `references/performance/06-concurrency-ui.md`.

### Structure: toolbars, tabs, presentations

`toolbarMinimizationBehavior(_:for:)` (with restoration and safe-area companions), `visibilityPriority(_:)`, `ToolbarOverflowMenu`, `.topBarPinnedTrailing`, `ToolbarPlacement.statusBar`, `TabRole.prominent`, `PickerStyle.tabs`, `presentationPlacement(_:)` and `NavigationTransition.crossFade`. Owners: `references/design/07-navigation-patterns.md` (toolbars and tabs), `references/patterns/05-modality-sheets.md` (presentations), `references/animation/04-transitions-geometry.md` (the cross-fade). The theme is windows that change size: toolbars now degrade by priority instead of clipping.

### Lists, reordering, swipe actions, gestures

`reorderContainer` (four overloads) with `reorderable()` on the `ForEach`, swipe actions on any view inside `swipeActionsContainer()`, multi-item `dragContainer` on iOS, and `GestureInputKinds` for touch/Pencil/pointer-specific gestures. The move closure hands the app a `ReorderDifference` (`sources`, `destination`); SwiftUI ships no helper that applies it. Owners: `references/interaction/06-custom-controls-reorderable.md`, `references/patterns/10-drag-drop.md`, `references/animation/05-gesture-driven.md`.

### Liquid Glass, second iteration

No `Glass` symbol changed. The iteration is a Clear-to-Tinted **slider** replacing 26.1's toggle (still no API; unavailable while Reduce Transparency or Increase Contrast is on) and HIG guidance: clear glass only over rich media with a dimming layer when the content is bright, scroll edge effects only behind floating UI, brand color mostly in the content layer. Owner: `references/design/02-liquid-glass.md`. New layout helpers: `GeometryProxy.concentricCornerRadii`, `ignoresSafeArea(_:edges:alignment:)`. Text input: `TextInputBorderShape` and `.textFieldStyle(.bordered)` supersede `.roundedBorder`; selectable `Text` gets the system selection UI. SF Symbols adds symbols only -- no new effects.

### Performance and data

Swift MetricKit (`MetricManager`, `HitchTimeMetric`, termination and launch metrics, `MemoryExceptionDiagnostic` -- a call stack for an out-of-memory kill) deprecates the MX family; `AsyncImage` gains HTTP caching, `asyncImageURLSession(_:)` and request initializers; SwiftData gains `@Query(..., sectionBy:)` returning `SectionedResults`. Instruments 27 adds a Swift Executors instrument and SwiftUI update summaries. Owners: `references/performance/03-launch-memory-instruments.md`, `references/performance/02-scroll-list-performance.md`, `references/performance/08-swiftdata-ui.md`.

### Siri AI and Apple Intelligence

The rebuilt Siri shipped as **Siri AI** -- personal context, onscreen awareness, in-app actions and a dedicated Siri app -- labelled beta by Apple, English-only at launch. It reaches apps only through App Intents: the `@AppIntent(schema:)` family (iOS 18.0+), with the `@Assistant...(schema:)` macros now deprecated and complete schema sets enforced at build time. Foundation Models became provider-agnostic (`LanguageModel`, `PrivateCloudComputeLanguageModel` -- free for Small Business Program developers under 2 million first-time downloads), multimodal (`Attachment`), gained Vision tools (`OCRTool`, `BarcodeReaderTool`), Dynamic Profiles and `ToolCallingMode`, and reached watchOS. `LanguageModelSession.GenerationError` is deprecated, and rebuilding changes which error type is thrown. Owners: `references/platform/02-app-intents-system.md`, `references/platform/06-apple-intelligence-ui.md`.

### Accessibility and localization

No new SwiftUI or UIKit accessibility modifiers, traits or environment values -- symbols WWDC26 sessions made look new (`accessibilityLinkedGroup`, `causesPageTurn`, `.isTabBar`) are years old. What changed: `AXSpeechAttributeSSML`, `AccessibilitySettings.isApplicationAccessibilityEnabled`, `.pickerStyle(.tabs)` read as tabs, `.crossFade` as the concrete Reduce Motion substitute, system Dynamic Type on tvOS, App Store Accessibility Nutrition Labels as the acceptance bar, and Xcode 27's agentic String Catalog translation. Owner: `references/accessibility/`.

### Platform surfaces

A quiet release for widgets, Live Activities, controls and notifications: one new widget family (`systemExtraLargePortrait`), Dynamic Island in landscape (`isDynamicIslandLimitedInWidth`), notification entity identifiers, and a new Now Playing framework. The busy area is the scene: mandatory scene life cycle, scene accessories for external displays, closure confirmation, async state restoration, per-scene orientations. Owners: `references/platform/01-widgets-live-activities.md`, `references/platform/09-scene-lifecycle.md`.

### Commerce, account, and presentations

Offer-code redemption was rewritten (`presentOfferCodeRedeemSheet(from:options:)`, `offerCodeRedemption(options:isPresented:onCompletion:)`; the old forms are deprecated), subscriptions gained bundles and suites, and Apple Pay gained `ApplePayMerchandisingView` (iOS/iPadOS only, with a fallback builder). Wallet adds a group of passes in one sheet. `dismissalConfirmationDialog` gives drafts a system confirmation on swipe-down. The HIG's in-app purchase page is now "Apple In-App Purchase". TipKit, `requestReview`, `ContentUnavailableView`, `SettingsLink` and Sign in with Apple did not change. Owners: `references/patterns/08-paywall-storekit-applepay.md`, `references/patterns/09-auth-account.md`, `references/patterns/05-modality-sheets.md`.

### Across the platforms

iPhone apps resize on iPad and in iPhone Mirroring; the iPadOS and macOS menu bars show fewer item images. macOS 27 ("Golden Gate") adds `NSRefreshController` and is the last release for Intel apps. tvOS 27 gets system Large Text, so Dynamic Type matters on the TV. visionOS 27 gains accessory widgets and still uses `glassBackgroundEffect`, not `glassEffect`. watchOS 27 deprecates `WKExtension` and gets Foundation Models. CarPlay adds a video category, a Now Playing mini player, map panels, and Voice Control and Search templates across most categories. Owners: `references/cross-platform/`.

## iOS 27.1 and 27.2 -- developer beta

- **27.1 -- iPhone Duo.** `ArrangementView`, `ReservedRegion`, `DeviceHinge` / `onHingeChange`, side-mounted toolbars (`toolbarVerticalEdge`), and a camera-capture scene accessory. Apple's SwiftUI updates page lists them under "September 2026", which reads like the shipped delta and is not. The HIG "Designing for iPhone Duo" page is already live, and its advice -- content that survives the hinge, bars on the outer display's side -- is design guidance you can act on now.
- **27.2.** A general point release in beta. Apple's documentation stamps soft deprecations with the newest SDK, so `ContentSizeCategory`, the legacy `accessibility(label:)` family, `MKMapView`'s legacy configuration properties and `CLPlacemark` show "deprecated 27.2" -- read that as "prefer the replacement" (`DynamicTypeSize`, `accessibilityLabel(_:)`), not as a 27.2 change. `FileDocument` and `ReferenceFileDocument` carry the same soft-deprecation stamp (the iOS 27 release notes call `FileDocument` deprecated outright); new code conforms to `Document`.

## Renamed, pulled, or never real (WWDC26 -> release)

| As announced or rumored | What shipped |
|---|---|
| `toolbarMinimizeBehavior` / `ToolbarMinimizeBehavior` | Renamed: `toolbarMinimizationBehavior(_:for:)` / `ToolbarMinimizationBehavior` |
| `ScrollHitchTimeMetric`, `MetricResult.scrollHitchTime(_:)` | Removed before release (a missing-symbol crash if referenced); use `HitchTimeMetric` |
| `ResultsSectionCollection` | Never existed; SwiftData's type is `SectionedResults<Element, String>` |
| `ReorderDifference.apply(to:)` | Not SwiftUI API -- a WWDC sample extension over swift-collections; write your own mutation |
| `appearsActive` as a WWDC26 symbol | It has shipped since iOS 18 |
| `@ContentBuilder` as an iOS 27 API | A `typealias` for `ViewBuilder`, iOS 13 |
| A macOS 27 glass opacity slider; Icon Composer 2.0's rendering mode as a future OS feature | Apple's support pages confirm the slider on iPhone and iPad and its cross-platform announcement does not name platforms, so treat the Mac as unconfirmed. "Upcoming 2027 operating systems" is Apple's model-year name for the 27 releases: Icon Composer's Design Generation 27 (refraction, inside/outside specular, deeper shadows) renders on iOS/iPadOS/macOS/watchOS 27 today and is inert on 26 |

## The Liquid Glass walkback -- a design lesson, not just a version note

Apple spent five point releases (26.1-26.5) and then iOS 27's slider trading transparency for readability; Nielsen Norman Group had documented measurable contrast failures in the 26.0 implementation. None of it changed a single `.glassEffect()` / `Glass` / `GlassEffectContainer` call site -- keep authoring `.glassEffect(.regular ...)` normally and trust the system to apply the user's choice; never read or branch on the setting. The iOS 27 HIG makes the same point in numbers: clear glass over bright content wants a dimming layer. Apple's own framing: "a bold leap forward, and then we continue to iterate" -- iteration, not reversal. The craft lesson for `references/design/01-apple-design-philosophy.md`: when glass and readability conflict, readability wins. That is Apple's revealed preference across six releases, not just guidance. For app icons, preview both Icon Composer design generations (26 and 27) and ship one `.icon` that works in each -- the 27 generation's refraction and specular are live on the 27 releases and inert on 26 (`references/design/14-app-icons.md`).

## Reference-library currency note

- 2026-07-03: this log and `references/methodology/03-apple-samples-teardown.md` were checked against Apple's HIG five-axis IA (Foundations / Patterns / Components / Inputs / Technologies) and the sample-code corpus (Landmarks, Backyard Birds, Destination Video, Fruta, Food Truck).
- 2026-09-22: full iOS 27 pass. Floors and signatures re-verified against Apple's DocC symbol metadata (`introducedAt`, `beta`, `deprecatedAt`) and the iOS 27 and Xcode 27 release notes; every section of the library scored by a Jev confidence pass for staleness, iOS 27 coverage and HIG-topic coverage. Extend this note, don't replace it, on the next pass.

## Availability + fallbacks

```swift
// Reordering: iOS 27 container API first, iOS 26 List fallback beside it.
if #available(iOS 27, *) {
    ScrollView {
        LazyVStack {
            ForEach(model.items) { item in ItemRow(item) }
                .reorderable()
        }
    }
    .reorderContainer(for: Item.self) { difference in
        model.apply(difference)          // the app's own mutation: SwiftUI ships no apply
    }
} else {
    List {
        ForEach(model.items) { item in ItemRow(item) }
            .onMove { model.move(fromOffsets: $0, toOffset: $1) }
    }
}
```

Every iOS 27 API shown as a primary path in this library takes this shape when the deployment target is below 27: the gated branch plus a real iOS 26 fallback, never "left as an exercise." Toolchain entries need no branch. Beta entries never lead.

## Accessibility contract

This file is a changelog, not a UI surface -- it carries no motion or VoiceOver obligation of its own. Every accessibility-relevant delta above points to its owning file; see `references/accessibility/05-motion-accessibility.md` for the canonical Reduce Motion contract.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Treating iOS 27.0 symbols as beta, or fencing them with `// SDK-verify` | They shipped 2026-09-14; the fence hides the right tool | Gate on the deployment target with an iOS 26 fallback |
| Shipping an iOS 27.1 symbol (iPhone Duo) as the primary path | Still beta; the signature can change | `#available(iOS 27.1, *)` + a beta comment, never primary |
| Gating `ToolbarMinimizationBehavior.onScrollDown` under the same `#available(iOS 26, *)` as `TabBarMinimizeBehavior.onScrollDown` | Different types, different floors (27.0 vs 26.0); `.onScrollDown` on toolbars is iOS/iPadOS/Catalyst only | Split the gates |
| Treating SwiftData `@Query(..., sectionBy:)` as an iOS 26 API, or conflating it with Core Data's `SectionedFetchRequest` | 27.0 vs iOS 15, unrelated frameworks | Gate `#available(iOS 27, *)`, fall back to `Dictionary(grouping:)` |
| Reading or branching on the Liquid Glass appearance setting | No such API exists | Do nothing; glass inherits the setting |
| Keeping `UIDesignRequiresCompatibility` as the plan for Liquid Glass | Ignored when built with the iOS 27 SDK | Adopt the design; fix legibility at the content layer |

## Severity guide

CRITICAL: a PHANTOM or pulled symbol in shipped code (`toolbarMinimizeBehavior`, `ScrollHitchTimeMetric`) -- it will not compile or will crash at launch; an app built with the iOS 27 SDK without the scene life cycle. HIGH: two distinct APIs with similar names or floors conflated; a beta 27.1 symbol as the only path. MEDIUM: a stale "beta" or "iOS 26 is current" label steering a reader away from the right API. LOW: this log drifting behind the current point release.

## Source sessions and durable citations


- WWDC25 "Get to know the new design system" (session #356), "Meet Liquid Glass," "Build a SwiftUI app with Liquid Glass," "Applying Liquid Glass to custom views" -- the iOS 26.0 entry.
- WWDC26 "What's new in SwiftUI" and the reordering sessions (269, 271); "Enhance the accessibility of your reading app" (219), "Refine accessibility for custom controls" (220), "Craft clear names for features and labels in your app" (290).
- iOS & iPadOS 27 Release Notes, Xcode 27 Release Notes, iOS & iPadOS 27.2 Beta 2 Release Notes -- the authority for every rebuild, toolchain, rename and removal entry above.
- Apple Newsroom, June 2026, on the new intelligence frameworks; Apple Support, "What's new in iOS 27" (the Liquid Glass slider).
- Apple Developer iOS/iPadOS 26.4 and 26.5 release notes -- the 26.x point-release entries.

## See also

- `references/_scaffolding/version-floor-registry.md` -- the authoritative floor tables this log narrates but never restates
- `references/design/02-liquid-glass.md` -- the Liquid Glass API surface
- `references/design/07-navigation-patterns.md` -- the iOS 27 toolbar and tab surface
- `references/platform/06-apple-intelligence-ui.md#foundation-models-sessions-streaming-and-tool-calling-ui` -- the Apple Intelligence surfaces this log only dates
- `references/platform/02-app-intents-system.md` -- Siri AI adoption through App Intents
- `references/methodology/03-apple-samples-teardown.md` -- companion file: how these APIs compose into screens
