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

## Stable identifiers in ForEach

`ForEach` uses identifiers to track which views correspond to which data. Unstable identifiers cause views to be destroyed and recreated.

```swift
// BAD: UUID() generates new ID every render
ForEach(items, id: \.self) { item in
    ItemRow(item: item)
}
// If items don't conform to Hashable, this is wrong

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
        .onChange(of: trips) { _, newTrips in
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

| Cheap (render-only) | Expensive (layout-triggering) |
|---|---|
| `.opacity` | `.frame(width:height:)` |
| `.scaleEffect` | `.padding` |
| `.rotationEffect` | `.offset` (in some cases) |
| `.offset` (transform) | Content changes |
| `.blur` | `.font` size changes |
| `.brightness` | `HStack`/`VStack` spacing |
| `.shadow` | Adding/removing views |

Animate transforms (scale, opacity, rotation, offset) for smooth 60-120fps animation. Animating layout properties triggers a full layout pass per frame -- expensive.

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
// BAD: 12MP photo decoded as 48MB
Image("large-photo")
    .resizable()
    .frame(width: 200, height: 200)
// Memory still 48MB even though displayed at 200x200

// GOOD: AsyncImage with explicit size
AsyncImage(url: url) { image in
    image.resizable().scaledToFill()
} placeholder: {
    Color.gray
}
.frame(width: 200, height: 200)

// BETTER: Custom image cache with pre-decoded thumbnails
ThumbnailImage(url: url, targetSize: CGSize(width: 200, height: 200))
```

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

## See also

- `02-scroll-list-performance.md` -- list-specific optimization
- `animation/01-animation-fundamentals.md` -- animation cost
