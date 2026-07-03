# Reduce Motion and Symbol-Effect Gating

> Owner: `references/accessibility/05-motion-accessibility.md` owns the Reduce Motion double-gate contract, the full motion-substitution catalog, and looping-effect gating (symbol effects, `PhaseAnimator`, `KeyframeAnimator`) for every reference file in this plugin. Every animation/interaction/design file that touches motion points here for the deep contract -- this file states it once.
> Floors: cite `references/_scaffolding/version-floor-registry.md#ios-26x` for version-gated members. Stated inline: `accessibilityPrefersCrossFadeTransitions` = iOS 26.4+ (the one writable accessibility environment member).

Reduce Motion does not mean "no animation" -- it means no vestibular-trigger motion: large-field slides, zoom-from-a-point, continuous rotation, spring overshoot, parallax, particle loops. The system auto-gates almost nothing; nearly every animation, transition, and looping effect in a SwiftUI app is the developer's responsibility to gate, and the single most common failure is gating one call site (`withAnimation`) while a sibling `.animation(_:value:)` on the same property keeps animating.

## The Apple way

- Read `@Environment(\.accessibilityReduceMotion)` and branch to a reduced substitute for every non-essential motion. Direct manipulation (a finger dragging a sheet, a 1:1 pan) is essential feedback and is never gated -- only the release/settle animation is.
- Route every animated call site -- explicit (`withAnimation`) and implicit (`.animation(_:value:)`) -- through one shared `Animation?` accessor. `Animation` has no `.identity`; `nil` is the only valid "off" value. `AnyTransition`/`ContentTransition` are the opposite: their off-value IS `.identity`.
- The system auto-gates exactly two things: the Liquid Glass specular highlight, and one-shot discrete symbol effects (`.bounce`, `.appear`) fired via `value:`. **"Sheet and push transitions auto-crossfade under Reduce Motion" is a persistent, false claim** -- a bare `NavigationStack` push under `accessibilityReduceMotion` alone still slides at its normal speed. Crossfade for navigation is a separate, opt-in preference (below).
- Looping symbol effects, every custom `.transition`/`matchedGeometryEffect`/`.navigationTransition(.zoom)`, `.scrollTransition`/`.visualEffect` parallax, and every `PhaseAnimator`/`KeyframeAnimator` loop are 100% developer-owned. Nothing above stops on its own.

## Accessibility contract

Centralize the reduced/full decision in one accessor so `grep` proves coverage, instead of scattering `reduceMotion ? nil : ...` at every call site:

```swift
// iOS 14+ (accessibilityReduceMotion). One vocabulary, returns Animation?.
enum AppMotion {
    // nil under Reduce Motion is the sentinel -- Animation has NO .identity.
    static func standard(_ reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .spring(duration: 0.4, bounce: 0.2)
    }
    static func snappy(_ reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .snappy(duration: 0.3)
    }
    // When a hard cut reads as broken and a brief fade is preferable to nothing:
    static func gentle(_ reduceMotion: Bool) -> Animation? {
        reduceMotion ? .easeInOut(duration: 0.15) : .spring(duration: 0.4, bounce: 0.3)
    }
}

// A ViewModifier that reads the environment itself, so call sites can't forget to gate.
struct AnimationIfAllowed: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let animation: Animation
    let value: AnyHashable
    func body(content: Content) -> some View {
        content.animation(reduceMotion ? nil : animation, value: value)
    }
}
extension View {
    func animationIfAllowed(_ animation: Animation, value: some Hashable) -> some View {
        modifier(AnimationIfAllowed(animation: animation, value: AnyHashable(value)))
    }
}

extension AnyTransition {
    /// Full transition normally; a plain crossfade under Reduce Motion.
    static func motionSafe(_ full: AnyTransition, reduceMotion: Bool) -> AnyTransition {
        reduceMotion ? .opacity : full
    }
}
```

Both call sites of a value must route through the same accessor -- this is the double-gate:

```swift
struct Drawer: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isOpen = false

    var body: some View {
        Panel()
            .offset(x: isOpen ? 0 : -300)
            .transition(.motionSafe(.move(edge: .leading).combined(with: .opacity), reduceMotion: reduceMotion))
            .animation(AppMotion.standard(reduceMotion), value: isOpen)   // declarative site
            .onTapGesture {
                withAnimation(AppMotion.standard(reduceMotion)) { isOpen.toggle() }  // imperative site -- SAME accessor
            }
    }
}
```

Two gotchas that waste hours:

- **`App.body` returns `Scene`, not `View`.** `@Environment(\.accessibilityReduceMotion)` read on the `@main App` struct reads the environment's DEFAULT (`false`), never the live value. Extract the transitioning content into a small `View` subview and read the key there.
- **Never gate direct manipulation.** The live 1:1 `.offset` tracking a `DragGesture` in real time is not decorative motion -- gating it breaks the touch itself. Gate only the release settle/spring-back, exactly like a system sheet's own drag-to-dismiss (which Apple does not disable under Reduce Motion either).

## Three tools for suppressing an animation -- pick the narrowest that works

A gate that "doesn't take" is almost always the wrong tool for the job, not a missing branch:

| Tool | Scope | Use when |
|---|---|---|
| `.animation(nil, value: x)` | One value, one view | Default choice -- the everyday Reduce Motion gate |
| `.transaction { $0.animation = nil }` | Every animation flowing through this subtree | Neutralizing an ancestor's `withAnimation` you don't own (e.g. a third-party view) |
| `Transaction.disablesAnimations = true` | Actively suppresses -- wins even over a downstream `.animation(_:value:)` that would re-insert its own animation on the same change | A declarative `.animation(spring, value:)` keeps re-adding motion on every update and `animation = nil` alone isn't beating it |

```swift
// Scoped transaction (iOS 17+ value: overload avoids flattening unrelated updates):
.transaction(value: isOpen) { t in
    if reduceMotion { t.disablesAnimations = true }
}
```

## Looping effects are never auto-gated

Discrete, one-shot symbol effects (`.bounce`, `.appear` fired via `value:`) are the ONE thing the system reduces automatically. Anything indefinite -- `.pulse`, `.variableColor.iterative`, `.breathe`, `.rotate` with `options: .repeating` -- keeps looping under Reduce Motion unless you gate it yourself, via the effect's own `isActive:`, never a branching `if reduceMotion { staticImage } else { animatedImage }` (that remounts the view and causes spurious transitions; `isActive: false` keeps the same view mounted and the effect simply stops on its rest frame):

```swift
Image(systemName: "dot.radiowaves.left.and.right")
    .symbolEffect(.variableColor.iterative, options: .repeating, isActive: isSearching && !reduceMotion)

// Strip every symbol effect from a subtree at once (iOS 17+):
DecorativeIconStrip().symbolEffectsRemoved(reduceMotion)
```

Full symbol-effect catalog and rendering modes: `references/design/05-sf-symbols.md#symbol-effects-and-reduce-motion`.

`PhaseAnimator` and `KeyframeAnimator` loops follow the same rule -- freeze on a resting phase, don't just stop cold, and cancel any `Timer.publish(...).autoconnect()` re-trigger in `.onDisappear` or on a `scenePhase` transition to `.background` (an uncancelled timer keeps mutating `@State` on a view that no longer exists). The worked freeze-on-resting-phase pattern and Timer teardown code live at `references/animation/03-advanced-animators.md#reduce-motion-critical` -- this file states the rule once; that file shows the application.

## The full Reduce Motion substitution catalog

Every gate below reads `@Environment(\.accessibilityReduceMotion) private var reduceMotion`.

| Motion | Reduce Motion substitute |
|---|---|
| Slide / push transition | `.transition(reduceMotion ? .opacity : .move(edge: .trailing).combined(with: .opacity))` |
| Scale / zoom / hero expand | Drop the scale entirely, fade only -- never scale-from-a-point under RM |
| Scroll parallax / stretch header | Zero the differential offset; layout structure (peek, sticky headers) stays |
| `matchedGeometryEffect` hero | Crossfade between the two states -- do not share geometry under RM |
| `.navigationTransition(.zoom)` hero | Crossfade the underlying content; gate the presentation path, the modifier's own spring isn't swappable |
| Continuous rotation / spin loop | Static state, or a single non-repeating cue -- rotational motion is the strongest nausea inducer |
| `.contentTransition(.numericText())` | `.contentTransition(.identity)` -- rolling digits are vestibular motion |
| Particle / confetti / decorative loop | Don't render it at all -- simplest correct answer |

```swift
// matchedGeometryEffect crossfade fallback
if reduceMotion {
    Group { if isExpanded { DetailCard() } else { Thumbnail() } }.transition(.opacity)
} else {
    (isExpanded ? DetailCard() : Thumbnail()).matchedGeometryEffect(id: "hero", in: ns)
}
```

## Why: vestibular risk and the WCAG mapping

The vestibular system (inner ear) senses acceleration; a screen reporting large self-motion the inner ear doesn't feel is sensory conflict -- the same mechanism as motion sickness, and for vestibular-disorder users a trigger for a multi-hour episode from even small screen motion.

| Risk | Motion | Why |
|---|---|---|
| HIGH | Parallax / multi-layer depth | Simulates 3D self-motion -- the classic trigger |
| HIGH | Zoom / scale-from-a-point | Looming stimulus reads as approach/recession in depth |
| HIGH | Large-field slide across most of the screen | Wide optical flow = strong self-motion cue |
| HIGH | Continuous rotation / spin / orbit | Rotational vection, the strongest nausea inducer |
| MEDIUM | Spring overshoot / bounce | Unexpected direction reversal |
| MEDIUM | Particle systems, floating decorations | Many independent motion vectors |
| LOW | Opacity crossfade | No spatial displacement, no depth cue -- the preferred substitute |
| KEEP | Direct-manipulation 1:1 finger tracking | User causes and controls it |

Maps to WCAG 2.1: **2.3.3 Animation from Interactions (AAA)** -- interaction-triggered motion must be suppressible unless essential (honoring `accessibilityReduceMotion` satisfies this); **2.2.2 Pause, Stop, Hide (A)** -- auto-playing/looping/auto-updating motion running over 5s must be pausable (covers autoplay video, animated images, decorative loops, below); **2.3.1 Three Flashes (A)** -- distinct from vestibular risk, covered by Dim Flashing Lights below.

## accessibilityPrefersCrossFadeTransitions (iOS 26.4+)

A separate, stricter sub-toggle under Settings > Accessibility > Motion > Reduce Motion > **Prefer Cross-Fade Transitions**. Reads `true` when EITHER base Reduce Motion OR this sub-toggle is on, and specifically means "replace sliding navigation/push transitions with a crossfade." Read THIS key, not bare `accessibilityReduceMotion`, to decide whether a custom `NavigationStack` push animation should become `.opacity`. It is the ONE writable accessibility environment member (`{ get set }`), so it is `#Preview`-injectable:

```swift
@Environment(\.accessibilityPrefersCrossFadeTransitions) private var prefersCrossFade  // iOS 26.4+

#Preview("Cross-fade preferred") {
    ContentView().environment(\.accessibilityPrefersCrossFadeTransitions, true)
}
```

## Availability + fallbacks

```swift
if #available(iOS 26.4, *) {
    @Environment(\.accessibilityPrefersCrossFadeTransitions) private var prefersCrossFade
} else {
    // UIAccessibility.prefersCrossFadeTransitions (iOS 14+) -- observe
    // .prefersCrossFadeTransitionsStatusDidChangeNotification for live updates.
}
```

`.task(name:file:line:)` (iOS 26.4+ metadata) is unrelated and a no-op before that floor -- do not confuse the two 26.4 boundaries.

## Autoplay and flashing-content gates -- the other Motion settings

Reduce Motion is one toggle among several under Settings > Accessibility > Motion; each governs a DIFFERENT class of automatic movement and must be gated on its OWN setting, independently -- a user can disable video autoplay without enabling Reduce Motion, or vice versa:

| Setting | API | Governs |
|---|---|---|
| Reduce Motion | `\.accessibilityReduceMotion` (iOS 14+) | Large/depth/overshoot animation (this file) |
| Prefer Cross-Fade Transitions | `\.accessibilityPrefersCrossFadeTransitions` (iOS 26.4+) | Nav push/pop crossfade preference (above) |
| Auto-Play Animated Images | `\.accessibilityPlayAnimatedImages` (iOS 17+, get-only) | GIFs, animated stickers/WebP, looping symbols |
| Auto-Play Video Previews | `UIAccessibility.isVideoAutoplayEnabled` (iOS 13+, no SwiftUI env) | Inline video preview autoplay |
| Dim Flashing Lights | `\.accessibilityDimFlashingLights` (iOS 17+, get-only) | Seizure-safety dimming (WCAG 2.3.1) |

```swift
// Animated content: static poster fallback, never a blank placeholder
@Environment(\.accessibilityPlayAnimatedImages) private var playAnimated
Image(systemName: "figure.run")
    .symbolEffect(.bounce, options: playAnimated ? .repeating : .nonRepeating, isActive: playAnimated)

// Video: no SwiftUI env -- read the UIKit static, gate player.play()
.onAppear { if UIAccessibility.isVideoAutoplayEnabled { player.play() } }
```

## TransitionProperties.hasMotion -- defense in depth for custom Transitions

The `Transition` protocol declares `static var properties: TransitionProperties { get }` (iOS 17+, default supplied). `TransitionProperties(hasMotion: true)` tells the system your custom transition involves motion so it can factor Reduce Motion into its own handling -- declare it alongside your explicit `reduceMotion` branch as belt-and-suspenders, not a replacement for it:

```swift
struct SlideScale: Transition {
    static var properties: TransitionProperties { TransitionProperties(hasMotion: true) }
    func body(content: Content, phase: TransitionPhase) -> some View {
        content.scaleEffect(phase.isIdentity ? 1 : 0.6).opacity(phase.isIdentity ? 1 : 0)
    }
}
```

Inside `body(content:phase:)`, apply modifiers to `content` -- never conditionally rebuild it (`if phase.isIdentity { A() } else { B() }`). Rebuilding re-inits the subtree mid-transition, resetting `@State` and cancelling in-flight animation.

## Testing Reduce Motion

- **The `#Preview` compile trap**: `accessibilityReduceMotion` and most accessibility environment keys are get-only (mirror a system setting) -- `.environment(\.accessibilityReduceMotion, true)` fails to compile (`KeyPath` != `WritableKeyPath`). Parameterize your OWN `Bool` and thread it through a testable seam instead of trying to inject the real key.
- **Manual toggles**: Settings > Accessibility > Motion > Reduce Motion on device/Simulator; Xcode's Debug navigator > Environment Overrides flips it live without relaunching; Accessibility Inspector's Audit tab can drive the connected Simulator.
- **UI tests**: Reduce Motion has no public XCUITest toggle -- drive it via a launch argument your app reads at startup and maps onto your own seam, then assert on frame-count/duration rather than trusting `UIAccessibility.isReduceMotionEnabled` in the test process (that reads the TEST runner's setting, not the app's).
- **Regression coverage**: render the same view twice -- Reduce Motion on and off, via the injected `Bool` seam -- and snapshot both. This is what catches the single-gate leak (only `withAnimation` was gated; a sibling `.animation(_:value:)` on the same property still animates). Audit rule: `grep` BOTH `withAnimation(` and `.animation(` for the animated property; route both through one accessor.
- **What source-grep proves nothing about**: string presence of `.spring(` or a `reduceMotion` branch says nothing about runtime behavior -- verify by toggling the setting and observing, on-device where possible (gesture-adjacent teardown timing differs from the Simulator).

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Gating `withAnimation` only | A sibling `.animation(_:value:)` on the same property still fires | Route both call sites through one `AppMotion`-style `Animation?` accessor |
| `if reduceMotion { staticImage } else { animatedImage }` for a symbol | Remounts the view -- view-identity churn, spurious transition | `.symbolEffect(_, isActive: reduceMotion ? false : condition)` keeps the same view mounted |
| Assuming a `NavigationStack` push crossfades under bare Reduce Motion | False -- it still slides at normal speed | Read `accessibilityPrefersCrossFadeTransitions` (iOS 26.4+) for that specific preference |
| `@Environment(\.accessibilityReduceMotion)` on the `@main App` struct | `App.body` is `Scene`, reads the default, never the live value | Read it in a child `View` |
| `.environment(\.accessibilityReduceMotion, true)` in a `#Preview` | Compile error -- get-only key | Parameterize your own `Bool` override for previews |
| `PhaseAnimator`/`KeyframeAnimator` loop with no RM branch | Never system-auto-gated, runs forever | Freeze on resting phase (`references/animation/03-advanced-animators.md#reduce-motion-critical`) |
| Gating the live 1:1 drag offset itself | Breaks the touch -- direct manipulation isn't decorative motion | Gate only the release settle/spring-back |
| Testing RM by grepping source for `.spring` | Proves nothing about runtime | Toggle the Simulator/device setting and observe |

## Severity guide

- **CRITICAL**: a looping effect (symbol, `PhaseAnimator`, `KeyframeAnimator`, decorative loop) has zero Reduce Motion branch anywhere in the file -- WCAG 2.3.3 violation, ships nausea-triggering content indefinitely.
- **HIGH**: single-gate bug -- one call site gated, a sibling `.animation`/`.transition` on the same value is not; motion still fires from some code paths.
- **MEDIUM**: a decorative flourish (parallax, hero scale, rotation accent) isn't gated, but the underlying interaction still functions.
- **LOW**: the Reduce Motion substitute's duration/curve diverges slightly from house convention.

## See also

- `references/accessibility/03-visual-accessibility.md#reduce-motion` -- system-vs-developer-owned motion overview, `#Preview` injectability table
- `references/patterns/01-gotchas-anti-patterns.md#reduce-motion-one-animation-accessor-gates-both-apis` -- the canonical shipped double-gate gotcha
- `references/animation/01-animation-fundamentals.md#reduce-motion-critical` -- double-gate quick reference at the animation-fundamentals level
- `references/animation/03-advanced-animators.md#reduce-motion-critical` -- `PhaseAnimator`/`KeyframeAnimator` freeze-on-resting-phase, `Timer` teardown
- `references/animation/04-transitions-geometry.md#reduce-motion-critical----every-motion-type-on-this-page-is-a-developer-gate` -- transition/`matchedGeometryEffect`/`.navigationTransition(.zoom)` substitutions
- `references/animation/05-gesture-driven.md#reduce-motion` -- gesture-release settle gating, essential-vs-decorative split
- `references/animation/06-scroll-driven-effects.md` -- scroll-linked parallax/fade Reduce Motion gating
- `references/design/05-sf-symbols.md#symbol-effects-and-reduce-motion` -- full symbol-effect catalog and rendering modes
- `~/Claude/vault/iOS Development/10 - Accessibility.md`
