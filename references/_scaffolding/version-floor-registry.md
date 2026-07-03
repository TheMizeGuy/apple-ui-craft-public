# Version-floor registry

The single source of truth for availability floors cited by every reference file. When a file and this registry disagree, this registry wins -- fix the file. Sources: Context7-verified audit ledger + final verification wave (2026-07-03). iOS 26.1 shipping, iOS 27 = developer beta.

## iOS 27.0+ (Beta -- gate `#available(iOS 27, *)` + `// SDK-verify`; never in primary examples)

| API | Note |
|---|---|
| `ToolbarMinimizeBehavior.onScrollDown` | Distinct from `TabBarMinimizeBehavior.onScrollDown` (26.0) -- split the gates |
| SwiftData `@Query(sort:sectionBy:)`, `Query(_:transaction:sectionBy:)` | iOS-26 fallback = `Dictionary(grouping:)`. NEVER conflate with Core Data `SectionedFetchRequest` (iOS 15+). `ResultsSectionCollection` name unconfirmed in public docs -- SDK-verify |
| `reorderable()` / `reorderContainer(for:itemID:isEnabled:move:)` | iOS-26 path = `List.onMove` or `.draggable` + `.dropDestination` |
| `MXAnimationMetric` successor `ScrollHitchTimeMetric` | On 26 use `scrollHitchTimeRatio` (iOS 14+) |
| AsyncImage HTTP caching | Pre-27: no cache -- own the pipeline |
| WWDC26-announced, SDK-unverified | `.visibilityPriority`, `ToolbarOverflowMenu`, `Tab(role: .prominent)`, `@ContentBuilder`, `appearsActive` -- quarantine until SDK confirms |

## iOS 26.x

| Floor | APIs |
|---|---|
| 26.0 | Liquid Glass: `glassEffect(_:in:)`, `Glass.regular/.clear/.identity` + `.tint(_ color: Color?)` + `.interactive(_:)`, `GlassEffectContainer`, `.buttonStyle(.glass)` / `.glassProminent`, `backgroundExtensionEffect()`, `scrollEdgeEffectStyle(_:for: Edge.Set)` |
| 26.0 | `TabBarMinimizeBehavior.onScrollDown`, `tabViewBottomAccessory`, `ToolbarSpacer`, `ConcentricRectangle`, `.symbolEffect(.drawOn/.drawOff)`, `listSectionIndexVisibility(_:)`, Foundation Models (`LanguageModelSession`, `@Generable`, `@Guide`, `SystemLanguageModel.default.availability`), `WebView`/`WebPage` (SwiftUI, module WebKit), `webViewScrollInputBehavior(_:for:)`, `webViewElementFullscreenBehavior(_:)`, `AssistiveAccess` scene, Chart3D family (`Chart3D`, `Chart3DPose`, `SurfacePlot(x:y:z:function:)`), `.impact` sensory feedback on visionOS |
| 26.0 | `chart3DCameraProjection` / `Chart3DCameraProjection`: iOS/iPadOS/macOS/Catalyst 26 ONLY -- NOT visionOS (Chart3D + Chart3DPose DO include visionOS 26) |
| 26.1 | Parameterized `.buttonStyle(.glass(_:))` / `GlassButtonStyle.init(_:)` / `.glass(.clear)` [SDK-verify exact minor]; Tinted appearance = Settings toggle, NO API |
| 26.2 | `.assistant.activate` [plausible -- SDK-verify] |
| 26.4 | `accessibilityPrefersCrossFadeTransitions` (the ONE writable a11y env member); `.task(name:file:line:)` no-ops before 26.4 |

## iOS 18.0

`@Entry`, `symbolEffect(.wiggle/.breathe/.rotate)`, `matchedTransitionSource` / `.navigationTransition(.zoom)` (not tvOS), `TextRenderer` (protocol floor 18 -- ignore DocC method pages saying 17), value-typed `Tab(_:systemImage:value:content:)`, `presentationSizing`, `ControlWidget` family, `.writingToolsBehavior`, `AVCaptureSlider` (AVFoundation, not AVKit), `ScrollInputKind` + `.handGestureShortcut` (predate WebKit adoption -- NOT 26), `accessibilityAssistiveAccessEnabled` env (scene is 26), `AccessibilityActionCategory` (init takes `Text`; String literal bridges), `SystemFormatStyle.DateOffset` (SwiftUI type, not Foundation), UIKit `NSAdaptiveImageGlyph` (Genmoji)

## iOS 17.0

`.sensoryFeedback` / `SensoryFeedback` (incl. `.start`/`.stop` -- REAL, watchOS-primary; `.pathComplete`), `.impact(weight:)` with `.light/.medium/.heavy` ONLY (default `.medium`) / `.impact(flexibility:)` with `.rigid/.soft/.solid` (no default), `ContentUnavailableView` + `.search` (NOT 18), `toolbarTitleDisplayMode(.inlineLarge)` (NOT "26 adds"), `@Observable`, TipKit, StandBy widgets, `.scrollTransition` / `.visualEffect`, `value.velocity` on DragGesture, `.interactiveSpring(duration:extraBounce:blendDuration:)`, `subscriptionStatusTask(for:priority:action:)` (StoreKit -- `\.subscriptionStatuses` env + `Status.all` do NOT exist), `Text.Layout.DrawingOptions.disablesSubpixelQuantization`, `Section(_:isExpanded:content:)`

## iOS 16.0

`NavigationStack` / `NavigationSplitView`, `navigationSplitViewColumnWidth(min:ideal:max:)` (NOT 17), `presentationDetents`, `lineLimit(_:reservesSpace:)`, `onGeometryChange(for:of:action:)` (NOT 18), `AddPassToWalletButton` (`init(_ passes:onCompletion:)` / `init(action:)`; the `add:`/`pass:` inits are fabrications) + `.addPassToWalletButtonStyle(_:)`, `String.LocalizationOptions.replacements` (property, not `.replacing(arguments:)`; NOT 17), `Duration.UnitsFormatStyle(allowedUnits:width:)` (`allowed:` label only on `.units(allowed:width:)` factory), ScenePadding parent type (`.navigationBar` behavior = watchOS 9 / macOS scoped -- iOS header alignment no-op)

## iOS 15.0 and earlier

`redacted(reason:)` = 14.0 (`.privacy` 15, `.placeholder` 14) · `#bundle` macro runtime floor 15.0 (COMPILES only with Xcode 26 / Swift 6.2) · Core Data `SectionedFetchRequest` = 15.0 · `predictedEndTranslation` = 13.0 (projected POSITION delta in points -- not velocity) · `@Entry`-less `EnvironmentKey` hand-roll only for Xcode 15-or-older toolchains (@Entry back-deploys to iOS 13)

## Not-iOS (the #1 mis-gate class)

| API | Actual platform |
|---|---|
| `Font.TextStyle.extraLargeTitle` / `.extraLargeTitle2` | visionOS 1.0+ ONLY. iOS ramp stays 11 styles, tops at `.largeTitle` |
| `glassBackgroundEffect(in:displayMode:)` | visionOS 1.0+ (`.automatic` 2.4). visionOS does NOT get `glassEffect()` |
| `perspectiveRotationEffect(_:axis:anchor:perspective:)` | visionOS-recommended over perspective `rotation3DEffect` |
| `pointerStyle(_:)` | macOS 15 / visionOS 2 -- NOT iPadOS (use UIKit `UIPointerInteraction`) |
| `pointerVisibility(_:)`, `modifierKeyAlternate(_:_:)`, `onModifierKeysChanged(mask:initial:_:)` | macOS 15 ONLY |
| `focusSection()` | macOS 13 / tvOS 15 ONLY -- not an iOS focus-grouping API |
| `digitalCrownRotation(_:)` basic + ranged | watchOS 6.0 (only the `(_:onChange:onIdle:)` event overload is watchOS 9) |
| `SceneRestorationBehavior.disabled` | macOS 15 / visionOS 26 ONLY (modifier + `.automatic` = iOS 18; iOS lever = `@SceneStorage` presence) |
| tvOS overscan safe margins | 80 pt sides / 60 pt top-bottom (per current tvOS HIG Layout) |

## Deprecated (label as Deprecated, never "discouraged")

`NavigationView` · `foregroundColor(_:)` · `cornerRadius(_:antialiased:)` · `accentColor(_:)` · `.animation(_:)` (no-value) · `UIScreen.main` (iOS 16 -- use `window?.windowScene?.screen`) · `MXAppLaunchMetric.histogrammedApplicationResumeTime` (since iOS 13; whole class deprecated in iOS 27 SDK) · `openAppWhenRun` on ControlWidget (iOS 26 -- use `supportedModes:` / `OpenURLIntent`) · UIKit `applicationDidEnterBackground` lifecycle in SwiftUI files (use `\.scenePhase`)

## PHANTOM -- never emit, even to refute

`Glass.thin` / `Glass.thick` · `@Environment(\.tintMode)` / `TintMode` · `@Environment(\.safeAreaInsets)` · "Sequoia Glass" (macOS 26 = Tahoe) · `@Equatable` view macro · `MXAnimationMetric.hitchTimeRatio` · `SWIFT_CROSS_MODULE_OPTIMIZATION` build setting (use `OTHER_SWIFT_FLAGS -cross-module-optimization`) · `WebView.BackForwardList` (it is `WebPage.BackForwardList`) · `PayWithApplePayButtonPaymentAuthorizationChangePhase` (no "Change"; cases `willAuthorize` / `didAuthorize(payment:resultHandler:)` / `didFinish`) · `MACaptionAppearanceGetForegroundColor` (Copy-rule: `MACaptionAppearanceCopyForegroundColor` returning `Unmanaged<CGColor>`)

## Build-tool floors (performance/07 cites this)

`-warn-long-function-bodies=N` / `-warn-long-expression-type-checking=N`: each flag `-Xfrontend`-prefixed inside `OTHER_SWIFT_FLAGS`. Cross-module optimization: `-cross-module-optimization` via `OTHER_SWIFT_FLAGS` (SwiftPM: `-Xswiftc`), pair with `@inlinable`.
