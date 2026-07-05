# Fluid Smoothness & Interruptible Animation

> Owner: `references/interaction/01-fluid-smoothness-interruptible.md` owns **interruptibility** -- why a running animation can be redirected, re-grabbed, or reversed mid-flight without snapping, and how to structure state so every interactive animation is interruptible by default. Spring parameter tuning (duration/bounce presets, per-interaction tuples) lives in `references/animation/02-spring-physics.md`; the Reduce Motion double-gate mechanics and full substitution catalog live in `references/accessibility/05-motion-accessibility.md` (OWNER); frame-budget numbers and field measurement (MetricKit, Instruments) live in `references/performance/03-launch-memory-instruments.md`.
> Floors: `Animatable`/`VectorArithmetic`/`AnimatablePair` are iOS 13.0+; `Spring` (the struct) and `Transaction.tracksVelocity` are iOS 17.0+ -- see `references/_scaffolding/version-floor-registry.md#ios-170`. `UIUpdateLink` and `UIGestureRecognizerRepresentable.velocity(in:)` are iOS 18.0+ -- `#ios-180`.

An animation a user can never interrupt is not really interactive -- it is a cutscene the touch happens to trigger. The single craft skill that separates an app that merely *has* animations from one that feels alive is this: **grab it while it's still moving and it must respond from where it actually is, at the speed it's actually going, with no visible restart.** Every technique below serves that one property.

## The Apple way

- Any property a user can interrupt -- drag, re-tap, toggle-spam, a re-grab mid-settle -- is driven by a member of the spring family (`.spring`, `.snappy`, `.smooth`, `.bouncy`, `.interactiveSpring`, `.interpolatingSpring`), never a fixed-duration curve. Curves carry position across a retarget but reset velocity to zero, which the eye reads as a kink.
- `.animation(_:value:)` is the default wiring for anything whose driving state can change from more than one call site (gesture, timer, network, notification) -- it retargets automatically on every change. Reserve `withAnimation` for state you can guarantee is mutated at a single, always-wrapped site.
- Motion expressible as a from-to change of a compositor property (`scaleEffect`, `offset`, `opacity`, `rotationEffect`) rides `withAnimation`/`.animation(_:value:)` and is handed to the render server in one commit -- it survives a busy main thread. Reach for a per-frame driven loop (`TimelineView(.animation)`, `CADisplayLink`, `UIUpdateLink`) only for content that must be recomputed every frame (physics, a live waveform, scrubbing to an external clock).
- Live gesture tracking is never wrapped in `withAnimation` inside `.onChanged`/`.updating` -- that restarts the animation every frame and stutters. Track raw via `@GestureState`, animate only the `.onEnded` settle.

## The two animation models -- why one survives a busy main thread and the other doesn't

Core Animation runs animations on a separate render-server process. Which model your motion uses is the difference between "indestructible" and "only as smooth as my main thread."

**Model A -- render-server handoff (buttery).** `withAnimation`/`.animation(_:value:)` commit the FROM value, the TO value, and the timing curve to the render server in one `CATransaction`. The render server interpolates every intermediate frame itself, at the display's native rate, with zero further involvement from your code. A spring on `.scaleEffect`/`.offset`/`.opacity` keeps ticking at a perfect 120fps even if the main thread hangs for 200ms mid-animation -- the animation was already handed off.

**Model B -- per-frame, main-thread-driven (fragile).** `TimelineView(.animation)`, `CADisplayLink`, `UIUpdateLink` call back into your code on the main thread every single frame. If the main thread is busy -- image decode, a big `body`, JSON parsing, a lock wait -- the callback is late and the user sees a stutter, because *you* are the interpolator and you weren't ready.

```swift
// FRAGILE (Model B): main thread computes every frame; a busy frame IS a stutter.
TimelineView(.animation) { timeline in
    let phase = timeline.date.timeIntervalSinceReferenceDate
    Circle().scaleEffect(1 + 0.1 * sin(phase * 3))
}

// BULLETPROOF (Model A): handed off once; immune to main-thread hangs.
Circle()
    .scaleEffect(big ? 1.1 : 1.0)
    .animation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: big)
    .onAppear { big = true }
```

Both look identical when the main thread is idle. Under load -- scrolling a busy feed, decoding images -- the Model B version visibly hitches and the Model A version stays glass-smooth. This is also why decorative animation on Model A doesn't compete with scroll for main-thread budget: the render server carries it independently. Reserve Model B strictly for motion that genuinely cannot be a single from-to compositor animation, and when you must use it, keep the callback microscopic (zero allocation, zero formatter construction, draw into `Canvas`/`GraphicsContext` rather than rebuilding a view tree, share ONE clock across many animated elements).

## Why springs retarget and curves kink

Apple's `Animatable` mechanism is why interruption is smooth by construction, not by accident: when an animatable value changes inside `withAnimation`/`.animation`, SwiftUI interpolates between the OLD and NEW `animatableData` using `VectorArithmetic` operations, updating the setter every frame. "Old" is not the original start value -- it is the CURRENT interpolated value at the instant of interruption, which is why redirection never teleports back to the origin. Springs additionally carry the current *velocity* into the new animation (Apple: "each animation will be replaced by its successor, preserving velocity from one animation to the next"); timing curves carry position but reset velocity to zero, producing the visible decelerate-then-re-accelerate kink. This is the whole reason the rule above is not a style preference -- it is the only path to velocity continuity.

Any type whose `animatableData` is `VectorArithmetic` (`CGFloat`, `Double`, `AnimatablePair`, or your own conformance) gets this for free, including custom shapes and view modifiers:

```swift
// iOS 13+. Interrupting a retarget mid-count continues from the CURRENT displayed value + velocity.
struct AnimatableNumber: Animatable, View {
    var value: Double
    var animatableData: Double {
        get { value }
        set { value = newValue }
    }
    var body: some View { Text(value.formatted(.number.precision(.fractionLength(0)))).monospacedDigit() }
}
```

Watch for rotation wraparound: a raw `Double` degrees value interpolates linearly, so retargeting a 0->350deg spin to 10deg sweeps 340deg backward instead of continuing forward. Fix by accumulating deltas rather than resetting the underlying value, or normalize to the nearest-equivalent target in a custom setter. Spring parameter values (`response`/`dampingFraction`, `duration`/`bounce`, presets) live at `references/animation/02-spring-physics.md#spring-presets` -- this file is about the retargeting mechanism, not the tuning numbers.

## Wiring so interruption is automatic, not incidental

Interruptibility is 80% how you wire state, 20% which spring you pick.

```swift
// A. Implicit, targeted -- retargets automatically on every change to `isOpen`, from any source.
view.animation(.snappy, value: isOpen)

// B. Explicit -- retargets only if THIS mutation is wrapped. Miss one call site and it jumps instantly.
withAnimation(.snappy) { isOpen.toggle() }
```

Both feed the same retargeting engine, but `.animation(_:value:)` is the safer default: it is declarative, so a value driven by a gesture, a timer, AND a push notification retargets correctly no matter which source changes it. For per-branch control -- one view should snap while its siblings animate, or a specific mutation needs a different curve than the ambient one -- reshape the transaction locally instead of branching the view body:

```swift
// iOS 13+. Kill inheritance for one branch (the canonical fix for "why is this label sliding too").
someStaticSibling.transaction { $0.animation = nil }

// iOS 13+, value: overload scopes to a specific value's changes.
myView.transaction(value: flag) { $0.disablesAnimations = true }

// iOS 17+. Mutates animation for ONLY the modifiers inside body -- the most precise tool.
MyView(isActive: isActive).transaction { $0.animation = $0.animation?.speed(2) } body: { content in
    content.opacity(isActive ? 1 : 0)
}
```

`withTransaction(_:)` attaches a configured `Transaction` to a specific state mutation instead of a blunt `withAnimation`, and can suppress implicit animations riding along via `disablesAnimations = true`. Never scope a value-driven animation broader than the leaf that changes -- a spring on a `List`/`ScrollView` container animates every row's geometry against the live scroll and reads as broken, not buttery.

## Velocity handoff: `Transaction.tracksVelocity`

When a value changes repeatedly from an interactive source (a drag, a slider, a streamed update) WITHOUT animation, and a later change applies a spring, that spring launches from zero velocity unless the transaction records the interim motion:

```swift
// iOS 17+. SwiftUI measures the live velocity for you -- no manual points/sec math.
func receiveChange(_ change: ChangeInfo) {
    var t = Transaction()
    if change.isFinal {
        t.animation = .spring(duration: 0.45, bounce: 0.2)   // settle inherits the tracked velocity
    } else {
        t.tracksVelocity = true                              // record motion during live changes
    }
    withTransaction(t) { state.applyChange(change) }
}
```

The result: a sheet thrown upward keeps going instead of decelerating from a standstill. This works for non-gesture sources too -- a live collaborator's cursor, an externally-driven slider -- anywhere a value is pushed rapidly and should settle with momentum. `blendDuration` on `.spring(duration:bounce:blendDuration:)` does NOT control velocity continuity (that's automatic); it smooths the *pace* change when the interrupting spring has a different response than the one it interrupts -- a no-op when both springs share a response.

## Hand-rolled interruption: the `Spring` value type

When the animated quantity is something SwiftUI's modifiers can't reach -- a Metal shader uniform, a `Canvas` parameter, a value shared with a non-View system -- step the physics yourself with the iOS 17+ `Spring` struct. Because you keep `value` and `velocity` as persistent state across ticks, a retarget is just changing `target`; velocity is never reset, so a pop is not even expressible:

```swift
// iOS 17+. THE interruptibility primitive: mutates value AND velocity in place.
func update(value: inout V, velocity: inout V, target: V, deltaTime: TimeInterval)
```

Seed `velocity` directly from a gesture's release when you want a real flick handoff (`DragGesture.Value.velocity`, points/sec, iOS 17+, used raw when your sim runs in the same coordinate space -- no normalization needed here, unlike `interpolatingSpring(initialVelocity:)`, which wants velocity relative to remaining travel). Poll `spring.settlingDuration(target:initialVelocity:epsilon:)` to stop the loop once settled -- an un-stopped `TimelineView(.animation)` keeps drawing at refresh rate after rest, burning battery for nothing.

## Hitting 120fps when you must drive it yourself

Frame-budget numbers and field measurement own `references/performance/03-launch-memory-instruments.md#hangs-hitches-and-the-swiftui-instrument`; this is the craft-side checklist for a Model B loop. Interpolate to `CADisplayLink.targetTimestamp` -- when the frame you're drawing NOW will actually be scanned out -- never to `.timestamp` or `CACurrentMediaTime()`, which position content for a moment that has already passed; under ProMotion's variable 10-120Hz interval that lag wobbles instead of staying constant, which reads as jitter, not lag. Request a RANGE (`CAFrameRateRange(minimum:maximum:preferred:)`), never a locked rate -- a fixed 120/120/120 fights the system's power management. Set `CADisableMinimumFrameDurationOnPhone = YES` in Info.plist or an iPhone silently throttles display-link callbacks to 60Hz even on a 120Hz panel. Query `maximumFramesPerSecond` off the window's screen (`UIScreen.main` is deprecated iOS 16+) -- never assume 120. On iOS 18+, prefer `UIUpdateLink` over `CADisplayLink` for its richer per-update info. Cap genuinely ambient motion (a slow breathing glow, a drifting gradient) at 30fps via `TimelineView(.animation(minimumInterval: 1.0/30.0))` -- the eye can't resolve the difference and it frees budget for interactions that need the full rate.

## Anti-patterns

Every "why does this feel janky when I flip it fast" bug traces to one of these ten.

| Wrong | Why it fails | Right |
|---|---|---|
| Timing curve on a property the user can interrupt | Carries position but resets velocity to zero on retarget -- decelerates to a stop, then re-accelerates | Switch to the spring family |
| `withAnimation` called inside `.onChanged` | A fresh animation starts every frame -- it never settles into one retargetable spring | `.animation(.interactiveSpring, value:)` on a `@GestureState`-backed value; settle with `withAnimation(.spring)` only in `.onEnded` |
| A `@GestureState` that resets to zero racing a still-in-flight settle on a separate `@State` | Grabbing a card mid-settle jumps it to the finger instead of catching it | One source of truth -- reconcile the gesture against the committed base offset so a re-grab retargets the SAME spring |
| Raw points/sec fed into `interpolatingSpring(initialVelocity:)` | The parameter is relative to remaining travel, not points/sec -- fast flicks overshoot wildly, slow ones barely move | Normalize (`physicalVelocity / (target - start)`), or use `Transaction.tracksVelocity` instead |
| A type whose `animatableData` isn't `VectorArithmetic`, or a discrete value | Nothing to interpolate -- the value jumps and interruption is meaningless | Conform to `Animatable` (`AnimatablePair` for multiple channels) |
| Raw `Double` degrees driving rotation | Interpolates linearly across the wraparound -- flick a knob twice and it spins the long way round | Accumulate deltas, or normalize to nearest-equivalent target in the setter |
| An `.id()`/`ForEach` identity change during the interaction | Reads as insert+remove instead of a retarget -- the view cross-fades or slides in as if new | Keep stable identity across the interaction; animate properties, not identity |
| Destructive work inside `withAnimation`'s `completion:` | A retarget defers or invalidates completion timing -- an interruptible dismiss unmounts too early or leaves stale state | Commit intent, then act -- gate destructive work on a committed-state check, not completion timing |
| Deprecated whole-view `.animation(_:)` | Animates every change in the subtree, not just the intended value -- incidental jank during an unrelated gesture | Targeted `.animation(_:value:)` |
| Animating a `frame`/layout property under rapid interruption | Layout re-runs every frame, fighting continuous interpolation -- visible judder | Animate a render transform during the interactive phase; commit to layout only at rest |

## Reduce Motion

Reduce Motion governs decorative motion, not feedback or intent -- gating the wrong thing here breaks the interaction, not just the aesthetics.

- KEEP 1:1 direct-manipulation tracking (a finger-following drag is essential feedback, not decoration) -- never zero it.
- KEEP haptics and commit/detent logic -- a haptic is feedback, gated only by the app's own haptic setting, never `accessibilityReduceMotion`.
- KEEP velocity-projection decisions (`predictedEndTranslation`, `Transaction.tracksVelocity`) -- responsiveness to intent is not motion.
- DROP decorative overshoot, bounce, and parallax -- the settle spring becomes an instant snap: `withAnimation(reduceMotion ? nil : .spring(...))`; passing `nil` reuses the identical code path with zero interpolation, so gate the ONE call site rather than forking the view body into a separate reduced-motion branch.
- Prefer `.transaction { $0.disablesAnimations = true }` to snap ONE element while siblings still animate, over branching the whole subtree.
- Do not blanket-kill all motion -- dropping essential finger-tracking to satisfy Reduce Motion is itself a bug; users lose the direct-manipulation feel the gesture is built on. Full substitution catalog: `references/accessibility/05-motion-accessibility.md` (OWNER).

## Severity guide

- **CRITICAL** -- a decorative spring left ungated under Reduce Motion drives continuous parallax/zoom (WCAG 2.3.3); OR live drag tracking is wrapped in `withAnimation`, making the control feel broken for every user.
- **HIGH** -- `withAnimation` used where the mutating state has multiple call sites, so some paths skip animation entirely and jump; OR a fling settle seeded with raw points/sec into `interpolatingSpring(initialVelocity:)`.
- **MEDIUM** -- a timing curve on a property the user can interrupt (visible kink on rapid reversal, not a functional break).
- **LOW** -- an un-stopped `TimelineView`/`CADisplayLink` loop left running after the animated value settles (battery, not feel).

## See also

- `references/animation/01-animation-fundamentals.md#reduce-motion-critical` -- implicit vs explicit animation, the RM double-gate idiom this file assumes
- `references/animation/02-spring-physics.md#spring-presets` -- spring parameter values and presets (this file owns the retargeting mechanism, not the tuning numbers)
- `references/animation/05-gesture-driven.md#interactive-springs-for-gesture-handoff` -- gesture-to-spring handoff at the DragGesture call-site level
- `references/interaction/03-direct-manipulation-drag.md` -- 1:1 tracking, momentum, and rubber-banding built on top of the interruptibility model here
- `references/performance/03-launch-memory-instruments.md#hangs-hitches-and-the-swiftui-instrument` -- frame-budget table and field measurement (MetricKit, Instruments)
- `references/accessibility/05-motion-accessibility.md` -- full Reduce Motion substitution catalog (OWNER)
