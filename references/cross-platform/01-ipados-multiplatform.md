# iPadOS + Multiplatform Craft

> Owner: `references/cross-platform/01-ipados-multiplatform.md` owns iPadOS windowing/multitasking, pointer + hardware-keyboard craft, and the cross-platform "adapt, don't port" strategy, per the ARCHITECTURE ownership map. Adaptive LAYOUT techniques (stack-vs-grid switching, breakpoints) live in `references/design/08-adaptive-layout-ipad.md`. Base `NavigationSplitView` mechanics, modal presentation, and the App Intents-driven Context Menu/Transferable/`.keyboardShortcut` patterns are owned elsewhere -- cited below, not restated. Per-platform deep dives for watchOS, tvOS, macOS Catalyst, and visionOS live in `references/cross-platform/02-watchos.md`, `03-tvos.md`, `04-macos-catalyst.md`, and `05-visionos.md`.
> Floors: `sidebarAdaptable` `TabView` + `TabSection`/`.customizationID` = iOS 18.0+. `navigationSplitViewColumnWidth(min:ideal:max:)` = iOS 16.0+ (see `references/_scaffolding/version-floor-registry.md#ios-160` -- do not over-gate to 17). `backgroundExtensionEffect()` = iOS 26.0+. `hoverEffect(_:)` = iOS/iPadOS 13.4+.

An iPad app that merely stretches its iPhone layout to fill the screen is the universal tell of a port. The Apple way reshapes navigation into a sidebar, gives the pointer real hover feedback, wires the hardware keyboard as a first-class input, and treats multi-window as the default rather than an edge case -- while keeping ONE model layer and one `AppIntent`/WidgetKit surface underneath. The most common craft failure isn't a missing feature; it's gating layout decisions on `UIDevice.current.userInterfaceIdiom` or `UIScreen.main.bounds` instead of `horizontalSizeClass`, which puts the wrong shape on screen the moment the user opens Split View or a narrow Stage Manager tile.

## The Apple way

- Never ship tab-only navigation on iPad -- a list-selects-detail app needs a sidebar.
- Size class drives layout SHAPE (split vs. stack, sidebar visible or not); it never means "iPhone vs. iPad" and never means orientation. An iPad in 1/3 Split View or a narrow Stage Manager tile IS `.compact`; an iPhone in landscape is STILL `.compact`.
- Support multi-window by default. `UIRequiresFullScreen = true` opts an app out of Split View, Slide Over, Stage Manager, *and* the iPadOS 26 windowed mode at once -- App Review pushes back without a hard justification (camera-lock, immersive AR).
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

## iPadOS 26 windowing

> **WWDC25-reported, SDK-verify before shipping.** The following selectors are dev-blog-sourced (MacRumors/AppleInsider iPadOS 26 coverage, third-party window-controls guides) and are NOT currently surfaced by Context7's SwiftUI/UIKit index. Confirm the exact signatures against a live iPadOS 26 SDK before treating them as fact in a review or shipping code that depends on them.
>
> - `UIWindowSceneDelegate.preferredWindowingControlStyle(for:)` -- reportedly chooses `.automatic`, `.minimal` (legacy), or `.unified` (the merged traffic-light-in-toolbar look).
> - `containerCornerOffset(_:sizeToFit:)` (SwiftUI) -- reportedly offsets leading content to clear the window-control cluster; UIKit equivalent via `layoutGuide(for:)`/`directionalEdgeInsets(for:)`.
> - `UIDesignRequiresCompatibility` (Info.plist) -- reportedly keeps legacy behavior where window controls contribute to the top safe area; treat as a temporary escape hatch, never a shipping target.

What IS confirmed: iPadOS 26 replaces the rigid Split View/Slide Over model with resizable, freely-positioned windows plus a macOS-style control cluster and a bottom-right resize handle; apps still launch full-screen by default and the user opts a scene into a window. Every `UIScreen.main.bounds`/fixed-layout/"landscape means N points wide" assumption is now wrong -- read geometry via `GeometryReader`/`.onGeometryChange` and structure via `horizontalSizeClass`, never idiom or screen bounds.

**Known XCUITest gotcha:** a second Stage Manager scene stays `.foregroundInactive` under UI testing -- its view tree never reaches the accessibility snapshot, because SpringBoard owns activation and there is no public API to force `.foregroundActive` from the test target. Assert only against the foregrounded scene in UI tests; cover inactive-scene routing logic with unit/state-level tests instead.

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

`sidebarAdaptable` `TabView` has no pre-18 shape -- gate the whole tab declaration behind `#available(iOS 18, *)` or ship a plain `TabView`/`NavigationSplitView` split for older deployment targets. `hoverEffect(_:)` is a safe no-op on touch-only hardware and needs no gate; it simply never fires without a pointer or gaze.

## Accessibility contract

None of this file's motion is system-auto-gated: any custom `.hoverEffect { }` transform (scale/offset) must switch to a static tint/clip under Reduce Motion per `references/accessibility/05-motion-accessibility.md` (owner of the double-gate). Every hover-revealed control (row actions, resize handles) must also be reachable by Full Keyboard Access and a persistent context menu -- hover is additive polish, never the only path. Window drag/resize and Stage Manager transitions are system-owned; you own nothing extra there beyond making content correct at every size.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Gating layout shape on `UIDevice.current.userInterfaceIdiom` or `UIScreen.main.bounds` | Wrong shape in Split View/Stage Manager/multi-window; bounds ignore the actual window | Gate on `horizontalSizeClass`; read real geometry via `GeometryReader` |
| Tab-only navigation on iPad | Wastes the screen, reads as an unported iPhone app | `NavigationSplitView` or `.tabViewStyle(.sidebarAdaptable)` |
| `TabSection`/`Tab` with no `.customizationID` | Reorder/hide silently doesn't persist | Add a stable ID to every tab and section |
| `.pointerStyle(_:)` used on an iPad target | Doesn't exist there -- macOS/visionOS only | `.hoverEffect(_:)`, or UIKit `UIPointerInteraction` for custom cursor shapes |
| Drop zone with no `isTargeted` feedback | User can't tell if the zone will accept the drag | Highlight the container while `isTargeted` is true |
| `UIRequiresFullScreen = true` without a hard justification | Opts out of Split View, Slide Over, Stage Manager, AND iPadOS 26 windowing at once | Support multitasking by default |

## Severity guide

CRITICAL: a hover-only affordance (row action, resize handle) with no touch/keyboard equivalent -- a11y-blocking. HIGH: `.pointerStyle(_:)` shipped on an iPad target, or layout gated on device idiom instead of size class. MEDIUM: missing `.customizationID` breaking tab persistence, or a drop zone with no `isTargeted` feedback. LOW: an unhedged claim about an SDK-unverified iPadOS 26 windowing selector. NIT: `.hoverEffect(.lift)` applied to a tiny chrome control (reads as a bug, `.highlight` is correct there).

## See also

- `references/design/07-navigation-patterns.md#navigationsplitview-ios-16` -- base split-view mechanics, deep linking (owner)
- `references/design/08-adaptive-layout-ipad.md` -- adaptive layout switching techniques (owner)
- `references/platform/02-app-intents-system.md#context-menus` -- base context menu, keyboard shortcut, and Transferable patterns (owner)
- `references/patterns/05-modality-sheets.md#popovers` -- popover-vs-sheet adaptivity (owner)
- `references/accessibility/05-motion-accessibility.md` -- the Reduce Motion double-gate (owner)
- `references/cross-platform/04-macos-catalyst.md`, `05-visionos.md`, `02-watchos.md`, `03-tvos.md` -- per-platform deep dives
