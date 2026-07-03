# Press Feedback States

> Owner: this file owns the press/touch-feedback lifecycle -- `ButtonStyle`/`configuration.isPressed`, asymmetric press-in/press-out timing, multi-property press (scale/dim/shadow), row and card press states, and `.hoverEffect` (pointer/gaze pre-touch feedback). It does NOT own: gesture arena disambiguation (`references/interaction/04-gesture-disambiguation.md`), the `SensoryFeedback` API surface (`references/haptics/02-swiftui-sensory-feedback.md`), or spring-curve vocabulary (`references/animation/02-spring-physics.md`) -- cite, don't restate.
> Floors: `references/_scaffolding/version-floor-registry.md`. `hoverEffect(in:isEnabled:body:)` and `HoverEffectGroup` are iOS 17.0+/visionOS 2.0+ for the custom-effect forms; `hoverEffect(_:)` base is iPadOS/tvOS/visionOS 13.4+ (no-op on iPhone).

A press is not a tap. The visual press state tracks the finger from touch-down through lift; the tap ACTION is a separate touch-up-inside event that only fires if the finger lifts inside the target. Conflating the two is why some buttons buzz on an aborted press and others feel like they never registered the touch at all.

## The Apple way

Use `Button` + `ButtonStyle` for anything semantically a button, never `.onTapGesture`. `ButtonStyleConfiguration` exposes exactly `label`, `isPressed: Bool`, and (iOS 26) `role: ButtonRole?` -- `isPressed` is the ONLY interaction signal a style receives, so every press feel decision is a function of that one Bool. In exchange you get, for free: correct scroll arbitration inside `List`/`ScrollView`, press-cancel on slide-off, the button accessibility trait, and Voice Control/Switch Control activation. `.onTapGesture` gives you none of it.

## Touch-down vs. touch-up semantics

One press moves through three moments:

1. **Touch-down** -- finger contacts inside the button. `isPressed` flips `true` immediately. The action has NOT fired.
2. **Track/drift** -- `isPressed` stays `true` while the finger remains within the hit region plus a system slop margin; it returns to `true` if the finger drifts back in.
3. **Touch-up** -- lift inside the slop region: `isPressed -> false` AND the action fires (commit). Lift outside: `isPressed -> false`, action does NOT fire (press-cancel, free with `ButtonStyle`).

The commit haptic belongs on touch-up, driven by a counter incremented inside the action closure -- never bind a haptic trigger to `isPressed` for a commit sound, or every aborted press buzzes:

```swift
struct CommitFeedbackButton: View {
    @State private var taps = 0
    var body: some View {
        Button { taps &+= 1; doThing() } label: { Text("Save") }
            .buttonStyle(SnappyPressStyle())
            .sensoryFeedback(.impact(weight: .medium), trigger: taps)   // fires on COMMIT only
    }
}
```

A touch-DOWN haptic is correct only when touch-down itself is meaningful (a context-menu preview arming, a peek). Because a `ButtonStyle` cannot host state that distinguishes commit from cancel, use the `condition:` overload against `isPressed` to fire only on the rising edge:

```swift
.sensoryFeedback(.selection, trigger: isPressed) { wasPressed, nowPressed in
    !wasPressed && nowPressed          // fires only on touch-down, never on release/cancel
}
```

Full `SensoryFeedback` case catalog and this `condition:` overload's exact signature: `references/haptics/02-swiftui-sensory-feedback.md` (OWNER).

## Asymmetric press-in vs. press-out

Symmetric press timing -- the same curve compressing and releasing -- is the tell of a generated button. Real controls compress instantly and pop back with a hair of overshoot. `.animation(_:value:)` applies whatever expression is in effect when the value changes, so a ternary keyed on the DESTINATION state picks the direction-correct curve:

```swift
struct SnappyPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var pressIn: Animation  { .spring(duration: 0.14, bounce: 0) }     // fast, critically damped
    private var pressOut: Animation { .spring(duration: 0.30, bounce: 0.28) }  // slight overshoot, the "pop"

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(
                reduceMotion ? nil : (configuration.isPressed ? pressIn : pressOut),
                value: configuration.isPressed
            )
    }
}
```

Bounce belongs on the release, never the compression -- bounce on press-in reads as a wobble, not a press. Springs (not `.easeInOut`) are load-bearing here for a second reason beyond overshoot: springs are velocity-preserving on interruption, so rapid taps blend continuously; `.easeInOut` restarts from a dead stop and stutters. Spring vocabulary and preset tuples: `references/animation/02-spring-physics.md` (OWNER).

| Direction | duration | bounce | Reads as |
|---|---|---|---|
| Press-in (compress) | 0.12-0.16 | 0.0 | Instant, planted under the finger |
| Press-out (standard release) | 0.28-0.32 | 0.25-0.30 | Crisp pop back |
| Press-out (calm/utility chrome) | 0.22 | 0.0 | Quiet return, no personality |
| Press-out (destructive) | 0.28 | 0.0 | No playful pop on a delete -- keep bounce off |

Scale depth by control class: text/pill buttons `0.96`, icon-only pucks `0.90-0.92` (smaller elements need a deeper compress to register), large cards/tiles `0.97-0.98` (bigger surfaces that shrink 4% look broken).

## Beyond scale: dim, shadow collapse, anchor

Scale-only reads as flat. Layer one more property:

- **Dim.** `.brightness(-0.06)` on a filled/tinted button (darkens without washing the tint); an opacity nudge on the fill layer for a bordered/translucent button (dim the background, not the label -- `.opacity` on the label reveals whatever is behind it).
- **Shadow collapse for cards.** A card is a raised plane; pressing it should push it toward the background, not shrink it in place -- shrink the shadow's radius and `y`-offset together as elevation drops:

```swift
struct PressableTileStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        configuration.label
            .scaleEffect(pressed ? 0.98 : 1.0)
            .shadow(color: .black.opacity(pressed ? 0.10 : 0.18),
                    radius: pressed ? 4 : 12, y: pressed ? 2 : 8)
            .animation(reduceMotion ? nil
                       : (pressed ? .spring(duration: 0.16, bounce: 0)
                                  : .spring(duration: 0.34, bounce: 0.20)),
                       value: pressed)
    }
}
```

- **Anchor.** `scaleEffect` defaults to `.center`, correct for a free-floating button. When the pressed element visually hugs an edge (a toolbar item, a card in a horizontal rail), center-scaling drifts it from its neighbor -- set `anchor: .leading`/`.trailing` to compress toward the pinned edge.
- **Liquid Glass owns its own press.** On iOS 26, `.glassEffect(.regular.interactive())` already tightens the specular highlight and refraction on press (`references/design/02-liquid-glass.md#tint-and-interactivity`, OWNER) -- do not stack a manual `.brightness` on top, or you double-dim.

Composition budget: scale + one luminance change for buttons, scale + shadow for cards. A third property is reserved for a hero action and should be barely perceptible -- restraint is the signature.

## Rows and cards inside `List`

`.onTapGesture` on a row gives no press state, no press-cancel, and no button accessibility trait -- always `Button`. Two more row-specific traps:

```swift
Button { open(item) } label: {
    HStack {
        Image(systemName: item.icon)
        Text(item.title)
        Spacer()
        Image(systemName: "chevron.right").foregroundStyle(.tertiary)
    }
    .contentShape(Rectangle())                     // the empty Spacer gap becomes tappable too
}
.buttonStyle(.plain)                               // required inside List, or labels render accent-tinted
```

For a full-bleed press flash spanning the row edge-to-edge (the native `List` grey flash), the label must own the row's padding and paint its own background, with the list's default insets zeroed out:

```swift
struct RowPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 16).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.systemGray4).opacity(configuration.isPressed ? 1 : 0))
            .contentShape(Rectangle())
            .animation(reduceMotion ? nil
                       : .easeOut(duration: configuration.isPressed ? 0.08 : 0.25),
                       value: configuration.isPressed)
    }
}
// List { ForEach(items) { Button { open($0) } label: { RowContent($0) } }
//     .buttonStyle(RowPressStyle()).listRowInsets(EdgeInsets()) }
```

Fast-in (~0.08s), slow-out (~0.25s) `.easeOut` -- not a spring, because a background opacity fill has no physical mass to overshoot; springs are for things that move. Keep three states distinct: **press** (transient, tracks the finger), **selection** (persistent, drive from your own binding), and the **system row flash** (free on a plain `NavigationLink` -- do not rebuild it unless you need a different color or a card look).

## Hover on iPad, Mac Catalyst, and visionOS

`.hoverEffect` is the pre-touch half of touch feedback -- it tells the user "you are aimed at me" before a press lands, on iPadOS pointer/trackpad, tvOS focus, and visionOS gaze. `func hoverEffect(_ effect: HoverEffect = .automatic) -> some View` is a no-op on iPhone (no pointer/gaze).

- **`.automatic`** -- system picks the platform-correct effect. Start here; on visionOS this is the standard gaze highlight.
- **`.highlight`** -- a shaped fill/tint tracing `contentShape`. Flat, in-plane targets: rows, cells, toolbar glyphs.
- **`.lift`** -- content rises with a shadow and specular sheen. Discrete raised objects: cards, posters, tiles. A `.lift` on a flat row looks wrong; use `.highlight`.

For bespoke feedback, the custom closure form drives any property from the live hover state:

```swift
func hoverEffect(
    in group: HoverEffectGroup? = nil,
    isEnabled: Bool = true,
    body: @escaping (EmptyHoverEffectContent, Bool, GeometryProxy) -> some HoverEffectContent
) -> some View

Text("Play")
    .hoverEffect { effect, isActive, proxy in
        effect.scaleEffect(isActive ? 1.06 : 1.0)
    }
```

This is preferred over `onHover { } + @State + withAnimation` for anything performance-sensitive: these effects are composited by the system OUT-OF-PROCESS on visionOS/iPadOS, so they stay glassy-smooth even under main-thread load. Use `onHover` only when hover must change OTHER state (reveal a secondary control elsewhere, load a preview) -- it runs on your actor, so keep that work trivial. `HoverEffectGroup` coordinates a parent and its decorative children so a whole cluster (a card art + its caption) activates together: `func hoverEffect(_ effect: some CustomHoverEffect, in group: HoverEffectGroup?, isEnabled: Bool) -> some View`.

`hoverEffectDisabled(_:)` suppresses the system hover morph for a whole subtree (an ancestor's `true` overrides a descendant's `false`) -- use it to honor an in-app "reduce pointer effects" preference or calm a busy grid. Read `@Environment(\.isHoverEffectEnabled)` before adding your OWN manual hover chrome so it respects the same policy instead of fighting it.

iPadOS 18.0+/macOS 15.0+/visionOS 2.0+ also lets you shape the pointer itself with `pointerStyle(_:)` (SwiftUI) / `UIPointerInteraction` (UIKit) -- NOT an iOS/iPhone API. Deep Mac-native pointer craft (modifier-key combos, `pointerVisibility`, cursor morphing tied to tool mode) is macOS-only and owned by `references/cross-platform/04-macos-catalyst.md`.

### Hover is never a required affordance

Hover, cursor-shape, and modifier-combo behaviors are pointer-hardware-only -- invisible to touch-only iPhone/iPad users, VoiceOver, Full Keyboard Access, Switch Control, and Voice Control. Anything reachable only by hovering (row action buttons, resize handles, reveal-on-hover chrome) MUST also be reachable by a persistent control, a context menu, and the keyboard. `.help("Archive selected messages")` is the one cross-platform tooltip modifier and is ALSO surfaced to VoiceOver as the element's help text -- give every icon-only control one; it degrades correctly by construction, unlike a bespoke `onHover`-only popover.

## Composable capstone: `PressableStyle`

```swift
struct PressableStyle: ButtonStyle {
    enum Feel { case button, puck, card, row }
    var feel: Feel = .button
    var haptic: SensoryFeedback? = nil          // press-DOWN only; commit haptic belongs at the action site

    @Environment(\.accessibilityReduceMotion)      private var reduceMotion
    @Environment(\.colorSchemeContrast)             private var contrast

    private var pressedScale: CGFloat {
        switch feel { case .button: 0.96; case .puck: 0.90; case .card: 0.98; case .row: 1.0 }
    }
    private var dim: Double {
        let base: Double = feel == .row ? 0 : 0.06
        return contrast == .increased ? base + 0.04 : base       // deepen under Increase Contrast
    }
    private func anim(_ pressed: Bool) -> Animation? {
        guard !reduceMotion else { return nil }
        return pressed ? .spring(duration: 0.14, bounce: 0)
                       : .spring(duration: 0.30, bounce: feel == .card ? 0.18 : 0.26)
    }

    func makeBody(configuration: Configuration) -> some View {
        let p = configuration.isPressed
        return configuration.label
            .scaleEffect(pressedScale == 1 ? 1 : (p ? pressedScale : 1))
            .brightness(p ? -dim : 0)
            .contentShape(feel == .card ? AnyShape(RoundedRectangle(cornerRadius: 20)) : AnyShape(Rectangle()))
            .animation(anim(p), value: p)
            .sensoryFeedback(haptic ?? .selection, trigger: p) { was, now in
                haptic != nil && !was && now
            }
    }
}
```

| Control | Scale | Extra property | Timing (in/out) | Haptic | Hover |
|---|---|---|---|---|---|
| Text/pill button | 0.96 | brightness -0.06 | 0.14 / 0.30 b0.26 | commit `.impact(.medium)` | `.highlight` |
| Icon-only puck | 0.90 | brightness -0.06 | 0.14 / 0.30 b0.26 | commit `.impact(.light)` or down-`.selection` | `.highlight` |
| Destructive button | 0.96 | brightness -0.06 | 0.14 / 0.28 b0 | commit `.impact(.heavy)` | `.highlight` |
| Card/tile | 0.98 | shadow collapse | 0.16 / 0.32 b0.18 | commit `.impact(.soft)` | `.lift` |
| List row | 1.0 | full-bleed fill | ease-out 0.08 / 0.25 | usually silent (nav rows) | `.highlight` |
| Glass control (iOS 26) | 0.98 max, no brightness | `.glassEffect(.interactive())` owns luminance | system | commit per metaphor | system |

## Latency budget

The press-in visual must begin within one display frame of touch-down -- 16ms at 60Hz, 8ms on ProMotion. Springs meet this because they have velocity from frame one; ease curves spend their first frames barely moving, reading as delayed even at the same duration. Never do main-actor work (formatting, a store hit) between touch-down and flipping the pressed state -- flip the visual first, do the work after.

`UIScrollView.delaysContentTouches` (default `true`) holds a content touch ~150ms before deciding scroll-vs-tap, which can make a naive press-in visual appear late inside a scroll view. `Button`'s `isPressed` already arbitrates this correctly -- the strongest reason to use `Button`+`ButtonStyle` for anything inside `List`/`ScrollView` rather than a raw `DragGesture(minimumDistance: 0)` press sensor, which wins against the enclosing scroll and blocks it from starting on top of the control.

For a control that should repeat while held (a stepper), use `buttonRepeatBehavior(_:)` (iOS 17+) rather than hand-rolling a timer -- it gives the correct accelerating cadence for free; pair repeats with `.selection` haptics.

## Availability + fallbacks

```swift
if #available(iOS 26, *) {
    Button(action: play) { Image(systemName: "play.fill").padding() }
        .glassEffect(.regular.interactive(), in: .capsule)   // system supplies the press-reactive sheen
} else {
    Button(action: play) { Image(systemName: "play.fill").padding() }
        .buttonStyle(PressableStyle(feel: .puck, haptic: .selection))   // manual press craft, pre-26
}
```

## Accessibility contract

- **Reduce Motion** -- `anim()`/`.animation(_:value:)` return `nil`: scale/dim/shadow still CHANGE, just instantly. Never gate the whole response behind Reduce Motion; a button with zero acknowledgment feels broken to everyone. The double-gate mechanics (`withAnimation` AND `.animation(_:value:)`) are owned by `references/accessibility/05-motion-accessibility.md`.
- **Increase Contrast** -- deepen the pressed dim (e.g. `-0.10`) or add a 1pt border; a subtle 6% brightness dim can vanish under increased contrast.
- **Reduce Transparency** -- for glass controls the system swaps to an opaque fill automatically; never hand-roll a translucent pressed overlay that ignores it.
- **Haptics are independent of Reduce Motion** -- keep them firing; gate only on the system Haptics toggle (automatic) and an app-level haptics preference if you expose one.
- **VoiceOver** -- because everything is a real `Button`, the trait and activation come for free; `.onTapGesture` loses them.
- **Hover** -- never the only path to a control; see "Hover is never a required affordance" above.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Same animation both press directions | The generated-UI tell -- no compression/pop asymmetry | Fast critically-damped press-in, springy pop press-out |
| `.easeInOut` on `isPressed` | Stutters on rapid taps, no velocity blending | `.spring(duration:bounce:)` |
| Commit-weight haptic hosted inside a `ButtonStyle` | Buzzes on every cancelled press (style can't distinguish commit from cancel) | Commit haptic at the action site, driven by a counter |
| `.onTapGesture` on a row/card | No press state, no cancel, no accessibility trait | `Button` + `ButtonStyle` |
| `onHover` + `withAnimation` for a view's own hover feedback | Main-actor jank | `.hoverEffect` (system-composited) |
| Row/card feature reachable only via hover | Invisible to touch, VoiceOver, Switch Control, Full Keyboard Access | Persistent control, context menu, or keyboard path required |
| `DragGesture(minimumDistance: 0)` press sensor on a scroll-embedded control | Wins the arena, blocks scrolling from on top of it | `Button` + `ButtonStyle` (system arbitration) |

## Severity guide

- **CRITICAL** -- an interactive row/card built with `.onTapGesture` (no accessibility trait, unusable by VoiceOver); a hover-only affordance with no touch/keyboard path.
- **HIGH** -- commit haptic hosted in a `ButtonStyle` (buzzes on cancel); Reduce Motion gates the entire press response instead of just the animation.
- **MEDIUM** -- symmetric press timing; missing full-bleed `contentShape` on a row leaving dead-zone gaps.
- **LOW** -- scale depth mismatched to control class; hover effect kind mismatch (`.lift` on a flat row).

## See also

- `references/interaction/04-gesture-disambiguation.md` -- gesture arena, `GestureMask`, scroll-vs-drag (OWNER)
- `references/interaction/06-custom-controls-reorderable.md` -- `accessibilityRepresentation`, custom slider/knob press states
- `references/haptics/02-swiftui-sensory-feedback.md` -- `SensoryFeedback` case catalog, `condition:` overload (OWNER)
- `references/animation/02-spring-physics.md#spring-presets` -- spring vocabulary and duration/bounce tuples (OWNER)
- `references/design/02-liquid-glass.md#tint-and-interactivity` -- `Glass.interactive()` press behavior (OWNER)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate (OWNER)
- `references/accessibility/04-motor-interaction.md#touch-targets` -- 44x44pt minimum hit region (OWNER)
- `~/Claude/vault/iOS Development/07 - SwiftUI Advanced Patterns.md#gestures`
