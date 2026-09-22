# Navigation Patterns

iOS navigation is built on three primary patterns: hierarchical (push/pop), modal (present/dismiss), and tabs (switch context). Each communicates a different mental model.

## NavigationStack (iOS 16+)

For hierarchical navigation. Replaces the deprecated `NavigationView`.

```swift
NavigationStack {
    List(items) { item in
        NavigationLink(value: item) {
            Text(item.name)
        }
    }
    .navigationTitle("Items")
    .navigationDestination(for: Item.self) { item in
        ItemDetail(item: item)
    }
}
```

### NavigationPath for programmatic control

```swift
@State private var path = NavigationPath()

NavigationStack(path: $path) {
    HomeView()
        .navigationDestination(for: Item.self) { item in
            ItemDetail(item: item)
        }
        .navigationDestination(for: Folder.self) { folder in
            FolderView(folder: folder)
        }
}

// Push programmatically
path.append(item)

// Pop one
path.removeLast()

// Pop to root
path.removeLast(path.count)

// Or:
path = NavigationPath()
```

### Title display modes

```swift
.navigationTitle("Items")
.navigationBarTitleDisplayMode(.large)      // Top of stack
.navigationBarTitleDisplayMode(.inline)     // Detail screens
.navigationBarTitleDisplayMode(.automatic)  // System decides
```

**Convention:** Root views use `.large`, detail views use `.inline`. The system handles this automatically with `.automatic`.

`toolbarTitleDisplayMode(_:)` (iOS 17.0+ -- not new in iOS 26) supersedes the modifier above with one additional case:

```swift
.toolbarTitleDisplayMode(.large)        // Same as .navigationBarTitleDisplayMode(.large)
.toolbarTitleDisplayMode(.inline)
.toolbarTitleDisplayMode(.inlineLarge)  // Inline nav bar with the large title still visible below the toolbar
.toolbarTitleDisplayMode(.automatic)
```

### Toolbar customization

```swift
.toolbar {
    ToolbarItem(placement: .topBarTrailing) {
        Button("Add", systemImage: "plus") { addItem() }
    }
    
    ToolbarItem(placement: .topBarLeading) {
        Button("Cancel", role: .cancel) { dismiss() }
    }
    
    ToolbarItem(placement: .principal) {
        // Custom title view
        Picker("Filter", selection: $filter) {
            ForEach(Filter.allCases, id: \.self) { Text($0.title).tag($0) }
        }
        .pickerStyle(.segmented)
    }
    
    ToolbarItemGroup(placement: .bottomBar) {
        Button("Edit", systemImage: "pencil") { edit() }
        Spacer()
        Text("\(items.count) items")
            .font(.caption)
            .foregroundStyle(.secondary)
        Spacer()
        Button("Delete", systemImage: "trash", role: .destructive) { delete() }
    }
}
```

Toolbar closures are `@ContentBuilder` closures in the iOS 27 SDK (`typealias ContentBuilder = ViewBuilder`), so a `ForEach` or a conditional works inside `.toolbar { }` the way it does inside a `body`. This is a compile-time change with **no runtime floor**: `ToolbarContentBuilder` and `CommandsBuilder` are not deprecated, existing code needs no migration, and wrapping anything in `#available(iOS 27, *)` on account of `@ContentBuilder` is a mis-gate. The only requirement is building with Xcode 27.

### Toolbar minimization (iOS 27)

The toolbar-side counterpart to iOS 26's `tabBarMinimizeBehavior(_:)`: the bar recedes on scroll and gives content the full glass-free height.

```swift
// nonisolated func toolbarMinimizationBehavior(_ behavior: ToolbarMinimizationBehavior,
//                                              for bars: ToolbarPlacement...) -> some View
private struct MinimizingBar: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 27.0, *) {
            content
                .toolbarMinimizationBehavior(.onScrollDown, for: .navigationBar)
                .toolbarMinimizationSafeAreaAdjustment(.disabled, for: .navigationBar)
        } else {
            content   // iOS 26: no toolbar minimization exists. A static bar is correct here,
                      // not degraded -- do not fake it by animating offset from scroll geometry.
        }
    }
}

NavigationStack {
    ScrollView { articleBody }
        .navigationTitle("Article")
        .modifier(MinimizingBar())   // on the content inside the stack, not on the NavigationStack
}
```

`ToolbarMinimizationBehavior` is `.automatic`, `.never`, `.onScrollDown`, `.onScrollUp`, and `.navigationBar` is the only placement the modifier supports (an integrated top tab bar minimizes with it). The modifier and `.automatic` are cross-platform; the three explicit cases are iOS / iPadOS / Mac Catalyst only, so a shared multiplatform view passing `.onScrollDown` needs a platform branch as well as a version gate. The `for bars:` parameter is variadic -- pass several placements in one call.

Two companion knobs, both iOS 27.0:

| Modifier | What it decides |
|---|---|
| `toolbarMinimizationRestoration(.atScrollEdge, for:)` | The bar returns only when scrolling reaches the edge, instead of on any reverse scroll |
| `toolbarMinimizationSafeAreaAdjustment(.disabled, for:)` | The safe area stops shrinking with the bar, so content doesn't reflow on every direction change |

Disabling the safe-area adjustment is the fix when a reviewer sees layout thrash under minimization: the glass still shrinks, the content just stops moving.

The shipped type is `ToolbarMinimizationBehavior`. `ToolbarMinimizeBehavior`, the name shown at WWDC26, was renamed before release and does not exist in the SDK -- writing it is a compile error. `TabBarMinimizeBehavior` (iOS 26.0) remains a separate type at a separate floor, so a 26-floor app gates the two independently.

### Toolbar overflow (iOS 27)

When a toolbar runs out of room it moves items into an overflow menu. On iOS 27 both *what* lands there and *in what order* are declarable instead of accidental.

`ToolbarOverflowMenu` holds actions that belong in the overflow regardless of available space, toolbar mode, or customizability:

```swift
.toolbar {
    ToolbarItem(placement: .topBarTrailing) {
        Button("Compose", systemImage: "square.and.pencil") { compose() }
    }

    if #available(iOS 27.0, *) {
        ToolbarOverflowMenu {
            Button("Archive", systemImage: "archivebox") { archive() }
            Button("Delete", systemImage: "trash", role: .destructive) { delete() }
        }
    } else {
        ToolbarItem(placement: .topBarTrailing) {
            Menu("More", systemImage: "ellipsis") {
                Button("Archive", systemImage: "archivebox") { archive() }
                Button("Delete", systemImage: "trash", role: .destructive) { delete() }
            }
        }
    }
}
```

iOS 27.0 / iPadOS 27.0 / Mac Catalyst 27.0 / visionOS 27.0 -- **not macOS, not tvOS, not watchOS** -- so a shared multiplatform toolbar needs an `#if os(...)` branch as well as the availability gate.

The HIG rule behind it: "Use the system overflow menu. If your app has its own overflow menu, move those actions into the system menu so people find everything in one place. Reserve the ellipsis symbol for overflow, and give other menus a distinct symbol." An app-drawn ellipsis `Menu` sitting beside the system overflow is a duplicated-affordance finding on iOS 27.

`visibilityPriority(_:)` ranks what survives as the bar shrinks -- lower priority overflows first:

```swift
ToolbarItem(placement: .topBarTrailing) {
    Button("Compose", systemImage: "square.and.pencil") { compose() }
}
.visibilityPriority(.high)      // last to overflow
```

`ToolbarItemVisibilityPriority` is `.automatic`, `.high`, `.low`, plus `init(higherThan:)` / `init(lowerThan:)` for a custom rank. Note the split floor: the type and its three system priorities are 27.0 everywhere except **macOS 26.1**; the custom-rank initializers are a separate floor -- iOS / iPadOS / Mac Catalyst / macOS 27.0 only, not tvOS, visionOS or watchOS -- so `#available(macOS 26.1, *)` covers only the system priorities on Mac. Assign priority to whole groups first, then to individual items within a group if you need finer control. The items worth ranking are the one or two actions that define the screen (Compose in Mail, New Note) and anything carrying status, such as a badged button; a toolbar whose survivors are whatever happened to be declared first is the defect.

Below the floor there is no priority model: cut the item count, or own the overflow yourself with a `Menu`.

### Pinned placement and the status bar (iOS 27)

`ToolbarItemPlacement.topBarPinnedTrailing` anchors an item to the trailing edge of the top bar so it holds position while other items shift or move into overflow. It is the placement for the one action that must never be reachable only through a menu -- Apple names Done.

```swift
.toolbar {
    if #available(iOS 27.0, *) {
        ToolbarItem(placement: .topBarPinnedTrailing) {
            Button("Done") { dismiss() }
        }
    } else {
        ToolbarItem(placement: .topBarTrailing) {
            Button("Done") { dismiss() }   // pre-27: keep the item count low enough to never overflow
        }
    }
    ToolbarItem(placement: .cancellationAction) {
        Button("Cancel", role: .cancel) { dismiss() }
    }
}
```

A Done or Save button in plain `.topBarTrailing` inside a crowded iOS 27 toolbar is a finding: it can now be pushed into overflow. iOS 27.0 / iPadOS 27.0 / Mac Catalyst 27.0 / visionOS 27.0 only.

`ToolbarPlacement.statusBar` (iOS 27.0 / iPadOS 27.0 / Mac Catalyst 27.0) closes a long-standing SwiftUI gap -- status-bar style and visibility with no `UIViewControllerRepresentable` shim:

```swift
.toolbarColorScheme(.dark, for: .statusBar)
.toolbarVisibility(hideStatusBar ? .hidden : .automatic, for: .statusBar)
```

Below iOS 27 the fallback is a `UIHostingController` subclass overriding `preferredStatusBarStyle`, or `.statusBarHidden(_:)` for visibility alone. Do not bridge through `UIApplication.statusBarFrame` / `statusBarStyle` / `isStatusBarHidden`: under the 27.0 SDK those deprecated accessors return NaN or null, so they are actively hostile now, not merely discouraged.

`contentMarginsRemoved(_:)` (iOS 27.0, on `ToolbarContent`) removes the system content margins from one toolbar item -- for a custom control, such as a segmented filter or a progress capsule, that must run edge to edge inside its glass. Leave standard buttons alone; the margins are what make adjacent items read as a group.

### UIKit toolbar counterparts

A mixed or UIKit codebase gets the same overflow craft, with one trap -- only two of the four symbols are new.

| UIKit | Floor | SwiftUI equivalent |
|---|---|---|
| `UIBarButtonItem.visibilityPriority` / `UIBarButtonItemVisibilityPriority` | iOS 27.0 | `visibilityPriority(_:)` |
| `UINavigationItem.navigationBarMinimization` (replaces `barMinimizeBehavior` + `barMinimizationSafeAreaAdjustment`) | iOS 27.0 | `toolbarMinimizationBehavior(_:for:)` |
| `UINavigationItem.pinnedTrailingGroup` | **iOS 16.0** | `.topBarPinnedTrailing` |
| `UINavigationItem.additionalOverflowItems` | **iOS 16.0** | `ToolbarOverflowMenu` |

Gating all four behind `#available(iOS 27, *)` is wrong: the bottom two have worked since iOS 16 and need no gate at all.

### Toolbars on a folding display

The HIG's central claim about iPhone Duo is that it is not a new platform -- "you're still designing for iPhone, and Designing for iOS patterns and best practices still apply." On the wide, short outer display the system moves the toolbar, tab bar and navigation controls to the SIDE, and keeps them there when the device opens in landscape; an app built on standard components and size classes inherits that layout for free. Three rules decide whether it actually works:

1. **Every toolbar item needs both a title and a symbol.** "The system uses an icon for an item it presents vertically... If your item has a title and doesn't have an icon, the system doesn't present it vertically," and "If your item uses a custom view rather than a title or icon, the system doesn't present it vertically." `Button("Archive", systemImage: "archivebox")` satisfies both; a bare `Text` label or a custom view does not.
2. **Group with `ToolbarItemGroup`** (UIKit: `UIBarButtonItemGroup`), never with manual `Spacer()` padding. Groups "provide space between items and other groups automatically, and adapt as the available space changes."
3. **Keep text-only buttons to a minimum.** "Labels that include text stay in a horizontal bar, so prefer a symbol wherever one works."

Reserve the top of the vertical axis for primary navigation controls (Back, Close), followed by prominent actions such as Done. If your bars are *not* presenting vertically, the cause is almost always hand-rolled chrome: attach `.toolbar(content:)` to a `NavigationStack` or `NavigationSplitView` instead of building a custom bar out of `UIToolbar` / `UINavigationBar` / `UITabBar`. A hero or background image should extend under a vertical bar via `backgroundExtensionEffect()` (iOS 26.0) -- and note the build-setting trap: built with Xcode 26 or earlier, an app does not extend under the status bar and camera at all.

Per-container behavior, from Apple: an inspector's bars are always horizontal; in a split view the sidebar and content bars stay horizontal while the detail's go vertical; on the outer display a sheet's bars are vertical by default, and on the inner display a sheet's toolbar is horizontal for centered or leading `presentationPlacement(_:)` and vertical for trailing.

The vertical-bar API surface itself -- `toolbarVerticalBehavior(_:)`, `ToolbarContent.axisBehavior(_:)`, `toolbarVerticalCompressionBehavior(_:)`, and the `toolbarVerticalEdge` environment value -- is **iOS 27.1 and still flagged beta by Apple as of 2026-09-22**. Gate it behind `#available(iOS 27.1, *)`, verify against the installed SDK before relying on it, and keep it out of primary examples. One design decision it exposes is worth knowing now: compression decides who survives when a toolbar and a tab bar compete for constrained space -- navigation-focused screens push toolbar items into overflow so the tab bar and primary destinations stay reachable (the default), while task-oriented screens minimize the tab bar to preserve the actions that finish the task. And the HIG's blunt instruction: "In general, don't override the default bar placement."

### Toolbar role

```swift
.toolbarRole(.editor)  // iPadOS editor layout: leading title, centered toolbar items, restyled back button
```

## NavigationSplitView (iOS 16+)

For iPad and Mac with multi-column layouts.

### Two-column

```swift
NavigationSplitView {
    SidebarView(selection: $selectedItem)
} detail: {
    if let item = selectedItem {
        ItemDetail(item: item)
    } else {
        ContentUnavailableView("Select an item", systemImage: "doc")
    }
}
```

### Three-column

```swift
NavigationSplitView {
    SidebarView(selection: $selectedFolder)
} content: {
    if let folder = selectedFolder {
        ItemListView(folder: folder, selection: $selectedItem)
    }
} detail: {
    if let item = selectedItem {
        ItemDetail(item: item)
    }
}
```

On iPhone, NavigationSplitView automatically collapses to a NavigationStack.

### Column visibility

```swift
@State private var columnVisibility = NavigationSplitViewVisibility.automatic

NavigationSplitView(columnVisibility: $columnVisibility) {
    SidebarView()
} detail: {
    DetailView()
}

// Hide sidebar programmatically
columnVisibility = .detailOnly
```

## TabView for top-level navigation

```swift
TabView {
    Tab("Home", systemImage: "house") {
        HomeView()
    }
    Tab("Search", systemImage: "magnifyingglass", role: .search) {
        SearchView()
    }
    Tab("Profile", systemImage: "person.circle") {
        ProfileView()
    }
}
```

### Tab guidelines

| Rule | Detail |
|---|---|
| 3-5 tabs maximum | More than 5 = "More" tab on iPhone |
| Standard system position (bottom) | Don't move it |
| Each tab is independent | State preserved per tab |
| Tab bar always visible | Don't hide unless full-screen modal |
| First tab is the "default" | App opens to this when launched |
| Last tab is often Profile/Settings | Convention, not requirement |

### Tab bar with Liquid Glass (iOS 26+)

```swift
TabView {
    Tab("Home", systemImage: "house") { HomeView() }
    Tab("Search", systemImage: "magnifyingglass", role: .search) { SearchView() }
}
.tabBarMinimizeBehavior(.onScrollDown)
.tabViewBottomAccessory {
    NowPlayingBar()
}
```

### Prominent tab (iOS 27)

`TabRole.prominent` gives one tab a focal treatment in a separate, trailing position of the tab bar -- the compose or capture slot, without a custom floating button drawn over the glass layer.

```swift
TabView {
    Tab("Home", systemImage: "house") { HomeView() }
    Tab("Search", systemImage: "magnifyingglass", role: .search) { SearchView() }

    if #available(iOS 27.0, *) {
        Tab("Compose", systemImage: "square.and.pencil", role: .prominent) { ComposeView() }
    } else {
        Tab("Compose", systemImage: "square.and.pencil") { ComposeView() }
    }
}
```

Two rules a reviewer enforces. Only one tab can be prominent. And if the app already has a `.search` role tab, adding an explicit `.prominent` tab takes the treatment away from it -- Apple: "When there are no tabs with an explicit `.prominent` role, then a `.search` role tab may receive the prominent visual treatment by default." Decide which one deserves it rather than discovering the answer.

The role is available on every 27.0 platform (`TabRole` itself is iOS 18.0). Below iOS 27, omit the role and the tab renders normally, or use `tabViewBottomAccessory` (iOS 26.0) for a persistent action surface. Never overlay a fake circular button on the tab bar to simulate this.

### Selection must resolve to a visible tab (iOS 27 SDK)

Apple, verbatim: "In apps built with the iOS 27.0 and iPadOS 27.0 SDKs, a `TabView` enforces that its selection is set to a visible tab. `TabView` might crash when its selection is set to a hidden or otherwise unavailable tab."

This fires on a **recompile alone** -- no deployment-target bump required -- and it turns a previously silent bug into a crash. Any app that hides tabs conditionally (feature flags, entitlement state, `TabViewCustomization`, sign-in gating) or restores a persisted selection from `@SceneStorage`/`@AppStorage` must validate the restored value against the currently visible tab set before binding it.

```swift
@State private var selection: TabIdentifier = .home

private var visibleTabs: [TabIdentifier] { ... }   // feature flags, entitlements, sign-in state

TabView(selection: $selection) { ... }
    .onChange(of: visibleTabs, initial: true) { _, tabs in
        if !tabs.contains(selection) {
            selection = tabs.first ?? .home        // clamp before the system ever sees it
        }
    }
```

CRITICAL severity for any `TabView` whose tab set is not static.

### `.pickerStyle(.tabs)` for in-page navigation

A segmented control used as in-page navigation -- switching which content is shown rather than choosing a value -- has always been announced to VoiceOver as a value picker, which misdescribes what it does. iOS 27 fixes that declaratively:

```swift
// sectionPicker is a `Picker` over the section enum.
if #available(iOS 27.0, *) {
    sectionPicker.pickerStyle(.tabs)              // VoiceOver reads it as "tabs"
} else {
    sectionPicker
        .pickerStyle(.segmented)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isTabBar)        // iOS 17+ equivalent semantics
}
```

`TabsPickerStyle` is iOS / iPadOS / Mac Catalyst / macOS / tvOS / visionOS 27.0 -- **not watchOS**. On macOS it also renders distinctly from a value picker, which is what separates it from a text-alignment picker in an inspector. Map the choice to the job, not the aesthetic: `.segmented` chooses a value, `.menu` handles many or long options, `.tabs` changes which content is displayed. The `.principal` toolbar picker earlier in this file is exactly the case that should become `.tabs`.

## Paged content (page control)

A page control is navigation for a FLAT set of peer pages of the same kind -- onboarding cards, a photo set, the days of a forecast. It is the wrong tool for sections that differ in kind (that is a tab bar) or for anything with depth (that is a navigation stack), because the dots say "more of the same" and nothing else. Keep the count small enough to read at a glance; past that, the dots stop telling anyone where they are, and a grid or a list serves better.

```swift
// iOS 14+. The system page control: swipe to page, tap or scrub the dots, VoiceOver adjustable.
TabView(selection: $page) {
    ForEach(cards) { card in
        CardView(card).tag(card.id)
    }
}
.tabViewStyle(.page(indexDisplayMode: .always))            // .automatic hides the dots for a single page
.indexViewStyle(.page(backgroundDisplayMode: .interactive)) // a backing that appears while the dots are touched
```

Prefer this over a hand-rolled `ScrollView` with `.scrollTargetBehavior(.paging)` and custom dots: the system control carries the adjustable VoiceOver behavior ("page 2 of 5", swipe up or down to change) that a custom indicator has to rebuild with `accessibilityValue` and `accessibilityAdjustableAction`. Paging follows the finger and needs no Reduce Motion gate; an AUTO-advancing carousel is a different matter -- it is motion the user did not start, so pause it under Reduce Motion and whenever VoiceOver focus is inside it (`references/accessibility/05-motion-accessibility.md`).

## Sheets, popovers, alerts, and confirmation dialogs

Modal presentation -- sheets, `fullScreenCover`, popovers, alerts, `confirmationDialog`, detents, `presentationSizing`, background interaction, and drag-to-dismiss ethics -- is owned by `references/patterns/05-modality-sheets.md`. This file covers only the hierarchical and tab navigation that those modals interrupt.

Three iOS 27 changes land there and matter from this side of the boundary:

- `presentationPlacement(_:)` positions a sheet -- `.automatic`, `.center`, `.leading`, `.trailing` (the last three iOS / iPadOS / Mac Catalyst only). Only sheet presentations respect it. On a wide window it keeps a modal near the pane that opened it, and on a folding display it also decides whether the sheet's toolbar is horizontal or vertical.
- `NavigationTransition.crossFade` fades a presentation in over the presenting content instead of sliding it up -- the right call when there is no source element to zoom from and a slide would imply hierarchy the flow doesn't have. iOS 27.0 on every platform except macOS.
- In apps built with the 27.0 SDKs, the `controlSize`, `buttonSizing`, `buttonRepeatBehavior`, `menuIndicatorVisibility` and `ButtonBorderShape` environment values are **reset to their defaults inside sheets and popovers**. A root-level `.controlSize(.large)` that used to leak into every sheet silently stops doing so on recompile; re-apply those modifiers inside the sheet's own content, which is also correct below iOS 27.

## Inspector (iOS 17+)

Side panel for detail/inspection on iPad/Mac:

```swift
ContentView()
    .inspector(isPresented: $showInspector) {
        InspectorView()
            .inspectorColumnWidth(min: 200, ideal: 300, max: 400)
    }
```

## Menus

### Menu item icons are hidden by default on iPadOS 27

The iPadOS 27 menu bar, and macOS 27 menus and context menus, present a reduced set of menu item images. Apple, verbatim: "By default, SwiftUI now hides all menu item symbol images in most contexts, while non-symbol images remain visible... Use the `labelStyle(_:)` view modifier with the `.titleAndIcon` style to indicate that a menu item `Label`'s icon should always be shown -- such as when the menu item represents an object or a concept rather than an action. SwiftUI continues to automatically provide default visible menu item images for certain common system-wide menu items, such as Settings, Share, and Print."

This is a visible regression on recompile for any iPad app that built a symbol-rich menu bar for iPadOS 26. The rule worth internalizing is Apple's own: **show an icon when the item represents an object or a concept; let the system hide it when the item represents an action.**

```swift
Menu("Insert") {
    Button("Table", systemImage: "tablecells") { insertTable() }
        .labelStyle(.titleAndIcon)     // an object -- keep the icon
    Button("Duplicate", systemImage: "plus.square.on.square") { duplicate() }
                                       // an action -- let the system hide it
}
```

UIKit's equivalent is `UIMenuElement.preferredImageVisibility`, with updated initializers on `UIMenu`, `UIAction`, `UICommand` and `UIKeyCommand`. In the same release, a `LabeledContent` view placed inside a `Menu` maps its value to the platform menu item's subtitle.

Icon discipline within a group is unchanged and still binary -- every item in a group carries an icon, or none does (`references/design/05-sf-symbols.md#icons-in-menus-and-sidebars`).

## Search

```swift
NavigationStack {
    List(filteredItems) { item in
        ItemRow(item: item)
    }
    .searchable(text: $searchText, placement: .automatic, prompt: "Search items")
}
```

### Search tokens

A token turns a filter the user has already committed to into a chip inside the field, instead of leaving it as free text the app re-parses on every keystroke. `searchable(text:tokens:placement:prompt:token:)` is iOS 16.0+ and unchanged in iOS 27:

```swift
@State private var searchText = ""
@State private var tokens: [FruitToken] = []      // FruitToken: Identifiable

List(results) { ItemRow(item: $0) }
    .searchable(text: $searchText, tokens: $tokens) { token in
        switch token {
        case .apple: Text("Apple")
        case .pear:  Text("Pear")
        }
    }
```

The token type must conform to `Identifiable`. Use `searchable(text:editableTokens:placement:prompt:token:)` (**iOS 17.0**, not 16.0; no tvOS or watchOS) when the token's own value is editable in place -- a date range, a numeric threshold -- since that variant hands the builder a `Binding` per token. Reach for a token whenever a filter is a persistent, removable fact about the query; leave it as text when it is just what the user is typing.

### Search scopes

```swift
.searchable(text: $searchText)
.searchScopes($searchScope) {
    Text("All").tag(SearchScope.all)
    Text("Favorites").tag(SearchScope.favorites)
}

// iOS 16.4+: choose when the scope bar appears rather than accepting the default.
.searchScopes($searchScope, activation: .onSearchPresentation) {
    Text("All").tag(SearchScope.all)
    Text("Favorites").tag(SearchScope.favorites)
}
```

`SearchScopeActivation` is `.automatic`, `.onTextEntry` (scopes appear once typing starts and hide on cancellation) or `.onSearchPresentation` (scopes appear as soon as search is presented). Use `.onSearchPresentation` when the scope genuinely changes what a search *means*, so the user picks before typing; `.onTextEntry` keeps the chrome out of the way until there is something to scope.

Keep scope titles short. In apps built with the iOS 27.0 SDK, a `UISearchController` using center search-bar placement puts the scope bar **inline on the same row as the search field** rather than on a separate row beneath it -- and inline beside the field when the search field is hosted inside a navigation bar. That reclaims a full row of vertical chrome, which matters more now that content height is the scarce dimension, but a scope bar that fit a full-width row can truncate inline. Re-check any UIKit search UI with more than three scopes, or with long scope titles, after an Xcode 27 rebuild.

### Search suggestions

```swift
.searchable(text: $searchText)
.searchSuggestions {
    ForEach(suggestions, id: \.self) { suggestion in
        Text(suggestion)
            .searchCompletion(suggestion)
    }
}
```

`searchCompletion(_:)` given a `String` completes the text; given a token value it promotes the suggestion straight into a token, which is how a suggestion list and a token field compose:

```swift
.searchable(text: $searchText, tokens: $tokens) { token in ... }
.searchSuggestions {
    Text("Apple").searchCompletion(FruitToken.apple)
    Text("Pear").searchCompletion(FruitToken.pear)
}
```

## Empty states (iOS 17+)

Use `ContentUnavailableView` for no-content situations:

```swift
List(items) { item in
    ItemRow(item: item)
}
.overlay {
    if items.isEmpty {
        ContentUnavailableView(
            "No Items",
            systemImage: "tray",
            description: Text("Items you create will appear here.")
        )
    }
}

// Search with no results:
.overlay {
    if filteredItems.isEmpty && !searchText.isEmpty {
        ContentUnavailableView.search(text: searchText)
    }
}
```

## Pull to refresh

```swift
List(items) { item in
    ItemRow(item: item)
}
.refreshable {
    await reloadItems()
}
```

## Deep linking

Every external navigation trigger -- a tapped link, a widget, a notification, a Spotlight hit -- ultimately hands the app a `URL` (or, in UIKit, an `NSUserActivity`) that must become a precise `NavigationPath` mutation.

### Entry point: `onOpenURL`

```swift
@main
struct MyApp: App {
    @State private var router = Router()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(router)
                .onOpenURL { url in router.handle(url) }   // universal links AND custom schemes
        }
    }
}
```

SwiftUI passes Universal Links directly as `URL`s through `onOpenURL` -- unlike UIKit, which delivers them as an `NSUserActivity` of type `NSUserActivityTypeBrowsingWeb`. Custom URL schemes arrive through the same handler. Attach `onOpenURL` exactly once, at the scene root; attaching it on multiple nested views fires every copy for the same URL.

Universal Links -- real `https://` URLs backed by an `apple-app-site-association` file served over HTTPS -- are the Apple-recommended mechanism because they fall back to Safari when the app isn't installed. Custom schemes silently no-op in that case, so reserve them for internal flows, never for anything a user might share publicly.

### Outbound links: `canOpenURL` is deprecated

`UIApplication.canOpenURL(_:)` is deprecated at iOS 27. Apple: "Attempt to open the URL and handle any failure instead of validating it first. Using universal links instead of custom URL schemes removes the need for this validation entirely."

That changes a UI contract, not just an API call. The "show this button only if the target app is installed" pattern is gone, so the entry point always appears and the failure path has to be designed -- which is the better error-recovery story anyway (`references/patterns/04-loading-empty-error.md`):

```swift
// Open, then handle the outcome in the UI. No pre-flight check.
UIApplication.shared.open(url, options: [:]) { didOpen in
    if !didOpen { showAppMissingGuidance = true }
}
```

### Routing

```swift
@Observable
final class Router {
    var path = NavigationPath()
    var authChecker: () -> Bool = { false }   // injected; fail-closed default
    private var pendingRoute: Route?

    func handle(_ url: URL) { Self.routes(for: url).forEach(route(to:)) }

    func route(to r: Route) {
        if r.requiresAuth && !authChecker() {
            pendingRoute = r                 // remember intent
            path.append(Route.signIn)
        } else {
            path.append(r)
        }
    }

    func didAuthenticate() {                 // call from the sign-in success handler
        guard let r = pendingRoute else { return }
        pendingRoute = nil
        path = NavigationPath(); path.append(r)   // replay to the intended destination
    }
}
```

Keep URL-to-route parsing in a pure `static routes(for: URL) -> [Route]`, unit-tested for every branch -- never inline in the `onOpenURL` closure. Wire the router's dependencies at `App.init`; anything wired later in `.task` risks `onOpenURL` firing first on cold launch.

### Restoration: `NavigationPath.codable`

`NavigationPath` exposes `var codable: NavigationPath.CodableRepresentation? { get }` for persistence -- `nil` if any type-erased element isn't `Codable`, so guard it:

```swift
func save() {
    guard let rep = path.codable else { return }        // nil-guard is mandatory
    try? JSONEncoder().encode(rep).write(to: dataURL)
}
```

`NavigationPath.CodableRepresentation` is not a plist-native type, so it cannot go directly into `@SceneStorage` -- encode it to `Data` first. If a stack only ever holds one homogeneous `Route: Codable` type, skip `NavigationPath` entirely and persist `[Route]` directly; it's simpler and fully `Codable` for free. Persist on `scenePhase == .background`, never on `.active` -- re-encoding on every foreground tick is pure waste since the in-memory router already owns the live path.

When both restoration and an incoming link apply on the same cold launch, **the link wins**: restore the saved path first in `init`, then let `onOpenURL` overwrite it.

### Deep linking pitfalls

| Mistake | Problem | Fix |
|---|---|---|
| Parsing the URL inline in the `onOpenURL` closure | Untestable, duplicated logic | Pure `static routes(for:)`, unit-tested |
| Multiple `onOpenURL` handlers on nested views | URL handled N times | One handler, at the scene root |
| Custom scheme for a publicly shareable link | No-ops when the app isn't installed | Universal Links for anything shareable |
| Encoding `path.codable` without a nil-check | Runtime crash when an element isn't `Codable` | `guard let rep = path.codable` |
| `authChecker` defaults to `{ true }` | Protected screen flashes, then kicks the user back | Default fail-closed |

## Decision matrix

| What you need | Use |
|---|---|
| Drill-down detail | NavigationStack with NavigationLink |
| Top-level app sections | TabView with Tabs |
| iPad two/three column | NavigationSplitView |
| Create/edit form, confirm/alert, supplementary info | See `references/patterns/05-modality-sheets.md` for the sheet/popover/alert/confirmationDialog decision |
| Inspect/configure side panel | inspector (iPad/Mac) |
| Quick choice from short list | Menu (button menu) |
| Action on row swipe | swipeActions |
| Long-press menu | contextMenu |
| Search/filter content | searchable |
| Persistent, removable filters inside the search field | `searchable(text:tokens:...)` |
| No-content empty state | ContentUnavailableView |
| Reload content | refreshable |
| External link / notification / Spotlight jump | Deep linking (above) |
| Segments that change *which content* is shown | `Picker` + `.pickerStyle(.tabs)` (iOS 27; `.segmented` + `.isTabBar` below) |
| One privileged create/compose destination | `Tab(role: .prominent)` (iOS 27) |
| Secondary actions that should always live in a menu | `ToolbarOverflowMenu` (iOS 27) |
| An action that must never be reachable only via overflow | `.topBarPinnedTrailing` (iOS 27) |
| Two peer content panes that reflow with the display | `ArrangementView` (iOS 27.1, still beta) -- and keep navigation *outside* it; see `references/design/08-adaptive-layout-ipad.md#foldable-and-continuously-resizable-surfaces` |

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `NavigationView` | Deprecated | `NavigationStack` |
| Push to create/edit | Breaks the "deeper into hierarchy" mental model | Sheet for create/edit (see `references/patterns/05-modality-sheets.md`) |
| Custom back button | Breaks swipe-back gesture | Use system back button; on iPadOS, `.toolbarRole(.editor)` restyles it as part of the editor layout instead |
| Modal stacking 3+ deep | Confusing, can't dismiss to root | Re-think flow; use NavigationStack within a single sheet |
| Hidden tab bar on push | Loses context | Don't hide unless going to genuine full-screen experience |
| Missing empty state | Blank screens confuse users | `ContentUnavailableView` always |
| `TabView` selection bound to a tab that can be hidden | Crashes under the iOS 27 SDK, on recompile alone | Clamp the selection to the visible tab set |
| `toolbarMinimizeBehavior` / `ToolbarMinimizeBehavior` | The WWDC26 spelling was renamed before release; the symbol does not exist | `toolbarMinimizationBehavior(_:for:)` / `ToolbarMinimizationBehavior` |
| App-drawn ellipsis `Menu` beside the system overflow | Two overflow affordances; users hunt in both | `ToolbarOverflowMenu`, and give any other menu a distinct symbol |
| `#available(iOS 27, *)` around `@ContentBuilder` usage | It is a typealias for `ViewBuilder` at the SwiftUI 1.0 floor; the requirement is Xcode 27, not a runtime version | No runtime gate |
| Toolbar item with a title and no symbol | The system won't present it on a vertical bar | Give every toolbar item both a title and a symbol |
| Done/Save in plain `.topBarTrailing` in a crowded iOS 27 toolbar | Can be pushed into the overflow menu | `.topBarPinnedTrailing`, plus `visibilityPriority(.high)` on what matters next |

## See also

- `references/design/02-liquid-glass.md` -- glass tab bar and toolbar buttons
- `references/design/06-layout-spacing.md` -- safe area, toolbar layout, minimization safe-area adjustment
- `references/design/08-adaptive-layout-ipad.md` -- continuous resizability, foldable surfaces, `ArrangementView`
- `references/patterns/05-modality-sheets.md` -- sheets, popovers, alerts, confirmationDialog, `presentationPlacement`, drag-to-dismiss
