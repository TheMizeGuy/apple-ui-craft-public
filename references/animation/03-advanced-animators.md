# Advanced Animators (iOS 17+)

PhaseAnimator and KeyframeAnimator provide structured ways to choreograph multi-step animations. CustomAnimation lets you define entirely custom curves.

## PhaseAnimator

Cycles through discrete phases automatically, applying different view modifiers at each phase. Each phase transition can have its own animation.

### Continuous loop

```swift
enum PulsePhase: CaseIterable {
    case small, large
    
    var scale: Double {
        switch self {
        case .small: 0.8
        case .large: 1.2
        }
    }
    
    var opacity: Double {
        switch self {
        case .small: 0.5
        case .large: 1.0
        }
    }
}

PhaseAnimator(PulsePhase.allCases) { phase in
    Circle()
        .fill(.blue)
        .scaleEffect(phase.scale)
        .opacity(phase.opacity)
} animation: { phase in
    switch phase {
    case .small: .easeOut(duration: 0.8)
    case .large: .easeIn(duration: 0.8)
    }
}
```

### Trigger-based (one-shot)

```swift
enum ShakePhase: CaseIterable {
    case idle, left, right, settle
    
    var offset: CGFloat {
        switch self {
        case .idle, .settle: 0
        case .left: -10
        case .right: 10
        }
    }
}

@State private var triggerCount = 0

PhaseAnimator(ShakePhase.allCases, trigger: triggerCount) { phase in
    Image(systemName: "exclamationmark.triangle.fill")
        .offset(x: phase.offset)
} animation: { phase in
    .spring(duration: 0.15, bounce: 0.3)
}
.onTapGesture {
    triggerCount += 1  // Plays through phases once
}
```

### View modifier variant

```swift
Image(systemName: "heart.fill")
    .phaseAnimator([false, true]) { content, phase in
        content
            .scaleEffect(phase ? 1.2 : 1.0)
            .opacity(phase ? 1.0 : 0.7)
    } animation: { phase in
        .easeInOut(duration: 0.5)
    }
```

### When to use PhaseAnimator

| Use PhaseAnimator | Don't use PhaseAnimator |
|---|---|
| Multi-step state transitions | Single property animation (use `.animation` instead) |
| All properties transition together per phase | Independent per-property timing (use KeyframeAnimator) |
| Cycling animation (loading, pulse) | One-time animation (use `withAnimation`) |
| Discrete phases with their own curves | Continuous interpolation (use Animatable) |

## KeyframeAnimator

Independent animation tracks per property with precise timing control. Like After Effects keyframes or CSS `@keyframes`.

### Setup

Define an animatable values struct:

```swift
struct AnimationValues {
    var scale: Double = 1.0
    var verticalOffset: Double = 0.0
    var rotation: Angle = .zero
    var opacity: Double = 1.0
}
```

### Building tracks

```swift
@State private var trigger = 0

KeyframeAnimator(initialValue: AnimationValues(), trigger: trigger) { values in
    Image(systemName: "star.fill")
        .font(.system(size: 60))
        .foregroundStyle(.yellow)
        .scaleEffect(values.scale)
        .offset(y: values.verticalOffset)
        .rotationEffect(values.rotation)
        .opacity(values.opacity)
} keyframes: { _ in
    // Each track animates independently
    KeyframeTrack(\.scale) {
        CubicKeyframe(1.5, duration: 0.2)
        CubicKeyframe(0.8, duration: 0.1)
        SpringKeyframe(1.0, duration: 0.4, spring: .bouncy)
    }
    
    KeyframeTrack(\.verticalOffset) {
        SpringKeyframe(-60, duration: 0.3, spring: .snappy)
        CubicKeyframe(-40, duration: 0.1)
        SpringKeyframe(0, duration: 0.3, spring: .bouncy)
    }
    
    KeyframeTrack(\.rotation) {
        LinearKeyframe(.degrees(-15), duration: 0.1)
        LinearKeyframe(.degrees(15), duration: 0.1)
        LinearKeyframe(.degrees(-10), duration: 0.1)
        LinearKeyframe(.degrees(10), duration: 0.1)
        SpringKeyframe(.zero, duration: 0.3)
    }
    
    KeyframeTrack(\.opacity) {
        CubicKeyframe(0.7, duration: 0.1)
        CubicKeyframe(1.0, duration: 0.2)
    }
}
.onTapGesture {
    trigger += 1
}
```

### Keyframe types

| Type | Interpolation | Use case |
|---|---|---|
| `LinearKeyframe(value, duration)` | Constant velocity | Mechanical motion, shaking |
| `CubicKeyframe(value, duration)` | Bezier curve (smooth) | Smooth transitions |
| `SpringKeyframe(value, duration, spring:)` | Physics spring | Natural settling |
| `MoveKeyframe(value)` | Instant jump (no interpolation) | Teleporting, resetting |

```swift
KeyframeTrack(\.scale) {
    MoveKeyframe(2.0)                                        // Jump to 2.0
    LinearKeyframe(1.5, duration: 0.3)                       // Linear to 1.5
    CubicKeyframe(0.8, duration: 0.2)                        // Smooth to 0.8
    SpringKeyframe(1.0, duration: 0.4, spring: .bouncy)      // Spring to 1.0
}
```

### Repeating keyframe animations

`KeyframeAnimator` has a native continuous-loop initializer -- `repeating: Bool = true` -- plus a matching view-modifier overload. This is a SEPARATE overload from the `trigger:` initializer above, not a config flag on it:

```swift
KeyframeAnimator(initialValue: AnimationValues(), repeating: true) { values in
    Image(systemName: "star.fill")
        .scaleEffect(values.scale)
        .opacity(values.opacity)
} keyframes: { _ in
    KeyframeTrack(\.scale) {
        SpringKeyframe(1.3, duration: 0.6, spring: .smooth)
        SpringKeyframe(1.0, duration: 0.6, spring: .smooth)
    }
    KeyframeTrack(\.opacity) {
        LinearKeyframe(0.6, duration: 0.6)
        LinearKeyframe(1.0, duration: 0.6)
    }
}
```

`repeating: false` plays the timeline once and then holds the value from its START (not mid-loop) -- useful when you want the repeating-shaped API without the loop.

Only reach for a `Timer` when the re-trigger interval must VARY (jittered reminders, re-firing on a schedule the fixed continuous loop can't express):

```swift
@State private var trigger = 0
let timer = Timer.publish(every: 2.0, on: .main, in: .common).autoconnect()

KeyframeAnimator(initialValue: AnimationValues(), trigger: trigger) { values in
    // ...
} keyframes: { _ in
    // ...
}
.onReceive(timer) { _ in
    trigger += 1
}
.onDisappear {
    timer.upstream.connect().cancel()   // .autoconnect() has no direct handle; re-connecting the upstream publisher yields the Cancellable to tear down
}
```

`PhaseAnimator` has NO `repeating:` overload -- its loop-vs-one-shot is controlled entirely by the presence or absence of `trigger:` (see "Trigger-based (one-shot)" above), not a parameter.

### When to use KeyframeAnimator

| Use KeyframeAnimator | Don't use KeyframeAnimator |
|---|---|
| Properties need independent timing | All properties move together (use PhaseAnimator) |
| Complex choreographed motion | Simple state change (use withAnimation) |
| Total animation duration matters | Open-ended interactive animation (use gesture + spring) |
| Each property has its own curve | Want a single curve for everything |

## PhaseAnimator vs KeyframeAnimator

| Feature | PhaseAnimator | KeyframeAnimator |
|---|---|---|
| Concept | Discrete states, one at a time | Timeline tracks per property |
| Property independence | All properties transition together per phase | Each property animated independently |
| Timing control | Per-phase animation curve | Per-keyframe duration and curve |
| Complexity | Simple -- define phases | Complex -- define tracks and keyframes |
| Use case | Multi-step state transitions | Precise choreographed motion |

## CustomAnimation protocol

For when you need entirely custom animation curves:

```swift
struct ElasticAnimation: CustomAnimation {
    var duration: TimeInterval
    var bounces: Int
    
    func animate<V: VectorArithmetic>(
        value: V,
        time: TimeInterval,
        context: inout AnimationContext<V>
    ) -> V? {
        guard time < duration else { return nil }  // Animation complete
        
        let progress = time / duration
        let frequency = Double(bounces) * .pi
        let decay = 1.0 - progress
        let oscillation = sin(frequency * progress) * decay
        let scale = 1.0 + oscillation * 0.3
        
        return value.scaled(by: scale)
    }
}

extension Animation {
    static func elastic(duration: TimeInterval = 0.8, bounces: Int = 3) -> Animation {
        Animation(ElasticAnimation(duration: duration, bounces: bounces))
    }
}

// Usage
withAnimation(.elastic(duration: 1.0, bounces: 4)) {
    scale = 1.5
}
```

**You usually don't need this.** Springs cover 95% of cases. CustomAnimation is for genuinely novel motion (elastic snap, magnetic attraction).

## Animatable for custom shapes

Make custom shapes animate by conforming to `Animatable`:

```swift
struct PieSlice: Shape {
    var endAngle: Angle
    
    var animatableData: Double {
        get { endAngle.degrees }
        set { endAngle = .degrees(newValue) }
    }
    
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2
        
        var path = Path()
        path.move(to: center)
        path.addArc(
            center: center,
            radius: radius,
            startAngle: .degrees(-90),
            endAngle: endAngle - .degrees(90),
            clockwise: false
        )
        path.closeSubpath()
        return path
    }
}
```

For multiple animatable properties, nest `AnimatablePair`:

```swift
struct WaveShape: Shape {
    var frequency: Double
    var amplitude: Double
    
    var animatableData: AnimatablePair<Double, Double> {
        get { AnimatablePair(frequency, amplitude) }
        set {
            frequency = newValue.first
            amplitude = newValue.second
        }
    }
    // ...
}
```

## SymbolEffect (iOS 17+)

Animate SF Symbols with built-in, symbol-aware effects (covered in `design/05-sf-symbols.md`):

```swift
.symbolEffect(.bounce, value: triggerValue)
.symbolEffect(.pulse)
.symbolEffect(.variableColor.iterative)
.symbolEffect(.appear, isActive: isComplete)
.symbolEffect(.wiggle)         // iOS 18+
.symbolEffect(.breathe)        // iOS 18+
.symbolEffect(.rotate)         // iOS 18+
```

## Reduce Motion (CRITICAL)

`PhaseAnimator` and `KeyframeAnimator` loops are NEVER auto-gated by the system -- nothing pauses them for you. Every continuous or trigger-replayed animator on this page needs an explicit branch on `@Environment(\.accessibilityReduceMotion)`.

**PhaseAnimator -- freeze on a resting phase, don't just stop:**

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

var body: some View {
    if reduceMotion {
        Circle().fill(.blue).opacity(0.8)                 // resting phase, no cycling
    } else {
        PhaseAnimator(PulsePhase.allCases) { phase in
            Circle().fill(.blue).scaleEffect(phase.scale).opacity(phase.opacity)
        } animation: { phase in
            switch phase {
            case .small: .easeOut(duration: 0.8)
            case .large: .easeIn(duration: 0.8)
            }
        }
    }
}
```

**KeyframeAnimator -- shrink to a crossfade, don't remove all feedback:** collapse positional/rotation amplitude toward zero while keeping the opacity track, or fall back to a plain `withAnimation(.easeInOut(duration: 0.2))` opacity change entirely. Removing all feedback can read as more broken than a calmer version -- the state change still has to communicate something.

**Any `Timer`-driven re-trigger loop** (see "Repeating keyframe animations" above) must also be canceled in `.onDisappear` or on a `scenePhase` transition to `.background` -- an un-canceled `Timer.publish(...).autoconnect()` keeps firing and mutating `@State` on a view that no longer exists.

This generalizes past this file: system auto-gating only covers Glass specular highlights, default push/sheet transitions, and one-shot discrete symbol effects. Any looping symbol effect, `PhaseAnimator`, or `KeyframeAnimator` is YOUR gate -- full substitution catalog: `references/accessibility/05-motion-accessibility.md` (OWNER).

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| PhaseAnimator with single phase | No animation (needs 2+ phases) | Provide at least 2 phases |
| KeyframeTrack durations don't sum to expected total | Tracks end at different times | Plan total duration per track |
| Using KeyframeAnimator for simple state change | Overkill | Use `withAnimation` |
| Using PhaseAnimator for independent timing | All phases transition together | Use KeyframeAnimator |
| `.repeatForever` on PhaseAnimator | Already cycles by default (without trigger) | Don't add `.repeatForever` |
| CustomAnimation when spring would work | Reinventing the wheel | Use `.spring()` first |
| Looping animator with no Reduce Motion branch | Vestibular-trigger motion never stops | Freeze on resting phase per the Reduce Motion section above |

## See also

- `references/animation/01-animation-fundamentals.md#reduce-motion-critical` -- when to use which animator, RM double-gate
- `references/animation/02-spring-physics.md#spring-presets` -- spring parameters
- `references/animation/04-transitions-geometry.md#transitions` -- transitions are different from animators
- `references/accessibility/05-motion-accessibility.md` -- full RM substitution catalog (OWNER)
- `~/Claude/vault/iOS Development/81 - SwiftUI Animation Deep Dive.md`
