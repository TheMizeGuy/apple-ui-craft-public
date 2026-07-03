# macOS + Mac Catalyst Craft

> Owner: `references/cross-platform/04-macos-catalyst.md` owns native macOS SwiftUI idioms (menu bar, window management, pointer/cursor craft, keyboard focus) and Mac Catalyst's UIKit-bridged equivalents, per the ARCHITECTURE ownership map. Liquid Glass material rules are owned by `references/design/02-liquid-glass.md`; this file states only Mac-specific consequences. Base `NavigationSplitView`/sidebar mechanics are owned by `references/design/07-navigation-patterns.md#navigationsplitview-ios-16`. iPad's own pointer/hover story (`.hoverEffect(_:)`, no `.pointerStyle`) is owned by `references/cross-platform/01-ipados-multiplatform.md#pointer-and-hover` -- this file does not repeat it.
> Floors: `pointerStyle(_:)` / `PointerStyle` = **macOS 15.0+ / visionOS 2.0+ ONLY** -- it does not exist on iOS or iPadOS (use UIKit `UIPointerInteraction` there, or `.hoverEffect(_:)` on Catalyst). `pointerVisibility(_:)`, `modifierKeyAlternate(_:_:)`, `onModifierKeysChanged(mask:initial:_:)` are **macOS 15.0+ ONLY** per `references/_scaffolding/version-floor-registry.md#not-ios-the-1-mis-gate-class`. `glassEffect(_:in:)` / `GlassEffectContainer` = macOS 26.0+ (Tahoe). `.commands { }` = macOS 11.0+. `Settings { }` scene, `MenuBarExtra` = macOS-SDK-only, unavailable under Catalyst.

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

## Sidebar

The three-column `NavigationSplitView` + `.listStyle(.sidebar)` shell (mechanics owned by `references/design/07-navigation-patterns.md#navigationsplitview-ios-16`) is the defining Mac layout -- Finder, Mail, Notes. Mac-specific finishing: `Label(_, systemImage:)` rows (never bare `Text`), `List(selection:)` binding so the system draws the glass selection capsule rather than a hand-rolled highlight, and `.backgroundExtensionEffect()` on the detail's background imagery so macOS 26's floating glass sidebar has real content to sample instead of a flat fill.

## Availability + fallbacks

```swift
if #available(macOS 15.0, *) {
    canvas.pointerStyle(mode == .select ? .rectSelection : nil)
        .onModifierKeysChanged(mask: .option) { _, new in mode = new.contains(.option) ? .select : .draw }
} else {
    canvas   // pre-15 Macs: fall back to an explicit tool-mode toggle button, always present
}
```

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

## Severity guide

CRITICAL: a command reachable only via a hover-revealed control or held modifier with no keyboard/menu equivalent. HIGH: `.pointerStyle`/`modifierKeyAlternate` shipped on a non-macOS target where they silently no-op. MEDIUM: Settings built as a sheet, or a fixed-size window with no `.windowResizability`. LOW: missing `.help` tooltips on icon-only toolbar buttons. NIT: `.topBarTrailing` used in a shared codebase instead of `.primaryAction`.

## See also

- `references/design/02-liquid-glass.md` -- the Liquid Glass material, Mac-specific consequences only stated here (owner)
- `references/design/07-navigation-patterns.md#navigationsplitview-ios-16` -- base split-view/sidebar mechanics (owner)
- `references/cross-platform/01-ipados-multiplatform.md#pointer-and-hover` -- iPad's `.hoverEffect`-only pointer story (owner)
- `references/platform/02-app-intents-system.md#keyboard-shortcuts-ipad-and-mac` -- base `.keyboardShortcut` patterns this file's Mac deltas extend (owner)
- `references/accessibility/07-cognitive-hearing-assistive.md#voice-control-switch-control-and-full-keyboard-access` -- Full Keyboard Access contract (owner; distinct from `.keyboardShortcut()`)
- `references/accessibility/05-motion-accessibility.md` -- the Reduce Motion double-gate (owner)
- `~/Claude/vault/iOS Development/` -- deep macOS/Catalyst source material
