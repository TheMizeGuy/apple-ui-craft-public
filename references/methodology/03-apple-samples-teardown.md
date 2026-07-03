# Apple Sample-Code and First-Party App Teardown

> Owner: `references/methodology/03-apple-samples-teardown.md` owns screen-COMPOSITION recipes -- how real Apple sample apps and first-party apps combine several individually-owned APIs into one working screen. Individual API mechanics (glass syntax, spring tuning, gesture state, SwiftData query semantics, the Reduce Motion accessor) are owned elsewhere; every recipe below cites its owner rather than re-teaching it.
> Floors: cite `references/_scaffolding/version-floor-registry.md` for anything version-gated. Every recipe states its floor inline since these are headline compositions, not incidental mentions.

An agent asked to "make this feel like a real Apple app" needs more than a list of correct APIs -- it needs to see how Apple assembles them into one screen. This file is reverse-engineered from Apple's sample-code apps (Landmarks, Backyard Birds, Destination Video) and from first-party app screens (Journal, Freeform, App Store, Fitness, Weather, Photos, Music), never from isolated snippets. If a recipe below only cites another file, that mechanic is already covered in depth there -- read this file for how the pieces combine, not for the pieces themselves.

## The Apple way

- One `@Observable` store, injected once at the scene root, read by type anywhere below it -- never passed down as an init parameter.
- The top-level navigation SHAPE is chosen by information architecture (list-selects-detail, peer sections, flat utility) and adapts on size class, never on device idiom or a second code path.
- Toolbars and floating controls group into shared-glass clusters; a lone `.glassEffect()` call is the exception, not the default.
- Every card, sheet, and hero surface uses continuous ("squircle") corners; a `.circular` corner at hero scale is the fastest tell of a non-Apple screen.
- Motion is compositor-safe (opacity/scale/offset/rotation) and springs, never `.easeInOut`, drive every interactive settle.
- A real screen exercises several APIs together -- grid + transition + toolbar + state -- never a single modifier shown in isolation. Every recipe below is extracted from a shippable app, not a toy snippet.

## Screen-composition recipes

### The adaptive collection: grid and peeking carousel

```swift
// iOS 17.0+
struct LandmarkGrid: View {
    private let columns = [GridItem(.adaptive(minimum: 160, maximum: 220), spacing: 16)]
    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(landmarks) { landmark in
                    NavigationLink(value: landmark) { LandmarkCard(landmark) }
                        .buttonStyle(.plain)                          // card, not a blue link
                        .matchedTransitionSource(id: landmark.id, in: ns)
                }
            }
        }
        .safeAreaPadding(.horizontal, 20)   // inset content without clipping the ScrollView itself
    }
}
```

`GridItem(.adaptive(minimum:maximum:))` is Apple's answer to "how many columns": the system computes the count for the available width -- 2 on iPhone, 4-5 on iPad -- so a grid never branches on size class for column count. A peeking horizontal carousel (the "one full card, next one peeking" row) uses proportional sizing instead of a fixed width:

```swift
ScrollView(.horizontal) {
    LazyHStack(spacing: 12) {
        ForEach(features) { feature in
            FeatureCard(feature)
                .containerRelativeFrame(.horizontal, count: 4, span: 3, spacing: 12)
        }
    }
    .scrollTargetLayout()
}
.scrollTargetBehavior(.viewAligned)
```

`count: 4, span: 3` reads as "divide the visible width into 4 lanes, each card spans 3" -- one full card plus a third of the next peeks in, at any screen size. `references/design/06-layout-spacing.md#container-relative-spacing-ios-17` owns the base modifier; the `count:span:` proportional form for carousels is this file's addition. `.matchedTransitionSource` / `.navigationTransition(.zoom)` wiring on the destination is owned by `references/animation/04-transitions-geometry.md#navigation-transition-with-matched-geometry-ios-18`.

### Liquid Glass chrome: toolbar groups, unions, and scroll edges

```swift
// iOS 26.0+
.toolbar {
    ToolbarSpacer(.flexible)                        // pushes trailing items right
    ToolbarItem { ShareLink(item: landmark) }
    ToolbarSpacer(.fixed)                            // starts a NEW glass group
    ToolbarItemGroup {                               // these two fuse into ONE glass capsule
        FavoriteButton(landmark)
        CollectionsMenu(landmark)
    }
}
```

Adjacent toolbar items already share one continuous glass capsule in iOS 26; `ToolbarSpacer` is the group DIVIDER, not decorative whitespace -- `.flexible` absorbs slack, `.fixed` starts a new capsule. Wrap actions that belong together in one `ToolbarItemGroup` inside a spacer-delimited region. An item that must not wear the shared glass (a status readout, a branded control) opts out with `.sharedBackgroundVisibility(.hidden)` on a `CustomizableToolbarContent` item. Never add `.glassEffect()` to a toolbar item yourself -- the toolbar already applies it, and manual glass double-renders.

Two glass mechanics `references/design/02-liquid-glass.md#glasseffectcontainer-multi-element-glass` doesn't cover: fusing views that are laid out separately into ONE glass shape uses `glassEffectUnion(id:namespace:)` inside the same container --

```swift
GlassEffectContainer(spacing: 20) {
    HStack(spacing: 20) {
        ForEach(0..<4) { i in
            Image(systemName: symbols[i]).frame(width: 80, height: 80)
                .glassEffect()
                .glassEffectUnion(id: i < 2 ? "left" : "right", namespace: glassNS)
        }
    }
}
```

-- distinct from `glassEffectID(_:in:)` (owned by `design/02`), which is morph IDENTITY across insert/remove, not a static merge of concurrently-visible views. And where scrolling content passes under a pinned glass bar, choose the boundary style explicitly: `.scrollEdgeEffectStyle(.soft, for: .top)` for photo-heavy screens that should feel continuous with the bar, `.scrollEdgeEffectStyle(.hard, for: .bottom)` where pinned controls must stay legible over a dense list (`for:` takes an `Edge.Set` -- top and bottom style independently).

### The scroll-driven hero collapse

```swift
// iOS 18.0+
@State private var scrollY: CGFloat = 0

ScrollView {
    VStack(spacing: 0) { HeroHeader(collapse: collapseProgress); content }
}
.onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y + $0.contentInsets.top }
    action: { _, y in scrollY = y }

var collapseProgress: CGFloat { min(1, max(0, scrollY / 180)) }
```

Interpolate every header property off the clamped 0...1 `collapse` value: font *size* (not `.scaleEffect`, which blurs text at intermediate sizes), padding, and an opacity fade tuned to outpace the size change so the subtitle disappears before the title fully pins. This is the general "hero + scrolling detail" primitive (an artist page, a place detail, a now-playing lyric view) -- distinct from the system tab-bar/toolbar auto-minimize covered in `references/animation/05-gesture-driven.md#scroll-driven-chrome-minimize-ios-26`, which hides system chrome; this drives a custom header you own and animate yourself.

### Docked-to-full glass morph

```swift
// iOS 26.0+
@Namespace private var glassNS
@State private var expanded = false

TabView { /* tabs */ }
    .tabViewBottomAccessory {
        GlassEffectContainer(spacing: 20) {
            MiniPlayerBar()
                .glassEffect(.regular, in: expanded ? .rect(cornerRadius: 32) : .capsule)
                .glassEffectID("player", in: glassNS)
        }
    }

Image(uiImage: artwork)
    .frame(width: expanded ? 300 : 44, height: expanded ? 300 : 44)
    .matchedGeometryEffect(id: "artwork", in: glassNS)
    .onTapGesture { withAnimation(.smooth(duration: 0.5)) { expanded.toggle() } }
```

The tell that separates this from a plain sheet: the SAME `withAnimation` block drives both the glass-shape morph (mechanics owned by `references/design/02-liquid-glass.md#glasseffectcontainer-multi-element-glass`) and the artwork's `matchedGeometryEffect` flight, frame-locked. `.tabViewBottomAccessory` itself is shown at `references/design/02-liquid-glass.md#tab-bar-with-glass`; this recipe is what to put inside it. Use `.smooth(duration: 0.5)` (no bounce) for a large glass surface -- a bouncy spring on that much area reads as toy-like; reserve bounce for small transport controls, per `references/animation/02-spring-physics.md#spring-presets`. Never hand-roll the morph with two stacked `.ultraThinMaterial` layers cross-fading -- it produces a visible double-blur seam; `GlassEffectContainer` exists precisely because glass doesn't stack on glass.

### The infinite canvas: a viewport transform

```swift
// iOS 17.0+
@State private var scale: CGFloat = 1
@State private var offset: CGSize = .zero
@GestureState private var pinch: CGFloat = 1
@GestureState private var pan: CGSize = .zero

var liveScale: CGFloat { min(max(scale * pinch, 0.25), 4) }

ZStack {
    ForEach(objects) { obj in ObjectView(obj).position(obj.canvasPosition) }   // fixed WORLD coordinate
}
.scaleEffect(liveScale)
.offset(x: offset.width + pan.width, y: offset.height + pan.height)
```

Never move individual objects -- position them once in canvas space and transform the whole layer. `@GestureState` with commit-on-`onEnded` is the general interruption-safe gesture pattern, owned by `references/animation/05-gesture-driven.md#why-gesturestate`; this file's addition is placing a tap at the correct WORLD coordinate at any zoom by inverting the transform:

```swift
let canvasPoint = CGPoint(x: (tap.x - offset.width) / scale, y: (tap.y - offset.height) / scale)
```

Anchor zoom to the pinch midpoint, not `.center`, so content doesn't slide out from under the fingers; clamp scale and rubber-band past the limits rather than hard-stopping. Do not reach for `ScrollView` plus a zoom scale for a truly unbounded 2D surface -- it assumes finite content and fights free placement. Generalizes to mind maps, floor planners, node graphs, seating charts.

### Press-scale hero cards and the interactive dismiss

```swift
// iOS 15.0+ for the ButtonStyle mechanic; the composition below is this file's addition
ZStack(alignment: .bottomLeading) {
    Image(story.cover).resizable().scaledToFill()
    LinearGradient(colors: [.clear, .black.opacity(0.55)], startPoint: .center, endPoint: .bottom)
    Text(story.title).font(.title.bold()).foregroundStyle(.white).padding(20)
}
.clipShape(.rect(cornerRadius: 20, style: .continuous))   // squircle -- .circular reads as non-Apple here
.shadow(color: .black.opacity(0.15), radius: 20, y: 10)
```

The press-in "give" is a `ButtonStyle`, never a tap gesture (so accessibility and press-cancel keep working) -- the scale/spring mechanics belong to `references/interaction/05-press-feedback-states.md#composable-capstone-pressablestyle`; this file's addition is the card itself: full-bleed cover, a scrim starting at `.center` so the photo's top stays clean, and `style: .continuous` on every card/sheet corner at this scale. Keep the detail's hero at the same aspect ratio and corner style as the card so a `.navigationTransition(.zoom)` interpolates without a visible "corner pop" at the midpoint.

For a full-screen media viewer, the square-reserve grid avoids the amateur tell of letterboxed or reflowing thumbnails:

```swift
Color.clear.aspectRatio(1, contentMode: .fill)
    .overlay { Thumbnail(asset).scaledToFill() }
    .clipped()
```

`Color.clear` plus `aspectRatio` reserves the exact square before the image decodes, so `LazyVGrid` never reflows as thumbnails stream in -- pairs with the virtualization guidance in `references/performance/02-scroll-list-performance.md#cell-stability`. The interactive drag-to-dismiss (shrink toward the source cell, dim the backdrop by `1 - progress`, release either back to full or into the reverse zoom) reads `predictedEndTranslation` for a velocity-aware release -- gesture mechanics owned by `references/animation/05-gesture-driven.md`. Never build this dismiss as a `.sheet`, which can't reverse-zoom into a specific source cell and loses the hero continuity.

### The custom progress ring

```swift
// iOS 16.0+
struct ActivityRing: View {
    var progress: Double   // 0...1+, values > 1 wrap past the top
    var gradient: AngularGradient
    var body: some View {
        ZStack {
            Circle().stroke(gradient.opacity(0.2), style: .init(lineWidth: 22))
            Circle().trim(from: 0, to: min(progress, 1))
                .stroke(gradient, style: .init(lineWidth: 22, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Move")
        .accessibilityValue("\(Int(progress * 100)) percent of goal")
    }
}
```

`lineCap: .round` gives the tip its shape (a butt cap reads as a generic gauge); `AngularGradient` over a flat color is what makes it glow; `.rotationEffect(-90)` starts the fill at 12 o'clock. Past 100%, redraw a tiny second trim rotated to the exact end angle with a drop shadow so the tip visibly overlaps the tail -- the detail every clone skips. Rings don't ease to value, they overshoot and settle: `withAnimation(.spring(response: 0.9, dampingFraction: 0.62)) { shown = target }` (spring choice owned by `references/animation/02-spring-physics.md#spring-presets`) -- the round cap sweeping past and back IS the "alive" feel. Use rings for "share of a goal"; use `references/design/09-swift-charts.md` marks for "value over time" -- the scrub-to-inspect detail chart (paged bars, a dashed `RuleMark` average, `chartXSelection` lollipop with `overflowResolution`) is already the worked example there and is not repeated here.

### Editorial timeline cards

```swift
// iOS 17.0+; scrollTransition mechanics owned elsewhere
RoundedRectangle(cornerRadius: 20, style: .continuous)
    .strokeBorder(LinearGradient(colors: accent, startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1)
    .opacity(0.5)
```

`strokeBorder` (inset), never `stroke` (straddles the edge, half the line clips at the rounded corner). A thin gradient stroke over a material -- not a fill -- signals "this is a suggestion" without shouting; reserve it for special rows and use a plain `.quaternary` hairline for ordinary ones. The scroll-reveal entrance (dim/small/offset below the fold, settle to identity) is the exact `.scrollTransition` phase contract already owned by `references/animation/04-transitions-geometry.md#scrolltransition-ios-17` -- this file adds only the card and the pinned date rail: `LazyVStack(pinnedViews: .sectionHeaders)` with `Section { ... } header: { ... }` keeps the date visible while its entries scroll under it.

## App architecture: one store, SwiftData beside it

Every current Apple sample -- Fruta, Food Truck, Backyard Birds, Destination Video, Landmarks -- wires the app the same way: one `@Observable` store, injected once at the scene root, read anywhere with `@Environment(Type.self)`. Wrapper mechanics (`@Bindable`, `@Entry`, tracking granularity) are owned by `references/performance/04-state-architecture.md#observable-runtime-semantics` and `#the-decision-table` -- this file's contribution is WHERE it lives and what it coexists with:

```swift
// iOS 17.0+
@main
struct LandmarksApp: App {
    @State private var modelData = ModelData()            // @State owns the single instance
    var body: some Scene {
        WindowGroup { RootView() }
            .environment(modelData)                        // inject ONCE, not per view
            .modelContainer(for: [BirdSpecies.self, Bird.self])   // SwiftData: persisted entities
    }
}
```

`@Model` / `@Query` own persisted domain entities and are already observable with zero `@Published` -- the full binding contract (predicate/sort composition, main-thread fetch hazards, dynamic search) is owned by `references/performance/08-swiftdata-ui.md#query-the-binding-primitive`. The `@Observable` store owns ephemeral SESSION state instead -- current selection, sheet flags, in-flight networking -- and both coexist on the same scene without conflict: if it must survive relaunch and is a domain object, it's `@Model`; if it's "what the user is looking at right now," it's the store. Passing either six levels down as an init parameter instead of reading it by type is the tell of hand-rolled, non-Apple-pattern SwiftUI.

## State-of-the-art benchmark checklist

Score a screen against these; each row is a recurring first-party structural signature, not a subjective taste call.

| Signal | Where first-party apps show it | Fails when |
|---|---|---|
| One `@Observable` store injected once at the scene root | App architecture, above | State threaded through 3+ levels of `init` parameters |
| Navigation SHAPE keyed to `horizontalSizeClass`, never device idiom | `references/cross-platform/01-ipados-multiplatform.md` | Branches on `UIDevice.current.userInterfaceIdiom` |
| Continuous corners (`style: .continuous`) on every card/sheet at hero scale | Press-scale hero cards, above | A `.circular`-cornered `RoundedRectangle` on a hero card |
| Every interactive settle uses a tuned spring, never `.easeInOut` | Activity ring overshoot, glass morph, drag-dismiss snap-back | `.easeInOut(duration:)` on a user-triggered transition |
| A designed screen exists for every HIG Pattern the flow touches -- onboarding, loading, empty, forms, settings, feedback | `references/patterns/` | A raw `ProgressView` standing in for a designed empty/error state |
| Glass reserved for floating chrome, never list rows or full-bleed backgrounds | Toolbar groups, mini-player morph, above | `.glassEffect()` on a `List` row or a screen-filling background |
| Every custom transition, parallax, or loop routes through one Reduce Motion accessor | Accessibility contract, below | A parallax or particle loop with no Reduce Motion branch |

0-2 rows pass: reads as a port or a prototype. 3-5: competent, has tells. 6-7: first-party feel.

## Availability + fallbacks

```swift
if #available(iOS 26, *) {
    // ToolbarSpacer / sharedBackgroundVisibility / GlassEffectContainer chrome grouping
    glassToolbar
} else {
    // Pre-26 fallback: .toolbarBackground(.regularMaterial, for: .navigationBar), no spacer grouping
    materialToolbar
}
```

The grid, carousel, viewport-transform, activity-ring, and gradient-card recipes above are iOS 16-18 and need no version branch. Only the glass-chrome recipes (toolbar grouping, `glassEffectUnion`, `scrollEdgeEffectStyle`, the docked-to-full morph) are iOS 26.0+ and need the `#available` gate with a Material-based fallback shown, never omitted.

## Accessibility contract

Every animated recipe above routes through the single `Animation?` / `nil` accessor owned by `references/accessibility/05-motion-accessibility.md#accessibility-contract` -- the scroll-reveal timeline card, the hero-collapse header's font/opacity interpolation, the activity ring's overshoot spring, and any parallax layered on the collapsing header all gate there; none of it is system-auto-gated. The one exception this file's recipes touch: the Liquid Glass specular highlight and the tab bar's default push/pop are the two motion surfaces the system already owns (per `design/02-liquid-glass.md#accessibility-auto-adaptation`) -- everything else in this file is the developer's obligation.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Branching layout on `UIDevice.current.userInterfaceIdiom` | Reads as an unported iPhone app the moment the user resizes | `horizontalSizeClass` or `.tabViewStyle(.sidebarAdaptable)` |
| Manual `.glassEffect()` on a toolbar item | The toolbar already applies glass; double-renders | Group with `ToolbarItemGroup` + `ToolbarSpacer`, let the toolbar own it |
| `RoundedRectangle` without `style: .continuous` on a hero card | Reads as non-Apple at card scale | `.continuous` on every card/sheet corner |
| A `.sheet` for a full-screen zoom-open detail | Can't reverse-zoom into a source cell; loses hero continuity | `.navigationTransition(.zoom(sourceID:in:))` |
| Moving individual objects in a canvas editor | No stable coordinate system; jump bugs on the second gesture | Transform ONE layer; keep objects in canvas space |
| A second stored property mirroring a derived value | Desyncs from the source; the classic "badge says N, list shows N-1" bug | Computed property, owned by `performance/04-state-architecture.md` |

## Severity guide

CRITICAL: n/a to this file directly -- see the owning API file's severity guide for compile-breaking or data-loss bugs surfaced through these recipes. HIGH: a signature first-party moment implemented with the wrong primitive entirely (a `.sheet` standing in for a zoom transition, a looping video standing in for `TimelineView` + `Canvas`) -- reads as fundamentally un-Apple, not merely rough. MEDIUM: the right primitive, missing the composition detail that sells it (a hero card without `style: .continuous`, an unmanaged toolbar spacing gap). LOW: a single benchmark-checklist miss on a screen that isn't part of the app's primary flow.

## See also

- `references/design/02-liquid-glass.md#glasseffectcontainer-multi-element-glass` -- glass container, morph, and tint mechanics this file composes into screens
- `references/animation/04-transitions-geometry.md#navigation-transition-with-matched-geometry-ios-18` -- the zoom transition used throughout the collection and card recipes
- `references/animation/05-gesture-driven.md` -- `@GestureState`, `MagnifyGesture`, and velocity-aware drag mechanics
- `references/performance/04-state-architecture.md#the-decision-table` -- property-wrapper ownership underneath the app-architecture recipe
- `references/performance/08-swiftdata-ui.md#query-the-binding-primitive` -- the full `@Query` binding contract the SwiftData composition recipe cites
- `references/interaction/05-press-feedback-states.md#composable-capstone-pressablestyle` -- the press-scale `ButtonStyle` used by hero cards
- `references/accessibility/05-motion-accessibility.md#accessibility-contract` -- the Reduce Motion accessor every animated recipe above routes through
- `references/methodology/04-whatsnew-sota-log.md` -- companion file: what changed in the OS since these patterns were extracted
- `~/Claude/vault/iOS Development/06 - SwiftUI Fundamentals.md` -- deep source
