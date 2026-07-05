# Adaptive Layout

> Owner: `references/design/08-adaptive-layout-ipad.md` owns the adaptive-layout construction toolkit -- `ViewThatFits`, `AnyLayout`, size-class-driven shape switching, and `containerRelativeFrame` -- the mechanics that answer both Dynamic-Type-driven reflow and size-class-driven reflow. `references/accessibility/02-dynamic-type-adaptation.md` owns Dynamic Type scale fundamentals (the 12 sizes, reading/scaling fonts and custom dimensions); cite it for the type-size vocabulary, not restated here. `references/cross-platform/01-ipados-multiplatform.md` owns the concrete iPad top-level shape decision (`NavigationSplitView` vs `sidebarAdaptable` `TabView`), pointer/hover, and windowing -- cite it, don't duplicate. Base `NavigationSplitView` two/three-column mechanics and `columnVisibility` live in `references/design/07-navigation-patterns.md#navigationsplitview-ios-16`.
> Floors: `AnyLayout`/`ViewThatFits` iOS 16.0+; `containerRelativeFrame` iOS 17.0+; `lineLimit(_:reservesSpace:)` iOS 16.0+; `dynamicTypeSize`/`isAccessibilitySize` iOS 15.0+.

An adaptive screen reshapes along two independent axes -- window/size-class and Dynamic Type -- and the tool you reach for depends on whether the CONTENT changes or only the ARRANGEMENT does. The most common craft failure is picking `ViewThatFits` or a manual `if/else` branch by habit instead of asking whether child state (focus, an in-flight animation, a `TextField` mid-edit) needs to survive the switch.

## The Apple way

- **Same content, changing axis → `AnyLayout`.** Genuinely different fallback content (fewer columns, a summarized string) → `ViewThatFits`. Don't reach for `ViewThatFits` just to flip `HStack`↔`VStack`.
- Size class answers "multitasking-narrow vs. full-width scene," never "iPhone vs. iPad" and never orientation. Gate structural chrome (split vs. stack, sidebar visible) on `horizontalSizeClass`; gate a single view's *internal* content arrangement on real geometry (`GeometryReader`/`.onGeometryChange`). Conflating the two is the most common adaptive-layout bug.
- Dynamic Type size and size class are ORTHOGONAL environment values -- a layout that correctly stacks at `.accessibility1` on a compact-width iPhone may have plenty of room to stay horizontal at the same type size on a regular-width iPad. Check both together when the layout genuinely differs by available width, not just by text size.
- `minimumScaleFactor` is a truncation escape hatch for a genuinely fixed single-line container (a status pill, a table cell) -- never a general answer to "text overflows at AX sizes." A user who set AX3 wants bigger text; a scale-factor floor silently shrinks it back, defeating the setting they chose. Fix overflow by reflowing/wrapping first.

## Core APIs

### `AnyLayout` vs `ViewThatFits`

```swift
// AnyLayout (iOS 16+) -- YOU decide the axis; ONE child tree, identity preserved across the flip.
@Environment(\.dynamicTypeSize) private var typeSize

var body: some View {
    let layout = typeSize.isAccessibilitySize
        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
        : AnyLayout(HStackLayout(spacing: 12))
    layout {
        Image(systemName: "bell.fill").imageScale(.large)
        Text("Notifications enabled")
        Spacer(minLength: 0)
    }
}
```

```swift
// ViewThatFits (iOS 16+) -- tries candidates in order, renders the FIRST that fits the proposed
// space. Content-driven: use when the breakpoint depends on the actual string length, not a
// known threshold.
ViewThatFits(in: .horizontal) {
    HStack { Image(systemName: "star.fill"); Text("Favorited at 12:34 PM on Jan 15") }
    VStack(alignment: .leading) {
        HStack { Image(systemName: "star.fill"); Text("Favorited") }
        Text("12:34 PM on Jan 15")
    }
}
```

`AnyLayout` swaps only the layout algorithm while keeping ONE child subtree -- focus, `@FocusState`, in-flight `.matchedGeometryEffect`, and animations survive the axis flip. A manual `if isAccessibilitySize { VStack{...} } else { HStack{...} }` treats the two branches as DIFFERENT subtrees: SwiftUI tears down and rebuilds on every crossing, resetting exactly that state. Reach for the manual branch only when you already know children are stateless (plain `Image`/`Text`, nothing focusable).

### Size class as a general adaptive signal

```swift
@Environment(\.horizontalSizeClass) private var hSizeClass

var body: some View {
    if hSizeClass == .compact {
        CompactLayout()          // narrow multitasking scene, any device
    } else {
        RegularLayout()          // full-width or wide-multitasking scene
    }
}
```

The concrete top-level application of this pattern -- `NavigationSplitView` vs. `TabView { }.tabViewStyle(.sidebarAdaptable)` -- is owned by `references/cross-platform/01-ipados-multiplatform.md#choosing-the-top-level-shape`; this file covers the general signal, not the iPad-specific decision. `NavigationSplitView` itself auto-collapses to a `NavigationStack` at compact width with no extra code -- bind `columnVisibility` as `@State` so the sidebar-toggle state survives rotation and multitasking transitions (base mechanics + the binding: `references/design/07-navigation-patterns.md#navigationsplitview-ios-16`).

A clamped-proportional formula holds a split pane's width sane across the full iPhone-to-iPad range better than a fixed point value:

```swift
let secondaryWidth = min(420, max(300, totalWidth * 0.34))   // floor 300, ceiling 420
let primaryWidth = totalWidth - secondaryWidth
```

At an SE-width scene (~667pt) this floors the secondary pane at 300pt instead of squeezing it unreadable; at a 12.9" iPad (~1366pt) it ceilings at 420pt instead of dominating the width. Feed `totalWidth` from `GeometryReader`/`.onGeometryChange(for:of:action:)`, never `UIScreen.main.bounds`.

### `containerRelativeFrame`

Sizes a view as a fraction of its scroll container -- the mechanism behind paged, card-style content that always shows a consistent fraction of the next item:

```swift
// One full-width page per swipe (iOS 17+)
ScrollView(.horizontal) {
    HStack(spacing: 12) {
        ForEach(pages) { page in
            PageView(page: page).containerRelativeFrame(.horizontal)
        }
    }
}
.scrollTargetBehavior(.paging)

// Divide the container into N relative segments -- e.g. show 2.2 cards to hint at more content
ForEach(cards) { card in
    CardView(card: card)
        .containerRelativeFrame(.horizontal, count: 5, span: 2, spacing: 12)
}
```

`containerRelativeFrame(_:count:span:spacing:alignment:)` divides the container's dimension into `count` equal segments and sizes the view to `span` of them -- the correct way to say "roughly 40% of the visible width" without a hardcoded point value that breaks across device widths.

### Dynamic-Type-driven reflow catalog

Beyond the `AnyLayout`/`ViewThatFits` choice, four more levers close the reflow story `references/accessibility/02-dynamic-type-adaptation.md` doesn't cover:

```swift
// 1. Grid/LazyVGrid columns collapse at AX sizes -- a 2-3 column grid almost never survives AX3+.
private var columns: [GridItem] {
    typeSize.isAccessibilitySize
        ? [GridItem(.flexible())]
        : [GridItem(.flexible()), GridItem(.flexible())]
}
LazyVGrid(columns: columns, spacing: 12) { ForEach(items) { ItemCell($0) } }
// Same principle for adaptive grids: GridItem(.adaptive(minimum: minCell)) where minCell is a
// @ScaledMetric value, so the minimum cell width grows with text and the grid naturally sheds
// columns instead of clipping.

// 2. lineLimit(_:reservesSpace:) -- stop AX layout jitter. Plain .lineLimit(2) lets a row shrink
// to 1 line when text is short, so a list visibly jumps as row heights differ.
Text(article.headline).font(.headline).lineLimit(2, reservesSpace: true)   // fixed 2-line slot
Text(user.displayName).font(.body)   // unlimited -- never truncate a name

// 3. @ScaledMetric honors an ancestor's dynamicTypeSize(...) clamp -- a metric inside a subtree
// clamped to .accessibility2 stops growing there too. This is usually what you want; be aware a
// metric will stop growing wherever the nearest clamp caps it.

// 4. dynamicTypeSize/isAccessibilitySize (iOS 15+) supersedes the legacy sizeCategory/
// isAccessibilityCategory pair -- read/clamp via the new API in new code.
```

## Availability + fallbacks

```swift
if #available(iOS 16, *) {
    ViewThatFits(in: .horizontal) { compactCandidate; expandedCandidate }
} else {
    // Pre-16: no ViewThatFits/AnyLayout -- a manual GeometryReader-measured branch is the fallback.
    GeometryReader { geo in
        if geo.size.width > 320 { compactCandidate } else { expandedCandidate }
    }
}
```

`containerRelativeFrame` has no pre-17 equivalent -- gate its use behind `#available(iOS 17, *)` or compute a manual fraction of `GeometryReader`'s proposed width for a lower deployment target.

## Accessibility contract

This file's motion surface is limited to layout switching -- `AnyLayout` axis flips and `ViewThatFits` candidate swaps are structural, not animated, by default; wrap a deliberate cross-fade in `withAnimation(reduceMotion ? nil : .default)` per the double-gate contract (`references/accessibility/05-motion-accessibility.md`) if you animate the transition yourself. The layout choice IS the accessibility feature -- an unreflowed two-column layout that clips at AX5 is itself a WCAG violation, not a cosmetic nit.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `if isAccessibilitySize { VStack } else { HStack }` around a `TextField`/`Toggle` | Tears down and rebuilds the subtree -- focus, edits, and animations reset | `AnyLayout` swapping `VStackLayout`/`HStackLayout` |
| `ViewThatFits` used only to flip an axis | More expensive per layout pass than needed; discards identity for no benefit | `AnyLayout` when it's the same content on a new axis |
| Gating layout shape on `UIDevice.current.userInterfaceIdiom` or `UIScreen.main.bounds` | Wrong shape in Split View/Stage Manager/multi-window; bounds ignore the actual window | `horizontalSizeClass` for chrome, real geometry for internal arrangement |
| `.minimumScaleFactor(0.5)` as a general AX-overflow fix | Silently shrinks text back toward default, defeating the user's chosen size | Reflow/wrap first; reserve scale-factor for a genuinely fixed single-line container |
| Fixed 2-3 column `LazyVGrid` with no AX branch | Columns clip or crush content at AX3+ | Branch column count on `isAccessibilitySize`, or use `.adaptive(minimum:)` with a `@ScaledMetric` minimum |
| Plain `.lineLimit(2)` on a list row title | Row heights differ by content length → visible jitter | `.lineLimit(2, reservesSpace: true)` |

## Severity guide

CRITICAL: a layout that clips or truncates essential content at AX5 with no reflow path. HIGH: focus/edit state lost mid-interaction because a stateful child was branched with `if/else` instead of `AnyLayout`. MEDIUM: layout shape gated on device idiom or `UIScreen.main.bounds` instead of size class. LOW: `ViewThatFits` reached for where `AnyLayout` was the correct, cheaper tool. NIT: a list row missing `reservesSpace: true` causing minor row-height jitter.

## See also

- `references/accessibility/02-dynamic-type-adaptation.md` -- Dynamic Type scale fundamentals, the 12 sizes, `@ScaledMetric` (owner)
- `references/cross-platform/01-ipados-multiplatform.md#choosing-the-top-level-shape` -- the concrete iPad top-level shape decision, pointer/hover, windowing (owner)
- `references/design/07-navigation-patterns.md#navigationsplitview-ios-16` -- base `NavigationSplitView` mechanics, `columnVisibility` (owner)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate for animated layout transitions (owner)
