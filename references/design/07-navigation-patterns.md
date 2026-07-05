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

## Sheets, popovers, alerts, and confirmation dialogs

Modal presentation -- sheets, `fullScreenCover`, popovers, alerts, `confirmationDialog`, detents, `presentationSizing`, background interaction, and drag-to-dismiss ethics -- is owned by `references/patterns/05-modality-sheets.md`. This file covers only the hierarchical and tab navigation that those modals interrupt.

## Inspector (iOS 17+)

Side panel for detail/inspection on iPad/Mac:

```swift
ContentView()
    .inspector(isPresented: $showInspector) {
        InspectorView()
            .inspectorColumnWidth(min: 200, ideal: 300, max: 400)
    }
```

## Search

```swift
NavigationStack {
    List(filteredItems) { item in
        ItemRow(item: item)
    }
    .searchable(text: $searchText, placement: .automatic, prompt: "Search items")
}
```

### Search scopes

```swift
.searchable(text: $searchText)
.searchScopes($searchScope) {
    Text("All").tag(SearchScope.all)
    Text("Favorites").tag(SearchScope.favorites)
}
```

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

### Routing

```swift
@Observable
final class Router {
    var path = NavigationPath()
    private var pendingRoute: Route?

    func handle(_ url: URL) { Self.routes(for: url).forEach(route(to:)) }

    func route(to r: Route) {
        if r.requiresAuth && !isAuthed() {
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
| No-content empty state | ContentUnavailableView |
| Reload content | refreshable |
| External link / notification / Spotlight jump | Deep linking (above) |

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `NavigationView` | Deprecated | `NavigationStack` |
| Push to create/edit | Breaks the "deeper into hierarchy" mental model | Sheet for create/edit (see `references/patterns/05-modality-sheets.md`) |
| Custom back button | Breaks swipe-back gesture | Use system back button; on iPadOS, `.toolbarRole(.editor)` restyles it as part of the editor layout instead |
| Modal stacking 3+ deep | Confusing, can't dismiss to root | Re-think flow; use NavigationStack within a single sheet |
| Hidden tab bar on push | Loses context | Don't hide unless going to genuine full-screen experience |
| Missing empty state | Blank screens confuse users | `ContentUnavailableView` always |

## See also

- `references/design/02-liquid-glass.md` -- glass tab bar and toolbar buttons
- `references/design/06-layout-spacing.md` -- safe area, toolbar layout
- `references/patterns/05-modality-sheets.md` -- sheets, popovers, alerts, confirmationDialog, drag-to-dismiss
