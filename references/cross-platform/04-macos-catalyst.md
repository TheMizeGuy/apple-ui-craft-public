# macOS + Mac Catalyst Craft

> Owner: `references/cross-platform/04-macos-catalyst.md` owns native macOS SwiftUI idioms (menu bar, window management, pointer/cursor craft, keyboard focus) and Mac Catalyst's UIKit-bridged equivalents, per the ARCHITECTURE ownership map. Liquid Glass material rules are owned by `references/design/02-liquid-glass.md`; this file states only Mac-specific consequences. Base `NavigationSplitView`/sidebar mechanics are owned by `references/design/07-navigation-patterns.md#navigationsplitview-ios-16`. iPad's own pointer/hover story (`.hoverEffect(_:)`, no `.pointerStyle`) is owned by `references/cross-platform/01-ipados-multiplatform.md#pointer-and-hover` -- this file does not repeat it.
> Floors: `pointerStyle(_:)` / `PointerStyle` = **macOS 15.0+ / visionOS 2.0+ ONLY** -- it does not exist on iOS or iPadOS (use UIKit `UIPointerInteraction` there, or `.hoverEffect(_:)` on Catalyst). `pointerVisibility(_:)`, `modifierKeyAlternate(_:_:)`, `onModifierKeysChanged(mask:initial:_:)` are **macOS 15.0+ ONLY** per `references/_scaffolding/version-floor-registry.md#not-ios-the-1-mis-gate-class`. `glassEffect(_:in:)` / `GlassEffectContainer` = macOS 26.0+ (Tahoe). `.commands { }` = macOS 11.0+. `Settings { }` scene, `MenuBarExtra` = macOS-SDK-only, unavailable under Catalyst. macOS 27 is **Golden Gate**: `NSRefreshController`, `TabsPickerStyle`, `NSSegmentedControlRole` / `NSToolbarItemGroupRole`, `toolbarMinimizationBehavior(_:for:)` and the `ReadableDocument` / `WritableDocument` / `Document` protocols are all macOS 27.0. `visibilityPriority(_:)` is the asymmetric one -- **macOS 26.1**, iOS/iPadOS/Mac Catalyst 27.0.

A Mac app is judged by whether the keyboard, the menu bar, and the pointer all feel like first-class citizens -- not whether it merely runs. The most common craft failure is a Catalyst or ported-iPad app that opens in a resizable window but never customizes the menu bar, never reacts to hover, and never earns a single keyboard shortcut beyond the ones the system inserts for free.

## The Apple way

- Every command reachable by mouse gets a menu-bar entry with its shortcut visible; Tab moves focus through controls in a sensible order.
- Hover, cursor shape, and modifier-key combos are pointer-hardware-only polish -- design complete without them, then layer them on for the mouse/trackpad user.
- Pick the route deliberately: native SwiftUI macOS target for greenfield work, "Optimize Interface for Mac" Catalyst for an existing UIKit iPad codebase, "Designed for iPad" only as a stopgap.
- `Settings { }` is the only correct preferences window; a `.sheet` breaks Cmd-, and the Settings menu item.

## Choosing the route

| Route | What it is | Feels Mac-native? |
|---|---|---|
| Designed for iPad | Unmodified iPad app via the iOS runtime | No -- iPad chrome, Apple Silicon only |
| Mac Catalyst, Scale Interface to Match iPad | UIKit/SwiftUI on the iOS SDK, iPad-sized controls | Partial -- resizable + menu bar, wrong metrics |
| Mac Catalyst, Optimize Interface for Mac | Catalyst with native control metrics + `NSToolbar` | Yes -- the closest UIKit path to native |
| Native SwiftUI (`os(macOS)`) | macOS-SDK target, AppKit under SwiftUI | Fully native |

New SwiftUI-first apps with no heavy UIKit dependency should ship native (`os(macOS)`) -- it is the only route with `MenuBarExtra`, `Settings`, `UtilityWindow`, and native `.pointerStyle`. A large existing UIKit iPad codebase should adopt Catalyst's "Optimize Interface for Mac" idiom rather than rewrite. Idiom conditionals:

```swift
#if targetEnvironment(macCatalyst)   // Catalyst-only, either idiom
#endif
#if os(macOS)                        // native macOS SDK only -- NOT Catalyst
#endif
if UIDevice.current.userInterfaceIdiom == .mac { /* running Mac-idiom Catalyst */ }
```

## Pointer, hover, and cursor craft (native macOS)

`.onHover(perform:)` (macOS 10.15+) fires `true`/`false` on enter/exit; `.onContinuousHover { phase in }` yields live position (the current `some CoordinateSpaceProtocol` overload is macOS 14.0+/iOS 17.0+ -- an older concrete-`CoordinateSpace` overload is macOS 13.0+, prefer the current one).

```swift
struct HoverRow: View {
    @State private var isHovering = false
    var body: some View {
        HStack { /* … */ }
            .background(isHovering ? Color.secondary.opacity(0.12) : .clear)
            .onHover { isHovering = $0 }
    }
}
```

`.pointerStyle(_:)` changes the literal cursor -- the declarative replacement for `NSCursor.push()`. It is **macOS 15.0+ / visionOS 2.0+ ONLY**; it does not exist on iOS or iPadOS, where `.hoverEffect(_:)` is the entire pointer story instead (owner: `references/cross-platform/01-ipados-multiplatform.md#pointer-and-hover`).

```swift
Divider().pointerStyle(.columnResize)         // ↔ resize cursor over a draggable divider
Text("openai.com").pointerStyle(.link)        // pointing-hand over a link
Rectangle().pointerStyle(mode == .select ? .rectSelection : nil)   // optional -- nil restores default
```

`.pointerVisibility(_:)` (macOS 15.0+ ONLY) takes the standard `Visibility` enum, not a bespoke type -- use `.hidden` to hide the cursor over immersive or playback content, never as a general-purpose UI-hiding trick. Every non-obvious control gets `.help("…")` -- one cross-platform tooltip modifier VoiceOver also surfaces as the element's help text, so it degrades correctly rather than being hover-only.

## Modifier-key combos (macOS 15.0+ ONLY)

Two APIs make Option/Command-augmented interaction feel Mac-native. Both are gated strictly to macOS 15.0+ -- treat any corpus note suggesting a broader iOS/Catalyst/visionOS cohort as superseded; the verified floor is Mac-native only.

```swift
// modifierKeyAlternate(_:_:) -- swap a view (often a menu Button) while a modifier is held.
Menu("File") {
    Button("Save") { save() }
        .keyboardShortcut("s")
        .modifierKeyAlternate(.option) {
            Button("Save All") { saveAll() }          // ⌥⌘S while Option is held
        }
}

// onModifierKeysChanged(mask:initial:_:) -- react to the CURRENT combined modifier state.
ImageCanvasView()
    .pointerStyle(toolMode == .selection ? .rectSelection : nil)
    .onModifierKeysChanged(mask: .option) { old, new in
        toolMode = new.contains(.option) ? .selection : nil
    }
```

If the base view carries a `.keyboardShortcut`, the alternate infers an augmented shortcut unless one is set explicitly; the most-specific held-key match wins among multiple alternates. Both are POWER-USER accelerators, never the only path -- every alternate menu item must also exist as a discoverable primary command, and any modifier-conditional UI must leave the base experience complete without it (a touch-only or Full Keyboard Access user never triggers a held modifier).

## Menu bar

`.commands { }` (macOS 11.0+) drives the entire menu bar from the `App` body:

```swift
WindowGroup { ContentView() }
    .commands {
        CommandMenu("Layout") {                                 // new top-level menu, before Help
            Button("Zoom In") { }.keyboardShortcut("+", modifiers: .command)
        }
        CommandGroup(replacing: .newItem) {                      // replace a standard group
            Button("New Document") { newDoc() }.keyboardShortcut("n")
        }
        CommandGroup(after: .sidebar) {                           // add beside a standard group
            Button("Toggle Inspector") { showInspector.toggle() }
                .keyboardShortcut("i", modifiers: [.command, .option])
        }
        SidebarCommands(); ToolbarCommands(); TextEditingCommands()   // opt into Apple's built-in menus
    }
```

Enable/disable items by the FOCUSED window, not app-global state, via `@FocusedValue`/`.focusedSceneValue`:

```swift
struct SelectionKey: FocusedValueKey { typealias Value = Binding<Selection> }
extension FocusedValues { var selection: Binding<Selection>? {
    get { self[SelectionKey.self] } set { self[SelectionKey.self] = newValue } } }

// owning view: .focusedSceneValue(\.selection, $selection)
// in .commands: @FocusedValue(\.selection) private var selection
Button("Delete") { selection?.wrappedValue.deleteAll() }
    .disabled(selection == nil)      // grays out when no frontmost window has a selection
```

Never reassign Cmd-Q/W/,/Z -- users' muscle memory depends on them. Mac Catalyst does NOT use `.commands` for a UIKit-lifecycle app; it builds menus via `UIResponder.buildMenu(with:)`, mutating only when `builder.system == .main` and calling `UIMenuSystem.main.setNeedsRebuild()` to refresh. A SwiftUI-lifecycle Catalyst app can still use `.commands`.

**Menu item images are hidden by default from macOS 27.** In apps built with the 27.0 SDKs, SwiftUI hides menu item symbol images in most contexts, UIKit stops drawing images set on menu elements in the macOS and iPadOS menu bars and in macOS context menus, and AppKit hides both symbol and non-symbol menu item images for apps linked on the macOS 27 SDK. An app that made a dense menu bar scannable with SF Symbols loses that affordance on rebuild, and the wording now carries the whole load. Opt individual items back in:

```swift
// SwiftUI -- for an item that represents an object or a concept, not an action.
Button { open(document) } label: { Label(document.name, systemImage: "doc.richtext") }
    .labelStyle(.titleAndIcon)

// UIKit: UIMenuElement.preferredImageVisibility, plus the updated UIMenu/UIAction/UICommand/UIKeyCommand initializers.
// AppKit: NSMenuItem.preferredImageVisibility.
```

The HIG's rule is the one to teach: show an icon when the item represents an **object, location, device or visual concept**, hide it when it represents an action -- and provide icons for every item in a group or none of them. The system still supplies its own images for Settings, Share and Print. One related addition in the same release: a `LabeledContent` view inside a `Menu` maps its value to the platform menu item's subtitle.

## Windows

```swift
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }                                    // unlimited document windows
        WindowGroup(id: "editor", for: Note.ID.self) { $id in EditorView(noteID: id) }
        Window("Activity", id: "activity") { ActivityView() }             // one instance ever
        UtilityWindow("Inspector", id: "inspector") { InspectorView() }   // floating panel, macOS 15+
        Settings { SettingsView() }                                       // the ONLY correct prefs window
        MenuBarExtra("Status", systemImage: "star.fill") { MenuContent() }
            .menuBarExtraStyle(.window)
    }
}
```

`openWindow(value:)` reuses an already-open window matching that value instead of duplicating it. `.windowResizability(.contentSize)` locks a window to its content's frame -- prefer it over a fixed `.frame` on the root view, which leaves dead resizable space around fixed content. `MenuBarExtra`, `UtilityWindow`, and the `Settings` scene's Cmd-, wiring are macOS-SDK-only; guard with `#if os(macOS)` in a shared codebase. Catalyst windows are `UIScene`/`UIWindowScene`-based (`requestSceneSessionActivation`, `windowScene.sizeRestrictions`) -- the same machinery iPad Stage Manager uses, so building resizable Catalyst windows also earns proper iPad multi-window support.

## Toolbar

```swift
WindowGroup { ContentView() }.windowToolbarStyle(.unified)   // modern single-row toolbar+title

.toolbar {
    ToolbarItem(placement: .primaryAction) { Button("Add", systemImage: "plus") { add() } }
    ToolbarItem(placement: .principal) { Picker("View", selection: $mode) { }.pickerStyle(.segmented) }
}
```

Prefer semantic placements (`.primaryAction`, `.confirmationAction`, `.navigation`) over `.topBarTrailing`, which is iOS-only and silently falls back on macOS. In macOS 26 (Tahoe), adjacent toolbar items automatically share one Liquid Glass capsule; split with `ToolbarSpacer(.fixed/.flexible)` and force a standalone capsule with `.sharedBackgroundVisibility(.hidden)` -- never hand-apply `.glassEffect()` to a toolbar button, it double-stacks the material the system already supplies.

**What survives a narrow window is now something you rank, not something you discover.** A Mac window dragged narrow, a Catalyst window in Split View and an iPad Stage Manager tile all run out of toolbar room, and macOS 26.1 shipped `visibilityPriority(_:)` ahead of the other platforms:

```swift
.toolbar {
    ToolbarItem(placement: .primaryAction) { Button("Share", systemImage: "square.and.arrow.up") { share() } }
        .visibilityPriority(.high)                     // macOS 26.1; iOS/iPadOS/Catalyst 27.0
    ToolbarItem { Button("Tag", systemImage: "tag") { tag() } }
        .visibilityPriority(.low)                      // falls into the overflow first
}
```

`ToolbarItemVisibilityPriority` offers `.automatic`, `.low` and `.high`, plus `init(lowerThan:)` / `init(higherThan:)` for a custom rank. `ToolbarOverflowMenu` (iOS/iPadOS/Mac Catalyst/visionOS 27.0 -- **no macOS**) puts secondary actions straight into the system overflow, and the `topBarPinnedTrailing` placement (same four platforms) anchors one item so it never shifts; on a native macOS target, rank with `visibilityPriority` alone. The review question is concrete: which two actions are guaranteed to survive at the narrowest size this app supports? An app-built "..." menu that duplicates the system overflow instead of feeding it is the failure mode.

Bar minimization was renamed in 27. `toolbarMinimizationBehavior(_:for:)` with `ToolbarMinimizationBehavior` (`.automatic`, `.never`, `.onScrollDown`, `.onScrollUp`) is the shipped name for what WWDC26 showed as `toolbarMinimizeBehavior` (that spelling never shipped in any release), and UIKit's `UINavigationItem.navigationBarMinimization` (a `UIBarMinimization` carrying `minimizationBehavior`, `restorationBehavior` and `safeAreaAdjustment`) replaces `barMinimizeBehavior` and `barMinimizationSafeAreaAdjustment`. `tabBarMinimizeBehavior(_:)` and `UITabBarController.tabBarMinimizeBehavior` were **not** renamed, so keep the toolbar and tab-bar gates separate:

```swift
// Mac Catalyst / iPadOS. .onScrollDown is iOS-family only (native macOS has just .automatic),
// and .navigationBar is the only placement the modifier supports.
if #available(iOS 27, *) {
    content.toolbarMinimizationBehavior(.onScrollDown, for: .navigationBar)
} else {
    content   // no toolbar minimization before 27 -- the WWDC26 beta name never shipped
}
```

A picker that represents navigation can finally say so. `TabsPickerStyle` (macOS 27.0, plus iOS/iPadOS/Mac Catalyst/tvOS/visionOS 27.0 -- no watchOS) looks like `.segmented` but VoiceOver announces it as tabs, and on macOS it renders distinctly from a value-selection segmented control such as a text-alignment picker. `TabView` in a macOS inspector adopts it automatically. AppKit gets the matching `role` property with `NSSegmentedControlRole` (including a `tabs` role) and `NSToolbarItemGroupRole`. Any Mac or iPad inspector faking tabs with `.segmented` plus `accessibilityAddTraits(.isTabBar)` should switch; the trait workaround was always a patch over a mislabelled control.

## Sidebar

The three-column `NavigationSplitView` + `.listStyle(.sidebar)` shell (mechanics owned by `references/design/07-navigation-patterns.md#navigationsplitview-ios-16`) is the defining Mac layout -- Finder, Mail, Notes. Mac-specific finishing: `Label(_, systemImage:)` rows (never bare `Text`), `List(selection:)` binding so the system draws the glass selection capsule rather than a hand-rolled highlight, and `.backgroundExtensionEffect()` on the detail's background imagery so macOS 26's floating glass sidebar has real content to sample instead of a flat fill.

## macOS 27 (Golden Gate): what changes on rebuild

macOS 27 shipped 2026-09-14 alongside iOS, iPadOS, watchOS, tvOS and visionOS 27. Six changes bite the moment a Mac or Catalyst target is rebuilt on the 27 SDK, and every one of them is silent:

- **The scene life cycle is mandatory.** An app built with the 27.0 SDKs that has not adopted the UIKit scene-based life cycle fails to launch, and iOS/iPadOS apps must additionally declare `UILaunchStoryboardName`, `UILaunchStoryboards`, `UILaunchScreen` or `UILaunchScreens`. Multi-window Catalyst plumbing is now the launch requirement, not a polish item. `UIScene.extendStateRestoration` / `completeStateRestoration` (iOS 15.0 symbols; linked on the 27.0 SDKs they extend restoration across the background-to-foreground transition) is the quality half: a restored window can finish restoring before the system considers it foregrounded, instead of flashing an empty state.
- **Catalyst activation no longer creates a window.** Catalyst apps now behave like AppKit apps -- switching to one with no open windows does not spawn a window unless the app was activated through the Dock or Spotlight. Any UX that assumed "switch to app, get a window" needs its File ▸ New path and a real zero-window state.
- **`UIDesignRequiresCompatibility` is inert.** The key is ignored when building for macOS, Mac Catalyst, iOS, iPadOS or tvOS 27 and later. The pre-Liquid-Glass compatibility mode was a one-release measure; an app that shipped the flag to defer the redesign gets the full redesign on the first 27-SDK build.
- **Titlebar accessories may draw outside their bounds.** For apps linked on macOS 27.0 or later, `NSTitlebarAccessoryViewController` is allowed to overflow by default, which supports shadows and interactive glass -- and inverts the clipping assumption a custom accessory was built against. Accessories may still be clipped during reveal animations or while hidden.
- **SwiftUI's Mac controls lost their AppKit backing.** `Slider` no longer uses `NSSlider`, and bordered `Menu` and `Picker` buttons no longer use `NSPopUpButton` (which buys better label customisation). Any layout metric, appearance hack or accessibility workaround written against the underlying AppKit control has to be re-tested, not trusted. Separately fixed in 27: `.glass` and `.glassProminent` buttons now show a hover state outside toolbars.
- **Intel is one release from the end.** Rosetta is not automatically restored after upgrading to macOS 27.0, apps a user had set to "Open using Rosetta" now launch natively, installer packages with no `hostArchitecture` default to arm64, and all Intel-based software stops working on macOS 28.0 (legacy games excepted). `DVDPlayback` is gone from the SDK entirely. Any Intel-only helper, plug-in, installer script or bundled tool in the Mac target is a shipping-path failure one release out -- worth a standing check alongside the UI work.

One more thing the Mac inherits from iOS 27: an iPhone-only app running in **iPhone Mirroring is now fully resizable**, built against the 27 SDK, because supported interface orientations stopped gating continuous resizability. A companion iPhone app that looked fine in a fixed mirrored window is now a resizable window on the Mac, and every `UIScreen.main.bounds` assumption in it is a Mac-visible defect (`references/cross-platform/01-ipados-multiplatform.md` owns that change). Users can also personalize Liquid Glass from ultraclear to fully tinted on iOS and iPadOS 27 (Apple's cross-platform release announcement suggests the Mac too, without naming it), which is one more reason a bespoke "glass" material in a shared codebase drifts away from system chrome: use `glassEffect(_:in:)`, the standard button styles and standard bars on every platform rather than hand-rolling a material.

Pull-to-refresh also stops being an iOS idiom Mac apps fake or omit. AppKit adds `NSRefreshController` (macOS 27.0), set on `NSScrollView.refreshController` with a target/action plus `beginRefreshing()` and `endRefreshing()`; `NSScrollView` also gains control over how many touches scrolling requires and a `scrollGestureForFailureRelationship`. On Catalyst, `UIRefreshControl` and `UIStepper` finally work in the Mac idiom. For a shared codebase that removes one reason to branch refresh UI per platform -- but on macOS 26 and earlier keep an explicit Refresh toolbar item or menu command rather than hand-rolling a pull gesture.

`NSApplication.presentationOptions` gains `.disableScreenCornerInteractions` to turn off Hot Corners. It is for genuinely full-screen immersive content; using it in an ordinary window takes a system gesture away from the user and is a hostility finding.

## Documents across iPad and Mac (27.0)

Document-based apps are the sharpest edge of iPad-and-Mac reach, and the whole protocol surface turned over in one release. `FileDocument` and `ReferenceFileDocument` are deprecated: use `ReadableDocument` for read-only documents, `WritableDocument` for write-only, and `Document` for both (all iOS/iPadOS/Mac Catalyst/macOS/visionOS 27.0). The new protocols support asynchronous reading and writing, progress reporting and direct URL access, and the new `DocumentGroup` initializers can disable document creation for an editing-only app or present custom UI before any document opens.

macOS 27 adds two affordances that previously needed custom flows: a `\.newDocument` environment action that accepts an in-memory `ReadableDocument` (New-from-Template), and `fileExporter(isPresented:documents:contentTypes:onCompletion:onCancellation:)` to export a collection in one dialog. The deprecated protocols still work on 27, so this is a migration to schedule rather than an emergency -- but a review of a document app should now flag them.

## Availability + fallbacks

```swift
if #available(macOS 15.0, *) {
    canvas.pointerStyle(mode == .select ? .rectSelection : nil)
        .onModifierKeysChanged(mask: .option) { _, new in mode = new.contains(.option) ? .select : .draw }
} else {
    canvas   // pre-15 Macs: fall back to an explicit tool-mode toggle button, always present
}
```

```swift
// macOS 27 pull-to-refresh, with the pre-27 answer kept rather than hand-rolled.
if #available(macOS 27, *) {
    let refresh = NSRefreshController()
    refresh.target = self
    refresh.action = #selector(reload)
    scrollView.refreshController = refresh
} else {
    // macOS 26 and earlier: an explicit Refresh toolbar item + View ▸ Refresh command (⌘R).
}
```

A shared iPad-and-Mac codebase gates the 27 renames on both platforms at once (`#available(macOS 27, iOS 27, *)`), because `toolbarMinimizationBehavior(_:for:)` and the document protocols landed on the same date. `visibilityPriority(_:)` is the one exception worth spelling out: `#available(macOS 26.1, iOS 27, *)`.

## Accessibility contract

Modifier-key combos, hover chrome, and cursor shape are pointer-hardware-only -- invisible to touch (Catalyst on iPad), VoiceOver, Full Keyboard Access, and Switch Control. Every hover-revealed control and every modifier-alternate menu item must also be reachable by Tab, a persistent menu entry, or a context menu; verify the focus ring is never suppressed, which is a Full Keyboard Access blocker. None of this file's hover motion is system-auto-gated -- any custom hover transform is governed by `references/accessibility/05-motion-accessibility.md`'s double-gate.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `.pointerStyle(_:)` shipped on an iPad/Catalyst target | Compiles, but is a no-op there -- macOS/visionOS only | `.hoverEffect(_:)`, or UIKit `UIPointerInteraction` |
| A feature reachable only by holding a modifier | Invisible to touch, VoiceOver, Full Keyboard Access | Every alternate also exists as a discoverable primary command |
| Settings window built as a `.sheet` | Breaks Cmd-, and the Settings menu item | The `Settings { }` scene |
| Fixed `.frame` on the root view for a fixed-size window | Leaves dead resizable space | `.windowResizability(.contentSize)` |
| Hand-applying `.glassEffect()` to a toolbar button | Double-stacks the system's shared glass capsule | Let the toolbar's automatic grouping own it |
| No hover states, no right-click menus anywhere | Reads as a stretched tablet app, not a Mac app | `.onHover` highlights + `.contextMenu` everywhere expected |
| `toolbarMinimizeBehavior` in code written against the 27 SDK | The WWDC26 beta spelling never shipped, so it does not compile | `toolbarMinimizationBehavior(_:for:)` (tab-bar spelling is unchanged) |
| A segmented control used for navigation with `accessibilityAddTraits(.isTabBar)` | VoiceOver mislabels it; the trait is a patch | `.pickerStyle(.tabs)` (macOS/iOS 27) |
| `.disableScreenCornerInteractions` in an ordinary window | Removes Hot Corners from the user with no immersive justification | Reserve it for genuinely full-screen content |
| A Catalyst app that assumes activation spawns a window | macOS 27 Catalyst behaves like AppKit -- no window appears | Working Dock/Spotlight and File ▸ New paths, plus a real zero-window state |
| `FileDocument` / `ReferenceFileDocument` in new code | Deprecated at 27 across iPad and Mac | `ReadableDocument` / `WritableDocument` / `Document` |

## Severity guide

CRITICAL: a command reachable only via a hover-revealed control or held modifier with no keyboard/menu equivalent, or a 27-SDK target that has not adopted the scene life cycle (it will not launch). HIGH: `.pointerStyle`/`modifierKeyAlternate` shipped on a non-macOS target where they silently no-op, or a Catalyst app with no usable zero-window state on macOS 27. MEDIUM: Settings built as a sheet, a fixed-size window with no `.windowResizability`, a toolbar with no `visibilityPriority` ranking whose primary action vanishes at narrow widths, or a menu bar whose meaning depended on icons now hidden by default. LOW: missing `.help` tooltips on icon-only toolbar buttons, or `FileDocument` in new code. NIT: `.topBarTrailing` used in a shared codebase instead of `.primaryAction`.

## See also

- `references/design/02-liquid-glass.md` -- the Liquid Glass material, Mac-specific consequences only stated here (owner)
- `references/design/07-navigation-patterns.md#navigationsplitview-ios-16` -- base split-view/sidebar mechanics (owner)
- `references/cross-platform/01-ipados-multiplatform.md#pointer-and-hover` -- iPad's `.hoverEffect`-only pointer story (owner)
- `references/platform/02-app-intents-system.md#keyboard-shortcuts-ipad-and-mac` -- base `.keyboardShortcut` patterns this file's Mac deltas extend (owner)
- `references/accessibility/07-cognitive-hearing-assistive.md#voice-control-switch-control-and-full-keyboard-access` -- Full Keyboard Access contract (owner; distinct from `.keyboardShortcut()`)
- `references/accessibility/05-motion-accessibility.md` -- the Reduce Motion double-gate (owner)
