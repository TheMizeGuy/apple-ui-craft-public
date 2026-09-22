# Launch, Memory, and Instruments

> Owner: `references/performance/03-launch-memory-instruments.md` owns launch-phase timing and targets, the Instruments decision framework (Time Profiler, Allocations, Leaks, Hangs, Animation Hitches, the SwiftUI Instrument), MetricKit + Xcode Organizer field telemetry, XCTest performance-gate metrics, and the `phys_footprint`/jetsam memory model including image-decode memory cost. `references/performance/01-swiftui-rendering.md` owns body-evaluation cost and the animation cost table; `references/performance/02-scroll-list-performance.md` owns the scroll-specific hitch-severity table and the cell image-loading pipeline -- this file cites both rather than restating them.
> Floors: see `references/_scaffolding/version-floor-registry.md` for every version cited below. MetricKit's `MX`-prefixed family is deprecated in the iOS 27 SDK; the Swift-native replacement is gated `#available(iOS 27, *)` throughout, because the install base is still overwhelmingly iOS 26 and earlier.

A hitch, a hang, and a slow launch are the same failure at different timescales: main-thread work that missed its deadline. This file is the measurement layer -- which tool answers which question, which field metric is real vs. deprecated vs. phantom, and the `phys_footprint`/jetsam arithmetic that decides whether your app gets killed. Get the wrong metric class and you optimize a number nobody's phone reports; get the wrong memory field and you ship an app that OOMs on a 4GB device while `resident_size` looks fine on your Pro Max.

## Launch phases, scenarios, and targets

| Scenario | Definition | Directional target |
|---|---|---|
| Cold launch | App binary not in memory, no cached dylibs | Perceived-fast ceiling ~2s; well-optimized apps land far under |
| Warm launch | Kernel buffer cache still has app pages, some dylibs cached | < 1s |
| Hot launch (resume) | Already resident, just needs to redraw | < 0.5s, ideally near-instant |

| Phase | Span | Target |
|---|---|---|
| Pre-main | Process start -> `main()` | < 100 ms |
| Post-main (to first frame) | `main()` -> first rendered frame | < 300 ms |
| Extended launch | Until content is fully interactive (data loaded, no placeholder spinners) | < 400 ms total, directional |

These are OS-perception targets, not enforced limits. The hard limit is the **launch watchdog**: if `application(_:didFinishLaunchingWithOptions:)` and first-frame setup don't complete in time, the OS kills the process with the signature crash code `0x8badf00d` ("ate bad food" = watchdog timeout). Apple no longer publishes the exact watchdog seconds -- treat any watchdog-adjacent crash log as "way over budget," not a fine-grained metric.

**First-frame discipline (the rule that matters most):** the root view must render on its first pass with zero blocking work ahead of it -- no synchronous network call, no Core Data/SwiftData migration, no synchronous file read. Kick those off in `.task` after the first frame is on screen, backed by a placeholder:

```swift
struct RootView: View {
    @State private var store: TripStore?

    var body: some View {
        Group {
            if let store {
                ContentView().environment(store)
            } else {
                LaunchPlaceholderView()   // renders on frame 1, no blocking work
            }
        }
        .task {
            store = await TripStore.loadOrMigrate()   // runs AFTER first frame
        }
    }
}
```

## Measuring launch precisely

iOS **prewarms**: it may run your process to `main()` -- and call `application(_:didFinishLaunchingWithOptions:)` -- minutes before the user taps, then suspend it. Timing from process start under prewarming records a multi-minute "launch." Detect it and re-anchor to the moment the user actually brings the app forward (`scenePhase -> .active`), not to `main()`:

```swift
// iOS 15+. True when the OS prewarmed the process ahead of user intent.
let wasPrewarmed = ProcessInfo.processInfo.environment["ActivePrewarm"] == "1"
```

For a precise first-frame timestamp, `.onAppear` fires during the first layout pass -- before the render server commits pixels. Catch the run loop going idle right after the first commit with a one-shot `CFRunLoopObserver`:

```swift
enum LaunchClock {
    static let start = CACurrentMediaTime()   // set as early as possible (App.init)

    static func markFirstFrame(_ report: @escaping (CFTimeInterval) -> Void) {
        var observer: CFRunLoopObserver?
        observer = CFRunLoopObserverCreateWithHandler(nil, CFRunLoopActivity.beforeWaiting.rawValue, false, 0) { _, _ in
            report(CACurrentMediaTime() - start)   // first frame is on screen
            if let observer { CFRunLoopRemoveObserver(CFRunLoopGetMain(), observer, .commonModes) }
        }
        CFRunLoopAddObserver(CFRunLoopGetMain(), observer, .commonModes)
    }
}
```

`.beforeWaiting` fires once the run loop has committed the first transaction and is about to sleep -- the closest in-process proxy for "pixels visible." For a CI regression gate, the dedicated UI-test metric is cleaner than hand-rolled signposts -- it launches the app repeatedly and measures cold launch to first frame, with a per-device+OS baseline Xcode stores automatically:

```swift
final class LaunchTests: XCTestCase {
    func testLaunchPerformance() throws {
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }
}
```

Run it on the **oldest supported device** for the worst-case number; CI fails when a run deviates beyond the configured threshold (default 10%).

## Pre-main: dyld and build-time levers

Since iOS 15 (dyld4), rebasing and binding are encoded as **chained fixups** -- compact chains threaded through `__DATA`/`__DATA_CONST` and applied in a single fixup pass, not the two separate rebase-time/bind-time steps older material describes. You can no longer optimize "rebase" and "binding" independently -- frame it as one fixups cost. `DYLD_PRINT_STATISTICS=1` still prints pre-main timing, but prewarming makes a single reading unreliable (a prewarmed launch shows near-zero dylib time because that work already happened); force-quit and wait, or use the App Launch Instruments template, which segments prewarmed from cold.

The single biggest pre-main win is fewer dynamic frameworks -- each linked framework costs load-and-fixup time on the order of a few milliseconds on modern A-series/M-series hardware (a WWDC-era directional heuristic, not a documented per-framework constant; the actionable lever is total framework count, not a precise per-framework budget). **Mergeable libraries** (Xcode 15+) remove the historical tradeoff between modular dynamic frameworks (slow launch) and static linking (fast launch, slow incremental builds):

| Setting (xcconfig key) | Where | Value |
|---|---|---|
| Build Mergeable Library (`MERGEABLE_LIBRARY`) | On each framework target | `YES` |
| Merged Binary Type (`MERGED_BINARY_TYPE`) | On the app target | `automatic` (Release-only merge, keeps Debug fast) or `manual` |

`automatic` is the recommended default: Debug builds keep frameworks as lightweight re-exported stubs (incremental builds stay fast); Release builds merge them into the executable, so dyld loads one binary instead of N frameworks at launch.

Two adjacent build-time flags are frequently mis-transcribed: cross-module optimization is enabled via `OTHER_SWIFT_FLAGS -cross-module-optimization` (SwiftPM: `-Xswiftc -cross-module-optimization`) -- there is no `SWIFT_CROSS_MODULE_OPTIMIZATION` build setting -- paired with `@inlinable` on hot cross-module call sites. Compile-time type-checker warnings use `-Xfrontend -warn-long-function-bodies=100 -Xfrontend -warn-long-expression-type-checking=100` inside `OTHER_SWIFT_FLAGS`, each flag separately `-Xfrontend`-prefixed (bare `-warn-long-function-bodies` is not a valid flag). Both are compile-time levers, not runtime launch cost -- full build-performance coverage lives in `references/performance/07-build-performance.md`.

Also audit for what actually runs pre-main: enable clang `-Wglobal-constructors` for C++ global constructors; the Swift equivalent is a top-level `let` doing real work outside a function -- keep expensive singletons as a lazy `static let` inside a type instead. Audit for Objective-C `+load` methods (run during ObjC setup, before `main()`) with `otool`/`nm` or a source grep; migrate to `+initialize` (lazy, fires on first use of the class).

## Instruments: which tool answers which question

| Symptom | Start with |
|---|---|
| App feels slow / unresponsive | Time Profiler |
| Memory keeps growing | Allocations (Mark Generation / heapshots) |
| Memory warnings / OOM crashes | Allocations + Leaks, VM Tracker for composition |
| Scrolling stutters | Animation Hitches + Core Animation |
| Slow app launch | App Launch template |
| SwiftUI body recomputation | SwiftUI Instrument (Xcode 26+, cause-and-effect graph; Xcode 27 adds Summary of Updates + layout-cache-miss reasons) |
| Thread contention / deadlocks | System Trace |
| "Is the main actor busy or blocked?" | Swift Executors (Xcode 27) + Swift Task Collection tracks |

Time Profiler workflow: record, exercise the exact interaction under suspicion, stop; in the Call Tree pane enable **Separate by Thread** (main-thread cost is what causes visible jank), **Invert Call Tree** (sorts by leaf functions, where time is actually spent), **Hide System Libraries** (surfaces your code first); **Heaviest Stack Trace** gives the single deepest/costliest path in one click. Allocations: record across a memory-neutral action repeated 3-5x, use **Mark Generation** heapshots before/after each cycle, inspect the **Growth** column between generations -- growth that repeats every cycle (not just cache warm-up that stabilizes) is a leak candidate. **Leaks** + the **Memory Graph Debugger** (Debug Navigator > Memory icon) show a live snapshot of every object and every strong reference between them; a circular arrangement of strong arrows is a retain cycle -- common causes are `Timer` closures capturing `self` strongly, un-removed `NotificationCenter` observers, non-`weak` delegate properties, and `@Observable` classes captured strongly inside a `Task { }` that outlives the view.

Xcode 16+ additions: a **Flame Graph** detail view on Time Profiler/Allocations (width = time spent, widest bars are the hot path, click to zoom); **Processor Trace** (Apple Silicon: iPhone 16/A18+ and M-series Macs) records every function entry/exit with cycle-accurate timing via on-chip hardware tracing instead of ~1ms sampling -- reach for it after Time Profiler narrows the region, not as the first tool, for death-by-a-thousand-sub-millisecond-cuts launch cost or exact hot-path counts. **Thread Performance Checker** (Xcode 14+, Scheme > Diagnostics, on by default during tests) is a runtime issue-navigator diagnostic, not an Instruments template -- it flags hangs, priority inversions (a high-QoS thread waiting on a lower-QoS one), and main-thread disk writes during ordinary debugging. It is distinct from **Main Thread Checker**, which flags the inverse problem: UIKit/AppKit APIs illegally called *off* the main thread.

Instruments 27 adds four things worth changing your workflow for. A CPU profile now opens in three complementary view modes -- **Call Tree**, **Flame Graph**, and **Top Functions** -- and **Run Comparison** measures the impact of a change by diffing two profiles directly, superseding File > Compare Traces. A **Swift Executors** instrument graphs the Cooperative Thread Pool, the Main Actor, and any `TaskExecutor`/`SerialExecutor` conformer as their own tracks, so "the main actor is busy" and "the main actor is blocked waiting" stop being an inference from Time Profiler; on pre-27 OSes executor names fall back to "Unknown executor". Task tracks group into named **Swift Task Collection** tracks, and Tasks/Collections/Actors/Executors gained a **Profile** detail showing a call tree built only from samples taken while the task was *running* (record alongside Time Profiler or CPU Profiler to populate it) -- which is what finally makes `.task(name:)` labels pay off in a trace. The **SwiftUI** instrument adds a **Summary of Updates** focus action on the View Hierarchy detail and now records layout-pass information including *the reason a layout computation was not cached*: a `GeometryReader` or custom `Layout` suspected of forcing repeated layout is now evidence you can point at rather than an argument from source. Instruments 27 requires target devices of at least iOS 17 / watchOS 10 / tvOS 17, and `xctrace record` accepts `--show-recording-options` / `--recording-options <json path>` for CI-driven captures.

## Hangs, hitches, and the SwiftUI Instrument

A **hang** is a period where the main thread is blocked and the app cannot respond to input. Sub-250ms stalls are microhangs -- felt but not counted in Organizer's Hang Rate. Apple's field threshold: **>= 250 ms**.

| Duration | Perceived severity |
|---|---|
| 250-500 ms | Noticeable stutter |
| 500 ms-1 s | Sluggish |
| 1-2 s | Obvious freeze |
| > 2 s | Users force-quit |

A **hitch** is a frame that misses its `CADisplayLink`/Core Animation commit deadline. Frame budget depends on refresh rate:

| Refresh rate | Devices | Frame budget |
|---|---|---|
| 60 Hz | Older iPhones, most iPads | 16.67 ms |
| 120 Hz (ProMotion) | iPhone/iPad Pro line | 8.33 ms |

Never average a hitch ratio across a mixed 60/120Hz fleet -- report the refresh regime alongside every hitch number. See `references/performance/02-scroll-list-performance.md#hitch-detection` for the scroll-specific severity table and bottleneck catalog; this file owns the general Instruments/field-metric layer underneath it.

Hitch triage order: reproduce under the **Animation Hitches** template on a **physical device** (Simulator hides real GPU/thermal throttling and can over- or under-report); bisect main-thread vs. render-server (main-thread idle during the hitch -> Core Animation off-screen-render-pass territory, per `references/performance/02-scroll-list-performance.md#off-screen-rendering`); if main-thread work owns it, the Xcode 26+ **SwiftUI Instrument** graphs state mutation -> body recomputation -> main-thread cost directly, with dedicated lanes: **View Body**/**Long View Body Updates** (every `body` evaluation, isolates ones that individually blew the frame budget), **Update Groups** (one state mutation -> N body re-evaluations -> total cost, proving `references/performance/01-swiftui-rendering.md#equatable-views`-style findings with a trace instead of source reading), **Long Representable Updates** (expensive `UIViewRepresentable`/`UIViewControllerRepresentable` `updateUIView` work), **Core Animation Commits** (correlates a SwiftUI update to the CA commit it forced). Two Xcode 26.x rough edges here are fixed in Xcode 27: the Cause & Effect graph could consume large amounts of memory when zoomed into a very small time range, and Instruments could crash opening the SwiftUI instrument's "Change Call Trees" view. On a 26.x toolchain, fall back to the flat body-evaluation list or Time Profiler with Hide System Libraries + Invert Call Tree if the graph view misbehaves. Fix one thing at a time, then diff the traces: **Run Comparison** (Xcode 27) on the pre-fix baseline, or File > Compare Traces on 26.x -- an objective before/after, not a subjective "feels smoother."

## Field telemetry: MetricKit

MetricKit aggregates real-device data across your entire install base, delivered roughly daily. iOS 27 rewrote it Swift-first: `MetricManager` vends `metricReports` and `diagnosticReports` as async sequences, every report is `Codable` and `Sendable` (serialize it straight to your backend, no hand-rolled payload parsing), and values arrive as `MetricResult` cases instead of `MX` payload properties. Apple's wording on the old family is "no longer recommended for new adoption" -- **deprecated, not removed**. With the install base overwhelmingly iOS 26 and earlier, the correct shape is a dual path: keep the `MX` subscriber as the primary reader for reach, add a `MetricManager` consumer behind `#available(iOS 27, *)`, and never present the `MX` path as an error.

| Deprecated `MX` type | iOS 27 successor | Platforms |
|---|---|---|
| `MXMetricManager` + `MXMetricManagerSubscriber` | `MetricManager` (`metricReports` / `diagnosticReports`) | iOS/iPadOS/Catalyst/macOS 27; visionOS 27 for diagnostics only |
| `MXAppLaunchMetric` | `TimeToFirstDrawMetric`, `OptimizedTimeToFirstDrawMetric`, `ApplicationResumeTimeMetric`, `ExtendedLaunchMetric` | iOS/iPadOS/Catalyst/macOS 27 |
| `MXMemoryMetric` | `PeakMemoryMetric`, `SuspendedMemoryMetric` | `PeakMemoryMetric`: **iOS/iPadOS 27 only** |
| `MXAppExitMetric` | `ForegroundTerminationMetric`, `BackgroundTerminationMetric` | iOS/iPadOS/Catalyst/macOS 27 |
| `MXAnimationMetric` | `HitchTimeMetric` (per-app animation hitch, not scroll-scoped) | iOS/iPadOS/Catalyst/macOS 27 |
| (no equivalent) | `MemoryExceptionDiagnostic` -- a call stack for an OOM kill | **iOS/iPadOS 27 only** |
| (no equivalent) | `MetalFrameRateMetric` -- per-`CAMetalLayer` frame pacing | iOS/iPadOS/Catalyst/macOS 27 |

None of the new types exist on tvOS or watchOS: those targets keep the `MX` path indefinitely. `HitchTimeMetric.ratio` and `SignpostIntervalMetric.hitchTimeRatio` are typed `Measurement<HitchTimeRatio>`, a `Dimension` subclass expressing milliseconds of hitch per second of tracked duration -- code that treated the ratio as a plain `Measurement<Unit>` must be recompiled against the 27 SDK, which Apple calls out as a launch-crash risk otherwise.

The iOS 27 reader is a long-lived object consuming two sequences:

```swift
import MetricKit

@available(iOS 27, *)
actor FieldMetrics {
    private let manager = MetricManager()

    func start() async {
        async let metrics: Void = consumeMetrics()
        async let diagnostics: Void = consumeDiagnostics()
        _ = await (metrics, diagnostics)
    }

    private func consumeMetrics() async {
        for await report in manager.metricReports {          // MetricReport: Codable, Sendable
            for entry in report.intervalEntries {            // + report.stateEntries when StateReporting is on
                for value in entry.values {
                    switch value {
                    case .hitchTime(let m):
                        // ratio: Measurement<HitchTimeRatio> -- ms hitching per second of tracked ANIMATION,
                        // app-wide, not scroll-scoped. Keep it in its own series from pre-27 scroll numbers.
                        Telemetry.send(hitchRatio: m.ratio, over: m.totalAnimationTime)
                    case .foregroundTermination(let m):
                        Telemetry.send(oomKills: m.memoryLimitTerminationCount)   // jetsam count, first-class
                    case .backgroundTermination(let m):
                        Telemetry.send(backgroundOOMKills: m.memoryLimitTerminationCount)
                    case .peakMemory(let m):
                        Telemetry.send(peak: m.value)                             // Measurement<UnitInformationStorage>
                    case .optimizedTimeToFirstDraw(let m):
                        Telemetry.send(launch: m.histogram)                       // Histogram<UnitDuration>
                    case .extendedLaunch(let m):
                        Telemetry.send(extendedLaunch: m.histogram)
                    default:
                        break   // MetricResult has 30 cases; handle only what you trend, or switch
                                // exhaustively with an @unknown default for forward compatibility
                    }
                }
            }
        }
    }

    private func consumeDiagnostics() async {
        for await report in manager.diagnosticReports {
            if case .memoryException(let diagnostic) = report.result {
                // NEW in iOS 27: an actual call stack for a memory-limit termination.
                Telemetry.send(oomStack: diagnostic.callStackTree)
            }
        }
    }
}
```

`OptimizedTimeToFirstDrawMetric` and `ExtendedLaunchMetric` are distinct types that happen to share a `histogram` member, so they need separate cases -- Swift will not let one binding cover both patterns. Extended launch is no longer only a signpost convention -- `MetricManager.trackLaunchTask(id:onTrackingError:_:)` measures a named async launch task on the main actor and the duration lands in `ExtendedLaunchMetric` in the field:

```swift
// trackLaunchTask is @MainActor, so hold a MetricManager on the main actor for it --
// a separate reference from the actor-held one above. LaunchTaskID is ExpressibleByStringLiteral.
@available(iOS 27, *)
@MainActor
enum LaunchTracking {
    static let manager = MetricManager()

    static func warmFeed() async throws -> FeedStore {
        try await manager.trackLaunchTask(id: "first-feed-ready") {
            try await FeedStore.warm()
        }
    }
}
```

`StateReporting` (the framework is iOS 27 on all seven platforms; the MetricKit side that delivers it -- `StateReportingDomain` and `MetricManager(enabledStateReportingDomains:)` -- is iOS/iPadOS/Mac Catalyst/macOS 27 only, so tvOS and watchOS get no state-segmented metrics) closes the biggest gap in MetricKit field data for UI craft: it segments metrics by app-defined states, so hitch time and launch time can be attributed to a feature, an A/B arm, or a graphics-quality setting instead of averaged across the whole app. Declare a metadata struct with `@ReportableMetadata`, get a `StateReporter` for a domain, call `reportTransition(to:...)` on entry and `reportTransition(to: nil)` on exit, and construct the manager with `MetricManager(enabledStateReportingDomains: [.experiments])` so reports carry `stateEntries` alongside `intervalEntries`. Annotated states also show up in Instruments on the Points of Interest track. Keep `@ReportableMetadata` property names concise, and check `hasExceededStateLimit` on every report -- metrics for states past the system limit collapse into the full-day interval entry.

For an app with a Metal-backed surface inside an otherwise SwiftUI UI -- a custom renderer, a map, a shader-driven effect -- `MetalFrameRateMetric` (via `MetricResult.metalFrameRate(_:)`) trends real-device frame pacing per `CAMetalLayer` in the field, which previously only Instruments could see. Read it against `HitchTimeMetric`: a healthy CA hitch ratio with a poor Metal frame rate points the investigation at the renderer, not at SwiftUI body cost.

On iOS 26 and earlier, the `MX` subscriber is still the live, functional reader:

```swift
import MetricKit

final class MetricsSubscriber: NSObject, MXMetricManagerSubscriber {
    func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            // iOS 13+, deprecated in the iOS 27 SDK -- still live on the iOS-26 install base.
            if let hangs = payload.applicationResponsivenessMetrics?.histogrammedApplicationHangTime {
                report(hangs)   // MXHistogram<UnitDuration>
            }
            // scrollHitchTimeRatio: Measurement<Unit>, iOS 14.0+/macOS 12.0+.
            // MXAnimationMetric.hitchTimeRatio does NOT exist -- never reach for it.
            if let ratio = payload.animationMetrics?.scrollHitchTimeRatio {
                report(ratio)
            }
        }
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {   // iOS 14+
        for payload in payloads {
            payload.hangDiagnostics?.forEach { hang in
                // hangDuration: Measurement<UnitDuration>, callStackTree: MXCallStackTree
                report(duration: hang.hangDuration, stack: hang.callStackTree)
            }
        }
    }
}

MXMetricManager.shared.add(MetricsSubscriber())   // register once, early (App.init)
```

`MXAppLaunchMetric.histogrammedTimeToFirstDraw` is itself deprecated (legacy, non-prewarm-aware) in favor of `histogrammedOptimizedTimeToFirstDraw` (the prewarmed-launch distribution); `histogrammedApplicationResumeTime` has been deprecated since iOS 13. Prefer `histogrammedExtendedLaunch` -- your own "fully ready" signal, not just first pixel -- as the field metric closest to what users experience as "launched."

**Do not merge the two series.** `MXAnimationMetric.scrollHitchTimeRatio` is scroll-scoped; iOS 27's `HitchTimeMetric` reports hitch time across *every* tracked animation in the app. Averaging them into one chart silently changes what the number means at the 27 boundary, so the familiar "< 5 ms hitch per second of scrolling" target has to be restated as a per-app animation-hitch budget on iOS 27 and compared only against like-for-like history.

For custom intervals, `OSSignposter` (iOS 15+/macOS 12+) feeds both Instruments traces and, via `mxSignpost`, MetricKit's field-aggregated `MXSignpostMetric` payloads -- the closest thing to "Instruments, but on every user's device":

```swift
let signposter = OSSignposter(subsystem: "com.example.myapp", category: "Launch")
let state = signposter.beginInterval("ColdLaunch")
// ... launch work ...
signposter.endInterval("ColdLaunch", state)
```

## Xcode Organizer and XCTest CI gates

**Xcode Organizer > Metrics** (Window > Organizer > Reports/Metrics) needs zero code and aggregates the same signals from opted-in App Store/TestFlight users, keyed to each shipped build, with automatic per-version regression deltas -- the field analogue of Comparison Mode.

| Organizer metric | Reports | Gate against |
|---|---|---|
| Launch Time | Distribution (median + 90th pct) to first frame, cold | 90th pct < 400 ms |
| Hang Rate | Hangs per hour of foreground use, >= 250 ms | Drive toward 0 |
| Memory | Peak memory distribution across the fleet | Leading OOM indicator |
| Terminations | Background/foreground termination counts incl. memory (OOM) and watchdog | Field `0x8badf00d`/OOM rate |
| Hitches | Hitch time across ALL animated interactions -- scrolling, transitions, other continuous motion | < 5 ms/s |
| Disk Writes | Logical bytes written / hour | Excessive-I/O regressions |
| Storage | The app's storage footprint trended across releases | Growth between versions |
| Battery Usage | Energy relative to peers | Background/CPU regressions |

The Hitches metric widened from scroll-only to every animated interaction in Xcode 27, matching MetricKit's move from `scrollHitchTimeRatio` to per-app `HitchTimeMetric` -- so a version-over-version hitch comparison that spans that change is comparing two different measurements. Xcode 27 Organizer also adds an **Insights** overview that surfaces high-impact regressions across metrics and diagnostic reports in one place, and draws a recommended goal value on each metric chart as a dashed line derived from similar apps and the app's own history -- useful as a sanity check on a target, not as a substitute for one you chose deliberately.

Organizer's data is also available via the **App Store Connect API** (`perfPowerMetrics` endpoint) for pulling launch time, hang rate, memory, disk, and hitch percentiles into a CI/observability dashboard instead of opening Xcode.

For a pre-merge PR gate, the full `XCTMetric` family (iOS 13.0+/macOS 10.15+/Xcode 11+) drives `measure(metrics:options:)`:

| Metric | Measures | Notes |
|---|---|---|
| `XCTClockMetric` | Wall-clock elapsed time | Default metric; most reliable, gate most tests on this |
| `XCTCPUMetric` | CPU time, cycles, instructions retired | Noisy on real devices; use for large deltas |
| `XCTMemoryMetric` | Peak physical memory | Noisy; catches order-of-magnitude regressions, not KB-level |
| `XCTStorageMetric` | Logical bytes written to storage | Catches accidental excessive-write regressions |
| `XCTOSSignpostMetric` | Duration of a named `os_signpost`/`OSSignposter` interval | Bridges your own instrumented code into a gate; `.scrollDecelerationMetric`, `.applicationLaunch` presets |
| `XCTApplicationLaunchMetric` | Cold app-launch duration (UI test) | Requires `XCUIApplication().launch()` inside the measured block |

```swift
final class ScrollPerfTests: XCTestCase {
    func testFeedBuildIsFast() throws {
        let options = XCTMeasureOptions()
        options.iterationCount = 10   // .default is 5; more samples -> tighter CI signal
        measure(metrics: [XCTClockMetric(), XCTMemoryMetric()], options: options) {
            _ = FeedViewModel().buildSections(from: .fixtureLarge)
        }
    }
}
```

`.default` invocation options auto-start/stop measurement around the block; `.manualStart`/`.manualStop` with `startMeasuring()`/`stopMeasuring()` exclude setup (e.g. a fixture load) from the timed window. Click the gray **baseline diamond** next to a result to store a per-device+OS baseline; subsequent runs fail if the metric regresses beyond the configured threshold (default 10%) -- pin CI to a fixed device+OS so the stored baseline stays meaningful. `XCTCPUMetric`/`XCTMemoryMetric` are widely reported as noisy on real devices (Apple Developer Forums); prefer `XCTClockMetric` or a signpost-bracketed interval when you need a tight threshold.

## Memory: `phys_footprint`, jetsam, and images

iOS's memory killer (jetsam) terminates apps based on **`phys_footprint`** (dirty + compressed + IOKit/IOSurface memory attributable to your process) -- not `resident_size`, which excludes compressed memory and overcounts shared clean pages, and disagrees with what actually triggers the kill:

```swift
import Darwin

func currentFootprintBytes() -> Int? {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let kr = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
            task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
        }
    }
    guard kr == KERN_SUCCESS else { return nil }
    return Int(info.phys_footprint)   // the jetsam-relevant value
}
```

`os_proc_available_memory()` (`<os/proc.h>`, iOS 13+) returns the bytes your process may still allocate before jetsam terminates it -- the best signal for *adaptive* memory behavior (evict a cache early, choose thumbnail over full-res):

```swift
import os

let headroom = os_proc_available_memory()
if headroom < 50 * 1024 * 1024 {
    ImageCache.shared.trim(toFraction: 0.5)
}
```

Foreground-app jetsam limits scale with installed RAM (Apple does not publish exact numbers; measured order of magnitude): roughly ~1.4 GB on 3 GB devices, ~2 GB on 4 GB, ~3 GB+ on 6 GB, higher with the Increased Memory Limit entitlement (`com.apple.developer.kernel.increased-memory-limit`) on supported devices for pro workloads. Backgrounded apps get a far smaller budget and are killed first under pressure. **App extensions have hard, device-independent ceilings much lower than the host app** -- these numbers are community-observed, not an Apple-published contract, and vary by device/OS:

| Process type | Approx. memory ceiling | Failure mode |
|---|---|---|
| WidgetKit widget extension | ~30 MB | Widget process killed; system shows last snapshot/placeholder |
| Notification Service extension | ~24 MB | Extension killed; original push delivered unmodified |
| Notification Content extension | ~24 MB | Custom UI fails to render |
| Share / Action extension | ~120 MB | Extension crashes mid-task |
| Main app (foreground) | Device-scaled (GB) | Jetsam / `EXC_RESOURCE` |

A widget decoding one full-resolution photo blows the ~30 MB ceiling instantly, even though the identical code merely wastes memory in the host app. Widgets must downsample to the exact `WidgetFamily` pixel size before drawing and prefer SF Symbols/vector over bitmaps.

Decoded (in-memory) bitmap cost is independent of on-disk file size or format:

```
memory bytes = width_px x height_px x bytes_per_pixel
```

`bytes_per_pixel` is 4 for standard sRGB 8-bit-per-channel (a 12MP photo decodes to ~48.7 MB) but **8 for wide-gamut Display P3 content** (16-bit per channel) -- a 12MP P3 photo, the default on modern iPhone cameras, is ~97 MB resident, not ~48 MB. A 2 MB JPEG on disk can be 48-97 MB in memory once decoded -- file size tells you nothing about memory cost; only downsampling the pixel dimensions at decode time does. `Image(...).resizable().frame()` in SwiftUI, and `AsyncImage`, both decode at source resolution first and scale the already-decoded bitmap for display -- neither downsamples. Decode directly at target size instead:

```swift
// iOS 15+. Async, off the main thread, display-ready.
let ready = await image.byPreparingForDisplay()

// iOS 15+. Downsampled thumbnail -- never fully decodes the source resolution.
let thumb = await image.byPreparingThumbnail(ofSize: CGSize(width: 200, height: 200))
```

Use the ImageIO `CGImageSourceCreateThumbnailAtIndex` path (`references/performance/02-scroll-list-performance.md#downsampling`) when decoding straight from a `URL`/`Data` without ever materializing the full-size image (best for a folder of 48MP photos); use `byPreparingThumbnail` when you already hold a `UIImage`. Cache with eviction, never a plain `Dictionary`:

```swift
let cache = NSCache<NSURL, UIImage>()
cache.countLimit = 200
cache.totalCostLimit = 50_000_000
cache.setObject(image, forKey: url as NSURL, cost: Int(image.size.width * image.size.height * 4))
```

`NSCache` participates in system memory-pressure eviction automatically. For large custom caches or in-flight buffers, also observe pressure directly: `UIApplication.didReceiveMemoryWarningNotification` for a coarse aggressive-purge hook, or `DispatchSource.makeMemoryPressureSource(eventMask: [.warning, .critical])` for queue-based, severity-aware handling. There is still no catchable in-process OOM signal -- a jetsam kill cannot be trapped and handled. What changed in iOS 27 is what you get AFTER the kill: `MemoryExceptionDiagnostic` (iOS/iPadOS 27 only), delivered through `MetricManager.diagnosticReports`, carries a `callStackTree` for the memory-limit termination. That is the difference between guessing which decode blew the budget and knowing. On iOS 26 and earlier the kill surfaces only as `EXC_RESOURCE`/`RESOURCE_TYPE_MEMORY` in a crash log (Xcode Organizer or App Store Connect), with rising `MXMemoryMetric.peakMemoryUsage` percentiles as the leading indicator that predicts rising OOM rates before `EXC_RESOURCE` crash volume climbs; from iOS 27, trend `PeakMemoryMetric` and the two `memoryLimitTerminationCount`s directly.

**iOS 27 moves Neural Engine memory onto your ledger.** Neural Engine allocations are now attributed to the app process instead of the system and appear in the Allocations instrument for the first time, so an app using Foundation Models or a Core ML model that sat comfortably inside its limit on iOS 26 can start taking OOM kills on iOS 27 with no code change. Re-measure `phys_footprint` on iOS 27 before shipping. iOS 27 also restricts background Neural Engine access the way it already restricted GPU use -- background inference needs the `com.apple.developer.background-tasks.continued-processing.inference` entitlement -- and improves load performance for models over 1 GB.

## Accessibility contract

This file instruments performance -- it has no direct Reduce Motion, VoiceOver, or Dynamic Type surface of its own. What it protects: the hang-rate and hitch-ratio targets gated here are the mechanical floor underneath `references/accessibility/05-motion-accessibility.md`'s vestibular-safety contract. A screen that correctly gates every `withAnimation(`/`.animation(_:value:)` call under Reduce Motion but still hangs or hitches is still perceived as uncontrolled motion by the user -- stutter reads as motion even when no `Animation` value fired. Treat a hang/hitch fix as unconditional (never gated on `accessibilityReduceMotion`); only the animated-transition choice itself is conditional.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Timing launch from `ProcessInfo` start / process creation | Prewarming can pre-spawn the process minutes before the user taps -- records a multi-minute "launch" | Check `ActivePrewarm`, anchor to `scenePhase -> .active` or first-frame capture |
| Reading `resident_size` from `mach_task_basic_info` as the memory number | Excludes compressed memory, overcounts shared clean pages -- disagrees with what jetsam actually watches | Read `phys_footprint` via `task_info(TASK_VM_INFO)` |
| Treating `MXAppLaunchMetric.histogrammedTimeToFirstDraw`/`histogrammedApplicationResumeTime` as the primary field metric | Both deprecated (`histogrammedApplicationResumeTime` since iOS 13); the whole `MX` launch/memory/exit class family is deprecated in the iOS 27 SDK | Use `histogrammedOptimizedTimeToFirstDraw`/`histogrammedExtendedLaunch`; dual-path the iOS 27 successor types behind `#available` |
| Reaching for `MXAnimationMetric.hitchTimeRatio` | Does not exist on `MXAnimationMetric` | `MXAnimationMetric.scrollHitchTimeRatio` (iOS 14.0+/macOS 12.0+), or `HitchTimeMetric` on iOS 27 |
| Charting pre-27 `scrollHitchTimeRatio` and iOS 27 `HitchTimeMetric` as one series | Scroll-scoped vs. app-wide animation hitch -- the metric's meaning changes mid-chart | Keep two series; restate the target as an animation-hitch budget on 27 |
| Dropping the `MX` subscriber once `MetricManager` is wired up | The new types do not exist on tvOS or watchOS, and the install base is mostly pre-27 | Dual path: `MX` for reach, `MetricManager` behind `#available(iOS 27, *)` |
| Shipping an iOS 27 Foundation Models / Core ML feature on an iOS 26 footprint measurement | Neural Engine memory now bills to the app process -- the same code can cross the jetsam limit on 27 | Re-measure `phys_footprint` on iOS 27; the allocations now show in Allocations |
| `Image(...).resizable().frame()` or `AsyncImage` on a full-resolution photo in a list/grid | Neither downsamples -- decodes at source resolution, scales the already-decoded bitmap | `byPreparingThumbnail(ofSize:)` or ImageIO thumbnail generation at the target pixel size |
| Judging decoded-image memory cost from file size on disk | A 2 MB JPEG can decode to 48-97 MB resident (4 or 8 bytes/pixel depending on gamut) | Compute `width x height x bytes_per_pixel`; downsample at decode time |
| A widget/notification extension decoding a full-resolution source image | Extension ceilings (~24-30 MB) are far below the host app's; instant kill | Downsample to the exact rendered size before drawing; prefer vector assets |
| Declaring a hitch fix from one "feels smoother" pass | Subjective, not attributable to the specific change | Re-run Animation Hitches and diff with Run Comparison against the pre-fix baseline trace |
| A plain `Dictionary`-backed image cache | Never evicts -- grows unbounded, contributes to OOM | `NSCache` with `totalCostLimit`, participates in system eviction |

## Severity guide

- **CRITICAL**: unbounded memory growth or a jetsam/OOM risk shipping to users, or a widget/extension blowing its process ceiling.
- **HIGH**: a launch or hitch regression that crosses the CI baseline threshold, or a wrong metric class producing false confidence (deprecated or phantom API treated as the source of truth).
- **MEDIUM**: a mis-measured number (prewarming-skewed launch time, a hitch "fixed" without a hitch-ratio re-measurement) that could silently mask a real regression.
- **LOW**: an order-of-magnitude heuristic (framework-load cost, extension ceilings) presented with false precision.

## See also

- `references/performance/01-swiftui-rendering.md#animation-cost-layout-vs-render` -- animation cost table this file's Instruments workflow verifies against a trace
- `references/performance/01-swiftui-rendering.md#equatable-views` -- the body-recomputation fix the SwiftUI Instrument's Update Groups lane proves
- `references/performance/02-scroll-list-performance.md#hitch-detection` -- scroll-specific hitch severity table
- `references/performance/02-scroll-list-performance.md#downsampling` -- ImageIO thumbnail-generation code path
- `references/performance/06-concurrency-ui.md` -- off-main-thread fix catalog for hang root causes
- `references/performance/07-build-performance.md` -- compile-time diagnostics (`-warn-long-function-bodies`, cross-module optimization) owner
- `references/accessibility/05-motion-accessibility.md` -- the Reduce Motion contract this file's hang/hitch targets sit underneath
