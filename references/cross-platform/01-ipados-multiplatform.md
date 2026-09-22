# iPadOS + Multiplatform Craft

> Owner: `references/cross-platform/01-ipados-multiplatform.md` owns iPadOS windowing/multitasking, pointer + hardware-keyboard craft, and the cross-platform "adapt, don't port" strategy, per the ARCHITECTURE ownership map. Adaptive LAYOUT techniques (stack-vs-grid switching, breakpoints) live in `references/design/08-adaptive-layout-ipad.md`. Base `NavigationSplitView` mechanics, modal presentation, and the App Intents-driven Context Menu/Transferable/`.keyboardShortcut` patterns are owned elsewhere -- cited below, not restated. Per-platform deep dives for watchOS, tvOS, macOS Catalyst, and visionOS live in `references/cross-platform/02-watchos.md`, `03-tvos.md`, `04-macos-catalyst.md`, and `05-visionos.md`.
> Floors: `sidebarAdaptable` `TabView` + `TabSection`/`.customizationID` = iOS 18.0+. `navigationSplitViewColumnWidth(min:ideal:max:)` = iOS 16.0+ (see `references/_scaffolding/version-floor-registry.md#ios-160` -- do not over-gate to 17). `backgroundExtensionEffect()` = iOS 26.0+. `hoverEffect(_:)` = iOS/iPadOS 13.4+. `preferredWindowingControlStyle(for:)` and `containerCornerOffset(_:sizeToFit:)` = iOS/iPadOS 26.0+. iOS/iPadOS 27.0: `toolbarMinimizationBehavior(_:for:)`, `ToolbarOverflowMenu`, `topBarPinnedTrailing`, `TabRole.prominent`, `presentationPlacement(_:)`, `reorderable()` + `reorderContainer(for:isEnabled:move:)`, `ExternalNonInteractiveAccessory`, `GestureInputKinds` and the `inputKinds:` gesture initializers; `visibilityPriority(_:)` is iOS/iPadOS 27.0 but **macOS 26.1**. Apple Pencil: `onPencilSqueeze` / `onPencilDoubleTap` / `preferredPencilSqueezeAction` / `preferredPencilDoubleTapAction` = iOS/iPadOS 17.5+; `UICanvasFeedbackGenerator` = iOS/iPadOS 17.5+; `PKCanvasView` / `PKToolPicker` = iOS 13.0+ (`drawingPolicy` and `PKToolPicker.init()` = iOS 14.0+); `UIScribbleInteraction` = iOS 14.0+. The iPhone Duo surface (`ArrangementView`, `ReservedRegion`, `DeviceHinge`, the vertical-bar modifiers, `CameraCaptureAccessory`) is **iOS/iPadOS 27.1 and still beta** -- it is the one quarantined area on this page.

An iPad app that merely stretches its iPhone layout to fill the screen is the universal tell of a port. The Apple way reshapes navigation into a sidebar, gives the pointer real hover feedback, wires the hardware keyboard as a first-class input, and treats multi-window as the default rather than an edge case -- while keeping ONE model layer and one `AppIntent`/WidgetKit surface underneath. The most common craft failure isn't a missing feature; it's gating layout decisions on `UIDevice.current.userInterfaceIdiom` or `UIScreen.main.bounds` instead of `horizontalSizeClass`, which puts the wrong shape on screen the moment the user opens Split View or a narrow Stage Manager tile.

## The Apple way

- Never ship tab-only navigation on iPad -- a list-selects-detail app needs a sidebar.
- Size class drives layout SHAPE (split vs. stack, sidebar visible or not); it never means "iPhone vs. iPad" and never means orientation. An iPad in 1/3 Split View or a narrow Stage Manager tile IS `.compact`; an iPhone in landscape is STILL `.compact`.
- Support multi-window by default. From the iOS 27 SDK, `UIRequiresFullScreen = true` no longer opts an app out of resizing at all -- it selects *discrete* resizing, delivering each size change as a new screen configuration instead of continuous updates. It is a quality tradeoff (letterboxed, stepwise), never an escape from building a resizable layout, and App Review still pushes back without a hard justification (camera-lock, immersive AR).
- Hover and pointer-style feedback are polish on top of a design that is already complete without them -- touch, VoiceOver, and Full Keyboard Access users must reach everything a hover reveals.
- Adapt each platform's chrome (sidebar + hover on iPad, menu bar on Mac, ornaments + gaze on visionOS, Crown + double-tap on watch) around one shared model and intent layer -- never one layout stretched to fit.

## Choosing the top-level shape

Three correct top-level idioms, picked by information architecture, not by habit:

1. **`NavigationSplitView`** -- list-selects-detail apps (Mail, Notes, Files). Base two/three-column mechanics, `columnVisibility`, and the empty-detail-placeholder rule are owned by `references/design/07-navigation-patterns.md#navigationsplitview-ios-16` -- cite it rather than re-deriving it.
2. **`TabView { }.tabViewStyle(.sidebarAdaptable)`** (iOS 18+) -- several peer sections that each own a hierarchy (Music, News, App Store). Renders as a floating Liquid Glass tab bar on iPhone and compact iPad, and **expands into a full sidebar on regular-width iPad/Mac** -- one declaration, not tabs-or-sidebar.
3. Plain `TabView` -- only for a genuinely flat 3-5 peer utility with no iPad sidebar story.

```swift
struct RootView: View {
    @AppStorage("tabCustomization") private var customization = TabViewCustomization()
    @State private var selection: Panel = .home

    var body: some View {
        TabView(selection: $selection) {
            Tab("Home", systemImage: "house", value: Panel.home) { HomeView() }
                .customizationID("tab.home")                     // REQUIRED for reorder/hide to persist

            Tab("Search", systemImage: "magnifyingglass", value: Panel.search, role: .search) { SearchView() }
                .customizationID("tab.search")

            TabSection("Library") {                              // collapsible sidebar group
                Tab("Playlists", systemImage: "music.note.list", value: Panel.playlists) { PlaylistsView() }
                    .customizationID("tab.playlists")
                Tab("Artists", systemImage: "music.mic", value: Panel.artists) { ArtistsView() }
                    .customizationID("tab.artists")
            }
            .customizationID("section.library")
        }
        .tabViewStyle(.sidebarAdaptable)
        .tabViewCustomization($customization)                     // persists user reorder/hide across launches
    }
}
```

Missing `.customizationID(_:)` on any tab or section is a silent no-op -- reordering/hiding simply won't persist. Gate the SHAPE decision on size class, the internal arrangement of a single view on raw geometry:

```swift
struct AdaptiveRoot: View {
    @Environment(\.horizontalSizeClass) private var hSizeClass

    var body: some View {
        if hSizeClass == .compact {
            TabView { /* … */ }.tabViewStyle(.sidebarAdaptable)   // iPhone, Slide Over, 1/3 Split View
        } else {
            NavigationSplitView { Sidebar() } detail: { Detail() } // regular-width iPad, Mac
        }
    }
}
```

Constrain the sidebar so users can't drag it arbitrarily wide or narrow:

```swift
List(sections, selection: $selection) { Text($0.name) }
    .listStyle(.sidebar)
    .navigationSplitViewColumnWidth(min: 220, ideal: 280, max: 340)   // iOS 16.0+
```

On iPadOS 26, the sidebar renders as floating Liquid Glass over the detail content. Let content scroll edge-to-edge *behind* the translucent sidebar/inspector rather than being hard-clipped to the column by applying `backgroundExtensionEffect()` (iOS 26+) to the detail's background layer -- it mirrors and blurs the leading content under the glass so the material has something real to refract. Deep links should set the `selection` binding, not push a `NavigationPath` -- only a selection change lands `NavigationSplitView` on the right column combination; see `references/design/07-navigation-patterns.md#deep-linking` for the general routing mechanics this extends.

## Multi-window scenes and Stage Manager

iPad multitasking (Split View, Slide Over, Stage Manager, and iPadOS 26's free-form windows) is scene-based, one `WindowGroup`, many scene instances:

```swift
@main
struct DocumentApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }                    // primary, unlimited instances
        WindowGroup("Inspector", id: "inspector") { InspectorView() }
        WindowGroup(for: Note.ID.self) { $noteID in        // value-based: one window per document
            NoteEditor(id: noteID)
        }
    }
}

struct OpenButtons: View {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.supportsMultipleWindows) private var supportsMultipleWindows

    var body: some View {
        Button("Open Inspector") { openWindow(id: "inspector") }
            .disabled(!supportsMultipleWindows)            // silent no-op otherwise -- always guard
        Button("Open Note") { openWindow(value: note.id) } // matches WindowGroup(for:)
            .disabled(!supportsMultipleWindows)
    }
}
```

Route external events (Universal Links, `NSUserActivity`) to an already-open window instead of always spawning a new one -- two distinct modifiers, easy to confuse:

```swift
// SCENE modifier: decides whether an incoming URL/activity spawns a new scene or reuses one.
WindowGroup(id: "chat") { ChatRoot() }
    .handlesExternalEvents(matching: ["com.app.chat"])

// VIEW modifier: prefers routing activation to THIS already-open window when its tokens match.
ChatRoot()
    .handlesExternalEvents(preferring: [thread.id.uuidString], allowing: ["*"])
```

If you already use `NavigationStack`/`NavigationSplitView` + `.toolbar` (SwiftUI), the system relays toolbar items to new positions as a resizable window changes shape for free -- don't hand-roll bespoke top chrome that fights this.

**External displays became opt-in in iOS 27, which is a silent regression for any app that used one.** In apps built with the 27.0 SDK the system no longer offers `windowExternalDisplayNonInteractive` scenes automatically; a presentation view, slideshow or second-screen readout disappears on recompile unless the app registers a scene accessory:

```swift
// SwiftUI -- iOS/iPadOS 27.0
ContentView()
    .sceneAccessory {
        ExternalNonInteractiveAccessory {
            PresenterDisplay(slide: currentSlide)      // no touch input; the iPad stays the controller
        }
    }

// UIKit: UIViewController.registerSceneAccessory(_:) with a UISceneAccessory.externalNonInteractive instance.
```

Scene accessories are the general pattern, not a one-off -- the iPhone Duo's outer-display camera preview uses the same mechanism (`CameraCaptureAccessory`, 27.1 beta, below). Below iOS 27 the automatic external-display scene still works for apps built with earlier SDKs, so this is an SDK-linked check, not a deployment-target one.

## Bars, menus, and presentation at every window size

A resizable iPad window, a Split View tile, a Catalyst window dragged narrow and a folded iPhone Duo all run the same toolbar out of room. iOS 27 replaced the system's guess with a ranking you author.

```swift
.toolbar {
    ToolbarItem(placement: .topBarPinnedTrailing) {          // iOS/iPadOS/Catalyst/visionOS 27.0
        Button("Compose", systemImage: "square.and.pencil") { compose() }
    }
    ToolbarItem(placement: .primaryAction) {
        Button("Share", systemImage: "square.and.arrow.up") { share() }
    }
    .visibilityPriority(.high)                               // iOS 27.0 / macOS 26.1
    ToolbarItem { Button("Tag", systemImage: "tag") { tag() } }
        .visibilityPriority(.low)                            // first into the overflow
    ToolbarOverflowMenu {                                    // secondary actions, straight to overflow
        Button("Archive", systemImage: "archivebox") { archive() }
        Button("Delete", systemImage: "trash", role: .destructive) { delete() }
    }
}
```

`ToolbarItemVisibilityPriority` is `.automatic` / `.low` / `.high` plus `init(lowerThan:)` and `init(higherThan:)`. `topBarPinnedTrailing` anchors one item so it never shifts as the window resizes. Ask the concrete question in review: which two actions are guaranteed to survive at the narrowest size this app supports? An app-built "..." menu that duplicates the system overflow instead of feeding it is the failure mode.

Bar minimization was renamed in the same release. `toolbarMinimizationBehavior(_:for:)` with `ToolbarMinimizationBehavior` (`.automatic`, `.never`, `.onScrollDown`, `.onScrollUp`) is the shipped name for what WWDC26 showed as `toolbarMinimizeBehavior` (that spelling never shipped in any release); UIKit's `UINavigationItem.navigationBarMinimization` (a `UIBarMinimization` carrying `minimizationBehavior`, `restorationBehavior` and `safeAreaAdjustment`) replaces `barMinimizeBehavior` and `barMinimizationSafeAreaAdjustment`. `tabBarMinimizeBehavior(_:)` and `UITabBarController.tabBarMinimizeBehavior` were **not** renamed -- this is the single most likely stale symbol in 26-era code, and the toolbar and tab-bar gates must stay separate.

`TabRole.prominent` (27.0, every platform including watchOS; UIKit `UITabBarController.prominentTabIdentifier` with `setProminentTabIdentifier(_:animated:)` on iOS/iPadOS/Catalyst/visionOS) places one tab in a separate trailing position with extra emphasis, and in UIKit pins it so it stays visible when the tab bar collapses on scroll. It is the sanctioned way to keep one destination reachable at every size this app now runs at. It is not a second navigation style: if the promoted tab is not a genuine always-available destination, it is a floating button wearing a tab's clothes. (When `prominentTabIdentifier` is nil and a search tab exists, search gets the prominent treatment by default.)

**Menu item images are hidden by default in the iPadOS 27 menu bar** (and in the macOS 27 menu bar and context menus). SwiftUI hides menu item symbol images in most contexts while non-symbol images remain visible; UIKit adds `preferredImageVisibility` on `UIMenuElement` with updated `UIMenu` / `UIAction` / `UICommand` / `UIKeyCommand` initializers. An iPad app that built an SF Symbol-rich menu bar for iPadOS 26 loses that scannability on rebuild, so the wording carries the load. Opt an item back in with `.labelStyle(.titleAndIcon)` when it represents an **object, location, device or visual concept** rather than an action, and give every item in a group an icon or none of them. The system still supplies visible images for Settings, Share and Print.

Two more that change what an adaptive contract can express:

```swift
// Sheet placement is a layout decision on a wide window, not a cosmetic one. iOS/iPadOS 27.0.
.sheet(isPresented: $showingInspector) {
    InspectorSheet()
        .presentationPlacement(.trailing)     // .automatic | .center | .leading | .trailing
}

// Drag-to-reorder in any container -- List, LazyVGrid, a custom layout. iOS/iPadOS 27.0 (not tvOS).
LazyVGrid(columns: columns) {
    ForEach(cards) { CardView($0) }
        .reorderable()
}
.reorderContainer(for: Card.self) { difference in apply(difference) }
```

On a wide iPad window or a Mac window, a sheet anchored to the wrong edge reads as a dialog dropped in the middle of nowhere; `presentationPlacement(_:)` gives the adaptive contract a real lever instead of `presentationDetents` plus hope. Reordering previously meant `List` + `onMove` or a hand-built `.draggable`/`.dropDestination` pair; it now works in grids and custom layouts too. `references/cross-platform/02-watchos.md` carries the full `reorderContainer` example.

A picker that represents navigation can declare itself one: `TabsPickerStyle` (`.tabs`, 27.0 on every platform except watchOS) looks like `.segmented` but VoiceOver announces it as tabs -- the correct replacement for `.segmented` plus `accessibilityAddTraits(.isTabBar)` in an inspector or sidebar. `references/cross-platform/04-macos-catalyst.md` owns the AppKit half.

## iPadOS 26 windowing

iPadOS 26 replaced the rigid Split View/Slide Over model with resizable, freely-positioned windows plus a macOS-style control cluster and a bottom-right resize handle; apps still launch full-screen by default and the user opts a scene into a window. Every `UIScreen.main.bounds`/fixed-layout/"landscape means N points wide" assumption is wrong under it -- read geometry via `GeometryReader`/`.onGeometryChange` and structure via `horizontalSizeClass`, never idiom or screen bounds.

Three APIs govern how a window's chrome meets your content, all at the iOS/iPadOS 26.0 floor:

- `UIWindowSceneDelegate.preferredWindowingControlStyle(for:)` -- `optional func preferredWindowingControlStyle(for windowScene: UIWindowScene) -> UIWindowScene.WindowingControlStyle`, returning `.automatic`, `.minimal`, or `.unified` (the merged traffic-light-in-toolbar look). iOS/iPadOS/Mac Catalyst/tvOS/visionOS 26.0.
- `containerCornerOffset(_ edges: Edge.Set, sizeToFit: Bool = false) -> some View` (SwiftUI, 26.0 on all seven platforms) -- adjusts layout to avoid the container's corner insets, which is what keeps leading content clear of the window-control cluster. UIKit reaches the same geometry through `layoutGuide(for:)` / `directionalEdgeInsets(for:)`.
- `UIDesignRequiresCompatibility` (Info.plist, iOS/iPadOS/macOS/tvOS 26.0) -- **now inert.** Apple's key documentation states the system ignores it when you build for iOS, iPadOS, Mac Catalyst, macOS or tvOS 27 or later. The judgement that it was a temporary escape hatch and never a shipping target is settled: a 27-SDK build gets the full Liquid Glass redesign across every platform at once, so glass adoption (toolbars, tab bars, sidebars, scroll-edge effects, concentric corners) is a prerequisite of shipping rather than a roadmap item.

**Known XCUITest gotcha:** a second Stage Manager scene stays `.foregroundInactive` under UI testing -- its view tree never reaches the accessibility snapshot, because SpringBoard owns activation and there is no public API to force `.foregroundActive` from the test target. Assert only against the foregrounded scene in UI tests; cover inactive-scene routing logic with unit/state-level tests instead.

## iPadOS 27: every app is a resizable app

iOS, iPadOS, macOS, watchOS, tvOS and visionOS 27 shipped on 2026-09-14 with Xcode 27. The headline change for this page is that resizing stopped being opt-in.

Built against the iOS 27 SDK, an **iPhone-only app is fully resizable on iPad and in iPhone Mirroring** -- still running under the phone user-interface idiom, but sized like any other iPad app. Two consequences, both from Apple's own release notes:

- `UISupportedInterfaceOrientations` is now only a *preference*. Apple's wording: "Beginning with iOS 27, supported interface orientations should no longer be a condition for continuous resizability." The declared orientations are honored until the user starts resizing, after which the scene ignores them. Declaring portrait-only is no longer a way to escape resizing.
- `UIRequiresFullScreen` selects a resize *model*, not immunity. An app that sets it receives each resize as a discrete change to a **new** `UIScreen` with updated bounds rather than continuous resize updates, and `UIScreen.main` bounds stay fixed once connected -- which is exactly why reading them is now wrong even in a portrait-locked app.

The practical review rules follow directly: any layout keyed to `UIDevice.current.userInterfaceIdiom`, `UIScreen.main.bounds`, or interface orientation is a defect on iOS 27, including in iPhone-only apps; and "my layout breaks when resized" can no longer be answered with `UIRequiresFullScreen`. The same release makes the **scene-based life cycle mandatory** -- an app built with the 27.0 SDKs that has not adopted it fails to launch, and iOS/iPadOS apps must declare a launch screen (`UILaunchStoryboardName`, `UILaunchStoryboards`, `UILaunchScreen` or `UILaunchScreens`) or the App Store rejects the build. `UIScene.extendStateRestoration` / `completeStateRestoration` (iOS 15.0 symbols; linked on the 27.0 SDKs they also cover the background-to-foreground transition) let a restored window finish restoring before the system foregrounds it, which is what removes the empty-window flash in a multi-window app.

Apple's Layout HIG page removed its per-device screen-size and safe-area tables in its 2026-09-09 revision and now points at Apple Design Resources for measurements. That is the same editorial point this page makes: with resizable iPhone apps, iPad windowing and a folding display, a layout keyed to a device's dimensions *is* the defect. Cite size classes, safe areas and real geometry; cite Apple Design Resources for metrics.

iPadOS 27 also refines system multitasking -- app names now appear in the status bar, iPhone apps resize on iPad, and closing, switching and dragging windows while multitasking all improved. None of it is API, and all of it moves the chrome around your window: read the geometry the system hands you instead of assuming a chrome height.

**Glass is a user-tunable range now, not a single look.** iOS and iPadOS 27 add a Liquid Glass slider in Settings that runs from ultraclear to fully tinted (Apple's cross-platform release announcement suggests the Mac too, without naming it); it is unavailable while Reduce Transparency or Increase Contrast is on, and those settings still override it entirely. There is **no developer API** -- standard components pick the tint up automatically, so do not invent an environment value for it. The craft consequence is sharp: a custom surface that hard-codes a blur, an opacity, or a hand-rolled "glass" gradient visibly desynchronises from system chrome at both ends of the slider. Use `glassEffect(_:in:)`, `.buttonStyle(.glass)` and standard bars, and keep testing the Reduce Transparency and Increase Contrast paths.

One deprecation with a UI shape: **`canOpenURL:` is deprecated in iOS 27.** Apple's guidance is to attempt the open and handle failure rather than validating first, and to prefer universal links over custom schemes so the validation is unnecessary. An "Open in <other app>" affordance hidden behind a `canOpenURL` probe becomes an always-present control with a real, non-silent recovery state on failure -- that is a design change, not a one-line refactor.

Document-based apps get the same turnover on iPad as on Mac: `FileDocument` and `ReferenceFileDocument` are deprecated in favour of `ReadableDocument` / `WritableDocument` / `Document` (27.0). `references/cross-platform/04-macos-catalyst.md` owns that migration.

## iPhone Duo (iOS 27.1, still in beta)

> **The one quarantined area on this page.** Apple's symbol metadata reports every API in this section as `beta` at iOS/iPadOS 27.1 as of 2026-09-22; none of it is in the 27.0 SDK that shipped on 2026-09-14. The HIG guidance below is live and final -- "Designing for iPhone Duo" published 2026-09-09, and the device ships 2026-10-23. Design against the guidance now; keep every symbol behind `#available(iOS 27.1, *)` and verify signatures against the shipping SDK before relying on them, and do not make any of them a primary example.

The design guidance carries the load, and its first claim is the important one: **this is not a new platform.** You are still designing for iPhone, and the Designing for iOS patterns still apply in full. A compact-width layout for the outer display plus a regular-width layout for the inner display covers every pose -- folded like a book, laid flat, standing on an edge. Apple is explicit that per-pose design is the wrong instinct: "Don't reinvent your app when it resizes; allow the existing layout to expand based on the available space instead." An app that already uses `NavigationSplitView`, standard toolbars and size classes gets the vertical-bar layout for free, and a split view collapses to one pane on the outer display exactly as it does at compact width anywhere else.

What is genuinely new is **where the controls live**. On the outer display, and on the inner display in landscape, the system moves the Dynamic Island, the status bar, the toolbar (including navigation buttons) and the tab bar to one side, to maximise vertical space for content; the exception is the inner display in portrait, which keeps standard horizontal bars. In Split View multitasking each app places its controls along its own outer edge, so the left app has controls on the left. Apple's instruction is blunt: "In general, don't override the default bar placement."

Three authoring rules fall out of it, and all three are things to fix *today* in an ordinary iPhone app:

- **Every toolbar item needs both a title and an SF Symbol.** The system uses the symbol when it presents an item vertically; an item with a title and no icon is not presented vertically at all, and neither is an item built from a custom view.
- **Group with `ToolbarItemGroup` / `UIBarButtonItemGroup`, not manual spacers.** Groups space themselves and adapt as available space changes; hand-placed `Spacer()`s do not.
- **Keep text-based buttons to a minimum.** A label containing text stays in a horizontal bar, so prefer a symbol wherever one works. And extend a hero or background image *under* the vertical bar with `backgroundExtensionEffect()` (SwiftUI) or `UIBackgroundExtensionView` (UIKit) rather than insetting content away from it.

Presentation containers behave differently from each other, which matters for review: **inspectors** always present bars horizontally; a **split view** shows bars horizontally for the sidebar or content column and vertically for the detail column; **sheets** on the outer display present bars vertically by default, and on the inner display follow their placement -- horizontal for `.center` or `.leading`, vertical for `.trailing`. That makes `presentationPlacement(_:)` (27.0, shipping) a layout decision rather than a cosmetic one. If your bars are *not* presenting vertically, the usual cause is hand-rolled chrome: put `.toolbar(content:)` on a `NavigationStack` or `NavigationSplitView` (SwiftUI), or set toolbar items on a view controller inside a navigation controller (UIKit), instead of building a bar out of `UIToolbar` / `UINavigationBar` / `UITabBar`.

The 27.1 beta API surface, in the order you would reach for it:

| Symbol | What it does | Floor |
|---|---|---|
| `ArrangementView<Primary, Secondary>` + `arrangementViewStyle(_:)` (`.split` / `.overlay`) | Adaptive two-content container that reorganises by size, orientation and reserved regions. UIKit: `UIArrangementViewController` | iOS/iPadOS 27.1 beta |
| `ReservedRegion` + `GeometryProxy.reservedRegions(kind:options:layoutDirectionBehavior:)` | Queries hardware-claimed areas: `.occlusion` (a camera) and `.division` (the fold). UIKit: `UIView.reservedRegions(kind:options:)` | iOS/iPadOS 27.1 beta |
| `onHingeChange(isEnabled:_:)`, `DeviceHinge`, `DeviceHingeContext` | Hinge angle and status (`.closed` / `.partiallyOpen` / `.fullyOpen`). UIKit: `UIHingeInteraction` | iOS/iPadOS 27.1 beta |
| `toolbarVerticalEdge`, `toolbarVerticalBehavior(_:)`, `axisBehavior(_:)`, `toolbarVerticalCompressionBehavior(_:)` | Read and opt out of vertical bar placement, per view and per item | iOS/iPadOS 27.1 beta |
| `CameraCaptureAccessory` | Outer-display content while the device is open, the app is foreground and a capture session is running | iOS/iPadOS 27.1 beta |

Three judgements about that surface. **`ArrangementView` is a layout container, not a navigation one** -- Apple says to keep navigation split views and tab views *around* an arrangement view rather than inside it, and never to nest one inside a navigation split view, list or scroll view where part of the content could become unreachable. The adoption signal is mechanical: an `HStack`/`VStack` pair maps to `.split`, a `ZStack` pair maps to `.overlay`.

**Reserved regions are for custom components only.** Alerts, context menus, sheets and split views already move around the fold on their own; a bespoke canvas, grid or media player does not. The layout rules Apple gives are concrete: prefer an even number of grid columns so content divides cleanly at the fold, keep important elements clear of the centre, and "avoid extreme layout changes as people fold the device" -- move only what has to move. Regions are also not static; the fold region is active only while the device is partially open, and the inner camera only while capture is running.

**Hinge angle is the wrong default tool.** `DeviceHingeContext.hinge` is optional and nil on every non-foldable device, so any hinge-driven UI needs a real non-foldable path -- Apple's own sample falls back to a `ContentUnavailableView`. Layout comes from size classes, arrangements and reserved regions; reserve `onHingeChange` for genuinely pose-specific behavior, such as a camera app switching to tabletop framing. A review should flag any layout branch driven by hinge angle.

```swift
// 27.1 beta -- gated, non-primary, and with the real non-foldable path first.
struct CaptureScreen: View {
    @State private var pose: CapturePose = .handheld

    var body: some View {
        CaptureViewfinder(pose: pose)
            .modifier(HingeAwareness(pose: $pose))
    }
}

private struct HingeAwareness: ViewModifier {
    @Binding var pose: CapturePose

    func body(content: Content) -> some View {
        if #available(iOS 27.1, *) {                    // verify against the shipping 27.1 SDK
            content.onHingeChange { _, new in
                guard let hinge = new.hinge else { return }   // nil on every non-Duo device
                pose = (hinge.status == .partiallyOpen) ? .tabletop : .handheld
            }
        } else {
            content                                      // no hinge exists; size classes already decided
        }
    }
}
```

One build-setting trap worth catching before October: **built with Xcode 26 or earlier, an app does not extend under the status bar and camera** on the Duo. Rebuilding on Xcode 27 is the fix.

## Pointer and hover

`.hoverEffect(_:)` is current and un-deprecated (iOS/iPadOS/Mac Catalyst 13.4+, tvOS 16.0+, visionOS 1.0+) -- it is iPad's actual pointer-morph mechanism, picked by target size:

```swift
Button { } label: { Image(systemName: "square.and.pencil") }
    .hoverEffect(.highlight)          // chrome: pointer melts into a "pill" behind the control

CardView(item: item)
    .hoverEffect(.lift)               // prominent, image-forward tap targets: content lifts + shadows

Label("Play", systemImage: "play.fill").hoverEffect(.automatic)   // let the system choose
```

Custom effect with a mandatory Reduce Motion gate (looping/transform hover effects are never system-auto-gated -- see `references/accessibility/05-motion-accessibility.md`):

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

Text(title)
    .padding()
    .hoverEffect { effect, isActive, _ in
        reduceMotion ? effect.clipShape(.capsule) : effect.scaleEffect(isActive ? 1.05 : 1.0)
    }
```

`.onHover { isHovering in }` / `.onContinuousHover { phase in }` drive your OWN chrome (reveal a delete affordance, a secondary label) -- keep them additive; the design must be complete without hover for touch users.

Two levers let a view opt out of, or read, the system's hover policy instead of fighting it: `.hoverEffectDisabled(_ disabled: Bool = true)` (iOS/iPadOS/Mac Catalyst 17.0+) suppresses the automatic hover morph for an entire subtree -- an ancestor's `true` overrides a descendant's `false`, so use it once at a container to calm a busy grid or honor an in-app "reduce pointer effects" setting. `@Environment(\.isHoverEffectEnabled)` reads whether hover effects are currently allowed, so a custom hover chrome (a manual glow or scale you build yourself, not `.hoverEffect(_:)`) can branch to match the same policy instead of showing up when the system's own effects are suppressed.

**`pointerStyle(_:)` is macOS 15.0+/visionOS 2.0+ ONLY -- it does not exist on iPadOS.** Changing the literal cursor shape (I-beam, resize handles, a custom grab hand) on iPad requires UIKit's `UIPointerInteraction` (a `UIPointerInteractionDelegate` returning `UIPointerStyle`), wrapped in a `UIViewRepresentable` when the surrounding app is SwiftUI. Don't reach for SwiftUI `.pointerStyle(_:)` on an iPad target -- it silently compiles only on macOS/visionOS destinations and is a no-op/unavailable elsewhere; `.hoverEffect(_:)` is the whole iPadOS pointer story in SwiftUI.

## Apple Pencil and Scribble

Pencil is iPad's third input class, co-equal with touch and the pointer, and it is the one most apps get wrong by treating it as a finger with better precision.

**Scribble needs no code and is easy to break.** Handwriting-to-text works in any editable view that implements `UITextInput` -- every SwiftUI `TextField` and `TextEditor`, every `UITextField` and `UITextView` -- with nothing to adopt. Two things break it, and each has its own opt-in. A hand-rolled text surface that draws its own caret and never implements `UITextInput` cannot be written into at all; `UIIndirectScribbleInteraction` (iOS/iPadOS 14.0+) is what brings handwriting to a custom element that is not formally a text field -- a label that becomes editable on tap, a spreadsheet cell. And a drawing canvas sitting near text fields lets those fields steal Pencil events meant for ink; `UIScribbleInteraction` (iOS/iPadOS 14.0+) suppresses them:

```swift
// Suppress Scribble on the text fields around a canvas so the Pencil marks instead of writing.
@MainActor
final class CanvasScribblePolicy: NSObject, UIScribbleInteractionDelegate {
    func scribbleInteraction(_ interaction: UIScribbleInteraction,
                             shouldBeginAt point: CGPoint) -> Bool {
        false                                     // this view handles Pencil events directly
    }

    // Keeps a field from focusing mid-write while its frame is still settling.
    func scribbleInteractionShouldDelayFocus(_ interaction: UIScribbleInteraction) -> Bool { true }
}
```

Suppressing Scribble costs the user a system input method, so pair it with a visible draw/write mode toggle rather than deciding on their behalf and silently.

**iOS 27 finally lets a gesture declare which hardware it listens to.** `GestureInputKinds` (`.all`, `.directTouch`, `.indirectTouch`, `.pencil`, `.pointer`) is an `OptionSet` available on every platform at 27.0, exposed through an `inputKinds:` initializer on `DragGesture`, `TapGesture`, `LongPressGesture`, `MagnifyGesture`, `RotateGesture`, `RotateGesture3D`, `SpatialTapGesture`, `SpatialEventGesture` and `WindowDragGesture`, plus `onTapGesture(count:coordinateSpace:inputKinds:perform:)` and `onLongPressGesture(minimumDuration:maximumDistance:inputKinds:perform:onPressingChanged:)`. The parameter defaults to `.all`, so adding it never changes existing behavior. It replaces the `UIGestureRecognizerRepresentable` bridge that a canvas previously needed to tell ink from a pan:

```swift
extension View {
    @ViewBuilder
    func canvasInput(mode: CanvasMode,                       // .draw | .pan -- the pre-27 toolbar toggle
                     mark: @escaping (CGPoint) -> Void,
                     pan: @escaping (CGSize) -> Void) -> some View {
        if #available(iOS 27, *) {
            // Hardware decides: the Pencil marks, a finger or trackpad pans. No mode, no toggle.
            self
                .gesture(DragGesture(minimumDistance: 0, inputKinds: .pencil)
                    .onChanged { mark($0.location) })
                .simultaneousGesture(DragGesture(inputKinds: [.directTouch, .indirectTouch, .pointer])
                    .onChanged { pan($0.translation) })
        } else {
            // iOS 26: no input-source filter exists in SwiftUI. Route one drag through an
            // explicit mode the user sets, and keep that toggle visible in the toolbar.
            self.gesture(DragGesture(minimumDistance: 0).onChanged { value in
                mode == .draw ? mark(value.location) : pan(value.translation)
            })
        }
    }
}
```

The mode toggle is still worth keeping on a 27-minimum target for the user who draws with a finger; what changes is that it stops being the *only* way to disambiguate. Reviewers should flag any content-creation surface that still treats every input source identically, and any `simultaneousGesture` priority juggling that `inputKinds:` now replaces.

**Pencil Pro's squeeze and double tap belong to the user, not to you.** Both modifiers are iOS/iPadOS 17.5+ and both come with an environment value carrying the action the user chose in Settings. Honor it; a squeeze that does something other than what the user picked is the interaction-design equivalent of reassigning ⌘Q:

```swift
struct InkCanvas: View {
    @Environment(\.preferredPencilSqueezeAction) private var squeezeAction
    @Environment(\.preferredPencilDoubleTapAction) private var doubleTapAction
    @State private var tool: Tool = .pen

    var body: some View {
        CanvasSurface(tool: $tool)
            .onPencilSqueeze { phase in
                guard case .ended = phase else { return }     // .active(_:) | .ended(_:) | .failed
                perform(squeezeAction)
            }
            .onPencilDoubleTap { value in
                // value.hoverPose is nil on hardware that can't detect hover -- never force-unwrap it.
                perform(doubleTapAction, near: value.hoverPose?.location)
            }
    }

    private func perform(_ action: PencilPreferredAction, near point: CGPoint? = nil) {
        switch action {
        case .switchEraser:           tool = (tool == .eraser) ? .pen : .eraser
        case .switchPrevious:         tool = tool.previous
        case .showColorPalette:       showColorPalette(at: point)
        case .showInkAttributes:      showInkAttributes(at: point)
        case .showContextualPalette:  showContextualPalette(at: point)
        default:                      break     // .ignore and .runSystemShortcut are the system's
        }
    }
}
```

`PencilPreferredAction` is `.ignore`, `.runSystemShortcut`, `.showColorPalette`, `.showContextualPalette`, `.showInkAttributes`, `.switchEraser`, `.switchPrevious`. On macOS neither value is user-changeable: `preferredPencilSqueezeAction` is always `.showContextualPalette` and `preferredPencilDoubleTapAction` is always `.switchEraser`. A palette summoned by squeeze should appear where the Pencil is, which is what `hoverPose` is for -- and because it is optional on hardware without hover, the fallback position (last touch, or screen centre) is part of the design, not an afterthought.

**Hover is a separate channel.** `.onHover` and `.onContinuousHover` fire for a hovering Pencil the same way they do for a pointer on supported iPads, so a canvas can preview the brush footprint before the tip lands. Everything the pointer section says applies: hover is additive, and nothing may be reachable only by hovering.

**PencilKit is the right default for a freeform drawing surface.** `PKCanvasView` (iOS/iPadOS 13.0+) and `PKToolPicker` (13.0+, with `init()` at 14.0+) give you ink rendering, the system tool palette, palm rejection and accessibility for free -- hand-rolled stroke rendering matches none of it. Host it with `UIViewRepresentable`, and set `drawingPolicy` (iOS 14.0+) deliberately: `.default` respects the system's pencil-interaction setting while a tool picker is visible and otherwise accepts Pencil input only, `.pencilOnly` never draws from a finger, `.anyInput` draws from any source. A canvas that lets a finger both scroll and draw will do one of them by accident.

```swift
struct PencilCanvas: UIViewRepresentable {
    @Binding var drawing: PKDrawing

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.drawing = drawing
        canvas.drawingPolicy = .pencilOnly          // finger scrolls and selects; Pencil draws
        canvas.delegate = context.coordinator
        context.coordinator.toolPicker.setVisible(true, forFirstResponder: canvas)
        context.coordinator.toolPicker.addObserver(canvas)
        DispatchQueue.main.async { canvas.becomeFirstResponder() }   // after it joins a window
        return canvas
    }

    func updateUIView(_ canvas: PKCanvasView, context: Context) {
        context.coordinator.parent = self           // keep the binding fresh, not the one from init
        if canvas.drawing != drawing { canvas.drawing = drawing }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    @MainActor
    final class Coordinator: NSObject, PKCanvasViewDelegate {
        let toolPicker = PKToolPicker()             // iOS 14.0+ initializer
        var parent: PencilCanvas
        init(_ parent: PencilCanvas) { self.parent = parent }
        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            parent.drawing = canvasView.drawing
        }
    }
}
```

**Pencil Pro renders haptics in the barrel, and `UICanvasFeedbackGenerator` (iOS/iPadOS 17.5+) is the only correct way to ask for them.** It is a canvas-event generator, not a general impact generator: `alignmentOccurred(at:)` for a snap to a guide, ruler or another object, and `pathCompleted(at:)` for a closed path or a recognized shape. Prepare it when a drag begins so the first tick is not late.

```swift
let feedback = UICanvasFeedbackGenerator(view: canvasView)
// on gesture .began:
feedback.prepare()
// when the shape snaps:
feedback.alignmentOccurred(at: location)
```

The haptic is confirmation of a snap that already happened visually -- never the only signal, because it reaches only a Pencil Pro on compatible hardware and nothing at all on a finger-drawn stroke (`references/haptics/01-haptic-design-principles.md#hardware-availability` owns that rule).

## Hardware keyboard, context menus, and drag-and-drop

Base `.keyboardShortcut(_:modifiers:)`, `.defaultAction`/`.cancelAction`, `.contextMenu { } preview: { }`, and `Transferable`/`.draggable`/`.dropDestination` are owned by `references/platform/02-app-intents-system.md#keyboard-shortcuts-ipad-and-mac`, `#context-menus`, and `#drag-and-drop-transferable` -- the iPad-specific deltas below extend, not repeat, those patterns.

- **Focus-driven menu state.** Global shortcuts and menu items must reflect the *focused* scene/document, not a random view: publish focused state with `@FocusedValue`/`FocusedValueKey`, read it in `.commands { CommandMenu(...) }`, and `.disabled(...)` when nothing is focused.
- **RTL-safe shortcuts.** Directional keys (bracket keys for alignment, arrow-adjacent shortcuts) shouldn't mirror in right-to-left locales: `.keyboardShortcut("{", modifiers: .option, localization: .withoutMirroring)`.
- **Multi-selection context menus.** `.contextMenu(forSelectionType: Item.ID.self) { ids in … }` (iOS 16+) gives ONE menu for a trackpad rubber-band selection on a `List`/grid, instead of only ever acting on a single row.
- **Cross-app drag is a first-class iPad interaction**, not a hidden feature (Split View, Slide Over, and Stage Manager side-by-side all expect it). Always drive a visible `isTargeted` highlight on a drop zone -- a drop zone with no hover feedback reads as "not droppable" and users won't retry. Prefer `FileRepresentation` over `DataRepresentation` for large media (a file URL transfers lazily; raw bytes through the drag session jank). A custom `Transferable` type needs its UTType declared under Info.plist's Exported Type Identifiers, or cross-app drops silently produce nothing.
- **User-customizable toolbars** (a pro-app hallmark on iPad and Mac): `.toolbar(id:)` with stable per-item `id:` values persists the user's add/remove/reorder arrangement automatically.

```swift
.toolbar(id: "main") {
    ToolbarItem(id: "share", placement: .primaryAction) {
        Button("Share", systemImage: "square.and.arrow.up") { share() }
    }
    ToolbarItem(id: "tag", placement: .secondaryAction, customizationBehavior: .default) {
        Button("Tag", systemImage: "tag") { tag() }
    }
}
```

## Multiplatform strategy: adapt, don't port

Two distinct roads reach the Mac, with a completely different "feels native" bar:

| Aspect | Designed for iPad | Mac Catalyst | Native SwiftUI macOS |
|---|---|---|---|
| Effort | Zero code | Moderate adaptation | Full macOS target |
| Window resizing | Fixed iPad layout | Resizable, native-feeling | Resizable, `NSWindow` |
| Menu bar | System default only | Full `.commands`/`UIMenuBuilder` | `.commands` |
| Availability | Apple Silicon only | Intel + Apple Silicon | Any Mac |

State which road an app is on before judging it -- "Designed for iPad" in a fixed window is held to a lower craft bar than Catalyst. A shared `Scene` body branches per platform for the pieces that genuinely differ:

```swift
var body: some Scene {
    WindowGroup { AppNavigation() }               // NavigationSplitView collapses to a stack on iPhone/watch
    #if os(macOS)
    Settings { SettingsView() }                   // Cmd+, preferences window -- macOS only
    MenuBarExtra("My App", systemImage: "star.fill") { MenuBarView() }
        .menuBarExtraStyle(.window)
    #endif
}
```

Each remaining platform gets its own deep-dive file rather than a duplicate treatment here: watchOS craft (Digital Crown, vertical-paged tabs, compact density) is `references/cross-platform/02-watchos.md`; tvOS (focus engine, overscan) is `03-tvos.md`; full Mac Catalyst/AppKit-adjacent chrome (menu bar customization, tooltips, right-click) is `04-macos-catalyst.md`; visionOS (ornaments, `glassBackgroundEffect`, volumes, eye+pinch) is `05-visionos.md`. Consult those before assuming an iPad pattern on this page transfers unchanged.

## Availability + fallbacks

```swift
if #available(iOS 26, *) {
    detailContent.backgroundExtensionEffect()          // iOS-26 glass-sidebar bleed
} else {
    detailContent                                      // pre-26: opaque background, no bleed needed
}
```

Most apps still deploy to iOS 26, the Liquid Glass floor, so an iOS 27 API is a primary example wrapped in an ordinary `#available` gate with a real fallback beside it:

```swift
struct RankedToolbar: ViewModifier {
    @Environment(\.horizontalSizeClass) private var hSizeClass

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 27, *) {
            content.toolbar {
                ToolbarItem(placement: .primaryAction) { ShareButton() }
                    .visibilityPriority(.high)
                ToolbarItem { TagButton() }
                    .visibilityPriority(.low)          // first into the overflow
            }
        } else {
            // iOS 26: no ranking exists. Choose the set per size class and accept the
            // system's own truncation order for whatever is left.
            content.toolbar {
                ToolbarItem(placement: .primaryAction) { ShareButton() }
                if hSizeClass == .regular {
                    ToolbarItem { TagButton() }
                }
            }
        }
    }
}
```

An app whose deployment target is iOS 27 can drop these fallback branches entirely; until then, both arms ship.

`sidebarAdaptable` `TabView` has no pre-18 shape -- gate the whole tab declaration behind `#available(iOS 18, *)` or ship a plain `TabView`/`NavigationSplitView` split for older deployment targets. `hoverEffect(_:)` is a safe no-op on touch-only hardware and needs no gate; it simply never fires without a pointer or gaze. `inputKinds:` defaults to `.all`, so on a 27-minimum target it is a pure addition -- but on a mixed target it still needs the gate, because the initializer itself does not exist below 27.

## Accessibility contract

None of this file's motion is system-auto-gated: any custom `.hoverEffect { }` transform (scale/offset) must switch to a static tint/clip under Reduce Motion per `references/accessibility/05-motion-accessibility.md` (owner of the double-gate). Every hover-revealed control (row actions, resize handles) must also be reachable by Full Keyboard Access and a persistent context menu -- hover is additive polish, never the only path. Window drag/resize and Stage Manager transitions are system-owned; you own nothing extra there beyond making content correct at every size.

Three additions from the 27 surfaces. Partitioning gestures with `inputKinds:` must never leave an action reachable by only one input class -- a command bound to `.pencil` alone is unavailable to a finger, a pointer, Full Keyboard Access, Voice Control and Switch Control at once. Apple Pencil squeeze and double tap are accelerators on top of a control that already exists on screen; the tool a squeeze switches to must also be pickable from the tool picker. And a menu bar whose items lost their icons on iPadOS 27 now depends entirely on its wording -- verify the labels still read unambiguously to VoiceOver with no symbol to disambiguate them.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Gating layout shape on `UIDevice.current.userInterfaceIdiom` or `UIScreen.main.bounds` | Wrong shape in Split View/Stage Manager/multi-window; bounds ignore the actual window | Gate on `horizontalSizeClass`; read real geometry via `GeometryReader` |
| Tab-only navigation on iPad | Wastes the screen, reads as an unported iPhone app | `NavigationSplitView` or `.tabViewStyle(.sidebarAdaptable)` |
| `TabSection`/`Tab` with no `.customizationID` | Reorder/hide silently doesn't persist | Add a stable ID to every tab and section |
| `.pointerStyle(_:)` used on an iPad target | Doesn't exist there -- macOS/visionOS only | `.hoverEffect(_:)`, or UIKit `UIPointerInteraction` for custom cursor shapes |
| Drop zone with no `isTargeted` feedback | User can't tell if the zone will accept the drag | Highlight the container while `isTargeted` is true |
| `UIRequiresFullScreen = true` used as an answer to "my layout breaks when resized" | On the iOS 27 SDK it only selects discrete resizing -- the app still resizes | Build a resizable layout; treat the flag as a stated quality tradeoff |
| A portrait-only declaration relied on to fix layout width | `UISupportedInterfaceOrientations` is a preference resizable environments ignore from iOS 27 | Read geometry; gate shape on `horizontalSizeClass` |
| `toolbarMinimizeBehavior` in code built against the 27 SDK | The WWDC26 beta spelling never shipped, so it does not compile (the tab-bar spelling did not change) | `toolbarMinimizationBehavior(_:for:)` |
| A hand-rolled "..." menu beside the system toolbar overflow | Two overflow affordances competing; neither is ranked | `visibilityPriority(_:)` + `ToolbarOverflowMenu` |
| An external-display scene assumed to still appear after a 27-SDK rebuild | `windowExternalDisplayNonInteractive` is no longer offered automatically | `.sceneAccessory { ExternalNonInteractiveAccessory { … } }` |
| A hand-rolled "glass" gradient or hard-coded blur | Desynchronises from system chrome at both ends of the iOS 27 Liquid Glass slider | `glassEffect(_:in:)`, `.buttonStyle(.glass)`, standard bars |
| `canOpenURL:` probe hiding an "Open in…" control | Deprecated in iOS 27; the allowlist made it unreliable anyway | Attempt the open, handle failure visibly; prefer universal links |
| Toolbar items with a title and no SF Symbol | The system will not place them on iPhone Duo's vertical axis | Give every toolbar item both a title and a symbol |
| A canvas that treats Pencil and finger input identically | Ink and pan fight each other; palm rejection is left to luck | `inputKinds:` (iOS 27), `PKCanvasView.drawingPolicy`, or a visible mode toggle |
| Overriding the Pencil squeeze/double-tap action the user chose in Settings | Breaks the one Pencil affordance the user configured deliberately | Read `preferredPencilSqueezeAction` / `preferredPencilDoubleTapAction` and honor it |

## Severity guide

CRITICAL: a hover-only affordance (row action, resize handle) with no touch/keyboard equivalent, an action reachable by only one `inputKinds:` class, or a 27-SDK target with no scene life cycle or launch screen (it will not launch or will not ship). HIGH: `.pointerStyle(_:)` shipped on an iPad target, layout gated on device idiom, `UIScreen.main.bounds` or interface orientation instead of size class and real geometry, or `toolbarMinimizeBehavior` left in 27-SDK code. MEDIUM: missing `.customizationID` breaking tab persistence, a drop zone with no `isTargeted` feedback, a toolbar with no `visibilityPriority` ranking whose primary action vanishes when the window narrows, a hand-rolled glass material that drifts under the Liquid Glass slider, or a lost external-display scene after a 27-SDK rebuild. LOW: a Pencil squeeze or double tap that ignores the user's configured action, or toolbar items with no SF Symbol on an app that will meet iPhone Duo. NIT: `.hoverEffect(.lift)` applied to a tiny chrome control (reads as a bug, `.highlight` is correct there).

## See also

- `references/design/07-navigation-patterns.md#navigationsplitview-ios-16` -- base split-view mechanics, deep linking (owner)
- `references/design/08-adaptive-layout-ipad.md` -- adaptive layout switching techniques (owner)
- `references/platform/02-app-intents-system.md#context-menus` -- base context menu, keyboard shortcut, and Transferable patterns (owner)
- `references/patterns/05-modality-sheets.md#popovers` -- popover-vs-sheet adaptivity (owner)
- `references/accessibility/05-motion-accessibility.md` -- the Reduce Motion double-gate (owner)
- `references/haptics/01-haptic-design-principles.md#hardware-availability` -- why a Pencil Pro haptic is never the only signal (owner)
- `references/cross-platform/04-macos-catalyst.md`, `05-visionos.md`, `02-watchos.md`, `03-tvos.md` -- per-platform deep dives
