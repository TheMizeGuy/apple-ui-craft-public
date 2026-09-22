# SwiftUI Rendering Performance

The most common iOS performance problem is SwiftUI views re-evaluating their body unnecessarily. Every body re-evaluation runs the diff algorithm against the previous tree. With many or expensive views, this drops frames.

## Body re-evaluation

SwiftUI re-evaluates a view's `body` whenever its observed state changes. The framework then diffs the returned tree against the previous tree to determine what to update.

### View decomposition

Decompose large views into focused subviews. Each subview only re-evaluates when ITS inputs change.

```swift
// BAD: entire body re-evaluated when ANY trip changes
struct TripListView: View {
    @State private var trips: [Trip] = []
    @State private var searchText = ""
    @State private var sortOrder: SortOrder = .name

    var body: some View {
        VStack {
            SearchBar(text: $searchText)        // Re-evaluated on every trip change
            SortPicker(order: $sortOrder)       // Re-evaluated on every trip change
            ForEach(filteredTrips) { trip in
                TripRow(trip: trip)              // All rows re-evaluated
            }
        }
    }
}

// GOOD: decomposed; each subview observes only what it needs
struct TripListView: View {
    @State private var trips: [Trip] = []
    @State private var searchText = ""
    @State private var sortOrder: SortOrder = .name

    var body: some View {
        VStack {
            SearchBarView(text: $searchText)
            SortPickerView(order: $sortOrder)
            TripListContent(trips: filteredTrips)
        }
    }
}

struct TripListContent: View {
    let trips: [Trip]  // Value type, compared by Equatable

    var body: some View {
        ForEach(trips) { trip in
            TripRow(trip: trip)
        }
    }
}
```

## @Observable vs @ObservedObject

`@Observable` (iOS 17+) provides per-property tracking. SwiftUI tracks WHICH specific properties a view reads. Only views reading a changed property re-evaluate.

```swift
// MODERN (iOS 17+)
@Observable
class TripStore {
    var trips: [Trip] = []
    var selectedTrip: Trip?
    var isLoading = false
}

struct TripListView: View {
    @Environment(TripStore.self) var store
    
    var body: some View {
        // Only re-evaluates when store.trips changes
        // (NOT when store.isLoading or selectedTrip changes)
        ForEach(store.trips) { trip in
            TripRow(trip: trip)
        }
    }
}
```

vs.

```swift
// OLDER (pre-iOS 17): @Published triggers ALL views re-evaluating
class TripStore: ObservableObject {
    @Published var trips: [Trip] = []
    @Published var isLoading = false
}

struct TripListView: View {
    @ObservedObject var store: TripStore  // Re-evaluates when ANY @Published changes
    // ...
}
```

**Migration:** For iOS 17+ projects, use `@Observable`.

A view OWNS its `@Observable` model with `@State`, not `@StateObject`:

```swift
struct TripListView: View {
    @State private var store = TripStore()   // Xcode 27: TripStore() runs ONCE for this view's lifetime
    var body: some View { ForEach(store.trips) { TripRow(trip: $0) } }
}
```

Build with Xcode 27 and `@State` resolves to a Swift macro instead of the `State` property wrapper: Apple documents that "a `State()` property instantiates its default value the first time SwiftUI instantiates the view." Under the old wrapper, that initializer re-ran every time the view struct was re-instantiated, which is why "never construct an expensive object in a `@State` default" was standard advice and why reviewers flagged `@State private var vm = ViewModel()` as an allocation bug. On an Xcode 27 build that finding is dead -- the line above is the recommended shape, and nothing needs an `#available` gate because this is a toolchain behavior (Apple states it back-deploys to iOS 17 aligned OSes). It is still a real bug when the project builds with Xcode 26 or earlier. `references/performance/04-state-architecture.md#state-is-a-macro-when-you-build-with-xcode-27` owns the migration's four source breaks.

For bridging an `@Observable` model into a non-SwiftUI surface (UIKit, a Metal renderer, a `CADisplayLink` loop), iOS 27's `withContinuousObservation` replaces the `withObservationTracking` re-arm loop -- see `references/performance/04-state-architecture.md#bridging-observable-into-a-non-swiftui-surface`.

## Equatable views

Adding `Equatable` conformance to a view skips body evaluation when inputs haven't changed:

```swift
struct TripRow: View, Equatable {
    let trip: Trip

    static func == (lhs: TripRow, rhs: TripRow) -> Bool {
        lhs.trip.id == rhs.trip.id &&
        lhs.trip.name == rhs.trip.name &&
        lhs.trip.price == rhs.trip.price
    }

    var body: some View {
        HStack {
            Text(trip.name)
            Spacer()
            Text(trip.formattedPrice)
        }
    }
}
```

Then in parent:

```swift
ForEach(trips) { trip in
    TripRow(trip: trip).equatable()  // Skip body if equal
}
```

Use this when:
- Views have expensive body computation
- Views appear in long lists
- Views receive frequently-changing parent state but their own inputs change rarely

**iOS 27 changed what `==` is allowed to consider.** Apple fixed a defect where retroactive conformances of SwiftUI types to `Equatable` were not consulted when SwiftUI compared their values. If a hand-written `==` compares a `Color`, `Font`, `Animation` or other SwiftUI type through an `extension` conformance the app declared itself, that comparison was silently unreliable before iOS 27 and is honored from 27 -- so the body may now be skipped more often, or less. Re-measure any `.equatable()` win on a 27 build instead of assuming it carried over. The safe construction is unchanged and works on every version: compare only your own value types, and make sure every property `body` reads appears in `==`.

## Stable identifiers in ForEach

`ForEach` uses identifiers to track which views correspond to which data. Unstable identifiers cause views to be destroyed and recreated.

```swift
// BAD: id: \.self derives identity from the ENTIRE value -- requires Hashable to
// compile, and any property change (not just a real identity change) makes ForEach
// see a "new" element and recreate its view instead of updating it in place
// (dropped @State, no smooth transition on the row that actually just changed).
ForEach(items, id: \.self) { item in
    ItemRow(item: item)
}

// BAD: array index as id
ForEach(Array(items.enumerated()), id: \.offset) { index, item in
    ItemRow(item: item)
}
// If list reorders, all views recreated

// GOOD: stable Identifiable
ForEach(items) { item in
    ItemRow(item: item)
}
// item.id is stable; views preserved across reorders

// GOOD: explicit stable id
ForEach(items, id: \.uniqueID) { item in
    ItemRow(item: item)
}
```

## Lazy stacks and lists

| Container | Lazy? | Use |
|---|---|---|
| `VStack` / `HStack` | NO | < 50 items, all visible |
| `LazyVStack` / `LazyHStack` | YES | > 50 items in ScrollView |
| `List` | YES (built-in) | Standard list UI |
| `LazyVGrid` / `LazyHGrid` | YES | Grid layouts |

```swift
// BAD: VStack creates ALL children immediately
ScrollView {
    VStack {
        ForEach(trips) { trip in    // 10,000 trips all created at once
            TripRow(trip: trip)
        }
    }
}

// GOOD: LazyVStack creates views only when visible
ScrollView {
    LazyVStack {
        ForEach(trips) { trip in    // Only visible rows created
            TripRow(trip: trip)
        }
    }
}

// ALSO GOOD: List is already lazy
List(trips) { trip in
    TripRow(trip: trip)
}
```

## Expensive computations

Don't filter, sort, format, or otherwise compute in body:

```swift
// BAD: filter runs on every body re-evaluation
var body: some View {
    let filtered = trips.filter { $0.price < 500 }.sorted { $0.name < $1.name }
    List(filtered) { trip in TripRow(trip: trip) }
}

// GOOD: precompute
@State private var filteredTrips: [Trip] = []

var body: some View {
    List(filteredTrips) { trip in TripRow(trip: trip) }
        // initial: true -- without it a view whose trips are already loaded shows an empty list
        .onChange(of: trips, initial: true) { _, newTrips in
            filteredTrips = newTrips.filter { $0.price < 500 }.sorted { $0.name < $1.name }
        }
}
```

For derived values, use a computed property only if it's cheap. For expensive derivation, cache.

## SwiftUI profiling

Use Instruments with the SwiftUI template. Key metrics:

| Metric | What to look for |
|---|---|
| Body evaluations | Views that re-evaluate frequently |
| Identity changes | ForEach elements losing identity (regenerating views) |
| Time in body | Views with expensive body computation |
| Layout-cache misses (Instruments 27) | The stated REASON a layout computation wasn't cached |

Instruments 27 adds a **Summary of Updates** focus action on the SwiftUI instrument's View Hierarchy detail, and records why a layout pass was not cached. That turns "this `GeometryReader` is probably forcing repeated layout" from an argument about source into a reading off the trace. `references/performance/03-launch-memory-instruments.md#hangs-hitches-and-the-swiftui-instrument` owns the full workflow.

### Self._printChanges

In a view's body, this reveals why it re-evaluated:

```swift
var body: some View {
    let _ = Self._printChanges()  // Debug only
    // ...
}
// Output: "TripRow: @self, @identity, _trip changed."
```

Remove before shipping (or wrap in `#if DEBUG`).

## Animation cost: layout vs render

This table is the OWNER; `references/animation/01-animation-fundamentals.md#animation-cost-layout-vs-render` carries the same rows as the animation-side summary and must match it.

| Cheap (render-only) | Expensive (layout-triggering or per-frame off-screen render) |
|---|---|
| `.opacity` | `.frame(width:height:)` |
| `.scaleEffect` | `.padding` |
| `.rotationEffect` | Content changes (`Text`, `Image`) |
| `.offset` (transform) | `.font` size changes |
| `.brightness` | `HStack`/`VStack` spacing |
| `.saturation` | Adding/removing views |
| | `.fixedSize` changes |
| | `.blur(radius:)` animated -- off-screen render pass every frame |
| | `.shadow(radius:/offset:)` animated -- same off-screen-pass cost; a static shadow is free |

Animate transforms (scale, opacity, rotation, offset) for smooth 60-120fps animation. Animating layout properties triggers a full layout pass per frame -- expensive.

`.shadow` and `.blur` are cheap only while their parameters are static. Animating either one's `radius` (or a shadow's `offset`) forces an off-screen render pass EVERY frame -- one of the top sources of scroll hitches (see `references/performance/02-scroll-list-performance.md#off-screen-rendering`). Animate `.opacity` of a pre-rendered shadow/blur layer instead of animating the radius directly; keep the static shadow/blur as-is.

## drawingGroup

Flattens a view subtree into a single Metal-rendered layer. Reduces compositing overhead.

```swift
VStack {
    ForEach(0..<100) { i in
        Circle()
            .fill(.blue.opacity(Double(i) / 100))
            .frame(width: 10 + CGFloat(i), height: 10 + CGFloat(i))
    }
}
.drawingGroup()  // Renders entire VStack as one GPU texture
```

Use when:
- Many overlapping graphical views animating simultaneously
- Complex transparency/blend mode stacks
- Particle effects with many elements

DON'T use when:
- Views contain text (text rendering quality may degrade)
- Views need individual hit testing
- Only a few views are animating

## Image handling in views

Loading full-resolution images blows memory:

```swift
// BAD: 12MP photo decoded at source resolution -- ~48 MB sRGB, ~97 MB Display P3
Image("large-photo")
    .resizable()
    .frame(width: 200, height: 200)
// Memory unchanged even though displayed at 200x200: .frame scales the decoded bitmap

// STILL BAD for memory: AsyncImage also decodes at source resolution. It fixes the
// synchronous load on the main thread, not the decode size.
AsyncImage(url: url) { image in
    image.resizable().scaledToFill()
} placeholder: {
    Color.gray
}
.frame(width: 200, height: 200)

// GOOD: a thumbnail pre-decoded at display size (byPreparingThumbnail(ofSize:) or ImageIO)
ThumbnailImage(url: url, targetSize: CGSize(width: 200, height: 200))
```

Decode cost and the downsampling recipe are owned by `references/performance/03-launch-memory-instruments.md` and `references/performance/02-scroll-list-performance.md#downsampling`.

For images shown in lists, decode at target size on a background thread before display.

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Mega-views (entire screen in one view) | All re-evaluates on any change | Decompose into subviews |
| `@Published` instead of `@Observable` | Whole-object invalidation | Migrate to `@Observable` (iOS 17+) |
| Computation in body | Runs on every re-evaluation | Move to `.onChange` or cache |
| `ForEach` with unstable IDs | Views recreated, state lost | Stable Identifiable IDs |
| `VStack` for long ScrollView content | All views created at once | `LazyVStack` |
| Loading full-res images | OOM, slow render | Downsample to display size |
| `.animation` without `value` | Animates everything | Always use `.animation(_, value:)` |
| Expensive shadow per-frame | Computed every frame | Animate opacity, not radius |
| GeometryReader as parent | Cascade of layout passes | Use container queries or visualEffect |
| Missing `.equatable()` on expensive view | Body runs unnecessarily | Add Equatable conformance + `.equatable()` |
| A class instance or closure as an `@Entry` environment default | Shared mutable state; every reader of the key re-evaluates when it changes. The iOS 27 SDK warns on it | Value-type defaults only; inject live objects with `.environment(instance)` |

## See also

- `references/performance/02-scroll-list-performance.md#off-screen-rendering` -- list-specific optimization, off-screen render cost
- `references/animation/01-animation-fundamentals.md#animation-cost-layout-vs-render` -- the animation-side summary of this file's cost table
