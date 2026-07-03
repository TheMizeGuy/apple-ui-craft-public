# Fluid Transitions & Shared-Element Continuity

> Owner: `references/interaction/02-fluid-transitions.md` owns **interactive, gesture-scrubbed transitions** (a finger driving continuous progress rather than a discrete state flip) and **landing choreography** -- z-order during flight, staggered hero-then-secondary reveal, and the interruptibility contract transition-adjacent code must honor. `matchedGeometryEffect` / `.navigationTransition(.zoom)` API mechanics and their Reduce Motion fallbacks are owned by `references/animation/04-transitions-geometry.md`. Liquid Glass shared-element morphing (`glassEffectID`/`glassEffectTransition`) is owned by `references/design/02-liquid-glass.md#glasseffectcontainer-multi-element-glass`. The retargeting mechanism behind "interruptible" is owned by `references/interaction/01-fluid-smoothness-interruptible.md`.
> Floors: see `references/_scaffolding/version-floor-registry.md#ios-180` for `.navigationTransition(.zoom)`/`matchedTransitionSource`; `#ios-170` for `DragGesture.Value.velocity`.

Shared-element continuity is the difference between "a new screen appeared" and "the thing I tapped BECAME the screen." Getting the API call right (`.navigationTransition(.zoom)`, `matchedGeometryEffect`) is necessary but not sufficient -- the feel lives in three things the API doesn't do for you: which layer draws on top during flight, how the destination's content arrives, and whether the whole thing can be grabbed and reversed mid-transition.

## The Apple way

- Pick the shared-element tool by what's actually moving: a navigation/present hero uses `.navigationTransition(.zoom)`; an arbitrary same-screen geometry swap uses `matchedGeometryEffect`; Liquid Glass surfaces merging or splitting use `GlassEffectContainer` + `glassEffectID`. Never hand-roll a glass morph with `matchedGeometryEffect` -- it exists for exactly this and batches the offscreen sampling passes the naive version would pay per-element.
- The element in motion is always the top layer until it settles. SwiftUI does not guarantee the inserting view renders above the removing one during a swap, so an un-pinned `zIndex` can flash the outgoing view over the incoming one for a few frames.
- Content arrives in a wave, not all at once: the hero leads with zero delay, secondary content (title, body, controls) trails by 40-60ms per tier, total wave under ~150ms. A detail screen that dumps everything in the same instant reads as flat, not composed.
- Anything a finger can scrub -- not just tap to trigger -- is progressively committed: the transition tracks a bound `progress` while dragging and resolves to 0 or 1 on release, the same shape as the system's own edge-swipe-back.

## The interruptibility contract for transitions

Apple's own transitions are continuously interactive: a `.zoom` push or present can be grabbed, reversed, and re-triggered at any frame. That has two consequences for the code AROUND the transition, not just the animation itself:

1. **Transition-adjacent code must be re-entrant.** A transition can start while a previous one is still animating. State mutated in `onAppear`/`onDisappear`/`.task` around a hero must be idempotent -- never assume a dismiss "finished" before the next present begins.
2. **Never block the main thread during a transition.** Image decode, JSON parsing, or a Core Data fetch on the transition's frames drops frames the user feels as the hero "catching." Decode and prefetch BEFORE the tap; the transition thread should only composite. This is the same render-server-handoff discipline as `references/interaction/01-fluid-smoothness-interruptible.md#the-two-animation-models----why-one-survives-a-busy-main-thread-and-the-other-doesnt` applied to the surrounding code, not just the animated properties.

Two concrete gotchas that break this in practice: a `@Namespace` declared INSIDE a screen that SwiftUI rebuilds during navigation won't match on the return leg -- declare it once at a stable parent and thread the `Namespace.ID` down. And a recycled `LazyVStack`/`LazyVGrid` row that scrolled off-screen has no frame left to zoom back into, so the dismiss silently degrades to a cross-dissolve -- keep the source alive, or accept the fallback deliberately rather than by surprise.

## Choreographing the landing

### Pin z-order so the incoming view never flashes underneath

```swift
// iOS 13+. The element in flight is always the top layer.
ForEach(cards) { card in
    CardView(card: card)
        .transition(.scale.combined(with: .opacity))
        .zIndex(card == selected ? 1 : 0)   // active/incoming card stays on top
}
.animation(.spring(duration: 0.4, bounce: 0.2), value: selected)
```

For a hero flying from a grid into an overlay, the flying element needs the highest `zIndex` on screen or it clips behind siblings and nav chrome mid-flight.

### Stagger secondary content behind the hero

```swift
// Hero (image) is already placed by the zoom/match; secondaries trail in a short wave.
@State private var revealed = false

VStack(alignment: .leading, spacing: 16) {
    HeroImage()
    Text(title).font(.largeTitle)
        .opacity(revealed ? 1 : 0).offset(y: revealed ? 0 : 12)
        .animation(.spring(duration: 0.4, bounce: 0.15).delay(0.05), value: revealed)
    Text(body)
        .opacity(revealed ? 1 : 0).offset(y: revealed ? 0 : 12)
        .animation(.spring(duration: 0.4, bounce: 0.15).delay(0.10), value: revealed)
}
.onAppear { revealed = true }
```

Sequence the reveal AFTER the hero flight commits, not against it -- starting the secondary wave while `.zoom`/`matchedGeometryEffect` is still traveling reads as two motions fighting. On exit, reverse the wave: secondaries leave first (fast), the hero leaves last, so the screen collapses cleanly back into its source. `.asymmetric(insertion:removal:)` makes this explicit when the two directions genuinely differ.

## Interactive, gesture-scrubbed transitions

`.navigationTransition(.zoom)` gives pinch/drag-to-dismiss and velocity-tracking interactivity for free -- reach for a hand-built interactive transition only for same-screen expansion where no navigation/presentation boundary exists, or when you need bespoke composited effects `.zoom` doesn't provide. The pattern is one bound scalar that both the finger and every visual effect read, so the whole thing scrubs, reverses, and can be re-grabbed mid-settle with zero transition-controller boilerplate:

```swift
// iOS 17+ (DragGesture.Value.velocity).
@Environment(\.accessibilityReduceMotion) private var reduceMotion
@State private var progress: CGFloat = 0        // 0 = collapsed, 1 = expanded
@GestureState private var live: CGFloat = 0
let travel: CGFloat = 400

var p: CGFloat { min(1, max(0, progress + live / travel)) }

DetailCard()
    .scaleEffect(0.85 + 0.15 * p)
    .opacity(0.4 + 0.6 * p)
    .offset(y: (1 - p) * 120)
    .gesture(
        DragGesture(minimumDistance: 0)
            .updating($live) { v, s, _ in s = -v.translation.height }
            .onEnded { v in
                // Light momentum projection (0.10); the full deceleration-matched formula is
                // references/interaction/03-direct-manipulation-drag.md#momentum-projecting-the-throw.
                let projected = (-v.translation.height - v.velocity.height * 0.10) / travel
                let complete = progress + projected > 0.5
                withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.84)) {
                    progress = complete ? 1 : 0
                }
            }
    )
```

Every effect reads `p`, which folds in the live drag -- there is no separate "animate to state" path fighting the gesture; the transition IS the interpolation. The release decision is velocity-projected (as in `references/interaction/03-direct-manipulation-drag.md#momentum-projecting-the-throw`), not a raw position threshold, so a quick flick completes from 20% and a slow drag-to-60%-then-hold cancels. Because `progress` is spring-animated and a fresh `DragGesture` immediately writes `live` on top of it, a user can catch the settling card mid-flight -- the same re-grab guarantee `references/interaction/01-fluid-smoothness-interruptible.md` covers for any interruptible spring. This is a distinct mechanism from the iOS 17+ `Transition` protocol (`body(content:phase:)`): that protocol governs insertion/removal choreography and is NOT finger-scrubbable; reach for the bound-`progress` pattern whenever a drag must control the transition continuously.

## Preserving the system back-swipe

The single most common way apps quietly break transition feel: replacing the system back button (`.navigationBarBackButtonHidden(true)`, a custom `leftBarButtonItem`) auto-disables `interactivePopGestureRecognizer` -- the edge-pan that pops the top view controller. The push/pop still works via the button, but the muscle-memory swipe-from-left-edge is gone, and users read the app as "broken" without knowing why.

Prefer not hiding the back button at all -- add chrome via `.toolbar { ToolbarItem(placement: .topBarLeading) { ... } }` instead, which leaves the system button (and its gesture) intact. When you must fully replace it, bridge once to re-arm the recognizer's delegate:

```swift
final class NavCoordinator: NSObject, UIGestureRecognizerDelegate {
    weak var nav: UINavigationController?
    // MUST implement, or the gesture can fire on the root with nothing to pop and the stack deadlocks.
    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        (nav?.viewControllers.count ?? 0) > 1
    }
}
// Attach nav.interactivePopGestureRecognizer?.delegate = coordinator once the pushed screen appears.
```

The leading edge is sacred: never attach a plain `DragGesture`/`UIPanGestureRecognizer` there that consumes horizontal drags, or the custom gesture eats the system pop. For a horizontal `DragGesture` elsewhere on the screen, gate on `abs(translation.width) > abs(translation.height)` and a start point away from the leading ~20pt so a diagonal or edge-adjacent gesture doesn't fight the pop.

## Reduce Motion

Nothing in this file is system-auto-gated -- auto-gating covers only Glass specular highlights, the default push/sheet transition, and one-shot discrete symbol effects. Every hero flight, staggered reveal, and scrubbed transition here is a developer gate. Split effects into ESSENTIAL (the view must still appear/disappear -- keep) and DECORATIVE (scale flourish, parallax offset, stagger delay -- drop):

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion
withAnimation(reduceMotion ? nil : .spring(duration: 0.4, bounce: 0.15).delay(delay), value: revealed)
.offset(y: (revealed || reduceMotion) ? 0 : 12)
```

The interactive pop/scrub itself is direct manipulation and stays under Reduce Motion -- what changes is the underlying transition's flavor (cross-fade instead of slide/parallax) and the completion tail (shortened, not removed). Keep the `zIndex` pin regardless of Reduce Motion -- it prevents a visual flash and is correctness, not motion. For navigation push/pop specifically, `accessibilityPrefersCrossFadeTransitions` (iOS 26.4+) is a SEPARATE, stricter sub-toggle from base Reduce Motion -- full mechanics and the pre-26.4 UIKit fallback: `references/animation/04-transitions-geometry.md#accessibilitypreferscrossfadetransitions-ios-264----a-separate-stricter-preference`. Full substitution catalog: `references/accessibility/05-motion-accessibility.md` (OWNER).

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `@Namespace` declared inside the destination screen | SwiftUI rebuilds navigation views during a transition; the namespace never matches | Declare once at a stable parent, thread `Namespace.ID` down |
| Decoding/parsing inside `onAppear` during a hero flight | Blocks the main thread on the transition's own frames -- the hero "catches" | Prefetch before the tap; the transition thread should only composite |
| Destination content appears all at once | Reads as flat, not composed | Hero leads, secondaries trail 40-60ms each, total wave under ~150ms |
| Position-threshold commit on a scrubbed transition (`progress > 0.5`) | Ignores intent -- a fast flick at 20% should still complete | Decide on the velocity-projected landing, not raw position |
| Custom back button with no `interactivePopGestureRecognizer` fix | Kills the edge-swipe-back muscle memory | Prefer leaving the system back button; bridge the delegate when you can't |

## Severity guide

- **CRITICAL** -- the leading-edge swipe-back is silently disabled app-wide by a custom back button, with no fix applied.
- **HIGH** -- a hero transition blocks the main thread on image decode/JSON parse during flight, producing a visible catch on every navigation.
- **MEDIUM** -- destination content arrives in one instant instead of a staggered wave; a scrubbed transition decides commit/cancel on raw position instead of projected velocity.
- **LOW** -- z-order not pinned on a rare, low-frequency transition where the flash is barely visible.

## See also

- `references/animation/04-transitions-geometry.md#navigation-transition-with-matched-geometry-ios-18` -- `.navigationTransition(.zoom)` / `matchedGeometryEffect` API and parameters (OWNER)
- `references/design/02-liquid-glass.md#glasseffectcontainer-multi-element-glass` -- Liquid Glass shared-element morphing (OWNER)
- `references/interaction/01-fluid-smoothness-interruptible.md` -- the retargeting mechanism behind "interruptible," `Transaction.tracksVelocity` (OWNER)
- `references/interaction/03-direct-manipulation-drag.md#momentum-projecting-the-throw` -- velocity-projection math shared with the scrubbed-transition commit decision (OWNER)
- `references/accessibility/05-motion-accessibility.md` -- full Reduce Motion substitution catalog (OWNER)
- `~/Claude/vault/iOS Development/81 - SwiftUI Animation Deep Dive.md#transitions`
