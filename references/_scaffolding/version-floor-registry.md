# Version-floor registry

The single source of truth for availability floors cited by every reference file. When a file and this registry disagree, this registry wins -- fix the file. Sources: Apple's DocC symbol metadata (`metadata.platforms`: `introducedAt`, `beta`, `deprecatedAt`) plus the iOS & iPadOS 27 and Xcode 27 release notes, re-verified 2026-09-22; the iOS 26.x and older tables carry over from the 2026-07-03 Context7 audit. **iOS 27.0 shipped 2026-09-14** with Xcode 27 and Swift 6.4, alongside iPadOS, macOS, watchOS, tvOS and visionOS 27. **Two point releases are in developer beta:** iOS 27.1 (the iPhone Duo surface; DocC flags its symbols `beta: true`) and iOS 27.2 (Apple's "iOS & iPadOS 27.2 Beta 2" release notes). Apple's documentation stamps soft deprecations (`API_TO_BE_DEPRECATED`) with the newest SDK, currently 27.2 -- `NavigationView` carries the same stamp -- so a "deprecated 27.2" label means "prefer the replacement", not a 27.2 event. Only 27.0 stamps mark an iOS 27 change.

## How to gate

- **iOS 27.0 APIs are current.** When one is the right tool it is the primary example. The deployment target decides the gate: an app that still supports iOS 26 wraps the call in `if #available(iOS 27, *)` and ships a real iOS 26 fallback beside it.
- **Toolchain changes have no runtime gate.** Some iOS 27 changes need Xcode 27 to compile but run on older OSes (the `@State` macro, `ContentBuilder`, item/error alerts). Say "Xcode 27" for these, never `#available`.
- **Rebuild changes bite without a code change.** Several behaviors switch on when an app is *built with* the 27.0 SDK, whatever its deployment target (table below). A review of a project moving to Xcode 27 checks these first.
- **Beta tier: iOS 27.1 and 27.2.** Symbols Apple still labels beta gate on their own minor (`#available(iOS 27.1, *)`), carry a `// beta: verify against the installed SDK` comment, and stay out of primary examples until they ship.

## iOS 27.1 (developer beta -- iPhone Duo)

Apple's SwiftUI updates page lists these under "September 2026", which reads like the shipped delta and is not: every symbol is `introducedAt 27.1, beta: true`, iOS/iPadOS only. The HIG "Designing for iPhone Duo" page (added 2026-09-09) is already live, and its guidance -- side-mounted bars on the outer display, content that survives the hinge -- applies to layout decisions now.

| API | Note |
|---|---|
| `ArrangementView` / `ArrangementViewStyle` (`.split`, `.overlay`) and the split/overlay arrangement modifiers | Folded/unfolded layout arrangements |
| `ReservedRegion`, `GeometryProxy.reservedRegions(kind:options:layoutDirectionBehavior:)` | Hinge-aware layout regions |
| `onHingeChange(isEnabled:_:)`, `DeviceHinge`, `DeviceHingeContext`, `CameraCaptureAccessory` | Hinge state; outer-display camera accessory |
| `toolbarVerticalEdge`, `toolbarVerticalBehavior(_:)`, `ToolbarItemAxisBehavior`, `ToolbarVerticalCompressionBehavior` | Side-mounted bars on the Duo; sheets present bars vertically there, inspectors never do |
| `AVMediaCharacteristic.signLanguageInterpretationForAccessibility` (27.1), `ATTrackingManager.requestTrackingAuthorization(usingExpandedInterface:...)` (27.2), `AVCaptureDeviceDirectionCoordinator` (27.1-era) | Beta outside the Duo surface |

## iOS 27.0 (shipped 2026-09-14)

| API | Floor and platforms | Note |
|---|---|---|
| `toolbarMinimizationBehavior(_:for:)` + `ToolbarMinimizationBehavior` (`.automatic`/`.never`/`.onScrollDown`/`.onScrollUp`) | 27.0 all platforms; the explicit cases are iOS/iPadOS/Catalyst only; `.navigationBar` is the only supported placement | Renamed before release from `toolbarMinimizeBehavior` (PHANTOM). A DIFFERENT type from the 26.0 `TabBarMinimizeBehavior.onScrollDown` -- split the gates |
| `ToolbarContent.visibilityPriority(_:)` + `ToolbarItemVisibilityPriority` | 27.0 iOS/iPadOS/Catalyst/tvOS/visionOS/watchOS; macOS 26.1 | Lower priority overflows first. The custom-rank `init(higherThan:)`/`init(lowerThan:)` are iOS/iPadOS/Catalyst/macOS 27.0 only |
| `ToolbarOverflowMenu` | 27.0 iOS/iPadOS/Catalyst/visionOS -- not macOS/tvOS/watchOS | Content that always lives in the overflow menu. Fallback: a `Menu` with an `ellipsis` label |
| `ToolbarItemPlacement.topBarPinnedTrailing` | 27.0 iOS/iPadOS/Catalyst/visionOS | Never overflows. Fallback: `.topBarTrailing` with a low item count |
| `ToolbarPlacement.statusBar` (with `toolbarColorScheme`/`toolbarVisibility`) | 27.0 iOS/iPadOS/Catalyst | Status-bar style and visibility from SwiftUI |
| UIKit: `UIBarButtonItemVisibilityPriority`, `UINavigationItem.navigationBarMinimization` | 27.0 | UIKit mirror of the toolbar overflow story. `UINavigationItem.pinnedTrailingGroup` and `additionalOverflowItems` are iOS 16.0 -- do NOT gate them at 27 |
| `TabRole.prominent` (`Tab(role: .prominent)`) | 27.0 all platforms | One prominent tab, placed in a distinct trailing area |
| `PickerStyle.tabs` / `TabsPickerStyle` | 27.0 -- not watchOS | Segmented-like; VoiceOver reads it as tabs |
| `presentationPlacement(_:)` + `PresentationPlacement` (`.automatic`/`.center`/`.leading`/`.trailing`) | modifier and `.automatic` 27.0 all platforms; `.center`/`.leading`/`.trailing` iOS/iPadOS/Catalyst only | Sheets only |
| `NavigationTransition.crossFade` / `CrossFadeNavigationTransition` | 27.0 -- not macOS | A fade instead of a slide or zoom; the natural Reduce Motion substitute for `.zoom` |
| `reorderContainer` (4 overloads: `(for:isEnabled:move:)`, `(for:itemID:isEnabled:move:)`, `(for:in:isEnabled:move:)`, `(for:itemID:in:isEnabled:move:)`) + `reorderable()` / `reorderable(collectionID:)` on `DynamicViewContent` | 27.0 iOS/iPadOS/Catalyst/macOS/visionOS/watchOS -- not tvOS | Move closure gets `ReorderDifference` (`sources`, `destination`); the app writes the mutation. iOS 26 path: `List.onMove` or `.draggable` + `.dropDestination` |
| `swipeActions(edge:allowsFullSwipe:content:onPresentationChanged:)` + `swipeActionsContainer()` | 27.0 -- not tvOS | Swipe actions on any view inside a container, not only `List` rows |
| `dragContainer(for:in:_:)` family (`dragContainerSelection`, `dragConfiguration(_:)`, `dropConfiguration(_:)`, `onDragSessionUpdated(_:)`) | 27.0 iOS/iPadOS/Catalyst/visionOS (macOS 26.0) | Multi-item drag reaches iOS |
| `DropSession.reorderDestination(for:in:)` / `(for:itemID:in:)` | 27.0 iOS/iPadOS/Catalyst/macOS/visionOS -- not tvOS/watchOS | Drop target for a reorder session |
| `GestureInputKinds` (`.all`/`.directTouch`/`.indirectTouch`/`.pencil`/`.pointer`) + `inputKinds:` on gesture initializers, `onTapGesture`, `onLongPressGesture` | 27.0 (per-gesture platform lists vary) | Restrict a gesture to touch, Pencil, or pointer |
| `TextInputBorderShape` + `textInputBorderShape(_:)`, `.textFieldStyle(.bordered)` | 27.0 | `.squareBorder`/`.roundedBorder` styles superseded |
| Selectable `Text` gets the system selection UI; `TextRenderer` works on selectable text | 27.0 SDK | `.textSelection(.enabled)` behavior change |
| `GeometryProxy.concentricCornerRadii` | 27.0 all platforms | Concentric radii without drawing a `ConcentricRectangle` |
| `ExternalNonInteractiveAccessory` + `.sceneAccessory` | 27.0 iOS/iPadOS | Non-interactive content on external displays |
| `UIScene.extendStateRestoration` / `completeStateRestoration` | Symbols iOS 15 / tvOS 15 / Catalyst 15 / visionOS 1; linked on the 27.0 SDKs they also cover background-to-foreground transitions | No `#available(iOS 27, *)` -- the 27.0 condition is the SDK you build with |
| `Document` / `ReadableDocument` / `WritableDocument`, `DocumentReader`/`DocumentWriter`, `URLDocumentConfiguration`, `DocumentCreationSource` | 27.0 -- not tvOS/watchOS | Replaces `FileDocument`; document apps stay out of this library's scope |
| `AsyncImage` HTTP caching (default), `asyncImageURLSession(_:)`, `AsyncImage(request:scale:...)` | 27.0 all platforms | Pre-27: no cache -- own the pipeline |
| SwiftData `@Query(..., sectionBy:)` + `Query.sections` -> `SectionedResults<Element, String>` of `ResultsSection`; `ResultsObserver`, `HistoryObserver` | 27.0 all platforms | iOS 26 fallback: `Dictionary(grouping:)` outside `body`. NEVER Core Data's `SectionedFetchRequest` (iOS 15) |
| Swift MetricKit: `MetricManager` (`metricReports`/`diagnosticReports` async sequences), `MetricResult`, `HitchTimeMetric`, `Foreground`/`BackgroundTerminationMetric`, `TimeToFirstDrawMetric` family, `trackLaunchTask`, `MetalFrameRateMetric`, `StateReporting` | 27.0 iOS/iPadOS/Catalyst/macOS (several not tvOS/watchOS/visionOS) | `PeakMemoryMetric` and `MemoryExceptionDiagnostic` are iOS/iPadOS only. Pre-27 devices: the MX family |
| `ObservationTracking.Options` / `withContinuousObservation` (SE-0506) | 27.0 all platforms, Swift 6.4 | Pre-27: `withObservationTracking(_:onChange:)` (17) or `Observations` (26) |
| `toolbarMinimizationRestoration(_:for:)` (`.atScrollEdge`), minimization safe-area adjustment, `contentMarginsRemoved(_:)`, `ignoresSafeArea(_:edges:alignment:)` | 27.0 (per-case platform lists vary) | Toolbar and layout companions |
| `dismissalConfirmationDialog(_:shouldPresent:actions:)` | 27.0 iOS/iPadOS/Catalyst (macOS 15) | Confirmation when the window hosting the view is closed over unsaved work; the swipe-down guard is `interactiveDismissDisabled` |
| PhotosUI `photosReferenceImageViewer(...)`, shared-album sheets | 27.0 (viewer not visionOS) | `PhotosPicker` unchanged |
| `WidgetFamily.systemExtraLargePortrait` | 27.0 iOS/iPadOS/Catalyst/macOS; visionOS 26.0 (earlier) -- not watchOS/tvOS | WidgetKit's only 27.0 addition; ActivityKit has none |
| `EnvironmentValues.isDynamicIslandLimitedInWidth` | 27.0 iOS/iPadOS/Catalyst | Dynamic Island in landscape |
| Now Playing framework (`MediaSession`, `MediaCommand`, ...) | 27.0 all platforms | Supersedes `MPNowPlayingInfoCenter` for new work |
| Scene accessories: SwiftUI `sceneAccessory(content:)` + `ExternalNonInteractiveAccessory` (iOS/iPadOS); UIKit `UISceneAccessory` (+ Catalyst) | 27.0 | Camera-capture accessory is 27.1 beta |
| `UISceneClosureConfirmation`, `UIWindowSceneDelegate.supportedInterfaceOrientations(for:)`, `UIWindowScene.displayLink(...)`, `UIApplication.systemPrefersReducedResourceUsage` | 27.0 (see per-symbol platforms) | Per-scene orientation, closure confirmation, frame pacing, low-resource mode |
| `UNMutableNotificationContent.appEntityIdentifiers` | 27.0 all platforms | Ties a notification to App Intents entities |
| WebKit: `WebPage.FormInfo` + `NavigationDeciding.willSubmit(formInfo:)`, `WebPage.NavigationPreferences` additions | 27.0 -- not tvOS/watchOS | `WebPage.ImmersiveEnvironment` is visionOS 27 only |
| Eleven new `MKPointOfInterestCategory` values | 27.0 all platforms | Map filtering by category |
| App Intents: `LongRunningIntent`, `OwnershipProvidingEntity`, `EntityCollection`, `SyncableEntity`, `RelevantEntities`, `@UnionValue`, `IntentExecutionTargets` | 27.0 all platforms | `IndexedEntityQuery` not tvOS/watchOS; `RunSystemShortcutIntent` iOS/iPadOS/Catalyst only; `.system.searchInApp` replaces `.system.search`. The eight schema domains audio/calendar/clock/maps/messages/notes/phone/reminders are 27.0; `AppIntentError`'s descriptive initializers are 27.0. `UndoableIntent` is 26.0; `CancellableIntent`/`IntentValueRepresentation` are 26.4 |
| Foundation Models: `LanguageModel` + `PrivateCloudComputeLanguageModel`, `Attachment`/`ImageAttachmentContent`, `LanguageModelSession.DynamicProfile`/`Profile`, `GenerationOptions.ToolCallingMode`, `LanguageModelError` | 27.0 -- never tvOS; `LanguageModelSession` reaches watchOS 27 | Vision tools: `OCRTool` not watchOS, `BarcodeReaderTool` watchOS 27; `OCRTool` not in Simulator. `SystemLanguageModel.default.contextSize`/`.tokenCount(for:)` (instance members, back-deployed) replace hardcoded windows |
| `ImagePlaygroundStyle.any` | 27.0 | `.imagePlaygroundOptions(_:)` is 26.4; the Image Playground sheet is 18.1 |
| Accessibility: `AXSpeechAttributeSSML`, `AccessibilitySettings.isApplicationAccessibilityEnabled`, `MACaptionAppearanceDomain.videoConferencing` | 27.0 (MediaAccessibility not on watchOS) | No new SwiftUI/UIKit accessibility modifiers, traits or environment values in 27.0 |
| AVKit `AVPlaybackUserInterfaceMediaSelectionControllable` | 27.0 iOS/iPadOS/Catalyst | Audio, audio-description and subtitle selection in custom players (six required members) |
| StoreKit: `AppStore.presentOfferCodeRedeemSheet(from:options:)`, `offerCodeRedemption(options:isPresented:onCompletion:)`, `RedeemOption`, `Product.ProductType.subscriptionBundle`/`.subscriptionSuite` | 27.0 (offer codes not tvOS/watchOS) | The pre-27 offer-code forms are deprecated |
| `ApplePayMerchandisingView` | 27.0 iOS/iPadOS ONLY | Load-bearing `fallback:` builder |
| PassKit multi-pass adds (`PKAddPassesViewController(passesData:)`, archive forms) | 27.0 -- not macOS/tvOS/watchOS | One sheet for a group of passes |
| `ASDeliveredVerificationCodesManager`; PermissionKit `askSignificantChangePermission(for:permissionFlow:in:)` | 27.0 -- not tvOS/watchOS | The first is for credential-provider apps only; PermissionKit itself is 26.0 |
| `UITabBarController.prominentTabIdentifier` | 27.0 | UIKit mirror of `TabRole.prominent` |
| CarPlay: `CPNowPlayingTemplate.allowsMiniPlayer`, `CPMapPanel` / `CPMapPanelSection` / `CPMapPanelItem`; video app category (`com.apple.developer.carplay-video`) | 27.0 | Voice Control and Search templates reach most categories |

## Xcode 27 toolchain changes (no runtime floor)

| Change | Note |
|---|---|
| `@State` is a macro with lazy initialization | `@State private var model = Model()` builds `Model` once per view lifetime. Apple: back-deploys to iOS 17-aligned OSes. Source breaks: a declaration-site value plus an `init` assignment no longer compiles; the synthesized private memberwise init is suppressed; no wrapper composition |
| `ContentBuilder` = `typealias ContentBuilder = ViewBuilder` | Symbol floor iOS 13; the unified builder replacing `ToolbarContentBuilder`/`CommandsBuilder` at call sites. Not an iOS 27 API |
| Item- and error-driven `alert` / `confirmationDialog` (`item:` / `error:` bindings) | Runtime floor iOS 15 (`@export(implementation)`); needs Xcode 27 to compile. No `#available` |
| `@Entry` warns on default class instances and closures | Environment defaults should be inert value types |
| Approachable-concurrency defaults (MainActor default isolation) | An unannotated `nonisolated async` method runs on the main actor; `@concurrent` is the off-main annotation |
| `withTaskCancellationShield` (SE-0504) | Swift 6.4 stdlib; no DocC page |

## Built-with-27.0-SDK behavior changes (apply at any deployment target)

| Change | What breaks or changes |
|---|---|
| Scene-based life cycle is mandatory (iOS/iPadOS/Catalyst/tvOS/visionOS) | An app without it fails to launch |
| A launch screen is required (`UILaunchStoryboardName` or `UILaunchScreen`) | Missing key: rejection |
| `TabView` selection must resolve to a visible tab | Selection pointing at a hidden tab can crash; clamp it when the visible set changes |
| `controlSize`, `buttonSizing`, `buttonRepeatBehavior`, `menuIndicatorVisibility`, `ButtonBorderShape` reset inside sheets and popovers | Re-apply them inside the presented content |
| Presented UIKit view controllers inherit traits through the superview chain | Trait overrides on a presenter now reach its presentations |
| iPad continuous resizability no longer gated by declared orientations; `UIRequiresFullScreen` now selects discrete resizing (each resize a new `UIScreen`) instead of opting out | Every iPad layout must survive arbitrary window sizes; iPhone apps resize under iPhone Mirroring too |
| iPadOS menu bar and macOS 27 menus show a reduced set of item images | Don't rely on menu-item icons for meaning |
| `UISearchController` center placement puts the scope bar inline | Re-check search headers |
| `AsyncImage` HTTP caching; retroactive `Equatable` conformances of SwiftUI types are consulted | Re-measure `.equatable()` wins |
| Neural Engine memory is attributed to the app process | Jetsam risk for apps loading large on-device models |

## iOS 26.x

| Floor | APIs |
|---|---|
| 26.0 | Liquid Glass: `glassEffect(_:in:)`, `Glass.regular/.clear/.identity` + `.tint(_ color: Color?)` + `.interactive(_:)`, `GlassEffectContainer`, `glassEffectID(_:in:)`, `glassEffectUnion(id:namespace:)`, `glassEffectTransition(_:)`, `.buttonStyle(.glass)` / `.glassProminent`, parameterized `.buttonStyle(.glass(_:))` / `.glass(.clear)` (the explicit `GlassButtonStyle.init(_:)` is 26.1), `backgroundExtensionEffect()`, `scrollEdgeEffectStyle(_:for: Edge.Set)`. No Glass symbol changed in iOS 27 |
| 26.0 | `TabBarMinimizeBehavior.onScrollDown`, `tabViewBottomAccessory`, `ToolbarSpacer`, `ConcentricRectangle`, `.symbolEffect(.drawOn/.drawOff)`, `listSectionIndexVisibility(_:)`, Foundation Models (`LanguageModelSession`, `@Generable`, `@Guide`, `SystemLanguageModel.default.availability`), `WebView`/`WebPage` (SwiftUI, module WebKit), `webViewScrollInputBehavior(_:for:)`, `webViewElementFullscreenBehavior(_:)`, `AssistiveAccess` scene, Chart3D family (`Chart3D`, `Chart3DPose`, `SurfacePlot(x:y:z:function:)`), `.impact` sensory feedback on visionOS |
| 26.0 | `chart3DCameraProjection` / `Chart3DCameraProjection`: iOS/iPadOS/macOS/Catalyst 26 ONLY -- NOT visionOS (Chart3D + Chart3DPose DO include visionOS 26) |
| 26.1 | The explicit `GlassButtonStyle.init(_:)` initializer (the `.glass(_:)` factory is 26.0). Clear/Tinted Liquid Glass appearance = a Settings toggle, NO API (iOS 27 turns it into a continuous Clear-to-Tinted slider; still no API). `UIDesignRequiresCompatibility` (the 26.x opt-out key) is ignored when built with the iOS 27 SDK |
| 26.2 | `.assistant.activate` schema -- iPhone in Japan only, entitlement-gated |
| 26.4 | `accessibilityPrefersCrossFadeTransitions` (the ONE writable a11y env member); the `executorPreference:` overload of `.task` (`task(name:priority:file:line:_:)` itself is iOS 15.0 and back-deploys) |

## iOS 18.0

`@Entry`, `EnvironmentValues.appearsActive` (visionOS 2 / watchOS 11; macOS back-deployed -- NOT a WWDC26 symbol), `symbolEffect(.wiggle/.breathe/.rotate)`, `matchedTransitionSource` / `.navigationTransition(.zoom)` (not tvOS), `TextRenderer` (protocol floor 18 -- ignore DocC method pages saying 17), value-typed `Tab(_:systemImage:value:content:)`, `presentationSizing`, `ControlWidget` family, `.writingToolsBehavior`, `AVCaptureSlider` (AVFoundation, not AVKit), `ScrollInputKind` + `.handGestureShortcut` (predate WebKit adoption -- NOT 26), `accessibilityAssistiveAccessEnabled` env (scene is 26), `AccessibilityActionCategory` (init takes `Text`; String literal bridges), `SystemFormatStyle.DateOffset` (SwiftUI type, not Foundation), UIKit `NSAdaptiveImageGlyph` (Genmoji)

## iOS 17.0

`.sensoryFeedback` / `SensoryFeedback` (incl. `.start`/`.stop` -- REAL, watchOS-primary; `.pathComplete`), `.impact(weight:)` with `.light/.medium/.heavy` ONLY (default `.medium`) / `.impact(flexibility:)` with `.rigid/.soft/.solid` (no default), `ContentUnavailableView` + `.search` (NOT 18), `toolbarTitleDisplayMode(.inlineLarge)` (NOT "26 adds"), `@Observable`, TipKit, StandBy widgets, `.scrollTransition` / `.visualEffect`, `value.velocity` on DragGesture, `.interactiveSpring(duration:extraBounce:blendDuration:)`, `Spring` type (`init(mass:stiffness:damping:allowOverDamping:)`, `init(response:dampingRatio:)`, derived `duration`/`bounce` -- the web-spec conversion bridge), `subscriptionStatusTask(for:priority:action:)` (StoreKit -- `\.subscriptionStatuses` env + `Status.all` do NOT exist), `Text.Layout.DrawingOptions.disablesSubpixelQuantization`, `Section(_:isExpanded:content:)`

## iOS 16.0

`NavigationStack` / `NavigationSplitView`, `navigationSplitViewColumnWidth(min:ideal:max:)` (NOT 17), `accessibilityZoomAction(_:)` + `AccessibilityZoomGestureAction` (NOT 13), `accessibilityDragPoint(_:description:)` / `accessibilityDropPoint(_:description:)`, `presentationDetents`, `lineLimit(_:reservesSpace:)`, `onGeometryChange(for:of:action:)` (NOT 18), `AddPassToWalletButton` (`init(_ passes:onCompletion:)` / `init(action:)`; the `add:`/`pass:` inits are fabrications) + `.addPassToWalletButtonStyle(_:)`, `String.LocalizationOptions.replacements` (property, not `.replacing(arguments:)`; NOT 17), `Duration.UnitsFormatStyle(allowedUnits:width:)` (`allowed:` label only on `.units(allowed:width:)` factory), ScenePadding parent type (`.navigationBar` behavior = watchOS 9 / macOS scoped -- iOS header alignment no-op)

## iOS 15.0 and earlier

`redacted(reason:)` = 14.0 (`.privacy` 15, `.placeholder` 14) · `#bundle` macro runtime floor 15.0 (COMPILES only with Xcode 26 / Swift 6.2) · Core Data `SectionedFetchRequest` = 15.0 · `predictedEndTranslation` = 13.0 (projected POSITION delta in points -- not velocity) · `accessibilityScrollAction(_:)` = 13.0 (NOT 16) · `@Entry`-less `EnvironmentKey` hand-roll only for Xcode 15-or-older toolchains (@Entry back-deploys to iOS 13)

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
| `glassEffect(_:in:)` on visionOS 27 | Still not applied; `glassBackgroundEffect` remains the visionOS material |
| `SensoryFeedback.press(_:)` / `.release(_:)` / `.selection(_:)` control-specific feedback (`PressFeedback.button`/`.toggle`/`.tab`/`.buttonIconOnly`, ...) | Declared iOS 26.0, but Apple documents every case as "Only plays feedback on visionOS" -- a silent no-op on iPhone, never an iOS press haptic |
| `NSRefreshController` (pull-to-refresh on `NSScrollView`) | macOS 27 only |
| Accessory widget families on visionOS | visionOS 27.0 (system families 26.0) |
| tvOS 27 system Large Text | `dynamicTypeSize` now matters on tvOS; buttons stop auto-tinting labels with the accent color when built for tvOS 27 |

## Deprecated (label as Deprecated, never "discouraged")

`NavigationView` · `foregroundColor(_:)` · `cornerRadius(_:antialiased:)` · `accentColor(_:)` · `.animation(_:)` (no-value) · `UIScreen.main` (iOS 16 -- use `window?.windowScene?.screen`) · `MXAppLaunchMetric.histogrammedApplicationResumeTime` (since iOS 13) · the MetricKit MX family -- `MXMetricManager`, `MXMetricManagerSubscriber`, `MXMetricPayload`, `MXDiagnosticPayload`, `MXAppLaunchMetric`, `MXMemoryMetric`, `MXAppExitMetric`, `MXAnimationMetric` (iOS 27 SDK; still the reader on iOS 26 devices -- use `MetricManager` on 27) · `FileDocument` / `ReferenceFileDocument` (the iOS 27 release notes call `FileDocument` deprecated; DocC soft-deprecates both -- conform new types to `Document`, or `ReadableDocument` for read-only) · soft-deprecated, use the replacement in new code: `ContentSizeCategory` (use `DynamicTypeSize`), the legacy `accessibility(label:)` modifier family (use `accessibilityLabel(_:)` and siblings), `MKMapView`'s legacy configuration properties, `CLPlacemark` · `UIApplication.canOpenURL(_:)` (iOS 27; open the URL and handle failure) · `@AssistantIntent(schema:)` / `@AssistantEntity(schema:)` / `@AssistantEnum(schema:)` (iOS 27 SDK; use `@AppIntent(schema:)` and siblings, iOS 18+) · `.system.search` schema (use `.system.searchInApp`) · `LanguageModelSession.GenerationError` (27.0; rebuilding changes which error type is thrown -- update `catch` clauses) · `ImageCreator` (27.0) · the pre-27 offer-code APIs `presentOfferCodeRedeemSheet(in:)` / `offerCodeRedemption(isPresented:onCompletion:)` · `UIApplication.requestSceneSessionActivation` and `UIApplication.supportedInterfaceOrientations(for:)` (27.0) · On Demand Resources / `NSBundleResourceRequest` (27.0) · AVFoundation caption read/write adaptors (27.0) · `WKExtension` / `WKExtensionDelegate` (watchOS 27) · `.squareBorder` / `.roundedBorder` text field styles (soft-deprecated in iOS 27; use `.textFieldStyle(.bordered)` + `textInputBorderShape(_:)`) · `UINavigationItem.barMinimizeBehavior` + `barMinimizationSafeAreaAdjustment` (replaced in iOS 27 by `navigationBarMinimization`) · `openAppWhenRun` on ControlWidget (iOS 26 -- use `supportedModes:` / `OpenURLIntent`) · UIKit `applicationDidEnterBackground` lifecycle in SwiftUI files (use `\.scenePhase`)

## PHANTOM -- never emit, even to refute

`Glass.thin` / `Glass.thick` · `@Environment(\.tintMode)` / `TintMode` · `@Environment(\.safeAreaInsets)` · "Sequoia Glass" (macOS 26 = Tahoe) · `@Equatable` view macro · `MXAnimationMetric.hitchTimeRatio` · `SWIFT_CROSS_MODULE_OPTIMIZATION` build setting (use `OTHER_SWIFT_FLAGS -cross-module-optimization`) · `WebView.BackForwardList` (it is `WebPage.BackForwardList`) · `PayWithApplePayButtonPaymentAuthorizationChangePhase` (no "Change"; cases `willAuthorize` / `didAuthorize(payment:resultHandler:)` / `didFinish`) · `MACaptionAppearanceGetForegroundColor` (Copy-rule: `MACaptionAppearanceCopyForegroundColor` returning `Unmanaged<CGColor>`) · `toolbarMinimizeBehavior(_:for:)` / `ToolbarMinimizeBehavior` (WWDC26 beta name, renamed before release: `toolbarMinimizationBehavior` / `ToolbarMinimizationBehavior`) · `ScrollHitchTimeMetric` / `MetricResult.scrollHitchTime(_:)` (in the iOS 27 betas, removed before release -- a missing-symbol crash; use `HitchTimeMetric`) · `ResultsSectionCollection` (never existed; SwiftData's sectioned type is `SectionedResults<Element, String>`) · `ReorderDifference.apply(to:)` / `Array.apply(_:)` (SwiftUI ships no reorder mutation helper; the app writes it from `sources` + `destination`) · `.draggable(configuration:)` (the API is the separate `.dragConfiguration(_:)` modifier) · `DragSession.draggedItemIDs(type:)` (it is `draggedItemIDs(for:)`) · `preferredSubscriptionPricingTerms` (no such StoreKit API)

## Build-tool floors (performance/07 cites this)

`-warn-long-function-bodies=N` / `-warn-long-expression-type-checking=N`: each flag `-Xfrontend`-prefixed inside `OTHER_SWIFT_FLAGS`. Cross-module optimization: `-cross-module-optimization` via `OTHER_SWIFT_FLAGS` (SwiftPM: `-Xswiftc`), pair with `@inlinable`.
