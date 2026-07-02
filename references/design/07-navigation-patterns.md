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
.toolbarRole(.editor)  // Hides back button title for cleaner detail view
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

## Sheets (modal presentation)

For temporary, contextual interfaces -- create/edit, confirmation, sign-in.

```swift
@State private var showCreateSheet = false

Button("Create") {
    showCreateSheet = true
}
.sheet(isPresented: $showCreateSheet) {
    NavigationStack {
        CreateView()
    }
}
```

### Sheet with item

```swift
@State private var editingItem: Item?

ItemRow(item: item)
    .onTapGesture { editingItem = item }
    .sheet(item: $editingItem) { item in
        EditView(item: item)
    }
```

### Detents (iOS 16+)

Sheets can present at fractional heights:

```swift
.sheet(isPresented: $showSheet) {
    SheetContent()
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
}
```

| Detent | Height |
|---|---|
| `.medium` | ~50% screen |
| `.large` | Near full screen (default) |
| `.fraction(0.3)` | Custom percentage |
| `.height(200)` | Fixed point height |

### Bottom sheet pattern

```swift
.sheet(isPresented: $showFilters) {
    FiltersView()
        .presentationDetents([.height(200), .medium])
        .presentationBackgroundInteraction(.enabled(upThrough: .height(200)))
}
```

## Confirmation dialogs

For destructive or significant actions:

```swift
@State private var showDeleteConfirm = false

Button("Delete", role: .destructive) {
    showDeleteConfirm = true
}
.confirmationDialog("Delete this item?", isPresented: $showDeleteConfirm) {
    Button("Delete", role: .destructive) { delete() }
    Button("Cancel", role: .cancel) { }
} message: {
    Text("This cannot be undone.")
}
```

| Use case | Pattern |
|---|---|
| Confirm destructive action | `.confirmationDialog()` |
| Choose from short list | `.confirmationDialog()` with multiple buttons |
| Display info + acknowledge | `.alert()` |
| Get text input | `.alert()` with `TextField` |

## Alerts

For critical info that requires acknowledgment:

```swift
@State private var showError = false
@State private var errorMessage = ""

.alert("Error", isPresented: $showError) {
    Button("OK") { }
} message: {
    Text(errorMessage)
}
```

### Alert with text input (iOS 16+)

```swift
.alert("Rename", isPresented: $showRename) {
    TextField("Name", text: $newName)
    Button("Save") { rename() }
    Button("Cancel", role: .cancel) { }
}
```

## Popovers

For supplementary info or controls (iPad-friendly, falls back to sheet on iPhone compact width):

```swift
.popover(isPresented: $showInfo) {
    InfoView()
        .frame(width: 300, height: 200)
        .presentationCompactAdaptation(.popover)  // Force popover even on iPhone
}
```

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

## Decision matrix

| What you need | Use |
|---|---|
| Drill-down detail | NavigationStack with NavigationLink |
| Top-level app sections | TabView with Tabs |
| iPad two/three column | NavigationSplitView |
| Create/edit form | Sheet with NavigationStack inside |
| Confirm destructive action | confirmationDialog |
| Alert user to error | alert |
| Show supplementary info | popover (iPad) or sheet (iPhone) |
| Inspect/configure side panel | inspector (iPad/Mac) |
| Quick choice from short list | Menu (button menu) |
| Action on row swipe | swipeActions |
| Long-press menu | contextMenu |
| Search/filter content | searchable |
| No-content empty state | ContentUnavailableView |
| Reload content | refreshable |

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `NavigationView` | Deprecated | `NavigationStack` |
| Push to create/edit | Breaks the "deeper into hierarchy" mental model | Sheet for create/edit |
| Custom back button | Breaks swipe-back gesture | Use system back button; customize via `.toolbarRole(.editor)` if title is too long |
| Modal stacking 3+ deep | Confusing, can't dismiss to root | Re-think flow; use NavigationStack within a single sheet |
| Hidden tab bar on push | Loses context | Don't hide unless going to genuine full-screen experience |
| `.fullScreenCover` for non-immersive | Heavy-handed | Use `.sheet` with `.large` detent |
| Custom alert | Inconsistent with system | `.alert()` or `.confirmationDialog()` |
| `presentationDetents` with single option | No reason to use detents | Just present at default size |
| Missing empty state | Blank screens confuse users | `ContentUnavailableView` always |

## See also

- `02-liquid-glass.md` -- glass tab bar and toolbar buttons
- `06-layout-spacing.md` -- safe area, toolbar layout
- `~/Claude/vault/iOS Development/06 - SwiftUI Fundamentals.md#navigation`
- `~/Claude/vault/iOS Development/75 - SwiftUI on iPad and Adaptive Layout.md`
