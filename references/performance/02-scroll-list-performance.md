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

**Target:** hitch ratio < 5ms per second of scrolling.

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

Decoded images consume `width * height * 4` bytes. A 12MP photo = 48MB. Downsample at load time:

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
List(items) { item in
    ItemRow(item: item)
        .task {
            await ImageCache.shared.prefetch(item.imageURL)
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

// GOOD: shadow on container, content on inner view
ZStack {
    RoundedRectangle(cornerRadius: 12)
        .fill(.background)
        .shadow(radius: 4)  // Shadow on container
    
    CellContent(item: item)
        .clipShape(.rect(cornerRadius: 12))  // Clip on inner
}
```

In SwiftUI, prefer `.shadow()` modifier directly on the view (SwiftUI handles separation automatically in most cases).

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

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Body computation per cell | Re-runs constantly during scroll | Pre-compute, cache, Equatable |
| Full-resolution images | Memory pressure, slow decode | Downsample |
| Synchronous image load | Hitches when cells appear | Async with background queue |
| Self-sizing every cell | Layout pass per cell | Absolute or estimated heights |
| Heavy shadow + cornerRadius | Off-screen rendering | Separate shadow container |
| Many transparent layers | Compositing cost | Use opaque where possible |
| Date formatting in body | Allocates every render | Pre-format, cache |
| Reading global state in cell | All cells re-evaluate on global change | Pass needed values from parent |
| Custom pull-to-refresh | Hard to match system feel | `.refreshable {}` |
| Animating cell frame | Layout cascade | Animate transforms |

## See also

- `01-swiftui-rendering.md` -- general SwiftUI performance
- `animation/01-animation-fundamentals.md` -- layout vs render cost
