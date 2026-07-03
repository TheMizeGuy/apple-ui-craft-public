# Display Promotion and Color

> Owner: `references/performance/05-display-promotion-color.md` owns ProMotion adaptive refresh mechanics, `CADisplayLink`/`UIUpdateLink`/`preferredFrameRateRange`, `TimelineView(.animation)` display-synced motion, Display P3 wide-gamut color, and HDR/EDR for UI. `references/performance/03-launch-memory-instruments.md` owns hitch/hang MEASUREMENT (Animation Hitches template, hitch time ratio, MetricKit field telemetry) -- this file owns the display CAPABILITY layer underneath it: what rate you can get, how to request it, and how to author color/HDR content that actually uses the hardware.
> Floors: see `references/_scaffolding/version-floor-registry.md`. `allowedDynamicRange` iOS 17+; `UIUpdateLink` iOS 18+; ProMotion capability query and `CADisplayLink` predate both.

Every current iPhone Pro and iPad Pro panel is variable-refresh (up to 120Hz) and wide-gamut (Display P3, some with EDR headroom). SwiftUI's built-in animations and scrolling already run at the display's max rate for free -- the craft and the bugs live in three places apps touch by hand: custom per-frame work that silently caps at 60fps on iPhone, color literals that leave the panel's extra saturation on the table, and HDR content that blows out next to ordinary UI.

## The 8.33ms budget, and why it is a request, not a guarantee

ProMotion refreshes ADAPTIVELY, chosen frame-by-frame by the system between roughly 10Hz and 120Hz -- never assume a fixed 120Hz.

| Refresh rate | Devices | Frame budget |
|---|---|---|
| 60Hz | Non-Pro iPhones, most iPads | 16.67ms |
| 120Hz (ProMotion) | iPhone Pro, iPad Pro | 8.33ms -- half the headroom |

Recalibrate any hitch-severity intuition for a ProMotion device: sustained >8ms of main-thread commit work per frame is the "moderate" threshold there, not 16ms. Even on a 120Hz-capable device the rate actually GRANTED varies -- the system requests max during active scrolling/gesture interaction and throttles down when content is static, to save power. An idle screen does not run at 120Hz just because the hardware supports it.

Query the device's ceiling through a window scene, never through the deprecated singleton:

```swift
// WRONG -- UIScreen.main is deprecated (iOS 16).
let maxHz = UIScreen.main.maximumFramesPerSecond

// RIGHT -- resolve through the connected window scene.
let maxHz = windowScene.screen.maximumFramesPerSecond   // 120 on ProMotion, 60 otherwise
```

`maximumFramesPerSecond` reports the panel's maximum, not the rate currently granted -- it is a device fact, not an OS-version fact. A current iOS release on a non-Pro iPhone still caps at 60.

## Requesting a rate for custom frame-driven work

Standard SwiftUI (`withAnimation`, `.animation(_:value:)`, `ScrollView`/`List`) opts into the display's max rate automatically -- no work needed. The trap is EXPLICIT per-frame work you drive yourself: `CADisplayLink`, `UIUpdateLink`, Metal, Core Animation with custom durations.

```swift
final class FrameDriver {
    private var link: CADisplayLink?
    private var startTime: CFTimeInterval = 0

    func start() {
        let link = CADisplayLink(target: self, selector: #selector(step(_:)))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)   // .common survives scroll tracking
        startTime = CACurrentMediaTime()
        self.link = link
    }

    @objc private func step(_ link: CADisplayLink) {
        let elapsed = link.timestamp - startTime   // drive math off timestamp, never a manual counter
        update(to: elapsed)
    }

    func stop() { link?.invalidate(); link = nil }   // always invalidate on teardown
}
```

`timestamp` is the time the CURRENT frame represents; `targetTimestamp` is when it will actually display (use it to extrapolate gesture-follow); `duration` is the nominal seconds per frame at the current granted rate. Give `preferredFrameRateRange` a RANGE, not a single value -- `CAFrameRateRange(minimum: 120, maximum: 120, preferred: 120)` fights the system's power management for no visual benefit when the content doesn't need every frame.

**The iPhone opt-in nobody remembers:** on iPhone (not iPad), a custom render loop is clamped to 60fps regardless of `preferredFrameRateRange` unless Info.plist sets `CADisableMinimumFrameDurationOnPhone` to `true`. iPad Pro has no such requirement.

`UIUpdateLink` (iOS 18+) supersedes `CADisplayLink` for new UIKit code -- tighter render-loop integration and event-driven low-latency updates:

```swift
let updateLink = UIUpdateLink(view: myView) { link, info in
    myView.advance(to: info.modelTime)
}
updateLink.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
updateLink.requiresContinuousUpdates = false   // request updates on demand; let the display idle between events
```

| Situation | Tool |
|---|---|
| SwiftUI continuous/time-based motion | `TimelineView(.animation)` |
| SwiftUI + heavy immediate-mode drawing | `TimelineView` + `Canvas` |
| UIKit/Metal custom render loop, new code | `UIUpdateLink` (iOS 18+) |
| UIKit custom loop, back-deployment | `CADisplayLink` |
| Standard state transitions | `withAnimation` -- already display-synced |

## TimelineView(.animation) for continuous, clock-derived motion

When motion is a continuous function of wall-clock time and must stay in lockstep with the display (a waveform, a countdown ring, several views animating in sync), `TimelineView` is the SwiftUI-native primitive -- not `withAnimation`, not a `@State` timer:

```swift
TimelineView(.animation) { context in
    let t = context.date.timeIntervalSinceReferenceDate
    Canvas { ctx, size in
        // draw a function of t -- prefer Canvas over a deep View tree; the closure
        // re-runs once per display frame, up to 120Hz.
    }
}
```

| Schedule | Cadence | Use for |
|---|---|---|
| `.animation` | Every display frame | Smooth continuous motion |
| `.animation(minimumInterval: 1.0/30.0)` | Throttled ~30fps | Battery-friendly ambient motion |
| `.periodic(from:by:)` | Fixed interval | Clocks, tickers |
| `.explicit([Date...])` | Exactly your dates | Scripted keyframe timelines |

`context.cadence` (`.live`/`.seconds`/`.minutes`) reports how often updates will REALISTICALLY be delivered -- it can be slower than requested when the system throttles (Low Power Mode, Apple Watch always-on). Branch fidelity on it rather than computing sub-second detail nobody will see. Keep the closure cheap: prefer `Canvas`/`GraphicsContext` over a View hierarchy inside it, scope it to the smallest subtree that needs per-frame updates, and cap ambient (non-interactive) motion at 30fps.

## Wide color: Display P3

```swift
// Verified signature: init(_ colorSpace: Color.RGBColorSpace, red:green:blue:opacity:)
let vividOrange = Color(.displayP3, red: 1.0, green: 0.35, blue: 0.0, opacity: 1.0)
```

`.displayP3` uses DCI-P3 primaries with the sRGB TRANSFER FUNCTION -- it is "Display P3," not raw DCI-P3. An sRGB color is exactly representable in P3 (P3 is a superset); a saturated P3 color has no sRGB equivalent and is gamut-clamped automatically on sRGB displays -- write the P3 value once, the system handles the fallback per device.

For brand colors, don't hardcode the literal (it won't adapt to dark mode or Increased Contrast) -- define a P3 **Color Set** in the asset catalog (Attributes inspector, Content = Display P3) with light/dark/high-contrast variants, and reference it by name. For **Image Sets**, set Gamut to "sRGB and Display P3" to ship both and let the system pick per device; shipping only a P3 image forces on-device conversion on sRGB panels.

P3 matters for saturated brand accents, photography/video thumbnails, and data-viz palettes where category separation relies on saturation. It is noise for text and grayscale chrome -- never hand-spec `.primary`/`.secondary` in P3; semantic colors already handle both gamuts.

## HDR and EDR: don't blow out your UI

EDR-capable panels can drive pixels brighter than reference white (1.0); the headroom above it is dynamic, shrinking under Low Power Mode, bright ambient light, and thermal pressure.

```swift
// iOS 17+. The asset must actually carry HDR data (a gain map or PQ/HLG color space) --
// .high on an SDR asset does nothing.
Image("sunset-hdr")
    .resizable()
    .allowedDynamicRange(.high)
```

| `Image.DynamicRange` | Behavior | Use for |
|---|---|---|
| `.standard` | Clamp to SDR | Thumbnails, anything beside text |
| `.constrainedHigh` | Bounded extended range | HDR content mixed with SDR text/chrome -- the professional default |
| `.high` | Unrestricted extended range | A dedicated full-bleed HDR moment (photo/video detail view) |

The moment HDR content shares a screen with SDR text, `.high` makes the SDR side look dim by comparison (the eye adapts to the brightest thing) -- reserve `.high` for a dedicated viewing moment, use `.constrainedHigh` for thumbnails/grids/captions. Set `\.allowedDynamicRange` on a container environment value to bound every image in a subtree at once. Because headroom is dynamic, never author against an assumed fixed peak -- declare intent (`.high`/`.constrainedHigh`) and let the system tone-map as conditions change.

```swift
// iOS 26+ Liquid Glass. Availability + fallback for HDR-adjacent chrome.
if #available(iOS 26, *) {
    content.glassEffect(.regular, in: .rect(cornerRadius: 16))
} else {
    content.background(.regularMaterial, in: .rect(cornerRadius: 16))
}
```

Glass and `Material` backgrounds are SDR by design -- they sample and blur content behind them as chrome. Placing `.high` content behind glass is fine; making the glass itself HDR-bright is not. Keep the HDR budget for content, never for interface surfaces.

## Verifying on real hardware

The Simulator cannot reproduce any of this -- it renders through the Mac's own display and refresh rate, so refresh cadence, P3 saturation, and EDR headroom all look wrong or absent there.

- **Refresh rate:** test on both a ProMotion device and a 60Hz device. Smoothness tuned by eye at 60Hz can stutter at 120Hz, and vice versa. Profile with the **Animation Hitches** Instruments template on device -- see `references/performance/03-launch-memory-instruments.md#hangs-hitches-and-the-swiftui-instrument` for the measurement workflow and hitch-ratio target.
- **Display P3:** compare `Color(.displayP3, red: 1, green: 0, blue: 0)` against `Color(.sRGB, red: 1, green: 0, blue: 0)` side by side on a real P3 device -- the P3 red is visibly more saturated. Sample a device screenshot with macOS Digital Color Meter set to "Display P3" to confirm components exceed sRGB gamut.
- **HDR:** verify on an XDR-capable panel (iPhone Pro, iPad Pro, Pro Display XDR) under varying brightness/Low Power Mode to confirm graceful tone-mapping rather than clipping.

## Accessibility contract

`TimelineView(.animation(paused:))` is the Reduce Motion gate for continuous display-synced motion -- pausing still renders one static frame, so the content never disappears, it just stops re-firing:

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion
TimelineView(.animation(paused: reduceMotion)) { context in
    let t = context.date.timeIntervalSinceReferenceDate
    Circle().fill(.orange.opacity(reduceMotion ? 0.5 : 0.5 + 0.3 * sin(t)))
}
```

This is a developer-owned gate, not system-automatic -- `TimelineView` has no knowledge of Reduce Motion on its own. Apply the same `paused:`/cancel discipline to any `CADisplayLink`/`UIUpdateLink` driving purely decorative motion. HDR and wide color are not accessibility-gated features, but an HDR-bright fill used as chrome (not content) is a visual-comfort problem worth flagging in review regardless of the Reduce Motion/Transparency settings.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `UIScreen.main.maximumFramesPerSecond` | `UIScreen.main` deprecated iOS 16 | `windowScene.screen.maximumFramesPerSecond` |
| `CADisplayLink` at 120 on iPhone with no Info.plist key | Silently clamped to 60fps | Add `CADisableMinimumFrameDurationOnPhone` = true |
| `CAFrameRateRange(120, 120, 120)` | Fights power management | Give a range with a lower `minimum` |
| Judging a hitch against 16.67ms on a Pro device | Wrong budget -- ProMotion halves it | Use 8.33ms on ProMotion, report the refresh regime |
| `Color(red: 1, green: 0.35, blue: 0)` for a brand accent | Silently sRGB; leaves P3 saturation unused | `Color(.displayP3, ...)` or a P3 Color Set |
| `.allowedDynamicRange(.high)` next to SDR captions/text | Blows out; SDR content looks dim by comparison | `.constrainedHigh` for mixed contexts |
| Verifying P3/HDR/ProMotion in the Simulator | None of the three are reproduced there | Verify on real hardware |
| `TimelineView(.animation)` with no `paused:` gate | Ignores Reduce Motion; runs every frame regardless | Gate with `accessibilityReduceMotion` |

## See also

- `references/performance/03-launch-memory-instruments.md#hangs-hitches-and-the-swiftui-instrument` -- Animation Hitches template, hitch time ratio, MetricKit field telemetry
- `references/performance/02-scroll-list-performance.md#off-screen-rendering` -- render-cost sources that eat the frame budget this file protects
- `references/design/02-liquid-glass.md` -- Glass materials that sample HDR/P3 content behind them
- `references/accessibility/03-visual-accessibility.md#reduce-motion` -- the double-gate pattern this file's `TimelineView` example follows
- `~/Claude/vault/iOS Development/` -- ProMotion and Core Animation deep source
