# Adaptive Layout

> Owner: `references/design/08-adaptive-layout-ipad.md` owns the adaptive-layout construction toolkit -- `ViewThatFits`, `AnyLayout`, size-class-driven shape switching, and `containerRelativeFrame` -- the mechanics that answer both Dynamic-Type-driven reflow and size-class-driven reflow. `references/accessibility/02-dynamic-type-adaptation.md` owns Dynamic Type scale fundamentals (the 12 sizes, reading/scaling fonts and custom dimensions); cite it for the type-size vocabulary, not restated here. `references/cross-platform/01-ipados-multiplatform.md` owns the concrete iPad top-level shape decision (`NavigationSplitView` vs `sidebarAdaptable` `TabView`), pointer/hover, and windowing -- cite it, don't duplicate. Base `NavigationSplitView` two/three-column mechanics and `columnVisibility` live in `references/design/07-navigation-patterns.md#navigationsplitview-ios-16`.
> Floors: `AnyLayout`/`ViewThatFits` iOS 16.0+; `containerRelativeFrame` iOS 17.0+; `lineLimit(_:reservesSpace:)` iOS 16.0+; `dynamicTypeSize`/`isAccessibilitySize` iOS 15.0+; `presentationPlacement(_:)` iOS 27.0+ (cases `.center`/`.leading`/`.trailing` iOS/iPadOS/Mac Catalyst only). `ArrangementView`, `ReservedRegion` and the hinge APIs are iOS 27.1 and still carry Apple's beta flag -- see Foldable and continuously resizable surfaces.

An adaptive screen reshapes along two independent axes -- window/size-class and Dynamic Type -- and the tool you reach for depends on whether the CONTENT changes or only the ARRANGEMENT does. The most common craft failure is picking `ViewThatFits` or a manual `if/else` branch by habit instead of asking whether child state (focus, an in-flight animation, a `TextField` mid-edit) needs to survive the switch.

## The Apple way

- **Same content, changing axis → `AnyLayout`.** Genuinely different fallback content (fewer columns, a summarized string) → `ViewThatFits`. Don't reach for `ViewThatFits` just to flip `HStack`↔`VStack`.
- Size class answers "multitasking-narrow vs. full-width scene," never "iPhone vs. iPad" and never orientation. Gate structural chrome (split vs. stack, sidebar visible) on `horizontalSizeClass`; gate a single view's *internal* content arrangement on real geometry (`GeometryReader`/`.onGeometryChange`). Conflating the two is the most common adaptive-layout bug.
- Dynamic Type size and size class are ORTHOGONAL environment values -- a layout that correctly stacks at `.accessibility1` on a compact-width iPhone may have plenty of room to stay horizontal at the same type size on a regular-width iPad. Check both together when the layout genuinely differs by available width, not just by text size.
- `minimumScaleFactor` is a truncation escape hatch for a genuinely fixed single-line container (a status pill, a table cell) -- never a general answer to "text overflows at AX sizes." A user who set AX3 wants bigger text; a scale-factor floor silently shrinks it back, defeating the setting they chose. Fix overflow by reflowing/wrapping first.
- **Every width is a real state.** Built with the iOS 27 SDK, an iPad app is continuously resizable no matter what `UISupportedInterfaceOrientations` declares, and every iPhone app window resizes too -- under iPhone Mirroring on macOS and on folding hardware. There is no longer a configuration that opts out, so "it only has to work at one width" is not a position an app can hold.

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

### Continuous resizability (iOS 27 SDK)

Apple's release notes close the last two loopholes. On iPad, an app built with the iOS 27 SDK is continuously resizable even when `UISupportedInterfaceOrientations` omits orientations -- "supported interface orientations should no longer be a condition for continuous resizability" -- and supported orientations are honored only until the user *begins* resizing, after which the scene ignores them. `UIRequiresFullScreen` no longer buys immunity either; it buys a different model, where each resize arrives as a discrete change to a **new** `UIScreen` with updated bounds while `UIScreen.main` bounds stay fixed once connected.

Two review rules follow directly:

- A layout keyed to `UIScreen.main.bounds` or a hardcoded device width is wrong **even in a portrait-locked app**, because those bounds stopped describing the window. Feed widths from `GeometryReader` / `.onGeometryChange(for:of:action:)` or size relative to the container.
- `UIRequiresFullScreen` is not an acceptable answer to "my layout breaks when resized." Apple's own framing: "Resizing is a key feature for your app on iPhone Duo. If your app already works on iPad and Mac or you've prepared your app to resize in iPhone Mirroring, you're well on your way."

One UIKit trap rides along: in apps built with the iOS 27 SDK, a presented view controller inherits its trait collection by walking up its view's superview chain through the intermediate views of the presentation, rather than jumping directly to the presentation controller. A custom `UIPresentationController` that injected an overridden size class or interface style into a presented `UIHostingController` can now be bypassed by an intermediate view, so an adaptive layout that used to arrive overridden may flip on first present. Set the override on a view in the presentation's superview chain instead.

### Placing a sheet in a wide or folded window

`presentationPlacement(_:)` (iOS 27.0) makes sheet position a layout decision instead of a system default. Only sheet presentations respect it.

```swift
private struct SideAnchoredSheet: ViewModifier {
    @Environment(\.horizontalSizeClass) private var hSizeClass

    func body(content: Content) -> some View {
        if #available(iOS 27.0, *), hSizeClass == .regular {
            content.presentationPlacement(.trailing)   // stays beside the pane that opened it
        } else {
            content                                     // pre-27 / compact: system default placement,
                                                        // sized with presentationSizing + detents
        }
    }
}
```

On a wide window, `.leading` or `.trailing` keeps a modal near its originating pane -- the same proximity principle the HIG applies to toolbar item placement -- and on a folding display it keeps the sheet clear of the fold. It also drives the sheet's toolbar axis on that hardware: the system presents the toolbar horizontally for centered or leading placements and vertically for trailing ones (`references/design/07-navigation-patterns.md#toolbars-on-a-folding-display`). `PresentationPlacement` itself and `.automatic` are cross-platform; `.center` / `.leading` / `.trailing` are iOS / iPadOS / Mac Catalyst only. Full modality ownership stays with `references/patterns/05-modality-sheets.md`.

## Foldable and continuously resizable surfaces

The HIG's "Designing for iPhone Duo" page is live now; the device ships 2026-10-23. Its central claim is that this is not a new platform -- "you're still designing for iPhone, and Designing for iOS patterns and best practices still apply" -- and the guidance is largely a restatement of discipline this file already teaches.

What the anatomy actually is: two displays with a centre hinge, three reserved regions (the always-present outer camera, the inner camera while active, and the folding region that divides the inner display when partly open), and system chrome that moves to the SIDE on the wide, short outer display. The size-class strategy Apple states: "A compact width layout for the outer display and a regular width layout for the inner display give you the fundamentals for every pose. Don't reinvent your app when it resizes; allow the existing layout to expand based on the available space instead." A `NavigationSplitView` expands on the inner display and collapses to a single pane on the outer one, exactly as it already adapts between regular and compact elsewhere.

The layout rules worth carrying into review now, none of which need new API:

- Prefer an **even number of columns** in a grid-style layout so content divides cleanly across the fold.
- "Avoid extreme layout changes as people fold the device. Move only what's necessary... favor small adjustments over rearrangement."
- Keep functionality and control positions consistent across poses. "Supporting the device's various poses doesn't mean designing a custom layout for each one."
- System components already adapt -- alerts, context menus, sheets and split views move themselves around the fold -- so custom layout is the only thing that needs help.

### The 27.1 beta API layer

Everything named below is **iOS 27.1 / iPadOS 27.1 and still carries Apple's beta flag as of 2026-09-22**. It is not in iOS 27.0, it exists on no other platform, and it belongs behind `#available(iOS 27.1, *)` with a `// beta: verify against the installed SDK` note -- never in a primary example. Standard size-class and safe-area layout is the entry ticket; this is the refinement layer.

| Surface | What it does | Hard rule |
|---|---|---|
| `ArrangementView` + `arrangementViewStyle(_:)` (`.split`, `.overlay`) | A two-child container that reorganizes primary and secondary content by display size, orientation and reserved regions. Split divides horizontally when wider than tall, vertically when taller than wide; overlay layers them and separates them either side of a partial fold. | "Keep navigation outside of arrangement views. An arrangement view lays out content but doesn't handle navigation, so place navigation containers like navigation split views and tab views around it rather than within it." An `ArrangementView` wrapping a `NavigationStack` is wrong. |
| `ReservedRegion` + `GeometryProxy.reservedRegions(kind:options:layoutDirectionBehavior:)` | Queries hardware-reserved areas: `.occlusion` (camera cutout) and `.division` (the fold). Regions carry a frame, margins, an ID, and an `isActive` flag -- the fold is active only while partly open, so a query is never static. | Safe areas generalized from edges to interior regions, and for **custom** components only. Reaching for it where a standard component already adapts is over-engineering. |
| `onHingeChange(isEnabled:_:)`, `DeviceHinge`, `DeviceHingeContext` | Delivers old/new hinge context; `DeviceHinge` carries an `angle` and a `status` (`.closed`, `.partiallyOpen`, `.fullyOpen`). | `DeviceHingeContext.hinge` is **optional and nil on every non-foldable device**, so any hinge-driven UI needs a real non-foldable path. Raw angle is the wrong default tool: use size classes and reserved regions for layout, and reserve `onHingeChange` for genuinely pose-specific behavior. |

Adoption test for `ArrangementView`, from the HIG: "Consider an arrangement view when your layout already resembles one" -- an `HStack`/`VStack` of two peers maps to split, a `ZStack` of two maps to overlay. Below the floor, the fallback is what this file already prescribes: `NavigationSplitView` where the relationship is navigational, a size-class-driven `AnyLayout` or `ViewThatFits` where it is not.

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
| Gating layout shape on `UIDevice.current.userInterfaceIdiom` or `UIScreen.main.bounds` | Wrong shape in Split View/Stage Manager/multi-window; bounds ignore the actual window, and under the iOS 27 SDK they stay fixed while the window resizes -- wrong even in a portrait-locked app | `horizontalSizeClass` for chrome, real geometry for internal arrangement |
| `UIRequiresFullScreen` or a portrait-only declaration used to avoid resizing | Neither gates continuous resizability under the iOS 27 SDK; `UIRequiresFullScreen` only changes resize delivery to discrete steps | Make the layout hold across the width range |
| `ArrangementView` wrapping a `NavigationStack` or `NavigationSplitView` | It lays out content and does not navigate; nesting navigation inside it can strand part of the view | Navigation containers go *around* the arrangement view |
| `#available(iOS 27, *)` on `ArrangementView` / `ReservedRegion` / hinge APIs | Those are iOS 27.1 and still beta -- a 27.0 check does not satisfy them, so the call site fails to compile ("only available in iOS 27.1 or newer") | `#available(iOS 27.1, *)`, kept out of primary examples |
| `.minimumScaleFactor(0.5)` as a general AX-overflow fix | Silently shrinks text back toward default, defeating the user's chosen size | Reflow/wrap first; reserve scale-factor for a genuinely fixed single-line container |
| Fixed 2-3 column `LazyVGrid` with no AX branch | Columns clip or crush content at AX3+ | Branch column count on `isAccessibilitySize`, or use `.adaptive(minimum:)` with a `@ScaledMetric` minimum |
| Plain `.lineLimit(2)` on a list row title | Row heights differ by content length → visible jitter | `.lineLimit(2, reservesSpace: true)` |

## Severity guide

CRITICAL: a layout that clips or truncates essential content at AX5 with no reflow path. HIGH: focus/edit state lost mid-interaction because a stateful child was branched with `if/else` instead of `AnyLayout`; a 27.1-beta foldable API shipped as a primary example or gated at `iOS 27`. MEDIUM: layout shape gated on device idiom or `UIScreen.main.bounds` instead of size class -- including in a portrait-locked app, since the iOS 27 SDK resizes it anyway. LOW: `ViewThatFits` reached for where `AnyLayout` was the correct, cheaper tool. NIT: a list row missing `reservesSpace: true` causing minor row-height jitter.

## See also

- `references/accessibility/02-dynamic-type-adaptation.md` -- Dynamic Type scale fundamentals, the 12 sizes, `@ScaledMetric` (owner)
- `references/cross-platform/01-ipados-multiplatform.md#choosing-the-top-level-shape` -- the concrete iPad top-level shape decision, pointer/hover, windowing (owner)
- `references/design/07-navigation-patterns.md#navigationsplitview-ios-16` -- base `NavigationSplitView` mechanics, `columnVisibility` (owner)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate for animated layout transitions (owner)
