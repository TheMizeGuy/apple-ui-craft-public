# Gesture Disambiguation

> Owner: this file owns the gesture ARENA -- which modifier wins a touch, `GestureMask`, hit-testing/`contentShape` before recognition even starts, and the scroll-vs-drag conflict. `references/animation/05-gesture-driven.md` owns gesture composition SYNTAX (`.sequenced`/`.simultaneously`/`.exclusively`) and gesture-driven animation handoff -- cite it, don't restate it.
> Floors: `references/_scaffolding/version-floor-registry.md`. `UIGestureRecognizerRepresentable` is iOS 18.0+ -- state inline, it is this file's headline API. `GestureInputKinds` is iOS 27.0+ on every platform; the `inputKinds:` gesture initializers are iOS 27.0+ with per-gesture platform lists -- only `TapGesture`'s reaches tvOS, and `MagnifyGesture`/`RotateGesture` skip tvOS and watchOS.

SwiftUI runs every touch through a gesture arena: when a finger lands, every eligible recognizer in the hit view's ancestry competes, and by default only ONE wins. Disambiguation is choosing, deliberately, which one -- and the single most common ship-blocking bug in the whole domain is a custom drag inside a `ScrollView`/`List` that either eats the scroll or gets eaten by it. That bug has exactly one correct fix, and it is not `.simultaneousGesture`.

## The Apple way

Three attachment modifiers pick who wins a touch, and picking the wrong one produces a specific, nameable felt failure -- not a compile error:

- **`.gesture(g)`** -- `g` is a loser by default. It sits below the view's own built-in gestures (`Button` tap, `ScrollView` pan, `List` row selection). Correct for additive gestures on inert content (`Color`, `Image`, `Shape`).
- **`.highPriorityGesture(g)`** -- `g` preempts the view's own gestures. Use only when you deliberately steal touches from children. Attaching it over a `ScrollView`/`List` kills scrolling, because the drag wins the arena before the scroll pan can even classify direction.
- **`.simultaneousGesture(g)`** -- `g` fires ALONGSIDE the built-ins; both win. Great for "track the drag while the row still highlights," but the footgun is double-activation: `.simultaneousGesture(TapGesture())` on a `Button` row fires both the row handler and the button.

Composition syntax (`.sequenced(before:)`, `.simultaneously(with:)`, `.exclusively(before:)`) and the priority table are owned by `references/animation/05-gesture-driven.md#gesture-composition` / `#gesture-priority`. Decision tree here:

1. Target is inert (no `Button`/scroll/selection underneath) -> plain `.gesture(g)`.
2. You want your gesture AND the native behavior to both run (drag-to-reorder while the row still shows its press highlight) -> `.simultaneousGesture(g)`, gated so it only *commits* on the intended axis/threshold.
3. Your gesture must beat a child that would otherwise swallow the touch, and the child must NOT act -> `.gesture(g, including: .gesture)` (disables subview gestures while yours is attached) over `.highPriorityGesture`.
4. Two of YOUR OWN gestures, only one should win -> `ExclusiveGesture`/`.exclusively(before:)`, not two separate modifiers.
5. Conflict is with a `ScrollView`/`List` pan specifically -> none of the above fully works. Drop to `UIGestureRecognizerRepresentable` (below).

## GestureMask -- the surgical scalpel

`.gesture(g, including: mask)` and the `including:` overloads on `.simultaneousGesture`/`.highPriorityGesture` take a `GestureMask`: `.all` (default, both recognize), `.gesture` (only `g`), `.subviews` (only children), `.none` (temporarily inert -- useful mid-animation so a re-tap can't interrupt it janky). Drive the mask from state instead of swapping modifiers:

```swift
// A draggable card whose inner buttons must be dead WHILE dragging, live otherwise.
@GestureState private var isDragging = false

card
    .gesture(
        DragGesture(minimumDistance: 12)
            .updating($isDragging) { _, s, _ in s = true }
            .onChanged { /* ... */ }
            .onEnded { /* ... */ },
        including: isDragging ? .gesture : .all   // buttons live until the drag actually starts
    )
```

The buttons stay tappable until a real drag begins, then go inert so a fingertip sliding off a button mid-drag never fires it. That is the difference between "feels precise" and "why did it open that?"

## Input kinds: partitioning by hardware (iOS 27+)

`GestureMask` decides which recognizer may compete. `GestureInputKinds` decides which HARDWARE may wake one, and it resolves the conflicts the mask cannot -- a pencil stroke that must mark while a finger pans, a pointer click that must mean something different from a tap. Before iOS 27 that required a `UIGestureRecognizerRepresentable` bridge inspecting `UITouch.type`; now it is a parameter at construction.

`GestureInputKinds` is an option set with five members: `.all` (every present and future input kind, the default everywhere), `.directTouch` (finger on screen), `.indirectTouch` (trackpad, remote), `.pencil`, `.pointer` (mouse or trackpad button press). Nine gesture types gained an `inputKinds:` initializer overload -- `DragGesture`, `TapGesture`, `LongPressGesture`, `MagnifyGesture`, `RotateGesture`, `RotateGesture3D`, `SpatialTapGesture`, `SpatialEventGesture`, `WindowDragGesture`:

```swift
init(minimumDistance: CGFloat = 10, coordinateSpace: some CoordinateSpaceProtocol = .local,
     inputKinds: GestureInputKinds = .all)                                   // DragGesture
init(count: Int = 1, inputKinds: GestureInputKinds = .all)                   // TapGesture
init(minimumDuration: Double = 0.5, maximumDistance: CGFloat = 10,
     inputKinds: GestureInputKinds = .all)                                   // LongPressGesture
init(minimumScaleDelta: CGFloat = 0.01, inputKinds: GestureInputKinds = .all) // MagnifyGesture
init(minimumAngleDelta: Angle = .degrees(1), inputKinds: GestureInputKinds = .all) // RotateGesture
```

Two view modifiers carry it directly: `onTapGesture(count:coordinateSpace:inputKinds:perform:)` (all platforms) and `onLongPressGesture(minimumDuration:maximumDistance:inputKinds:perform:onPressingChanged:)` (not tvOS) -- both owned by `references/interaction/05-press-feedback-states.md#input-kinds-on-tap-and-long-press-ios-27`.

The canonical case is the drawing surface, where pencil and finger must mean different things:

```swift
@available(iOS 27, *)
struct DrawingSurface: View {
    @Binding var strokes: [Stroke]
    @Binding var canvasOffset: CGSize

    var body: some View {
        CanvasLayer(strokes: strokes)
            .gesture(                                                // pencil marks, never pans
                DragGesture(minimumDistance: 0, inputKinds: .pencil)
                    .onChanged { strokes.appendPoint($0.location) }
            )
            .simultaneousGesture(                                    // finger and trackpad pan, never mark
                DragGesture(minimumDistance: 10, inputKinds: [.directTouch, .indirectTouch])
                    .onChanged { canvasOffset = $0.translation }
            )
    }
}
```

Because the parameter defaults to `.all`, adding it is source-compatible and changes nothing for input sources you do not name -- which makes it a safe additive adoption behind `#available(iOS 27, *)`, with the pre-27 branch falling back to the `UIGestureRecognizerRepresentable` bridge below or to priority juggling. This is the platform's own model, not an app-level invention: Apple's HIG "Motion" already states that Liquid Glass "responds to direct touch interaction with greater emphasis to reinforce the feeling of a tactile experience, but produces a more subdued effect when a person interacts using a trackpad." System components have always varied behavior by input source; `inputKinds:` is the first time an app can.

On a content-creation surface, treating every input source identically is now a reviewable defect on a 27 floor, and any bespoke pencil-vs-finger disambiguation hack is legacy code to delete.

## Scroll-vs-drag: the one correct fix

A custom horizontal drag that must coexist with vertical scroll cannot be solved with `.simultaneousGesture` alone -- `DragGesture` recognizes on any direction past its threshold and claims the touch sequence at the arena level, so `.simultaneousGesture` lets both fire (worse than a conflict: now the scroll AND your drag both move). Escalate through the ladder and stop at the first rung that holds:

1. **SwiftUI-only, different axis:** `.simultaneousGesture(DragGesture(minimumDistance: 15))`, only *acting* once `abs(translation.width) > abs(translation.height) * 1.5`. Works for swipe-to-reveal rows; fails when the ambiguous phase must not move the scroll at all.
2. **Native affordances before custom gestures:** `.swipeActions(edge:)` (List rows -- coexists with scroll natively), `.draggable`/`.dropDestination`, `.scrollTargetBehavior(.paging)`/`.viewAligned` for paging. Reach for these before hand-rolling.
3. **`UIGestureRecognizerRepresentable` with a direction-gated pan (iOS 18.0+).** The only mechanism that makes a custom horizontal swipe and vertical scroll genuinely independent, because the delegate *refuses to start* on vertical intent -- the scroll pan never even competes for those touches:

```swift
@available(iOS 18.0, *)
struct HSwipe: UIGestureRecognizerRepresentable {
    @Binding var offset: CGFloat
    let onCommit: () -> Void

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let r = UIPanGestureRecognizer()
        r.delegate = context.coordinator
        return r
    }
    func handleUIGestureRecognizerAction(_ r: UIPanGestureRecognizer, context: Context) {
        switch r.state {
        case .changed: offset = r.translation(in: r.view).x
        case .ended, .cancelled, .failed: onCommit(); offset = 0
        default: break
        }
    }
    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    @MainActor final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        // Decline vertical-dominant drags -> they fall through to the ScrollView's pan untouched.
        func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
            guard let pan = g as? UIPanGestureRecognizer, let v = pan.view else { return true }
            let vel = pan.velocity(in: v)
            return abs(vel.x) > abs(vel.y)
        }
        func gestureRecognizer(_ g: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    }
}
// attach: .gesture(HSwipe(offset: $x, onCommit: commit))
```

The load-bearing method is `gestureRecognizerShouldBegin` returning `abs(vel.x) > abs(vel.y)`. For strict ordering instead of simultaneity (your gesture must get first refusal on every touch, and the scroll waits for it to conclusively fail), use `require(toFail:)` or the delegate pair `shouldRequireFailureOf`/`shouldBeRequiredToFailBy` -- but prefer the `shouldRecognizeSimultaneouslyWith: true` + tight `shouldBegin` gate above whenever possible; require-to-fail inserts a latency window where scrolling is held hostage waiting for your gesture to give up.

## Hit-testing decides the arena before it starts

`contentShape` defines what is tappable, not just what is drawn -- by default the transparent `Spacer`/padding in an `HStack` row is not hit-testable, which is why a row only responds when you tap the text:

```swift
HStack { icon; Text(title); Spacer() }
    .contentShape(Rectangle())               // whole row rect becomes the tap target
    .onTapGesture { open() }
```

`contentShape` also takes a kind: `.contentShape(.interaction, Rectangle())` (default hit-test/gesture region), `.contentShape(.dragPreview, RoundedRectangle(cornerRadius: 16))` (the shape lifted for `.draggable`/context-menu drag), `.contentShape(.contextMenuPreview, ...)` (context-menu highlight region).

Three shipped-bug rules worth memorizing: (1) a hit-testable view inside a body-scope `.overlay` SHADOWS any `.simultaneousGesture`/`.highPriorityGesture` on the view beneath it -- a `Color.clear.contentShape(Rectangle())` catcher in an overlay eats the hit-test for the whole subtree, and even a *failing* `.onTapGesture` still consumes it; don't stack hit-testable overlays over gesture-active regions. (2) a button inside a draggable card can fire at the moment the finger lifts at the end of a drag, unless you disarm it during the drag with the `GestureMask` pattern above or `.allowsHitTesting(!isDragging)`. (3) a `Text` carrying `.textSelection(.enabled)` now competes for the touch: rebuilt against the iOS 27 SDK it gains user-interactive system text selection where it previously offered only the callout menu, so a custom long-press or drag on that text is silently swallowed.

Rule (3) is the rare disambiguation regression that arrives on an SDK rebuild with no code change, and Apple's own remedy is a priority escalation rather than an arena trick -- attach the custom gesture with `.highPriorityGesture(_:)` so it beats the system selection gesture, or drop `.textSelection(.enabled)` on that view. In review, every custom gesture on a selectable `Text` is worth grepping for on any project moving to the 27 SDK.

Prefer a real `Button` + `ButtonStyle` over `.onTapGesture` whenever the thing is semantically a button -- you inherit correct hit-testing, the pressed state, accessibility traits, and correct scroll arbitration for free. Full press-state treatment: `references/interaction/05-press-feedback-states.md` (OWNER).

## Composing tap + long-press + drag on one view

The hardest disambiguation is three intents on the same pixel. The fix: decouple the press-FEEDBACK from the disambiguation. Show a touch-down state instantly, before intent resolves, using a `LongPressGesture(minimumDuration: 0, maximumDistance: .infinity)` as a pure "am I touched" sensor:

```swift
@GestureState private var isPressing = false

content
    .scaleEffect(isPressing ? 0.96 : 1)
    .animation(reduceMotion ? nil : .snappy(duration: 0.18), value: isPressing)
    .gesture(
        LongPressGesture(minimumDuration: 0, maximumDistance: .infinity)
            .updating($isPressing) { _, state, _ in state = true }
    )
```

For long-press-THEN-drag (pick-up-to-reorder), `.sequenced(before:)` yields a nested `Value` enum (`.first`/`.second`) -- syntax owned by `references/animation/05-gesture-driven.md#gesture-composition`. The one addition here: once the long-press has committed, start the drag stage at `DragGesture(minimumDistance: 0, coordinateSpace: .named(...))`, not the ambiguous 10pt default -- the finger is already down and waiting, so any slop reads as the item being stuck.

## `minimumDistance` is a feel knob, not a correctness setting

| Value | Feel | Use for |
|---|---|---|
| `0` | Zero tolerance; grabs the touch instantly, starves any competing tap/scroll | Slider thumb, custom knob -- surfaces that are ONLY draggable |
| `10` (default) | Stationary press stays a tap; a real slide becomes a drag | Anything that must also be tappable or coexist with a parent scroll |
| `18-24` | Deliberately sticky; small wobbles ignored | Reorder-on-hold rows, drag handles |
| `44+` | Only a committed swipe counts | Destructive swipe-to-delete confirmation |

The mistake that ships: reaching for `minimumDistance: 0` because a drag "feels unresponsive," when the real problem is a competing tap/scroll. Zero slop wins the arena but breaks the tap -- fix the conflict with the ladder above, keep `10`.

For a pager/side-drawer, lock the axis once on the first sample past the slop and ignore the off-axis component for the rest of the gesture; bias the tie toward the dominant scroll direction (`abs(width) > abs(height) * 1.3`, not `1.0`) so ambiguous diagonal swipes scroll the page rather than firing your gesture.

## Availability + fallbacks

```swift
if #available(iOS 18.0, *) {
    row.gesture(HSwipe(offset: $x, onCommit: commit))       // direction-gated pan, coexists with scroll
} else {
    row.simultaneousGesture(                                 // pre-18: axis-gated simultaneous, less precise
        DragGesture(minimumDistance: 15)
            .onChanged { v in
                guard abs(v.translation.width) > abs(v.translation.height) * 1.5 else { return }
                x = v.translation.width
            }
    )
}

// Input-source partitioning: iOS 27 does it declaratively, earlier targets bridge to UIKit.
if #available(iOS 27, *) {
    canvas.gesture(DragGesture(minimumDistance: 0, inputKinds: .pencil).onChanged(mark))
} else {
    canvas.gesture(PencilOnlyPan(onChange: mark))            // UIGestureRecognizerRepresentable, UITouch.type == .pencil
}
```

## Accessibility contract

Every custom `Gesture` is invisible to VoiceOver, Switch Control, Voice Control, and AssistiveTouch -- none of them replay a `DragGesture`. The moment you attach one, mirror its OUTCOME with an accessibility action:

```swift
messageRow
    .simultaneousGesture(swipeToReplyGesture)                 // sighted: swipe left
    .accessibilityAction(named: "Reply") { reply() }          // VoiceOver: rotor -> "Reply"
```

A `.highPriorityGesture` that greedily claims every touch can also swallow the synthetic taps AssistiveTouch/Switch Control send to an inner control -- keep gesture greed to the minimum this file's decision tree requires. Full alternative-action catalog (adjustable action, `accessibilityDragPoint`/`accessibilityDropPoint`, `accessibilityScrollAction`, `accessibilityZoomAction`): `references/animation/05-gesture-driven.md#accessibility-alternatives-for-custom-gestures`, with the base signatures owned by `references/accessibility/04-motor-interaction.md#native-voiceover-bridge-apis`. Reduce Motion double-gate (`withAnimation(_:)` AND `.animation(_:value:)`) is owned by `references/accessibility/05-motion-accessibility.md` -- gesture RECOGNITION is never gated by Reduce Motion (the 1:1 finger-follow is direct manipulation, not motion); only the settle/snap animation the gesture drives is.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `.highPriorityGesture(DragGesture())` over a `ScrollView`/`List` | Drag wins the arena before the scroll pan can classify direction -- scrolling dies | `UIGestureRecognizerRepresentable` with a direction-gated `shouldBegin`, or a native affordance |
| `.simultaneousGesture(DragGesture())` for row-drag-vs-scroll | Makes BOTH fire -- doesn't resolve the conflict, just hides it | Direction-gated `UIGestureRecognizerRepresentable` (iOS 18); `.simultaneousGesture` is fine only for swipe-back |
| `minimumDistance: 0` "to fix" an unresponsive drag | Wins the arena but starves the tap underneath | Keep `10`; fix the real conflict with the escalation ladder |
| Two tap modifiers (single + double) without `ExclusiveGesture` | Both fire, or single tap races the double | `TapGesture(count: 2).exclusively(before: TapGesture(count: 1))`, accept the ~0.3s single-tap delay |
| Hit-testable `Color.clear` catcher in an `.overlay` over a gesture-active view | Shadows the gesture beneath even when the tap fails | Don't stack hit-testable overlays over gesture regions; use `GestureMask` instead |
| Custom gesture with no `.accessibilityAction` | Invisible to VoiceOver/Switch Control/AssistiveTouch | Mirror every gesture outcome with a named accessibility action |
| Custom gesture on a `Text` with `.textSelection(.enabled)`, plain `.gesture(_:)` | On the iOS 27 SDK the system's interactive text selection swallows it -- a regression with no code change | `.highPriorityGesture(_:)`, or remove `.textSelection(.enabled)` from that view |
| Pencil-vs-finger split hand-rolled with `simultaneousGesture` priority juggling on a 27 floor | Reimplements a system primitive, and still misclassifies a pointer drag | `inputKinds:` at gesture construction (`.pencil` vs `[.directTouch, .indirectTouch]`) |

## Severity guide

- **CRITICAL** -- a custom gesture has no accessibility path at all (feature does not exist for VoiceOver/Switch Control users); `.highPriorityGesture` breaks scrolling app-wide.
- **HIGH** -- scroll-vs-drag solved with `.simultaneousGesture` (both fire); `minimumDistance: 0` used to paper over an unrelated conflict; a custom gesture on selectable `Text` left at plain `.gesture(_:)` after moving to the iOS 27 SDK (the gesture stops firing).
- **MEDIUM** -- missing `GestureMask` disarm lets a drag accidentally fire an inner button on release; a content-creation surface on a 27 floor treats pencil, finger and pointer identically.
- **LOW** -- axis-lock bias not tuned for the surrounding scroll direction; `contentShape` kind mismatch (rectangle hit-shape under a rounded drag-preview).

## See also

- `references/animation/05-gesture-driven.md#gesture-composition` -- `.sequenced`/`.simultaneously`/`.exclusively` syntax (OWNER)
- `references/animation/05-gesture-driven.md#gesture-priority` -- the `.gesture`/`.simultaneousGesture`/`.highPriorityGesture` table (OWNER)
- `references/interaction/03-direct-manipulation-drag.md` -- accessibility alternatives catalog, drag/pinch/rotate cookbook (OWNER)
- `references/interaction/05-press-feedback-states.md` -- `Button`/`ButtonStyle` press lifecycle (OWNER)
- `references/accessibility/04-motor-interaction.md#no-complex-gestures-required-wcag-251-pointer-gestures` -- single-pointer alternative requirement (WCAG 2.5.1, Level A)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate (OWNER)
