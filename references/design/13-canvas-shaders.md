# Canvas, Metal Shaders & Custom Drawing

> Owner: this file owns `Canvas`/`GraphicsContext` immediate-mode drawing, `TimelineView`-driven animation of that drawing, and writing/profiling Metal shaders via `.colorEffect`/`.layerEffect`/`.distortionEffect`. `references/design/12-text-rendering.md` owns using a `Shader` to fill `Text` and everything `TextRenderer`-shaped. `references/performance/01-swiftui-rendering.md` owns `.drawingGroup()` and the general render-cost model this file's escalation ladder ends at.
> Floors: cite `references/_scaffolding/version-floor-registry.md`. `Canvas` is iOS 15.0+ (incl. watchOS 8). The three shader modifiers are iOS 17.0+/macOS 14.0+ with **no watchOS row** -- shaders do not exist on watchOS; `Canvas` is the fallback there. `Shader.compile(as:)` pre-warming is iOS 18.0+/macOS 15.0+.

`Canvas` and Metal shader modifiers are the escalation path past what SwiftUI's native view modifiers can express -- particle systems, waveforms, custom gauges, ripples, holographic foil, dissolve transitions. Both are GPU-cheap per pixel but not free, and both bypass parts of the accessibility tree by default: this is a deliberate performance-and-accessibility decision, not decoration to sprinkle everywhere.

## The Apple way

- Stop at the first tool that achieves the look. Escalation order: native modifier (gradient, `Material`, `MeshGradient`, Liquid Glass) → `Canvas` → SwiftUI shader modifier → full Metal (`MTKView`). Each step down costs accessibility, maintainability, or performance headroom.
- `Canvas` renders pixels -- it is invisible to VoiceOver by default. Every `Canvas` needs an explicit semantic layer, or it should not exist; prefer Swift Charts for data visualization since it is accessible for free.
- A shader that conveys state (progress, selection, validity) through color or motion alone fails WCAG 1.4.1 -- pair it with a non-visual equivalent.

## Canvas and GraphicsContext

```swift
// iOS 15.0+ (incl. watchOS 8)
init(
    opaque: Bool = false,
    colorMode: ColorRenderingMode = .nonLinear,      // .linear / .nonLinear / .extendedLinear (wide-gamut/HDR)
    rendersAsynchronously: Bool = false,
    renderer: @escaping (inout GraphicsContext, CGSize) -> Void
)
// + a symbols: variant taking @ContentBuilder symbols: () -> Symbols for resolving real SwiftUI views
```

`opaque: true` can improve performance, but drawing non-opaque content into an opaque canvas is undefined -- only set it if you fully cover the surface. `rendersAsynchronously: true` presents off the main thread; the renderer closure must not touch main-actor state when it's set. Both the `init` and the `renderer` closure are `nonisolated`/`@escaping`: under Swift 6 strict concurrency, everything the closure captures must be `Sendable`. Capturing a mutable `@Observable`/class model or `@State` and mutating it inside the renderer is a data-race error -- compute in `body`, capture the value snapshot.

### Core drawing operations

```swift
Canvas { context, size in
    context.fill(Path(ellipseIn: CGRect(origin: .zero, size: size)), with: .color(.green))
    context.stroke(path, with: .linearGradient(Gradient(colors: [.blue, .purple]),
                                                startPoint: .zero, endPoint: CGPoint(x: size.width, y: 0)),
                    style: StrokeStyle(lineWidth: 3, lineCap: .round))
}
.frame(width: 300, height: 200)
```

`GraphicsContext.Shading` options: `.color(_:)`, `.linearGradient`, `.radialGradient`, `.conicGradient`, `.tiledImage`, `.style(_:)` (any `ShapeStyle` incl. `Color`, `Material`, `HierarchicalShapeStyle`, and -- iOS 17+ -- a `Shader`).

### Transforms, clipping, layers, filters

```swift
Canvas { ctx, size in
    ctx.translateBy(x: size.width / 2, y: size.height / 2)
    ctx.rotate(by: .degrees(30))
    ctx.scaleBy(x: 1.2, y: 1.2)
    ctx.opacity = 0.8                 // multiplies all subsequent drawing
    ctx.blendMode = .plusLighter      // additive glow for particles
    ctx.clip(to: Path(roundedRect: rect, cornerRadius: 12))

    ctx.drawLayer { layer in          // isolated sublayer -- group opacity/blur
        layer.addFilter(.blur(radius: 8))
        layer.fill(bigPath, with: .color(.white))
    }
}
```

`addFilter` values: `.blur(radius:opaque:)`, `.shadow(color:radius:x:y:blendMode:options:)`, `.colorMultiply`, `.hueRotation`, `.saturation`, `.brightness`, `.contrast`, `.colorInvert`, `.grayscale`, `.alphaThreshold`, and (iOS 17+) `.colorShader`, `.layerShader`, `.distortionShader` -- the same Metal shaders you can attach as view modifiers, usable inline in a `Canvas`.

### Drawing text, images, and resolved symbols

Arbitrary SwiftUI views cannot go inside a `Canvas`, but you can resolve and draw them:

```swift
Canvas { ctx, size in
    let resolvedText = ctx.resolve(Text("42").font(.system(size: 48, weight: .bold)))
    ctx.draw(resolvedText, at: CGPoint(x: size.width / 2, y: 40))

    let img = ctx.resolve(Image(systemName: "bolt.fill"))
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: 32, height: 32))

    if let badge = ctx.resolveSymbol(id: 0) { ctx.draw(badge, at: CGPoint(x: 100, y: 100)) }
} symbols: {
    BadgeView().tag(0)   // a full SwiftUI view, rasterized for canvas use
}
```

`ctx.draw(_ line: Text.Layout.Line, options: Text.Layout.DrawingOptions = .init())` bridges a `TextRenderer`'s laid-out line into a `Canvas`-style pipeline (`references/design/12-text-rendering.md#textlayoutdrawingoptions----earlier-floor-than-the-protocol`). Resolving is not free -- hoist resolves out of tight loops.

## Animating Canvas with TimelineView

`Canvas` is stateless per draw -- it redraws when its inputs change. `TimelineView` (iOS 15+) re-evaluates its body on a schedule and hands you `context.date`; deriving all motion from that date keeps animation smooth, resumable, and testable.

```swift
TimelineView(.animation) { timeline in
    Canvas { ctx, size in
        let t = timeline.date.timeIntervalSinceReferenceDate
        // derive every drawn value from `t`
    }
}
```

| Schedule | Cadence | Use for |
|---|---|---|
| `.animation` | Every display frame (up to 120 Hz ProMotion) | Smooth continuous motion |
| `.animation(minimumInterval:1/30, paused:)` | Throttled ~30 fps | Battery-friendly ambient motion |
| `.periodic(from:by:)` | Fixed interval (e.g. 1s) | Clocks, tickers |
| `.explicit([Date...])` | Exactly the dates you supply | Scripted keyframe timelines |
| `.everyMinute` | Top of each minute | Widget-style clocks |

`context.cadence` (`.live` / `.seconds` / `.minutes`) reports how often updates will realistically arrive -- branch drawing detail on it so you don't compute sub-second precision nobody will see (Apple Watch always-on / Low Power Mode both drop cadence).

**Reduce Motion (mandatory):** gate the schedule, not the view tree.

```swift
struct AmbientBackground: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { timeline in
            Canvas { ctx, size in
                render(ctx, size, at: reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate)
            }
        }
    }
}
```

`paused:` stops the closure firing, but the LAST frame drawn is whatever date it last saw -- pass an explicit frozen time (here `0`) to guarantee a designed resting state, not an arbitrary mid-animation pose. This is the same double-gate discipline as any other motion; the canonical contract is `references/accessibility/05-motion-accessibility.md#accessibility-contract`.

**Pause off-screen.** `TimelineView(.animation)` keeps firing when scrolled off-screen or covered by a sheet, wasting GPU/CPU. Track visibility explicitly:

```swift
@State private var isVisible = true
TimelineView(.animation(paused: !isVisible)) { timeline in /* ... */ }
    .onAppear { isVisible = true }
    .onDisappear { isVisible = false }
```

Also pause on `scenePhase != .active`.

## Metal shader effects -- Shader, ShaderLibrary, and the three modifiers

Since iOS 17 / macOS 14, SwiftUI can run custom Metal fragment shaders on any view without a render pipeline, `MTKView`, or command encoder. `ShaderLibrary` loads your app's default `.metal` bundle (`ShaderLibrary.default`) and uses `@dynamicMemberLookup` so `ShaderLibrary.myFunc(args...)` resolves the `[[stitchable]]` function named `myFunc`; also `ShaderLibrary.bundle(_:)` and `ShaderLibrary(url:)`. `Shader` = a `ShaderFunction` plus its bound uniform arguments.

```swift
// iOS 17.0+ / macOS 14.0+ -- no watchOS
func colorEffect(_ shader: Shader, isEnabled: Bool = true) -> some View
    // MSL: [[stitchable]] half4 fn(float2 position, half4 color, args...)
func layerEffect(_ shader: Shader, maxSampleOffset: CGSize, isEnabled: Bool = true) -> some View
    // MSL: [[stitchable]] half4 fn(float2 position, SwiftUI::Layer layer, args...)
func distortionEffect(_ shader: Shader, maxSampleOffset: CGSize, isEnabled: Bool = true) -> some View
    // MSL: [[stitchable]] float2 fn(float2 position, args...) -> returns SOURCE coord
```

`isEnabled: false` is the correct, cheap off-switch (for Reduce Motion, for example) -- it removes the GPU pass entirely rather than running a no-op shader. `maxSampleOffset` (layer + distortion) declares the maximum per-axis distance between a destination pixel and the source pixel your shader reads/returns; SwiftUI expands render bounds by this amount. Too small clips/samples-transparent at edges; absurdly large wastes fill-rate -- size it to the real displacement (a 40pt ripple → `CGSize(width: 40, height: 40)`).

`Shader` also conforms to `ShapeStyle` (iOS 17+), so it paints shapes and text directly with no modifier: `Rectangle().fill(ShaderLibrary.animatedGradient(.float(time)))`.

`Shader.Argument` constructors (exhaustive): `.boundingRect`, `.float`/`.float2`/`.float3`/`.float4` (generic over `BinaryFloatingPoint`, also take `CGPoint`/`CGSize`/`CGRect`), `.floatArray(_:)`, `.color(_:)`, `.colorArray(_:)`, `.data(_:)`, `.image(_:)`. Arguments bind positionally, in declaration order, after the shader's required leading parameters.

## Writing .metal shader functions

Add a `.metal` file to your app target; Xcode compiles it into the default Metal library `ShaderLibrary.default` loads.

```metal
#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>   // provides SwiftUI::Layer and helpers
using namespace metal;

// colorEffect -- recolors ONE pixel; cannot sample neighbors
[[ stitchable ]] half4 tintByX(float2 position, half4 color, float width) {
    half t = half(position.x / width);
    return half4(color.r, color.g * (1.0h - t), color.b + t * (1.0h - color.b), color.a);
}

// layerEffect -- SwiftUI::Layer exposes half4 sample(float2 p), the rasterized view content
[[ stitchable ]] half4 chromaticAberration(float2 position, SwiftUI::Layer layer, float amount) {
    half4 r = layer.sample(position + float2(amount, 0));
    half4 g = layer.sample(position);
    half4 b = layer.sample(position + float2(-amount, 0));
    return half4(r.r, g.g, b.b, g.a);
}

// distortionEffect -- returns the SOURCE coord to sample; SwiftUI does the resampling
[[ stitchable ]] float2 waveDistort(float2 position, float time, float2 size) {
    float2 uv = position / size;
    float offsetY = sin(uv.x * 12.0 + time * 3.0) * 8.0;
    return float2(position.x, position.y + offsetY);
}
```

Load-bearing correctness rules that fail silently:

1. **`position` is USER-SPACE POINTS, not normalized 0…1.** Pass `.boundingRect` or a size uniform and divide to normalize.
2. **`color`/`layer.sample()` are PREMULTIPLIED alpha.** Scaling alpha without scaling RGB to match produces fringing.
3. **Reduce a `Date` timestamp before binding as `.float`.** `date.timeIntervalSinceReferenceDate` (~7.6e8) loses sub-frame precision as a 32-bit float -> visible stepping. Use `.truncatingRemainder(dividingBy: 1000)` first.
4. **Function name mismatch or a missing `[[stitchable]]`/header produces a blank or unchanged view with NO compile error.** Check the function name first when a shader "does nothing."
5. **`maxSampleOffset` must be ≥ the largest displacement** the shader reads/returns, or edges clip; too large wastes fill-rate.
6. **Shaders do not self-animate.** A constant uniform renders one static cached frame -- drive change via `TimelineView`.

## Pre-warming shaders

Every shader must compile for the current GPU before it can render. By default this happens lazily on first use -- dropping a frame exactly when the effect first appears, the worst moment. `Shader.compile(as:)` moves that ahead of time:

```swift
// iOS 18.0+ / macOS 15.0+
func compile(as type: Shader.UsageType) async throws
// UsageType: .shapeStyle / .colorEffect / .layerEffect / .distortionEffect -- MUST match the eventual call

.task {
    let s = ShaderLibrary.ripple(.float2(.zero), .float(0))
    try? await s.compile(as: .distortionEffect)   // must match how it's actually used
}
```

Argument *types* must match the real call too (values can be placeholders). Do this for any shader that first renders during an animation or transition.

## Performance and profiling

- Each `.colorEffect`/`.layerEffect`/`.distortionEffect` is one extra fragment pass over the view's bounds on every redraw. Constant arguments render once and cache; per-frame arguments (from `TimelineView`) re-run every frame.
- `colorEffect` is cheapest -- no neighbor sampling. `layerEffect`/`distortionEffect` force SwiftUI to first rasterize the view to a layer AND expand bounds by `maxSampleOffset` -- bigger offset shades more pixels. Keep `maxSampleOffset` tight.
- Full-screen layer effects are fill-rate bound; stacking two or three will hitch on older/base-model devices. Prefer one shader that does the whole look over chaining several.
- Profile with Instruments' Metal System Trace (shader execution time, GPU occupancy) and the Core Animation FPS gauge; Xcode's GPU capture (Debug > Capture GPU Workload) shows the exact draw calls a shader adds.
- `.drawingGroup()` flattens a vector-heavy subtree into one Metal composite before shading -- useful under a `Canvas`, but it adds an offscreen pass and rasterizes any `Text` inside it (loses subpixel crispness, blurs on scale-up); never wrap `Text` or Liquid Glass in it. Full cost model owned by `references/performance/01-swiftui-rendering.md#drawinggroup`.

## Decision framework -- which custom-drawing tool

| Goal | Reach for | Why |
|---|---|---|
| A few shapes, want state/layout animation | `Path`/`Shape` views | Diffed, animatable, accessible |
| Standard data charts | Swift Charts (`Chart`) | Accessible + themed for free |
| Many primitives/particles/waveforms, CPU-drawn | `Canvas` + `TimelineView(.animation)` | One view node, immediate mode |
| Recolor pixels of an existing view/image | `.colorEffect` shader | Cheapest GPU pass |
| Blur/displace/RGB-split reading neighbor pixels | `.layerEffect` shader | `SwiftUI::Layer.sample()` |
| Warp geometry (waves, lens, curl) | `.distortionEffect` shader | Remaps source coords |
| Fill a shape/text with a generated pattern | `Shader` as `ShapeStyle` (`.fill`/`.foregroundStyle`) | No modifier needed |
| Multi-stop 2D color mesh | `MeshGradient` (iOS 18+) | Native, no `.metal` file |
| Frosted/lensing glass surface | `.glassEffect` Liquid Glass (iOS 26) | Native, adaptive, accessible |
| Full 3D scene / game | `MTKView` (`UIViewRepresentable`), SceneKit, RealityKit | Real render pipeline |

Stop at the first row that achieves the look -- on watchOS, shaders don't exist at all; fall back to `Canvas`.

## Accessibility contract

A `Canvas` renders pixels, so it is INVISIBLE to VoiceOver by default -- it has no accessibility tree. You MUST supply a semantic layer:

```swift
Canvas { ctx, size in /* chart drawing */ }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Revenue chart")
    .accessibilityValue("Up 12 percent, peaking Thursday at 4,200 dollars")
    .accessibilityChartDescriptor(MyChartDescriptor())   // AXChartDescriptor for data viz
```

For data visualization, prefer Swift Charts (`Chart { }`), which is accessible by default; reach for `Canvas` only when Charts can't express the visual. Drawn text does NOT scale with Dynamic Type automatically -- read `@Environment(\.dynamicTypeSize)` and size fonts yourself, or resolve a `Text` that already carries a `.font(.body)` (resolution respects the environment). Shader animations and heavy visual effects are exactly what the two big accessibility switches turn off -- respect both: Reduce Motion → freeze time (pass a constant) or `isEnabled: false`; Reduce Transparency → fall back to a solid, high-contrast fill if the shader fakes glass/translucency. Also honor `@Environment(\.accessibilityDifferentiateWithoutColor)` for shader effects that encode meaning in hue alone.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| A `Canvas` with no `.accessibilityLabel`/`.accessibilityValue` | Invisible to VoiceOver -- no accessibility tree at all | Add explicit label/value, or an `AXChartDescriptor`; prefer Swift Charts for data |
| `if reduceMotion { StaticCanvas() } else { AnimatedCanvas() }` | Remounts the subtree; churns identity | `TimelineView(.animation(paused: reduceMotion))`, frozen time when paused |
| `TimelineView(.animation)` with no visibility/scenePhase gate | Keeps firing off-screen/backgrounded -- real battery/thermal bug | Pause on `onDisappear`/`scenePhase != .active` |
| Stacking 3+ full-screen `.layerEffect`s | Fill-rate bound, hitches on base-model devices | One shader that does the whole look |
| Shipping a shader with no `Shader.compile(as:)` pre-warm | Visible frame drop on first render | `.task { try? await s.compile(as:) }` matching the real usage |
| `.drawingGroup()` wrapped around animated `Text` | Rasterizes text, loses subpixel crispness, blurs on scale | Never wrap `Text`/glass in `drawingGroup()` -- see `references/performance/01-swiftui-rendering.md#drawinggroup` |

## Severity guide

- **CRITICAL**: a `Canvas` conveying real information with zero accessibility label/value/descriptor; a shader animation with no Reduce Motion gate.
- **HIGH**: `maxSampleOffset` set to zero/too small on a `layerEffect`/`distortionEffect` that visibly clips at edges; premultiplied-alpha math wrong in a `.colorEffect` producing fringing.
- **MEDIUM**: `TimelineView(.animation)` never paused off-screen; `.drawingGroup()` wrapped around `Text` or Liquid Glass.
- **LOW**: missing `Shader.compile(as:)` pre-warm on a shader that first appears mid-transition; `position` treated as normalized when it's user-space points.

## See also

- `references/design/12-text-rendering.md#filling-text-with-a-gradient-or-shader` -- using `Shader` to fill `Text`
- `references/performance/01-swiftui-rendering.md#drawinggroup` -- `.drawingGroup()` cost model
- `references/accessibility/05-motion-accessibility.md#accessibility-contract` -- Reduce Motion double-gate contract
- `references/accessibility/03-visual-accessibility.md#reduce-motion` -- what auto-gates vs what you own
- `references/design/09-swift-charts.md` -- accessible-by-default alternative to hand-drawn data viz
