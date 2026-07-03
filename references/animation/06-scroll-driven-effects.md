# Scroll-Driven Effects

> Owner: `references/animation/06-scroll-driven-effects.md` owns scroll-position-driven behavior -- the scroll-observation family (`onScrollGeometryChange`/`onScrollPhaseChange`/`onScrollVisibilityChange`), scroll targeting (`scrollTargetBehavior`/`scrollTargetLayout`/`scrollPosition`/`containerRelativeFrame`/`contentMargins`), and composite patterns (peeking carousels, sticky/stretchy headers, pull-to-refresh). `.scrollTransition`/`.visualEffect` API basics live at `references/animation/04-transitions-geometry.md#scrolltransition-ios-17` (OWNER); system chrome auto-minimize (`TabBarMinimizeBehavior`/`ToolbarMinimizeBehavior`) lives at `references/animation/05-gesture-driven.md#scroll-driven-chrome-minimize-ios-26` (OWNER) -- this file is the effects you build ON TOP of scroll position, not those two.
> Floors: cite `references/_scaffolding/version-floor-registry.md#ios-180` for the iOS 18 scroll-observation additions; `.scrollTransition`/`scrollTargetBehavior`/`containerRelativeFrame` are iOS 17.0+.

Scroll offset is a continuous, per-frame signal -- the only way a scroll-linked effect stays at 120fps on ProMotion is picking an API that never triggers a layout pass, and never attaching an animation to the `ScrollView`/`List` container itself. Get those two rules wrong and every scroll-linked effect on the screen jank simultaneously, not just the one you added.

## The Apple way

- Compositor-safe, render-only transforms only: `.visualEffect`/`.scrollTransition` read geometry and return `opacity`/`scale`/`rotation`/`offset` without a layout pass. A `GeometryReader`-driven header re-runs layout every scroll frame and drops to ~40fps on long lists -- never use it for scroll-linked motion. Cost table (`.blur`/`.shadow` radius per frame is the same expensive-off-screen-pass trap as elsewhere): `references/animation/01-animation-fundamentals.md#animation-cost-layout-vs-render` (OWNER).
- Observe scroll state at the coarsest grain that expresses your intent: `onScrollGeometryChange` with a derived `Equatable` type fires only when THAT value changes, not on every offset tick.
- **Never attach `.animation(_:value:)` to the `ScrollView`/`List` container itself.** It animates the entire subtree -- every row's geometry AND the live scroll offset -- against a value a real finger is simultaneously driving via the scroll gesture. Scope any animation to the specific leaf/overlay that should animate.
- Snapping and paging (`scrollTargetBehavior`) is a POSITION change, not decoration -- it stays on under Reduce Motion. Only the decorative scale/opacity riding on top of the snap (a `.scrollTransition` dim on off-center cards) is gated.

## The scroll-observation family (iOS 18+)

| API | Fires | Use for |
|---|---|---|
| `onScrollGeometryChange(for:of:action:)` | Only when YOUR derived `Equatable` value changes | Coarse derived state ("scrolled past top": `Bool`) |
| `onScrollPhaseChange(_:)` | On `ScrollPhase` transitions: `.idle`/`.tracking`/`.interacting`/`.animating`/`.decelerating` | Start/stop lifecycle -- dismiss keyboard, pause/resume autoplay, fire analytics |
| `onScrollVisibilityChange(threshold:_:)` | When a CHILD view crosses `threshold` fraction on/off screen | Per-item autoplay-when-mostly-visible (attach to the child, not the `ScrollView`) |

```swift
// Coarse derived state -- fires only on the Bool flip, not every offset tick
.onScrollGeometryChange(for: Bool.self) { geometry in
    geometry.contentOffset.y > geometry.contentInsets.top
} action: { _, isScrolled in scrolledPastTop = isScrolled }

// Lifecycle -- the correct place to dismiss keyboard or pause video, NOT onScrollGeometryChange
.onScrollPhaseChange { _, newPhase, _ in
    if newPhase == .interacting || newPhase == .decelerating { hideKeyboard() }
}

// Per-row autoplay (TikTok/Reels-style feed)
VideoCell(item: item)
    .onScrollVisibilityChange(threshold: 0.6) { isVisible in
        isVisible ? player.play() : player.pause()
    }
```

**Gotcha:** `onScrollGeometryChange`/`onScrollPhaseChange` observe the FIRST scroll view in the hierarchy. With nested scroll views, attach the modifier as close as possible to the specific `ScrollView` you mean -- only the outer one reports, and a runtime issue is logged.

## Snapping and paging

```swift
@State private var scrolledID: Item.ID?

ScrollView(.horizontal) {
    LazyHStack(spacing: 16) {
        ForEach(items) { item in
            CardView(item: item)
                .containerRelativeFrame(.horizontal)     // each card == viewport width
        }
    }
    .scrollTargetLayout()                                // children are snap targets
}
.scrollTargetBehavior(.viewAligned)                       // snap to nearest card
.scrollPosition(id: $scrolledID)                          // two-way: read + programmatic jump
.contentMargins(.horizontal, 24, for: .scrollContent)     // peek adjacent cards -- NOT padding, see below
```

`.contentMargins(_:_:for:)` (iOS 17+) insets the SCROLLABLE CONTENT region so `.viewAligned` snapping still centers correctly and scroll indicators stay right. Padding on the stack shifts content visually but snap alignment still targets the un-padded edges -- cards land off-center by the padding amount.

`ViewAlignedScrollTargetBehavior.LimitBehavior` controls how far a fling can travel: `.automatic`, `.always`, `.never`, `.alwaysByFew`, `.alwaysByOne`. Switching a paging carousel from `.automatic` to `.viewAligned(limitBehavior: .alwaysByOne)` fixes the #1 carousel complaint ("it flew past the card I wanted") with zero custom code -- a fast fling still advances exactly one card.

For fling-velocity-aware snapping to a fixed pitch (a filmstrip, a ruler), write a custom `ScrollTargetBehavior`:

```swift
struct SnappyPitch: ScrollTargetBehavior {
    let itemWidth: CGFloat
    func updateTarget(_ target: inout ScrollTarget, context: ScrollTargetBehaviorContext) {
        var index = (target.rect.origin.x / itemWidth).rounded()
        let v = context.velocity.dx                               // pt/s, exit velocity
        if abs(v) > 300 {                                          // dead-band: slow drags never over-travel
            index += CGFloat(v > 0 ? 1 : -1) * CGFloat(min(4, Int(abs(v) / 900)))  // capped, ~1 item per 900 pt/s
        }
        target.rect.origin.x = index * itemWidth
    }
}
```

`context.velocity` is the exit velocity of the scroll gesture; `context.originalTarget` is where the system's own deceleration would have landed. Snapping is a POSITION change and stays on under Reduce Motion -- only a decorative `.scrollTransition` riding on top gates.

## Composite pattern: peeking, dimming carousel

Combine snapping with `.scrollTransition` to make the centered card read as "lifted" and neighbors as "waiting" (the App Store / Photos memories feel):

```swift
CardView(item: item)
    .containerRelativeFrame(.horizontal)
    .scrollTransition { content, phase in
        content
            .scaleEffect(reduceMotion ? 1 : (phase.isIdentity ? 1 : 0.90))
            .opacity(reduceMotion ? 1 : (phase.isIdentity ? 1 : 0.55))
    }
```

Peek width ~24-40pt; below ~16pt reads as a rendering glitch, above roughly half a card competes visually with the centered one. Neighbor scale 0.88-0.93 paired with an opacity dim (0.5-0.65) -- scale alone is too subtle on small cards.

## Composite pattern: sticky and stretchy headers

True sticky section headers are `pinnedViews`, not manual offset math:

```swift
ScrollView {
    LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
        Section { ForEach(section.rows) { RowView($0) } } header: {
            SectionHeader(section).background(.bar)   // opaque so rows don't ghost through
        }
    }
}
```

Layer elastic stretch onto a pinned header with `.visualEffect` (render-only, no layout pass) so it's pinned while scrolling up but stretches on an over-pull:

```swift
SectionHeader(section).visualEffect { content, proxy in
    let minY = proxy.frame(in: .scrollView).minY
    return content.scaleEffect(minY > 0 ? 1 + minY / 500 : 1, anchor: .bottom)
}
```

## Composite pattern: pull-to-refresh

**Tier 1 -- native, use by default:** `.refreshable { await store.reload() }` on `List`/`ScrollView` (iOS 16+) draws the system spinner, elastic drag, and threshold haptic for free, matching the OS exactly. Do not rebuild this without a concrete reason (a branded indicator, gamified pull).

**Tier 2 -- custom elastic pull**, when you need branded artwork: pulling down at the top makes `contentOffset.y` go negative; that magnitude is your pull distance.

```swift
.onScrollGeometryChange(for: CGFloat.self) { geo in
    max(0, -(geo.contentOffset.y + geo.contentInsets.top))
} action: { _, distance in
    pull = distance
    let nowArmed = distance >= threshold   // ~90pt
    if nowArmed != armed { armed = nowArmed }   // edge-triggered, not every frame
}
.sensoryFeedback(.impact(flexibility: .rigid, intensity: 0.7), trigger: armed) { _, now in now }
```

Three beats make it read as Apple-native: (1) the head height tracks the raw pull distance 1:1 below threshold -- true elastic reveal, not a delayed spinner; (2) exactly ONE rigid haptic fires on the `armed` edge (false to true), never continuously while past threshold; (3) the indicator interpolates from `progress = pull / threshold` (rotate/fill), only switching to an indeterminate spin once the refresh actually commits. `SensoryFeedback` API depth: `references/haptics/02-swiftui-sensory-feedback.md#pull-to-refresh`.

## Reduce Motion

Split every scroll-driven effect into STRUCTURAL (stays on: peek insets, pinned headers, snap points, the refresh action itself -- these are affordances, not decoration) and DECORATIVE (gates: scale/opacity/rotation/parallax riding on scroll position):

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

.scrollTransition { content, phase in
    content
        .scaleEffect(reduceMotion ? 1 : (phase.isIdentity ? 1 : 0.9))
        .opacity(phase.isIdentity ? 1 : (reduceMotion ? 1 : 0.55))
}
```

Content is never hidden under Reduce Motion -- the card/row/header still appears and disappears, just without the flourish. Full double-gate contract and substitution catalog (OWNER): `references/accessibility/05-motion-accessibility.md`. Haptics are governed by the system Sounds & Haptics setting, not Reduce Motion -- do not suppress the pull-to-refresh threshold haptic under RM.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `.blur(radius:)` or animated `.shadow` inside `.scrollTransition`/`.visualEffect` | Off-screen render pass every scroll frame -- the top cause of scroll-list hitches | Opacity/scale/offset only; animate a pre-blurred static layer if blur is needed |
| `.animation(_:value:)` on the `ScrollView`/`List` itself | Animates row geometry AND live scroll offset against a value the finger is driving -- visible jank | Scope the animation to the specific leaf/overlay |
| `GeometryReader`-driven header instead of `.visualEffect` | Forces a layout pass every frame | `.visualEffect { content, proxy in ... }` -- render-only |
| Padding on the `LazyHStack` for a peek carousel | Snap alignment still targets the un-padded edges -- cards land off-center | `.contentMargins(_:_:for: .scrollContent)` |
| Firing a haptic every frame while past the pull-to-refresh threshold | Machine-gun buzz | Gate on the `armed` boolean EDGE (false to true) only |
| `onScrollGeometryChange` with a fine-grained (non-coarse) `Equatable` | Fires every offset tick, defeats the point of the API | Derive a coarse `Bool`/rounded `Int` |
| Manual `onScrollPhaseChange(.decelerating -> .idle)` + `scrollTo(id:)` for snapping | Fires AFTER the scroll settles -- visible "stop, then jump" two-stage jank | `ScrollTargetBehavior.updateTarget` redirects the landing DURING deceleration -- one continuous motion |

## Severity guide

- **HIGH**: animated `.blur`/`.shadow` radius keyed to scroll position, or `.animation(_:value:)` attached directly to a `ScrollView`/`List` -- both are shipped scroll-hitch causes, not style nits.
- **MEDIUM**: `GeometryReader`-driven scroll effect where `.visualEffect` would be render-only; missing Reduce Motion gate on a decorative scroll-transition (structural snapping/pinning is unaffected).
- **LOW**: peek width or neighbor-scale outside the 24-40pt / 0.88-0.93 house convention; haptic intensity/flexibility choice on the pull-to-refresh threshold.

## See also

- `references/animation/04-transitions-geometry.md#scrolltransition-ios-17` -- `.scrollTransition` base API, `ScrollTransitionConfiguration` (OWNER)
- `references/animation/04-transitions-geometry.md#visual-effects-ios-17` -- `.visualEffect` base API (OWNER)
- `references/animation/05-gesture-driven.md#scroll-driven-chrome-minimize-ios-26` -- `TabBarMinimizeBehavior`/`ToolbarMinimizeBehavior` system chrome (OWNER)
- `references/animation/01-animation-fundamentals.md#animation-cost-layout-vs-render` -- compositor-safe vs expensive property cost table (OWNER)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate contract (OWNER)
- `references/haptics/02-swiftui-sensory-feedback.md#pull-to-refresh` -- `SensoryFeedback` threshold-haptic API
- `~/Claude/vault/iOS Development/81 - SwiftUI Animation Deep Dive.md`
