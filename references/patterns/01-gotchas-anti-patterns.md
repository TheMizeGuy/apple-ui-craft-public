# Gotchas and Anti-Patterns

> Owner: `references/patterns/01-gotchas-anti-patterns.md` owns six recurring, ship-breaking traps that don't belong to any single API surface: the `#Preview` environment-key injectability gotcha, the Reduce Motion double-gate mechanism, animating shadow opacity instead of radius, a `Timer`/`TimelineView` left running behind a `.sheet`, the symbol-effect Reduce Motion fallback, and the Reduce Transparency opaque-fallback rule. Every other row below is a pointer to its real owner -- read this file for the failure mode, follow the link for the full contract.
> Floors: see `references/_scaffolding/version-floor-registry.md` for every version cited below; nothing in this file introduces a new floor.

Most entries here shipped to a device before they were caught -- unit tests, source review, and Xcode's canvas all stayed green while the bug was live; the two compile-time traps below (the `#Preview` get-only-key injection and the `.identity`-on-`Animation` mistake) are instead caught at build, not runtime. The common thread for the runtime bugs: SwiftUI's compile-time guarantees say nothing about runtime environment values, system-auto-gating scope, or off-screen render cost, so those categories are structurally invisible to static review. Grep for the anti-pattern, don't trust "it compiled."

## The `#Preview` environment-key trap

**Symptom**: `.environment(\.accessibilityReduceTransparency, true)` in a `#Preview` fails to compile -- `cannot convert value of type 'KeyPath<EnvironmentValues, Bool>' to expected argument type 'WritableKeyPath<EnvironmentValues, Bool>'`.

**Root cause**: not every accessibility environment key is `.environment(_:_:)`-injectable. Several are read-only reflections of a system setting, exposed as a plain `KeyPath`, not a `WritableKeyPath`:

| Get-only (cannot inject) | Writable (can inject) |
|---|---|
| `accessibilityReduceMotion` | `colorScheme` |
| `accessibilityReduceTransparency` | `dynamicTypeSize` |
| `colorSchemeContrast` | `legibilityWeight` |
| `accessibilityDimFlashingLights` | `locale` |
| `accessibilityPlayAnimatedImages` | `layoutDirection` |
| | `accessibilityPrefersCrossFadeTransitions` (iOS 26.4+) |

**Fix**: don't inline-override a get-only key. Toggle the Xcode canvas Accessibility Inspector (Reduce Transparency / Increase Contrast) at preview time, or parameterize the view under test with a plain `Bool` and drive both preview variants from that:

```swift
// WRONG -- compile error, accessibilityReduceTransparency is get-only
#Preview {
    ContentView().environment(\.accessibilityReduceTransparency, true)
}

// RIGHT -- legibilityWeight, dynamicTypeSize, colorScheme, locale ARE writable
#Preview("Bold Text") {
    ContentView().environment(\.legibilityWeight, .bold)
}

// RIGHT for a get-only key -- parameterize instead of injecting the real key
#Preview("Reduce Transparency") {
    ContentView(forcesOpaqueForPreview: true)
}
```

The full accessibility-environment catalog and testing workflow live in `references/accessibility/03-visual-accessibility.md#environment-key-injectability-preview-and-testing` -- cite it, don't re-derive the table from memory.

## Reduce Motion: one `Animation?` accessor gates both APIs

**Symptom**: every `withAnimation(...)` in a screen is correctly gated behind Reduce Motion, but a panel still visibly slides when the setting is on.

**Root cause**: SwiftUI has two independent animation entry points -- imperative `withAnimation(_:)` and declarative `.animation(_:value:)` -- and gating only one leaves the other live. The declarative modifier is easy to miss because it reads as "just describing state," not "driving a transition."

**Fix**: route every commit through one shared accessor and apply it at BOTH sites. `Animation` has no `.identity` case -- the "no animation" sentinel is `nil`, and both APIs take `Animation?`:

```swift
// WRONG -- compiler error: type 'Animation' has no member 'identity'
.animation(reduceMotion ? .identity : .smooth(duration: 0.18), value: isPressed)

// RIGHT -- shared accessor, applied everywhere a commit can fire
extension Animation {
    static func snap(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .spring(duration: 0.4, bounce: 0.3)
    }
}

withAnimation(.snap(reduceMotion: reduceMotion)) { isOpen.toggle() }
.animation(.snap(reduceMotion: reduceMotion), value: isOpen)   // <- the one that gets forgotten
```

Grep BOTH `withAnimation(` and `.animation(` when auditing a Reduce Motion pass -- gating one and shipping is a WCAG 2.3.3 vestibular violation, not a style nit. A live finger-drag `.offset` keyed on a gesture-translation value is direct manipulation and stays ungated; only the settling/commit transition needs the accessor. The full double-gate contract, including `PhaseAnimator`/`KeyframeAnimator` freeze-on-resting-phase, is owned by `references/accessibility/05-motion-accessibility.md#accessibility-contract`.

## Looping symbol effects are never auto-gated

**Symptom**: a searching indicator built as `.symbolEffect(.variableColor.iterative, isActive: isSearching)` keeps pulsing under Reduce Motion; a reviewer assumed "symbol effects auto-respect Reduce Motion" and shipped it unguarded.

**Root cause**: the system only auto-reduces ONE-SHOT, discrete symbol effects (`.bounce`, `.appear` triggered by a `value:` change) plus the Liquid Glass specular highlight and default push/sheet transitions. Indefinite, looping effects -- `.pulse`, `.variableColor.iterative`, `.breathe`, `.rotate` with a repeating option -- run until you stop them, Reduce Motion or not.

**Fix**: gate the `isActive:` argument yourself, or strip every effect on a subtree:

```swift
// WRONG -- "symbol effects handle Reduce Motion automatically" is false for loops
Image(systemName: "dot.radiowaves.left.and.right")
    .symbolEffect(.variableColor.iterative, isActive: isSearching)

// RIGHT -- developer-owned gate on the looping effect
Image(systemName: "dot.radiowaves.left.and.right")
    .symbolEffect(.variableColor.iterative, isActive: isSearching && !reduceMotion)

// RIGHT -- blanket strip for a whole subtree
ContentView().symbolEffectsRemoved(reduceMotion)
```

A one-shot effect like `.symbolEffect(.bounce, value: liked)` genuinely IS reduced by the system -- don't add a redundant gate there. The full auto-gated-vs-developer-owned boundary is owned by `references/accessibility/03-visual-accessibility.md#reduce-motion`.

## Reduce Transparency: Materials go opaque on their own, `.opacity()` never does

**Symptom**: a banner styled `.background(theme.surfaceElevated.opacity(0.5))` stays translucent under Reduce Transparency while every sibling banner using `.regularMaterial` correctly turns solid.

**Root cause**: a SwiftUI `Material` (`.regularMaterial`, `.ultraThinMaterial`, and Liquid Glass's `.glassEffect()`) is rendered opaque by the system automatically when Reduce Transparency is on. A `Color` alpha blend via `.opacity(_:)` is a fixed blend -- it has no idea `UIAccessibility.isReduceTransparencyEnabled` exists, and stays translucent regardless of the setting.

**Fix**: reach for a `Material` for any frosted/elevated surface -- you get correct Reduce Transparency behavior for free, with zero `@Environment` branching:

```swift
// WRONG -- ignores Reduce Transparency; sibling Material surfaces correctly go opaque, this one doesn't
Text("Floating").padding().background(theme.surfaceElevated.opacity(0.5))

// RIGHT -- Material auto-opaques under Reduce Transparency
Text("Floating").padding().background(.regularMaterial)
```

Any HAND-ROLLED translucent control (a custom blurred shape, a disc at `.opacity(0.94)`) needs its OWN explicit Reduce Transparency branch matching the rest of the app's glass doctrine -- it will not inherit the Material behavior just by looking similar:

```swift
@Environment(\.accessibilityReduceTransparency) var reduceTransparency

Circle().fill(reduceTransparency ? Color(.systemBackground) : .clear.opacity(0.9))
```

## Animate shadow opacity, never radius or offset

**Symptom**: a card's shadow is listed as "cheap, render-only" in a cost table, then animating its `radius` during a press-down interaction becomes the top scroll-hitch source in a trace.

**Root cause**: a STATIC shadow is cheap -- rendered once, composited like any other layer. Animating `.shadow(radius:)` or its offset forces an off-screen render pass EVERY FRAME, because the shadow's silhouette must be recomputed each time the radius changes. `.blur(radius:)` has the identical cost profile.

**Fix**: animate the shadow's `.opacity` (a pre-rendered layer fading in/out is cheap) instead of its `radius`/`offset`; keep the shadow's shape parameters constant:

```swift
// WRONG -- off-screen render pass every frame of the animation
.shadow(radius: isPressed ? 12 : 4)

// RIGHT -- animate opacity of a shadow layer with a FIXED radius
.shadow(radius: 8)
.opacity(isPressed ? 1 : 0)
```

The full animation-cost table and off-screen-render mechanics are owned by `references/performance/01-swiftui-rendering.md#animation-cost-layout-vs-render` and `references/performance/02-scroll-list-performance.md#off-screen-rendering`.

## A `Timer` or `TimelineView` kept alive behind a `.sheet`

**Symptom**: a settings `.sheet` scrolls with visible lag. Nothing in the sheet's own view hierarchy is expensive.

**Root cause**: presenting a `.sheet(isPresented:)` does NOT call `.onDisappear` on the presenter's content -- the presenter's view tree stays mounted and "appeared" underneath the sheet. A shared animation clock built as `TimelineView(.animation(minimumInterval: 0.05, paused: !ticking))`, gated on a visible-count maintained by `.onAppear`/`.onDisappear` on the presenter's rows, never sees those rows disappear, so it keeps ticking at 20fps and starves the main thread the sheet's own scroll needs.

**Fix**: gate any per-frame work (animation clocks, `Timer`, `TimelineView`) on sheet/cover presentation state OR `scenePhase`, not only on a visible-count the presenter maintains:

```swift
// WRONG -- presenter rows never fire onDisappear while a sheet covers them
TimelineView(.animation(minimumInterval: 0.05, paused: visibleAnimatedCount == 0)) { _ in
    EmoteOverlay()
}

// RIGHT -- also halt while ANY sheet/cover is up
TimelineView(.animation(minimumInterval: 0.05, paused: visibleAnimatedCount == 0 || isSheetPresented)) { _ in
    EmoteOverlay()
}
```

An un-canceled `Timer.publish(...).autoconnect()` on ordinary `.onDisappear`/`scenePhase` transitions is a related but distinct bug, owned by `references/animation/03-advanced-animators.md#repeating-keyframe-animations`; this entry is specifically about the sheet-presentation blind spot in that cancellation logic.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `GlassEffectContainer(spacing:) { viewA; viewB; viewC }` with bare siblings | Container performs no layout of its own -- bare children stack vertically, tripling row height | Put an explicit `HStack`/`Layout` INSIDE the container (owner: `references/design/02-liquid-glass.md#glasseffectcontainer-multi-element-glass`) |
| Two adjacent `.glassEffect()` views that visually touch, each un-grouped | Each samples the backdrop separately -- muddy, inconsistent tint | Wrap both in one `GlassEffectContainer` so they share a sampling region |
| `.accessibilityElement(children: .combine)` with no explicit label/trait/id re-applied | `.combine` drops every child's individual label, `.isHeader` trait, and `accessibilityIdentifier` -- source-pinned unit tests keep passing while VoiceOver silently loses the heading and UI-test hook | Re-apply label, trait, and identifier explicitly on the COMBINED element, after `.combine` in the modifier chain |
| A decorative SF Symbol left un-hidden inside a `.combine` group | Its auto-derived label ("person crop circle fill") leaks into the merged utterance | `.accessibilityHidden(true)` on the decorative child -- there is no other way to exclude one child under `.combine` |
| `ViewThatFits { candidateA; candidateB }` wrapped in an outer `.combine`, no explicit label | `ViewThatFits` instantiates ALL candidates to measure them; every candidate's a11y elements land in the tree, so `.combine` reads the content twice | Either gate on `dynamicTypeSize`/size-class so only one branch builds, or add an explicit `.accessibilityLabel` that overrides the doubled auto-merge |
| Per-element Dynamic Type reflow (`if isAX { VStack } else { HStack }` inside each row) | Inconsistent with sibling rows that reflow at the container level; some rows clip at AX sizes while others don't | Switch `HStackLayout`/`VStackLayout` via `AnyLayout` once, at the CONTAINER, keyed on `dynamicTypeSize.isAccessibilitySize` |
| `accessibilityShowsLargeContentViewer` attached to an element that is conditionally REMOVED at accessibility Dynamic Type sizes | The element it's attached to no longer exists when the viewer would be useful -- dead affordance | Only attach the Large Content Viewer to elements that PERSIST at every Dynamic Type size (tab icons, toolbar buttons) |
| A toolbar width-reservation helper hardcoding a fixed control count | Adding one more conditional button overflows on iPhone SE/mini (375pt) and iPad Slide Over (320pt) while looking fine on a Pro Max simulator | Recompute `fixed = padding + buttons * 44 + gaps * spacing + spacerMin` against the CURRENT control count every time a control is added or removed |
| `.animation(_:value:)` attached to a `ScrollView`/`List` container | An implicit transaction over the whole scrollable subtree interpolates every row's geometry against the live drag gesture -- stutters at the release edge | Animate only the specific leaf/overlay whose appearance should animate, never the scroll container |
| A per-row `DragGesture` inside a `ScrollView` for swipe actions | SwiftUI cannot disambiguate a vertical-dominant drag between the row gesture and the scroll gesture -- breaks scroll AND scroll-to-dismiss-keyboard | `UIGestureRecognizerRepresentable` (iOS 18+) wrapping a `UIPanGestureRecognizer` that only begins for horizontal-dominant drags |
| `.sensoryFeedback(_:trigger:)` bound to a model-derived value | Fires whenever the value changes, regardless of WHO changed it -- a background refresh mutating `isFavorited` fires a phantom haptic the user never asked for | Bind to an explicit monotonic counter that ONLY view code touching a user action increments |
| Two feedback modifiers (`.sensoryFeedback` + `.hapticFeedback`, or `UIFeedbackGenerator` + `CHHapticEngine`) firing on the same interaction | User feels the event twice -- invisible in source review and the Simulator, only felt on a physical device | One feedback source per interaction; grep for an existing feedback modifier on a view before adding another |
| `CHHapticEngine` created unconditionally on iPad or in the Simulator | iPad has no Taptic Engine; the Simulator cannot produce haptic output -- engine creation can crash or silently no-op on both | `guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }` before every engine creation |
| A prominent filled Liquid Glass "puck" (a Send/CTA circle) over a dark canvas | The frosted material's specular highlight brightens the whole disc regardless of tint, producing a pale/lavender result with the glyph washed out; a brightening "sheen" overlay makes it WORSE, not better | Draw the prominent control as a SOLID accent-gradient fill, not glass; reserve frosted glass for the surrounding chrome bar, and pick glyph ink by the accent's WCAG relative luminance, not a fixed inverted token |

## Craft-review discipline

Four process gotchas that repeat across every UI review pass, independent of any single API:

- **Green contract tests + "feels sloppy" on a real device means the contract pinned the SHAPE, not the FEEL.** A prior story locked structural invariants (pixel budget, toolbar layout) but left cross-OS uniformity, glyph-legibility-under-every-state, and page identity at AX5 outside the contract. Surface the gap as a design decision -- don't silently "fix" one axis and call the finding closed.
- **Run sibling-consistency triage before flagging a "missing" affordance.** A gap every sibling element shares is the app's convention, not a defect -- matching it is correct. A gap only ONE element has is the real finding. This also runs in reverse: a plain `Color.opacity()` surface is a genuine finding when every sibling uses a `Material`, because only the `Material` adapts to Reduce Transparency.
- **Never iterate visual UI from source alone.** Render into the Simulator and screenshot before judging spacing, color, or proportion -- glass-over-dark washout, clipped predictive-bar overlaps, and layout-direction bugs are invisible in a source diff and in most unit/snapshot tests, visible only in a rendered screenshot at the actual device size.
- **A `.sheet`'s background belongs on the OUTER container that wraps every branch (populated, empty, error), not on the `List` alone.** Sheets render at UIKit's ELEVATED interface level, so a dark-mode `systemBackground` inside a sheet resolves to `#1C1C1E`, never pure black, even with `preferredColorScheme(.dark)` at the window root -- and a background attached only inside the populated branch leaves the transparent `ContentUnavailableView` empty/error branches falling through to the elevated system backdrop.

## Accessibility contract

Every gotcha above that touches motion or transparency is developer-owned unless explicitly marked auto-gated. The Reduce Motion double-gate (one `Animation?` accessor covering both `withAnimation(` and `.animation(_:value:)`) and the auto-gated-vs-developer-owned boundary are canonical in `references/accessibility/05-motion-accessibility.md` and `references/accessibility/03-visual-accessibility.md#reduce-motion`. Reduce Transparency's Material-auto-opaques rule is canonical here; anything you hand-roll needs its own explicit branch.

## Severity guide

- **CRITICAL**: a Reduce Motion or Reduce Transparency gap that ships (WCAG 2.3.3 vestibular violation, or a hand-rolled surface that ignores the user's transparency setting).
- **HIGH**: a compile-time trap that blocks the fix entirely (`.identity` on `Animation`, get-only key injection) or a `.combine` misuse that silently drops VoiceOver content.
- **MEDIUM**: a performance anti-pattern with a measurable hitch (shadow radius animation, `.animation` on a scroll container, a `Timer` running behind a sheet).
- **LOW**: a craft/consistency gap a sibling-triage pass would catch before it reaches review.

## See also

- `references/accessibility/03-visual-accessibility.md#environment-key-injectability-preview-and-testing` -- full a11y environment-key catalog
- `references/accessibility/05-motion-accessibility.md` -- full Reduce Motion contract, `PhaseAnimator`/`KeyframeAnimator` freeze semantics
- `references/design/02-liquid-glass.md#glasseffectcontainer-multi-element-glass` -- `GlassEffectContainer` sampling/morph semantics
- `references/performance/01-swiftui-rendering.md#animation-cost-layout-vs-render` -- animation cost table, shadow/blur cost
- `references/performance/02-scroll-list-performance.md#off-screen-rendering` -- off-screen render triggers
- `references/haptics/02-swiftui-sensory-feedback.md` -- `.sensoryFeedback` trigger semantics (OWNER)
- `~/Claude/vault/iOS Development/` -- deep source material for every gotcha above
