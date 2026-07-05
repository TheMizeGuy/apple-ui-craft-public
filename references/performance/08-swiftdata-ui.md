# SwiftData UI Binding and Performance

> Owner: `references/performance/08-swiftdata-ui.md` owns the `@Query` -> SwiftUI binding contract (initializer families, the `animation:` lever, dynamic search/sort/filter, undo/redo, optimistic edits, migration and preview seeding) AND the performance hazards specific to that binding (main-actor fetch cost, predicate pushdown, N+1 relationship faulting, pagination, animated-diff cost at scale). `@Model`/`ModelContainer`/`ModelContext`/`#Predicate`/`@ModelActor` PERSISTENCE internals live in the vault SwiftData note -- this file is the UI-facing layer only.
> Floors: see `references/_scaffolding/version-floor-registry.md`. Baseline iOS 17.0+ for everything except sectioned queries. `#Index` iOS 18+. `@Query(sort:sectionBy:)` / `ResultsSectionCollection` is **iOS 27.0+ Beta, not iOS 26** -- gate `#available(iOS 27, *)` + `// SDK-verify`, and never emit it as a primary shipping example.

`@Query` makes a SwiftUI view a live projection of the store: mutate a `@Model`, the bound view re-renders itself, no manual reload, no Combine plumbing. The craft question is getting the MOTION right (declare it once, at the query); the performance question is that `@Query` is `@MainActor @preconcurrency` and runs its fetch SYNCHRONOUSLY on the main actor -- an unbounded query over a large table is a launch/navigation hang hiding behind a one-line property wrapper.

## @Query: the binding primitive

```swift
// 1. KeyPath sort + animation
@Query(sort: \Trip.startDate, order: .reverse, animation: .default) private var trips: [Trip]

// 2. Predicate + KeyPath sort
@Query(filter: #Predicate<Trip> { !$0.isArchived }, sort: \Trip.startDate,
       order: .reverse, animation: .snappy) private var activeTrips: [Trip]

// 3. Multi-key sort via [SortDescriptor]
@Query(filter: #Predicate<Trip> { $0.destination.contains("France") },
       sort: [SortDescriptor(\Trip.startDate), SortDescriptor(\Trip.name)],
       animation: .default) private var frenchTrips: [Trip]

// 4. FetchDescriptor -- full control (fetchLimit, fetchOffset, prefetching)
@Query(FetchDescriptor<Trip>(predicate: #Predicate { $0.rating >= 4 }), animation: .default)
private var topTrips: [Trip]
```

`#Predicate` is the type-checked replacement for `NSPredicate` strings; `SortDescriptor(\.key, order:)` composes, first descriptor primary. The view re-renders whenever a tracked model in `container.mainContext` is inserted, deleted, or has a fetched property mutated -- fine-grained, so mutating `trip.name` re-renders only rows reading `trip.name`, not siblings. `@Query` requires a `ModelContext` in the environment (set by an ancestor `.modelContainer(...)`) or it crashes at runtime with "Failed to find a currently active container."

## Keeping @Query off the main-thread hang path

An unbounded `@Query private var rows: [Row]` with no predicate/limit materializes EVERY matching row on the main actor during init/first body and again on every merge. On a 10k-row table that is a multi-hundred-ms synchronous fetch on the thread that must also produce a frame -- a launch/navigation hang, not a jank. Fix hierarchy, cheapest first:

1. **Push the filter into SQLite** with `#Predicate` over stored properties -- never fetch-all-then-filter in Swift:
   ```swift
   // BAD -- every row crosses onto the main actor before Swift filters it, O(n) per body
   @Query(sort: \.startDate) private var all: [Trip]
   var visible: [Trip] { all.filter { $0.isActive && $0.name.contains(query) } }

   // GOOD -- only matching rows materialize
   _trips = Query(filter: #Predicate<Trip> { !$0.isArchived && $0.name.localizedStandardContains(q) },
                  sort: \.startDate, order: .reverse)
   ```
   A predicate referencing a computed/`@Transient` property, or an unsupported operation, cannot be pushed down -- SwiftData **throws `SwiftDataError.unsupportedPredicate` at fetch time**; there is no silent in-memory-scan fallback. Keep predicates on stored attributes; derive computed filters in an `@Observable` store over already-bounded, fetched data.
2. **Cap the result set** with `FetchDescriptor.fetchLimit` -- the single highest-leverage fix for a UI-bound query. The `sort:`/`filter:` `@Query` inits cannot express `fetchLimit`; use the descriptor init:
   ```swift
   // iOS 17.0+. @MainActor @preconcurrency init(_ descriptor: FetchDescriptor<Element>, animation: Animation)
   struct RecentTripsList: View {
       @Query(Self.recentDescriptor, animation: .default) private var trips: [Trip]
       private static var recentDescriptor: FetchDescriptor<Trip> {
           var d = FetchDescriptor<Trip>(predicate: #Predicate { !$0.isArchived },
                                         sortBy: [SortDescriptor(\.startDate, order: .reverse)])
           d.fetchLimit = 100
           d.relationshipKeyPathsForPrefetching = [\.destination]   // avoid N+1, see below
           return d
       }
       var body: some View { List(trips) { TripRow(trip: $0) } }
   }
   ```
3. **Sort in the store on an indexed key**, not in `body`. `@Attribute(.unique)` implies an index; `#Index<Article>([\.categoryID, \.publishDate])` (iOS 18+) adds an explicit compound one. A `fetchLimit`ed query over an UNINDEXED sort key still scans the whole table to find the top N.
4. **For genuinely heavy work**, fetch off the main actor on a `@ModelActor` and hand the view plain `Sendable` snapshots -- never a live `@Query` over unbounded data.

**N+1 relationship faulting** is the scroll-time killer hazard #2 catches: SwiftData relationships are FAULTS -- unloaded until first access. If each visible row reads `trip.destination.name`, every row fires a separate synchronous store round-trip on the main actor as it scrolls into view, even though the parent fetch was bounded. Prefetch what the row touches: `d.relationshipKeyPathsForPrefetching = [\.destination, \.stops]`. For a heavy column the row never displays, exclude it: `d.propertiesToFetch = [\.title, \.startDate]` -- touching an excluded property later still faults (a round-trip), so only exclude attributes the cell truly never reads. Diagnose N+1 with Time Profiler watching for repeated fetch stacks on the main thread DURING scroll, not just at load.

For a count, never `fetch(...).count` -- `context.fetchCount(descriptor)` is a `SELECT COUNT`, zero objects loaded.

## Sectioned lists -- iOS 27.0+ Beta only, not iOS 26

```swift
if #available(iOS 27, *) {
    // SDK-verify: ResultsSectionCollection name unconfirmed against a live iOS 27 SDK.
    // macro Query(_:transaction:sectionBy:); var Query.sections: ResultsSectionCollection<Element, String>
    // (accessed via the underscored storage, e.g. _trips.sections); nil key -> empty-string section.
} else {
    // iOS 26 and earlier -- manual grouping, computed in the STORE, never in body.
}
```

`@Query(sort:sectionBy:)` and the paired `ResultsObserver(...sectionBy:...)` require iOS/iPadOS/macOS/tvOS/watchOS/visionOS **27.0+**. Targeting a lower deployment floor and it won't compile -- gate it. Never conflate this with Core Data's `SectionedFetchRequest`, which is a SEPARATE API on iOS 15+; an 11-major-version gap sits between the two, and stating SwiftData sectioning as "iOS 26 new" or as equivalent to `SectionedFetchRequest` is a shipped error, not a style choice.

The iOS-26-safe fallback groups an already-fetched, bounded result in an `@Observable` store -- grouping in `body` is O(n log n) PER FRAME:

```swift
@MainActor @Observable final class GroupedTrips {
    private(set) var sections: [(key: String, rows: [Trip])] = []
    func rebuild(from trips: [Trip]) {
        sections = Dictionary(grouping: trips, by: \.continent).map { ($0.key, $0.value) }.sorted { $0.key < $1.key }
    }
}
// List { ForEach(grouped.sections, id: \.key) { s in Section(s.key) { ForEach(s.rows) { TripRow(trip: $0) } } } }
```

## Dynamic query: runtime search, sort, filter

`@Query`'s parameters are baked at property-wrapper initialization -- you cannot mutate `sort`/`filter` on a live `@Query` from a `@State` change. Recreate the query in `init`, driven by parameters the parent passes down; assign the UNDERSCORED storage directly:

```swift
struct TripListView: View {
    @Query private var trips: [Trip]
    init(searchText: String, sortOrder: SortOrder) {
        _trips = Query(filter: #Predicate<Trip> { searchText.isEmpty || $0.destination.localizedStandardContains(searchText) },
                       sort: \Trip.startDate, order: sortOrder, animation: .default)
    }
    var body: some View { List(trips) { TripRow(trip: $0) } }
}
// Parent: TripListView(searchText: searchText, sortOrder: sortOrder).searchable(text: $searchText)
```

Debounce the SEARCH BINDING, not the query -- re-running `init` on every keystroke rebuilds the fetch. Use `localizedStandardContains` (case- and diacritic-insensitive, matches Spotlight/Finder) for user-facing search, not `contains`. The child view must not also hold its own `@State` for the search text; the parent owns it, or the two fight.

## Pagination and bulk writes off-main

For tables too large to fetch whole, `FetchDescriptor.fetchLimit`+`fetchOffset` back an imperative pager -- fetch pages off-main, append snapshots to an `@Observable` store, load the next page from a bottom sentinel:

```swift
@MainActor @Observable final class TripPager {
    private(set) var rows: [Trip] = []
    private var offset = 0, isLoading = false, reachedEnd = false
    let context: ModelContext
    func loadNextPage() {
        guard !isLoading, !reachedEnd else { return }
        isLoading = true
        var d = FetchDescriptor<Trip>(sortBy: [SortDescriptor(\.startDate, order: .reverse)])
        d.fetchLimit = 50; d.fetchOffset = offset
        let page = (try? context.fetch(d)) ?? []
        rows.append(contentsOf: page); offset += page.count; reachedEnd = page.count < 50
        isLoading = false
    }
}
// ForEach(pager.rows) { t in TripRow(trip: t).onAppear { if t.id == pager.rows.last?.id { pager.loadNextPage() } } }
```

Bumping a `@Query` descriptor's `fetchLimit` re-fetches rows `0..<newLimit` every time (O(total), re-materializing prior rows) -- fine for a few hundred rows, wrong for thousands; the imperative append-pager fetches each page once.

Heavy imports run on a `@ModelActor` bound to the SAME `ModelContainer` -- the single `save()` merges into `mainContext` and re-fires the visible `@Query` automatically, rows animating in with the main thread free:

```swift
@ModelActor
actor Importer {
    func importTrips(_ dtos: [TripDTO]) throws {
        modelContext.autosaveEnabled = false                              // one save, not one per runloop tick
        let undo = modelContext.undoManager; modelContext.undoManager = nil  // skip per-insert registration
        defer { modelContext.undoManager = undo; modelContext.autosaveEnabled = true }
        for dto in dtos { modelContext.insert(Trip(dto)) }
        try modelContext.save()
    }
}
```

**Cross-actor rule (the #1 SwiftData concurrency crash):** never pass a `@Model` instance between actors. Pass `PersistentIdentifier`, re-fetch with `modelContext.model(for:)` in the target context. Batch delete without materializing: `try context.delete(model: Trip.self, where: #Predicate { $0.endDate < cutoff })` -- the `@Query` refreshes once. For a bounded aggregation over a large table, stream in pages instead of loading it whole:

```swift
// Trailing block: parameter, default batchSize 5000. Peak memory bounded to one page.
try context.enumerate(FetchDescriptor<Trip>(sortBy: [SortDescriptor(\.startDate)]), batchSize: 100) { trip in
    // process one trip at a time
}
```

## Animating mutations

Declare `animation:` at the query and mutate plainly -- do NOT also wrap the mutation in `withAnimation`, or you get a double-driven, visibly stuttering animation:

```swift
@Query(sort: \Trip.startDate, order: .reverse, animation: .snappy) private var trips: [Trip]
// Button("Add") { context.insert(Trip(name: "New", startDate: .now)) }   // NO withAnimation here
```

Reach for `withAnimation` only for something the QUERY does not drive -- a sibling view, a badge, a layout change on the same event. Reorder needs an explicit persisted `sortIndex: Int` (`@Query(sort: \.sortIndex)`) -- SwiftData rows have no intrinsic order, so an `.onMove` that only reorders an in-memory array snaps back on the next query refresh. Key `ForEach` by the model, never array index, so SwiftUI diffs by `PersistentIdentifier` and animates moves correctly.

**At scale, the diff itself costs.** `animation:` makes SwiftUI diff old-vs-new by identity (O(n)) and animate every insert/move/remove simultaneously on every store merge. Fine for a small/paged/user-scoped list; wrong for a multi-thousand-row table (logs, a data browser) where a single change would animate a huge diff and overrun the frame. Omit `animation:` entirely for those -- changes apply instantly, no diff-animation cost.

Reduce Motion doubles as the perf escape hatch: collapsing the animated diff to instant both honors the setting and removes its O(n) cost. Because `animation:` is fixed at `init`, recreate the query in a child view keyed on the flag, or use `Query(_:transaction:)` with a `nil`-animation `Transaction`:

```swift
struct TripListHost: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View { TripList(animated: !reduceMotion) }
}
struct TripList: View {
    @Query private var trips: [Trip]
    init(animated: Bool) {
        var d = FetchDescriptor<Trip>(sortBy: [SortDescriptor(\.startDate, order: .reverse)]); d.fetchLimit = 200
        _trips = animated ? Query(d, animation: .default) : Query(d, transaction: Transaction())
    }
    var body: some View { List(trips) { TripRow(trip: $0) } }
}
```

## Optimistic edits and the cancelable sheet

A `@Model` is `Observable` -- mutating a property updates every `@Query`-bound view on the next runloop tick, and autosave persists it shortly after. For an inline edit that should apply immediately (no notion of cancel), bind live with `@Bindable`:

```swift
struct TripDetail: View {
    @Bindable var trip: Trip   // @Model is Observable -> @Bindable gives $-bindings
    var body: some View { Form { TextField("Name", text: $trip.name) } }
}
```

For a modal "Edit"/"New" sheet where Cancel must DISCARD, do not edit the live object and call `rollback()` -- that discards ALL pending changes in the context, including unrelated edits. Edit in an isolated child context with autosave off:

```swift
struct EditTripSheet: View {
    @State private var editContext: ModelContext
    @State private var draft: Trip
    init(container: ModelContainer, editing id: PersistentIdentifier?) {
        let ctx = ModelContext(container); ctx.autosaveEnabled = false
        _editContext = State(initialValue: ctx)
        _draft = State(initialValue: (id.flatMap { ctx.model(for: $0) as? Trip }) ?? {
            let t = Trip(name: "", startDate: .now); ctx.insert(t); return t
        }())
    }
    // Cancel: dismiss() -- child context discarded, main store untouched.
    // Save: try? editContext.save(); dismiss() -- merges into mainContext, parent @Query animates it in.
}
```

`modelContext.rollback()` discards pending inserts/updates/deletes and restores changed models to last-saved state -- correct for a coarse "Discard all changes on this screen" on a context you own, gated by `context.hasChanges`, not for isolated per-field cancel. For a fast destructive action, delete immediately and let undo bring it back rather than blocking on a confirm alert: `context.delete(trip); undoManager?.setActionName("Delete Trip")`.

## Undo/redo

```swift
.modelContainer(for: Trip.self, isUndoEnabled: true)   // shake-to-undo on iOS, Cmd-Z on Mac/keyboard-iPad, for free
```

Drive it from a toolbar with `@Environment(\.undoManager)`, `canUndo`/`canRedo` gating the disabled state. Group a multi-field edit into one undo step with `undoManager?.beginUndoGrouping()` / mutate / `context.processPendingChanges()` / `endUndoGrouping()`. Because the mutation is query-bound, the undone change animates via the same `@Query(animation:)` already set -- no extra work. Mute registration before a bulk import (`context.undoManager = nil`, restore in `defer`) -- Apple's own docs recommend temporarily nil-ing it for expensive operations.

## Migration and preview seeding

A schema change with no plan crashes on launch with a store mismatch after an App Store update. Provide a `SchemaMigrationPlan`; lightweight stages (added/removed optional properties, renames) run near-instantly with no UI needed, a `.custom` stage that rewrites rows can take seconds -- gate the main UI behind a launch state and show determinate progress rather than a frozen splash. Test against a copy of a real pre-update store, not an empty simulator DB, which hides data-transform bugs.

Never point a preview at the real store -- seed an in-memory `ModelContainer`:

```swift
struct SampleTripsModifier: PreviewModifier {
    static func makeSharedContext() async throws -> ModelContainer {   // iOS 18+, cached across previews
        let c = try ModelContainer(for: Trip.self, configurations: .init(isStoredInMemoryOnly: true))
        for i in 0..<5 { c.mainContext.insert(Trip(name: "Trip \(i)", startDate: .now)) }
        return c
    }
    func body(content: Content, context: ModelContainer) -> some View { content.modelContainer(context) }
}
```

## Craft and perf checklist

- Every table-backed `@Query` carries a `fetchLimit` or a selective pushed-down `#Predicate`; sort/filter keys are indexed; relationships the row reads ride `relationshipKeyPathsForPrefetching`.
- Large tables paginate with `fetchLimit`+`fetchOffset` and a bottom sentinel; counts use `fetchCount`, never `fetch().count`.
- Heavy writes/imports run on a `@ModelActor`, autosave and undo muted, one `save()`.
- `animation:` on bounded/paged queries only; omitted on large "table" data; `ForEach` ids are the model's stable identity; Reduce Motion collapses the diff to instant.
- `sectionBy` gated behind `#available(iOS 27, *)`, with the `Dictionary(grouping:)` fallback above covering earlier deployment targets.
- A `SchemaMigrationPlan` exists before any model change ships; previews use an in-memory seeded container; cancelable edits use a child context, never `rollback()` on the shared one.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `@Query private var rows: [Row]` with no predicate/limit over a large table | Synchronous main-actor fetch = launch/navigation hang | `fetchLimit` + pushed-down `#Predicate` |
| `@Query(sort:sectionBy:)` at an iOS 26 deployment target | iOS 27.0+ API; won't compile | `#available(iOS 27, *)` + `Dictionary(grouping:)` fallback |
| Conflating `@Query(sectionBy:)` with Core Data `SectionedFetchRequest` | 11-major-version-different, separate APIs | State each floor explicitly; never equate them |
| Row reads `trip.destination.name` with no prefetch | N+1 fault per row on scroll | `relationshipKeyPathsForPrefetching` |
| `animation:` on the query AND `withAnimation` around the insert | Double-driven, stuttering animation | Declare animation once, at the query |
| `animation:` on a multi-thousand-row table | O(n) animated diff per merge overruns the frame | Omit `animation:` on large tables |
| `context.rollback()` for a single field's cancel | Discards ALL pending changes in that context | Isolated child `ModelContext`, discard by dropping it |
| Passing a `@Model` instance between actors | The #1 SwiftData concurrency crash | Pass `PersistentIdentifier`, re-fetch in the target context |
| Assuming an unsupported `#Predicate` silently scans in memory | It throws `SwiftDataError.unsupportedPredicate` | Keep predicates on stored attributes; derive computed filters in-store |

## See also

- `references/performance/01-swiftui-rendering.md` -- `List`/`ForEach` diffing cost underneath any `@Query`-bound list
- `references/performance/02-scroll-list-performance.md` -- scroll-time hitch budget the N+1/prefetch fixes protect
- `references/performance/06-concurrency-ui.md` -- `@ModelActor` off-main work as a specific case of the general concurrency rules
- `references/accessibility/03-visual-accessibility.md#reduce-motion` -- the Reduce Motion transaction pattern used above
