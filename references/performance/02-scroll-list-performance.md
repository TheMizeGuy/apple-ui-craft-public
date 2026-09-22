# Scroll and List Performance

Scrolling is where users notice performance most. A single dropped frame during scroll is visible. Consistent 60fps (or 120fps on ProMotion) is the floor.

## Hitch detection

A "hitch" is a frame that misses its display deadline. iOS measures hitches in Instruments via the Animation Hitches template.

| Severity | Duration | User impact |
|---|---|---|
| Micro | < 5ms | Imperceptible |
| Minor | 5-16ms | Barely noticeable |
| Moderate | 16-33ms | Noticeable stutter |
| Severe | > 33ms | Clearly janky |

**Bands are for 60 Hz.** On ProMotion a frame is 8.33 ms, so halve them: sustained >8 ms of commit work is already a moderate hitch there (`references/performance/05-display-promotion-color.md`), and every hitch number is reported with its refresh regime (`references/performance/03-launch-memory-instruments.md`).

**Target:** hitch ratio < 5ms per second of scrolling.

That target is a LOCAL profiling target, measured with the Animation Hitches template over a scroll. The FIELD number changed shape in iOS 27 and the two are no longer the same series. MetricKit's `HitchTimeMetric` (`MetricResult.hitchTime(_:)`, iOS/iPadOS/Mac Catalyst/macOS 27.0) reports hitch time across every tracked animation in the app -- scrolling, transitions, continuous motion -- not scroll alone, and Xcode Organizer's Hitches metric widened the same way. On iOS 26 and earlier the field reader is still the scroll-scoped `MXAnimationMetric.scrollHitchTimeRatio` (iOS 14.0+). Trend them separately and restate the budget as a per-app animation-hitch budget on 27; `references/performance/03-launch-memory-instruments.md` owns the dual-path MetricKit wiring.

## Common scroll bottlenecks

| Bottleneck | Symptom | Fix |
|---|---|---|
| Image decoding on main thread | Hitches when cells appear | Decode on background, cache |
| Expensive cell layout | Hitches as cells construct | Simplify cell, use absolute heights |
| Body re-evaluation in cells | Hitches on data changes | Equatable cells, decomposition |
| Off-screen rendering | Hitches with shadows + cornerRadius | Separate shadow layer |
| Layout-triggering animations | Hitches on animated cells | Animate transforms, not layout |
| Synchronous network in cell | Hitches when cell appears | Pre-fetch, cache |
| String formatting per render | Hitches with many cells | Pre-compute, cache |

## Lazy stacks vs List

`List` is already lazy and well-optimized. `LazyVStack` in `ScrollView` is sometimes needed for custom layouts but lacks some of List's optimizations.

| Use | Container |
|---|---|
| Standard list with selection, swipe actions, separators | `List` |
| Custom layout per row, complex chrome, heterogeneous content | `ScrollView` + `LazyVStack` |
| Grid | `LazyVGrid` |
| Horizontal scroll | `ScrollView(.horizontal)` + `LazyHStack` |
| Mixed orientation | `ScrollView` with multiple `LazyVStack` / `LazyHStack` |

The row above that used to force the choice -- "standard list with selection, swipe actions, separators" -- is weaker from iOS 27, because reorder and swipe affordances are no longer `List`-only. `reorderable()` is declared on `DynamicViewContent`, so it attaches to a `ForEach` inside any container, with `reorderContainer(for:itemID:isEnabled:move:)` (or the no-key-path `reorderContainer(for:isEnabled:move:)`) on an ancestor receiving a `ReorderDifference`. `swipeActions(edge:allowsFullSwipe:content:onPresentationChanged:)` works outside `List`, and `swipeActionsContainer()` coordinates dismissal and mutual exclusion across rows in a container. All of these are iOS/iPadOS/Mac Catalyst/macOS/visionOS/watchOS 27.0, **not tvOS**; below 27 the fallbacks are `List` with `.onMove`, `.draggable` + `.dropDestination`, and `List`-only `.swipeActions`. The performance consequence is that a feed no longer has to be built on `List` purely to get a swipe affordance -- and equally, a hand-rolled drag-to-reorder over `DragGesture` plus manual offsets has lost its excuse.

### What lazy stacks actually do (and what that breaks)

A `LazyVStack` is not "a `VStack` that creates views later." Four of its documented behaviors routinely invalidate patterns that look fine in review:

- **Its height is ESTIMATED and changes while you scroll.** Absolute `contentOffset` and content size are unstable inside a lazy stack, so never drive UI off them. For "is this row visible," use `onScrollTargetVisibilityChange(idType:threshold:)` (iOS 18.0+) rather than `onScrollGeometryChange`.
- **A view struct is not one lazy subview.** Two top-level views in a `body` become two independently-loaded subviews. A leaf view created many times in a `ForEach` should not produce a dynamic NUMBER of subviews -- filter at the data layer instead of branching inside the leaf.
- **Prefetching runs `body` and layout BEFORE a view appears.** `onAppear`-based setup therefore lands late, and is discarded outright for a prefetched view that never appears. A row's setup belongs in its initializer.
- **State on a scrolled-off view is eventually discarded.** Persistent per-row state belongs in the model or a parent binding (`references/performance/04-state-architecture.md#view-identity-and-taskid-lifecycle`).

Two more rules fall out of the same machinery. Do not change a subview's layout AFTER it appears -- an `onGeometryChange`-driven measure-then-resize loop pushes the stack off the targeted scroll position, which is a correctness bug, not just a cost; use a custom `Layout` instead. And a scroll transition must never translate an off-screen view into the visible rect: prefer `scaleEffect` over `offset` in a `scrollTransition`.

## Cell stability

Cells should be cheap to construct and re-evaluate.

```swift
// BAD: heavy cell
struct ItemRow: View {
    let item: Item
    @Environment(Store.self) var store
    
    var body: some View {
        let formatted = item.timestamp.formatted(date: .abbreviated, time: .shortened)  // Computed every render
        let isFavorite = store.favorites.contains(item.id)  // Reads global state
        let badgeCount = store.unreadCount(for: item)  // Expensive computation
        
        HStack {
            Text(item.title)
            Text(formatted)
            if isFavorite { Image(systemName: "star.fill") }
            if badgeCount > 0 { Badge(count: badgeCount) }
        }
    }
}

// GOOD: lean cell
struct ItemRow: View, Equatable {
    let item: Item
    let formattedDate: String  // Pre-computed by parent
    let isFavorite: Bool
    let badgeCount: Int
    
    static func == (lhs: ItemRow, rhs: ItemRow) -> Bool {
        lhs.item.id == rhs.item.id &&
        lhs.item.title == rhs.item.title &&
        lhs.formattedDate == rhs.formattedDate &&
        lhs.isFavorite == rhs.isFavorite &&
        lhs.badgeCount == rhs.badgeCount
    }
    
    var body: some View {
        HStack {
            Text(item.title)
            Text(formattedDate)
            if isFavorite { Image(systemName: "star.fill") }
            if badgeCount > 0 { Badge(count: badgeCount) }
        }
    }
}

// Parent pre-computes
ForEach(items) { item in
    ItemRow(
        item: item,
        formattedDate: item.timestamp.formatted(date: .abbreviated, time: .shortened),
        isFavorite: favorites.contains(item.id),
        badgeCount: unreadCounts[item.id] ?? 0
    )
    .equatable()
}
```

Every property `body` reads MUST appear in `==`. Comparing only `item.id` while `body` also renders `item.title` lets `.equatable()` suppress a real in-place title edit -- the row never refreshes because the equality check says nothing changed.

**Re-measure `.equatable()` wins on an iOS 27 build.** Apple fixed a long-standing defect: retroactive `Equatable` conformances of SwiftUI types are now consulted when SwiftUI compares values. A row `==` that leans on an `extension` conformance someone added to a `Color`, `Font` or `Animation` behaved unpredictably before 27 and is honored now -- which can change how often the row's body is skipped, in either direction. `references/performance/01-swiftui-rendering.md#equatable-views` owns the rule; the scroll consequence is that a hitch budget validated on a 26 SDK is not automatically valid after the recompile.

## Image loading in cells

Images are the most common scroll bottleneck.

### AsyncImage (basic)

```swift
AsyncImage(url: item.thumbnailURL) { image in
    image.resizable().scaledToFill()
} placeholder: {
    Color.gray
}
.frame(width: 80, height: 80)
.clipShape(.rect(cornerRadius: 8))
```

### AsyncImage with phase handling

```swift
AsyncImage(url: url) { phase in
    switch phase {
    case .empty:
        ProgressView()
    case .success(let image):
        image.resizable().scaledToFill()
    case .failure:
        Image(systemName: "photo")
            .foregroundStyle(.tertiary)
    @unknown default:
        EmptyView()
    }
}
```

### AsyncImage caching and session control -- iOS 27

From iOS 27 (all seven platforms, in apps built against the 27.0 SDKs) `AsyncImage` caches downloaded images using HTTP caching protocols, so the server's `Cache-Control`/`ETag` headers decide re-download behavior. The blanket "AsyncImage re-downloads on every appearance" advice is true only below iOS 27.

Two new levers make `AsyncImage` worth keeping for a class of cases that previously forced a hand-rolled loader. `asyncImageURLSession(_:)` supplies one `URLSession` to every `AsyncImage` in a subtree -- attach it at the root with your `URLCache` size, `requestCachePolicy`, timeouts and auth headers, and every child inherits it:

```swift
// iOS 27+. nonisolated func asyncImageURLSession(_ urlSession: URLSession) -> some View
if #available(iOS 27, *) {
    FeedView().asyncImageURLSession(.imageLoading)
} else {
    FeedView()   // below 27: own the session inside your loader
}

extension URLSession {
    static let imageLoading: URLSession = {
        let config = URLSessionConfiguration.default
        config.urlCache = URLCache(memoryCapacity: 16 << 20, diskCapacity: 256 << 20)
        config.requestCachePolicy = .returnCacheDataElseLoad
        return URLSession(configuration: config)
    }()
}
```

And `AsyncImage` gained `URLRequest` initializers -- `init(request:scale:)`, `init(request:scale:content:placeholder:)`, `init(request:scale:transaction:content:)` -- so per-image cache policy is expressible without leaving the API. Prefer this over bolting a cache-busting query parameter onto a URL:

```swift
// iOS 27+. Force a fresh fetch of one avatar without poisoning the URL.
AsyncImage(request: URLRequest(url: avatarURL, cachePolicy: .reloadIgnoringLocalCacheData), scale: 3)
```

**None of this changes the decode side, which is the reason `AsyncImage` is still the wrong default for a scrolling cell.** It decodes at source resolution and never downsamples, on the main actor. A 12MP Display P3 asset is ~97 MB resident once decoded no matter how perfectly it was cached, so the iOS 27 review finding for an image grid is a decode/memory finding, not a network one.

### Custom image loader (for caching, prefetching, downsampling)

For high-performance image-heavy lists, use a custom loader:

```swift
class ImageCache {
    static let shared = ImageCache()
    private let cache = NSCache<NSURL, UIImage>()
    
    func image(for url: URL, targetSize: CGSize) async -> UIImage? {
        if let cached = cache.object(forKey: url as NSURL) {
            return cached
        }
        
        // Download and downsample on background
        let downsampled = await Task.detached(priority: .userInitiated) {
            await downsample(url: url, to: targetSize)
        }.value
        
        if let image = downsampled {
            cache.setObject(image, forKey: url as NSURL)
        }
        return downsampled
    }
}
```

### Downsampling

Decoded images consume `width * height * bytes_per_pixel`: 4 for sRGB (a 12MP photo = ~48 MB), 8 for the Display P3 default on modern iPhone cameras (~97 MB) -- `references/performance/03-launch-memory-instruments.md` owns the memory model. Downsample at load time:

```swift
func downsample(url: URL, to targetSize: CGSize, scale: CGFloat = 2.0) async -> UIImage? {
    let maxDimension = max(targetSize.width, targetSize.height) * scale
    
    let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: maxDimension
    ]
    
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
        return nil
    }
    
    return UIImage(cgImage: cgImage)
}
```

## Prefetching

For lists where users scroll fast, prefetch upcoming images:

```swift
List(Array(items.enumerated()), id: \.element.id) { index, item in
    ItemRow(item: item)
        .task {
            // Prefetch the NEXT window, not this row: this row's image is already needed.
            let upcoming = items.dropFirst(index + 1).prefix(6).compactMap(\.imageURL)
            await ImageCache.shared.prefetch(upcoming)
        }
}
```

For UICollectionView:

```swift
extension ViewController: UICollectionViewDataSourcePrefetching {
    func collectionView(_ collectionView: UICollectionView, prefetchItemsAt indexPaths: [IndexPath]) {
        let urls = indexPaths.compactMap { items[$0.row].imageURL }
        ImagePrefetcher.shared.startPrefetching(urls: urls)
    }
}
```

## Cell heights

| Strategy | Performance |
|---|---|
| Absolute heights (`.frame(height: 60)`) | Fastest |
| Estimated heights | Fast |
| Self-sizing (no height set) | Slower (requires layout pass) |

For uniform lists, set absolute heights:

```swift
List(items) { item in
    ItemRow(item: item)
        .frame(height: 60)   // the absolute height -- without it the row self-sizes
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
}
```

For UICollectionView with compositional layout:

```swift
let itemSize = NSCollectionLayoutSize(
    widthDimension: .fractionalWidth(1.0),
    heightDimension: .absolute(120)  // Fixed: no self-sizing
)
```

## Avoid layout-triggering animations during scroll

Animating cells while scrolling causes hitches. If you must animate:

```swift
// BAD: animates frame during scroll
cell.frame.size.height = isExpanded ? 200 : 60
// Triggers layout cascade

// GOOD: animate scaleEffect (transform)
cell.scaleEffect(isExpanded ? 1.0 : 0.95)
```

## Off-screen rendering

Combinations that trigger off-screen render passes:

| Combination | Causes off-screen render |
|---|---|
| `cornerRadius` + `clipsToBounds` + shadow | YES |
| Multiple overlapping transparent layers | YES |
| `mask()` modifier | YES |
| Complex `clipShape` | Sometimes |

### Fix: separate shadow layer

```swift
// BAD: triggers off-screen rendering
cell.layer.cornerRadius = 12
cell.layer.masksToBounds = true
cell.layer.shadowOpacity = 0.3

// UIKit fix: shadow on the container layer, mask on the inner layer. The same split in
// SwiftUI is only worth it when the clipped content is itself expensive.
ZStack {
    RoundedRectangle(cornerRadius: 12)
        .fill(.background)
        .shadow(radius: 4)  // Shadow on container
    
    CellContent(item: item)
        .clipShape(.rect(cornerRadius: 12))  // Clip on inner
}
```

In SwiftUI the rule is one line: `.clipShape(...)` first, then `.shadow()` on the same view. The compositor shadows the clipped shape without the CALayer `masksToBounds` off-screen pass, so the container/inner split above is the UIKit fix, and in SwiftUI it earns its place only when the clipped content is expensive enough to want its own layer.

## Color blended layers

Transparency = blending = compositing cost. Where possible, use opaque:

```swift
// SwiftUI doesn't expose isOpaque directly, but solid backgrounds help:
Rectangle()
    .fill(.background)  // Solid
// vs
Rectangle()
    .fill(.background.opacity(0.95))  // Blended
```

In Simulator > Debug > Color Blended Layers: red regions are blended (slow), green are opaque (fast).

## Pull-to-refresh

```swift
List(items) { item in
    ItemRow(item: item)
}
.refreshable {
    await reloadItems()  // Async; system handles spinner
}
```

The system spinner is well-optimized. Don't build custom pull-to-refresh -- it's hard to match the system feel.

## Two scroll behaviors that change on the 27-SDK recompile

Both land in apps built against the 27.0 SDKs, with no source change and no `#available` gate -- which is exactly why they are worth a visual re-check rather than a code review.

- **Tap-to-top now updates a bound `scrollPosition`.** Tapping the status bar to scroll a `ScrollView` to its top previously left the binding holding a stale value. Any "scroll to top" affordance or sticky header that was kept in sync by hand against that stale binding should have its workaround removed, not carried forward.
- **`containerRelativeFrame(_:alignment:)` now accounts for safe-area insets on the scroll view's non-scrollable axis.** A horizontal carousel whose cards use `containerRelativeFrame(.vertical)` and extend into the navigation bar or home indicator previously calculated a scrollable content size that was too small. Card heights will measure differently after the recompile, so re-check carousels visually. Build against the 26 SDK to retain the prior behavior.

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Body computation per cell | Re-runs constantly during scroll | Pre-compute, cache, Equatable |
| Full-resolution images | Memory pressure, slow decode | Downsample |
| Synchronous image load | Hitches when cells appear | Async with background queue |
| Self-sizing every cell | Layout pass per cell | Absolute or estimated heights |
| Heavy shadow + cornerRadius | Off-screen rendering (UIKit `masksToBounds` + shadow on one layer) | UIKit: separate shadow layer; SwiftUI: `.clipShape` then `.shadow()` |
| Many transparent layers | Compositing cost | Use opaque where possible |
| Date formatting in body | Allocates every render | Pre-format, cache |
| Reading global state in cell | All cells re-evaluate on global change | Pass needed values from parent |
| Custom pull-to-refresh | Hard to match system feel | `.refreshable {}` |
| Animating cell frame | Layout cascade | Animate transforms |
| `onAppear` doing a row's setup inside a lazy stack | Prefetching evaluates and lays out first; the setup lands late or is thrown away | Do it in the row's initializer |
| Driving UI from a lazy stack's `contentOffset` / content size | The stack's height is estimated and changes during scroll | `onScrollTargetVisibilityChange(idType:threshold:)` for visibility |
| `onGeometryChange` measuring a row, then resizing it | Pushes the stack off the targeted scroll position | Custom `Layout` |
| `scrollTransition` translating off-screen views into the visible rect | Views the stack considered off-screen become visible | `scaleEffect`, not `offset` |
| Building a feed on `List` only to get swipe or reorder affordances | Both exist outside `List` from iOS 27 | `swipeActions(...onPresentationChanged:)` / `reorderable()` + `reorderContainer(...)`, gated `#available(iOS 27, *)` |
| "AsyncImage re-downloads on every appearance" as an unqualified claim | It caches per HTTP headers from iOS 27 | Say it for pre-27; on 27 the finding is the decode, not the download |

## See also

- `references/performance/01-swiftui-rendering.md#equatable-views` -- general SwiftUI performance, Equatable views
- `references/animation/01-animation-fundamentals.md#animation-cost-layout-vs-render` -- layout vs render cost
