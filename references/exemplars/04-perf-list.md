# Exemplar: High-Performance List

> Status: signature-drafted, build-pending (requires Xcode build at iOS 18 + iOS 26 targets).
> Composes: `references/performance/02-scroll-list-performance.md` (cell stability, `AsyncImage` caveats), `references/performance/01-swiftui-rendering.md` (invalidation cost), `references/design/11-media-content.md` (image rendering pipeline).
> Floors: `@Observable` iOS 17.0+; `.scrollTargetLayout()`/`.scrollPosition(_:)` iOS 17.0+/18.0+; `.onScrollPhaseChange` iOS 18.0+; `ImageIO` thumbnail decode APIs long-stable.

A ProMotion-smooth image feed: `@Observable` field-granular invalidation, a decomposed `Equatable` row, a coalescing actor image loader that downsamples off-main, a recycling `List`, and the Instruments verification pass that proves it hits the frame budget instead of assuming it. This is the target file the performance agent should hold up when reviewing scroll code.

## The Apple way

- **`List`, not `ScrollView`+`LazyVStack`, for an unbounded feed.** `List` is `UICollectionView`-backed and RECYCLES off-screen rows -- memory stays proportional to the visible window. `LazyVStack` lazily *creates* rows but never frees them; a long feed grows memory monotonically with scroll distance.
- **`@Observable`, field-granular.** A row re-evaluates only when a property it actually read in `body` changes. Legacy `ObservableObject`+`@Published` fires `objectWillChange` for every mutation -- every row re-renders on any unrelated model change.
- **The row is a value sink.** The parent passes plain, pre-computed values (title, an already-formatted subtitle, `isFavorite: Bool`) -- never the whole store. `DateFormatter`/regex/`filter` inside a row's `body` costs tens-hundreds of µs × rows × redraws -- a visible scroll hitch.
- **`AsyncImage` is the wrong default for cells.** It caches only compressed HTTP bytes (`URLCache`) and re-decodes on the MAIN actor on every reappearance -- full detail in `references/performance/02-scroll-list-performance.md`. A row-owned downsampled cache is the fix (below).

## Core APIs

### Part A -- model, `@Observable` store, decomposed `Equatable` row, recycling `List`

```swift
import SwiftUI

// MARK: - Model (stable identity, pre-formatted display strings)

struct Photo: Identifiable, Hashable, Sendable {
    let id: UUID
    let title: String
    let subtitle: String     // pre-formatted upstream (e.g. "Jul 3 · Ansel Adams") -- NEVER format in body
    let imageURL: URL
}

// MARK: - Store (@Observable, field-granular, main-actor)

@Observable @MainActor
final class PhotoFeedStore {
    private(set) var photos: [Photo] = []
    private(set) var favorites: Set<Photo.ID> = []

    func toggleFavorite(_ id: Photo.ID) {
        if favorites.contains(id) { favorites.remove(id) } else { favorites.insert(id) }
    }
    func load() async { photos = await PhotoService.fetch() }   // subtitle formatted here, off the render path
}

// MARK: - Row (decomposed value sink, Equatable, cheap body)

struct PhotoRow: View, Equatable {
    let id: Photo.ID
    let title: String
    let subtitle: String
    let imageURL: URL
    let isFavorite: Bool
    let pixelSize: CGSize        // target DECODE size in pixels (points × displayScale)

    @State private var thumbnail: UIImage?

    // Compare only what affects pixels. @State (thumbnail) is deliberately NOT part of ==.
    static func == (lhs: PhotoRow, rhs: PhotoRow) -> Bool {
        lhs.id == rhs.id && lhs.title == rhs.title && lhs.subtitle == rhs.subtitle &&
        lhs.imageURL == rhs.imageURL && lhs.isFavorite == rhs.isFavorite
    }

    var body: some View {
        // #if DEBUG: uncomment to log WHY this row re-evaluated -- see Part D.
        // let _ = Self._printChanges()
        HStack(spacing: 12) {
            thumbnailView
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline).lineLimit(1)
                Text(subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
            if isFavorite { Image(systemName: "star.fill").foregroundStyle(.yellow).accessibilityHidden(true) }
        }
        .padding(.vertical, 6)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(isFavorite ? "\(title), favorite" : title)
        .accessibilityValue(subtitle)
        // .task(id:) auto-cancels the previous decode when a recycled row rebinds to a new URL --
        // essential on a fast fling so you never paint a stale thumbnail.
        .task(id: imageURL) { thumbnail = await ThumbnailLoader.shared.thumbnail(for: imageURL, pixelSize: pixelSize) }
    }

    @ViewBuilder private var thumbnailView: some View {
        if let thumbnail {
            Image(uiImage: thumbnail)      // already decoded+downsampled off-main -- zero main-thread decode
                .resizable().scaledToFill().frame(width: 56, height: 56).clipShape(.rect(cornerRadius: 12))
        } else {
            RoundedRectangle(cornerRadius: 12).fill(.quaternary).frame(width: 56, height: 56)
                .overlay(ProgressView().controlSize(.mini))
        }
    }
}

// MARK: - Feed (recycling List; parent pre-computes every row input)

struct PhotoFeedView: View {
    @State private var store = PhotoFeedStore()
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.photos) { photo in
                    PhotoRow(id: photo.id, title: photo.title, subtitle: photo.subtitle,
                             imageURL: photo.imageURL, isFavorite: store.favorites.contains(photo.id),
                             pixelSize: CGSize(width: 56 * displayScale, height: 56 * displayScale))
                        .equatable()
                        .listRowInsets(.init(top: 4, leading: 16, bottom: 4, trailing: 16))
                        .swipeActions(edge: .trailing) {
                            Button("Favorite", systemImage: "star") { store.toggleFavorite(photo.id) }.tint(.yellow)
                        }
                }
            }
            .listStyle(.plain)
            .navigationTitle("Photos")
            .task { await store.load() }
            .refreshable { await store.load() }   // system pull-to-refresh; don't hand-roll it
        }
    }
}
```

`pixelSize` is in **pixels** (points × `displayScale`), because ImageIO downsampling works in pixels -- a 56pt cell on a 3× screen wants a 168px thumbnail; decoding smaller blurs, larger wastes memory. `store.favorites.contains(...)` is read by the PARENT, never inside the row body -- reading it in the row would make every row observe the whole `favorites` set and re-render on an unrelated toggle.

### Part B -- `ThumbnailLoader`: coalescing actor, size-aware cache, off-main downsample

```swift
import UIKit
import ImageIO

actor ThumbnailLoader {
    static let shared = ThumbnailLoader()

    private struct Key: Hashable {
        let url: URL, w: Int, h: Int
        init(_ url: URL, _ size: CGSize) { self.url = url; w = Int(size.width.rounded()); h = Int(size.height.rounded()) }
        var nsKey: NSString { "\(url.absoluteString)|\(w)x\(h)" as NSString }
    }

    private let cache: NSCache<NSString, UIImage> = { let c = NSCache(); c.totalCostLimit = 64 * 1024 * 1024; return c }()
    private var inFlight: [Key: Task<UIImage?, Never>] = [:]

    func thumbnail(for url: URL, pixelSize: CGSize) async -> UIImage? {
        let key = Key(url, pixelSize)
        if let cached = cache.object(forKey: key.nsKey) { return cached }
        if let running = inFlight[key] { return await running.value }   // coalesce concurrent requests

        let task = Task<UIImage?, Never> { await Self.fetchAndDownsample(url: url, pixelSize: pixelSize) }
        inFlight[key] = task
        let image = await task.value
        inFlight[key] = nil   // actor-serialized: safe

        if let image { cache.setObject(image, forKey: key.nsKey, cost: image.decodedByteCost) }
        return image
    }

    private static func fetchAndDownsample(url: URL, pixelSize: CGSize) async -> UIImage? {
        guard let data = try? await URLSession.shared.data(from: url).0 else { return nil }
        return await Task.detached(priority: .utility) { downsample(data, to: pixelSize) }.value
    }

    private static func downsample(_ data: Data, to pixelSize: CGSize) -> UIImage? {
        let srcOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let src = CGImageSourceCreateWithData(data as CFData, srcOptions) else { return nil }
        let maxPixel = max(pixelSize.width, pixelSize.height)
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,       // decode NOW, on this background thread
            kCGImageSourceCreateThumbnailWithTransform: true,  // honor EXIF orientation
            kCGImageSourceThumbnailMaxPixelSize: maxPixel
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }
}

private extension UIImage {
    var decodedByteCost: Int { (cgImage.map { $0.bytesPerRow * $0.height }) ?? 1 }   // real decoded footprint
}
```

Four things make this fast and correct: (1) downsample, don't decode-then-shrink -- `CGImageSourceCreateThumbnailAtIndex` with `kCGImageSourceThumbnailMaxPixelSize` decodes DIRECTLY to the target size; a full-res decode-then-shrink costs `width × height × 4` bytes regardless of the frame it lands in (a 4000×3000 JPEG is 48MB even in an 80×80 cell); (2) the cache key includes size -- an 80×80 thumbnail is the wrong asset for a 300×300 detail view; (3) the decoded bitmap is cached in a store that OUTLIVES the row -- `List` rows are destroyed off-screen, so row-local `@State` does not survive scroll-out; (4) in-flight coalescing -- one `Task` per key, every row wanting the same key awaits the same task, so a fast fling never spawns N redundant fetch+decodes for one URL.

### Part C -- `LazyVStack` + `.scrollTargetLayout` variant (when custom chrome demands it)

```swift
struct PhotoFeedLazyView: View {
    @State private var store = PhotoFeedStore()
    @State private var scrollPosition = ScrollPosition(idType: Photo.ID.self)
    @State private var isScrolling = false
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(store.photos) { photo in
                    PhotoRow(id: photo.id, title: photo.title, subtitle: photo.subtitle, imageURL: photo.imageURL,
                             isFavorite: store.favorites.contains(photo.id),
                             pixelSize: CGSize(width: 56 * displayScale, height: 56 * displayScale))
                        .equatable().frame(height: 72).padding(.horizontal, 16)
                }
            }
            .scrollTargetLayout()                       // children become scroll-snap targets
        }
        .scrollTargetBehavior(.viewAligned)              // snaps to whole rows
        .scrollPosition($scrollPosition)                 // program­matic scroll-to / restore, no ScrollViewReader hack
        .onScrollPhaseChange { _, newPhase in isScrolling = newPhase.isScrolling }
        .environment(\.isScrollActive, isScrolling)      // rows read this to deprioritize decode mid-fling
        .task { await store.load() }
    }
}

private struct IsScrollActiveKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues { var isScrollActive: Bool { get { self[IsScrollActiveKey.self] } set { self[IsScrollActiveKey.self] = newValue } } }
```

`LazyVStack` NEVER recycles -- it's correct only for bounded/windowed data; for an unbounded feed either window the data source or use the `List` variant above (memory grows monotonically otherwise). Wire the fling gate into the loader by passing `priority: isScrollActive ? .utility : .userInitiated` to `ThumbnailLoader.thumbnail(for:pixelSize:priority:)` -- decodes yield to the scroll while it's in motion, and run at full priority once it settles. `onScrollPhaseChange` fires only on the FIRST `ScrollView` in the hierarchy; a second one logs a runtime issue.

## Availability + fallbacks

```swift
if #available(iOS 17, *) {
    PhotoRow(...).equatable()
} else {
    PhotoRow(...)   // .equatable() is available earlier too; gate is illustrative -- real gate
                     // points are .scrollTargetLayout()/.scrollPosition (iOS 17/18) in Part C
}
```

`.onScrollPhaseChange` is iOS 18.0+; on a lower floor, omit fling-gating and decode at `.userInitiated` unconditionally -- correctness first, the gate is a scroll-quality refinement.

## Accessibility contract

No RM/VoiceOver-specific surface of its own -- the hang-rate and hitch-ratio targets below sit underneath `references/accessibility/05-motion-accessibility.md`'s vestibular-safety contract. A screen that correctly gates every animation but still hangs is STILL perceived as uncontrolled motion -- stutter reads as motion even with no `Animation` value firing. Treat a hitch fix as unconditional, never gated on `accessibilityReduceMotion`.

## Part D -- verifying it: `Self._printChanges()` + Instruments checklist

```swift
var body: some View {
    let _ = Self._printChanges()   // DEBUG-only SPI; remove before shipping. Silence = no re-eval.
    HStack { /* ... */ }
}
```

Reading the console tokens: **`@self`** -- the view VALUE changed (an input differs by `==`); should fire ONLY for the row whose input actually changed. **`@identity`** -- the view's IDENTITY changed → SwiftUI tore down and rebuilt it; in a list this almost always means an unstable `ForEach` id (index-based, or a fresh `UUID()` per render) -- fix identity first, it's the expensive one. **A property name** -- that specific `@State`/binding changed. **Nothing logged during a pure scroll of already-realized rows** is the goal -- SwiftUI does not re-run the parent `List` body on scroll; only newly-realized rows evaluate `body`.

Instruments checklist (device, Release build, ProMotion hardware; frame budget 16.67ms/frame at 60Hz, **8.33ms/frame at 120Hz**):

1. **Animation Hitches** -- watch Hitch Time Ratio (target < 5ms hitch per 1s of scroll). Splits Commit (main-thread layout/update -- `body` cost, `AnyView` rebuilds, whole-`@Observable` reads land here) from Render (GPU -- off-screen passes, blending, oversized textures).
2. **SwiftUI** template (iOS 17+) -- View Body count/duration; a row `body` firing far more than rows realized = an invalidation bug, jump back to `_printChanges()`.
3. **Time Profiler** -- sample during a fast fling. Main-thread frames dominated by `CGImageSourceCreateThumbnail…`/`UIImage` decode/`DateFormatter` = compute that must move off the render path.
4. **Allocations** -- scroll a long feed top-to-bottom; flat = `List` recycling working; monotonic climb = a `LazyVStack` retaining every realized row (expected there -- a red flag if you meant `List`). Confirm `NSCache` isn't unbounded (`totalCostLimit` set).
5. **Simulator → Debug menu** quick triage before device profiling: Color Blended Layers (red = compositing cost -- prefer opaque row backgrounds), Color Copied Images (cyan/blue = an undecoded-for-display image copied at draw time -- the off-main ImageIO downsample above should eliminate this), Color Offscreen-Rendered (yellow = an off-screen pass from shadow+cornerRadius+masksToBounds combined -- prefer SwiftUI `.shadow()` on the view and clip inner content separately).

**Acceptance bar**: Hitch Time Ratio < 5ms/s across a 5-second fast fling on the slowest supported device; per-row `body` count ≈ rows realized with zero `@identity` churn during scroll; zero image decode/date formatting on the main thread during scroll; memory flat for `List`, bounded for `LazyVStack`'s window.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `AsyncImage` as the default cell image | Caches only compressed bytes, re-decodes on main every reappearance, no downsampling | `ThumbnailLoader` actor: cached, coalesced, off-main, downsampled |
| `class ImageCache` with a bare `NSCache<NSURL, UIImage>` | No in-flight coalescing (a fling fires N redundant decodes); key omits size | `actor` + `inFlight` map + `(url, pixelSize)` key |
| `LazyVStack` for an unbounded feed | Never frees off-screen rows -- memory grows monotonically with scroll distance | `List` (recycles) for unbounded data; `LazyVStack` only for bounded/windowed |
| `.task { await ImageCache.shared.prefetch(...) }` on a row, labeled "prefetching" | `.task`/`.onAppear` fire once the row is ALREADY on-screen and laid out -- no lead time | Warm the cache for the next data window when a page loads, or drop to `UICollectionView.prefetchItemsAt` |
| `AnyView` wrapping a row | Type-erasure defeats structural diffing → tear-down/rebuild every update | Concrete row type + `Equatable` |
| `GeometryReader` per row | Greedy layout container per cell | Reserve for one container measurement, not per-row |
| Reading a whole `@Observable`/`ObservableObject` store inside row `body` | Over-invalidates -- every row re-renders on any unrelated store mutation | Parent reads the store, passes plain pre-computed values down |

## Severity guide

CRITICAL: `LazyVStack` shipped for a genuinely unbounded feed -- unbounded memory growth. HIGH: `AsyncImage` decoding full-resolution images on the main thread inside a fast-scrolling list. MEDIUM: unstable `ForEach` identity causing `@identity` churn (tear-down/rebuild) during scroll. LOW: `.equatable()` applied to a row with no real per-render work (neutral-to-negative, not harmful). NIT: `GeometryReader` used where a fixed frame would do.

## See also

- `references/performance/02-scroll-list-performance.md` -- cell stability, `AsyncImage` caveats, prefetching reality (owner)
- `references/performance/01-swiftui-rendering.md` -- `@Observable` invalidation granularity (owner)
- `references/design/11-media-content.md` -- image rendering pipeline, HDR (owner)
- `references/accessibility/05-motion-accessibility.md` -- the vestibular-safety contract this file's hitch targets sit underneath
