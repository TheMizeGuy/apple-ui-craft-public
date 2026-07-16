# Swift Charts and Data Visualization

> Owner: `references/design/09-swift-charts.md` owns Swift Charts mark selection, axes/scale/legend configuration, chart interactivity, and the `Chart3D` family, per the ARCHITECTURE ownership map. Semantic color and CVD-safe palettes are owned by `references/design/04-color-system.md`; cite it, don't restate.
> Floors: base marks (`BarMark`/`LineMark`/`AreaMark`/`PointMark`/`RuleMark`/`RectangleMark`) are iOS 16.0+; `SectorMark` and declarative selection are iOS 17.0+; vectorized/function plots are iOS 18.0+; the `Chart3D` family is iOS 26.0+. See `references/_scaffolding/version-floor-registry.md#ios-26x` for the exact `Chart3DCameraProjection` platform list.

Swift Charts turns a data question into an accessible, VoiceOver-navigable, Dynamic-Type-aware visualization with a declarative mark API -- the same `import Charts` framework backs 2D and 3D. The most common failure isn't a wrong mark, it's reaching for a chart when a labeled number reads faster, or reaching for `Canvas` when `Chart` would have given accessibility for free.

## The Apple way

- Choose the mark from the reader's QUESTION, not the aesthetic. "How does this compare across categories?" → `BarMark`. "How did this change over time?" → `LineMark`/`AreaMark`. "What share is each part of the whole?" → `SectorMark`, only when ≤5 slices and proportion (not exact value) is the point.
- Don't chart a single value or two categories -- a labeled figure ("4,200 vs 3,100 → +35%") reads faster than a one- or two-bar chart. Reserve `Chart` for a screen's primary, interactive visualization; a 60×24 inline trend hint needs none of Charts' axis/scale/legend machinery -- draw a `Path` and add the accessibility layer yourself.
- Bar tops are always rounded (`.cornerRadius(6, style: .continuous)`); bar y-domains always start at 0 -- a truncated baseline exaggerates differences and is a HIG/data-integrity violation.
- Direct-label 1-3 series with `.annotation` on the last point instead of a legend hop; hide the auto-generated legend with `.chartLegend(.hidden)` when you do.
- Never put `.glassEffect()` behind or over a plot area -- refraction distorts data marks. A chart sits on a plain or `.fill.tertiary` card; glass is fine for a floating toolbar or range picker *above* the chart, never as the plot backdrop.

## Core APIs

### The seven marks

| Mark | Encodes | Floor | Use for | Never for |
|---|---|---|---|---|
| `BarMark` | length from a zero baseline | 16.0+ | counts, sums, category comparison | continuous trend |
| `LineMark` | value over a continuous domain | 16.0+ | time series, trends | unordered categories |
| `AreaMark` | line + filled magnitude | 16.0+ | cumulative totals, ranges (`yStart:yEnd:`), stacked share | comparing >3 overlapping series |
| `PointMark` | discrete x/y sample | 16.0+ | scatter, correlation, sparse events | dense time series |
| `RuleMark` | a reference line/threshold | 16.0+ | average, goal, selection lollipop, min-max whisker | primary data |
| `RectangleMark` | a filled cell/band | 16.0+ | heatmaps, Gantt bands, highlighted regions | anything `BarMark` does better |
| `SectorMark` | angular share of a whole | **17.0+** | part-to-whole when ≤5 slices, donut (`innerRadius:`) | precise value comparison |

```swift
// iOS 16.0+
import Charts

Chart(revenue) { row in
    BarMark(x: .value("Month", row.month), y: .value("Revenue", row.amount))
        .cornerRadius(6, style: .continuous)   // Apple never ships square bar tops
        .foregroundStyle(.tint)
}
.chartYScale(domain: 0...maxValue)              // zero baseline
```

Every axis binding is `.value("Axis label read by VoiceOver", plottableValue)` -- the string is the accessibility label for that dimension, not decoration.

### Multi-series, stacking, and interpolation

```swift
Chart(sales) { item in
    BarMark(x: .value("Month", item.month), y: .value("Revenue", item.revenue))
        .foregroundStyle(by: .value("Category", item.category))   // color channel → auto legend
        .position(by: .value("Category", item.category))          // omit to stack; add to cluster
}
```

`.foregroundStyle(by:)` assigns colors from the system categorical palette (already CVD-tuned) -- prefer it over hand-picked hues unless brand forces a scale. Always pair it with `.symbol(by:)` or a dashed `.lineStyle` for a `\.accessibilityDifferentiateWithoutColor` fallback (see `references/design/04-color-system.md`). `.interpolationMethod(.monotone)` for any series that must never dip below zero (counts, prices); `.catmullRom` overshoots local extrema and is wrong for that data.

For 100%-stacked share over time, normalize manually into each x's fractional total and pin `.chartYScale(domain: 0...1)` with `.chartYAxis { AxisMarks(format: .percent) }` -- don't rely on an undocumented stacking parameter.

### Axes, scales, legends

```swift
.chartXAxis {
    AxisMarks(values: .stride(by: .month)) { value in
        AxisGridLine()
        AxisTick()
        AxisValueLabel(format: .dateTime.month(.abbreviated))
    }
}
.chartYScale(domain: 0...1000)                  // pin for live/paging charts -- stops axis "breathing"
.chartPlotStyle { plot in plot.background(.fill.tertiary) }   // semantic fill adapts to dark mode + Increased Contrast
```

`AxisMarks(values:)` accepts `.stride(by: .month)`, an explicit array, or `.automatic`. You may stack multiple `AxisMarks` in one `chartYAxis` -- dense gridlines from one, sparse labels from another. Prefer `FormatStyle` (`.currency`, `.percent`, `.dateTime.weekday(.narrow)`) over string interpolation so values localize.

### Interactivity

Declarative selection (iOS 17+) beats hand-rolled `chartOverlay` gesture math -- the framework does the hit-testing:

```swift
@State private var selectedDate: Date?

Chart(samples) { s in
    BarMark(x: .value("Day", s.date, unit: .day), y: .value("Steps", s.steps))
        .foregroundStyle(selectedDate.map { sameDay($0, s.date) } ?? true ? .tint : .tint.opacity(0.3))
}
.chartXSelection(value: $selectedDate)
.sensoryFeedback(.selection, trigger: selectedDate)   // owner: references/haptics/02-swiftui-sensory-feedback.md
```

`chartXSelection`/`chartYSelection`/`chartAngleSelection` (iOS 17.0+) bind a value or a `ClosedRange` for a span selection. When you render a scrub tooltip via `.annotation`, set `overflowResolution: .init(x: .fit(to: .chart), y: .disabled)` -- chart annotations are NOT clipped to the plot frame by default, and a tall tooltip near an edge bleeds onto the next row (a real shipped bug, not theory). `.clipped()` on the chart is defense-in-depth, not the primary fix.

Scrollable window: `.chartScrollableAxes(.horizontal)` + `.chartXVisibleDomain(length:)` + `.chartScrollTargetBehavior(.paging)`. Guard the visible-domain length against datasets shorter than the window -- clamp to the real data range or you get empty scroll space.

### Chart3D (iOS 26)

`Chart3D` is a distinct container from 2D `Chart` (same `Charts` module), adding a Z axis and interactive rotation. `PointMark`, `RuleMark`, `RectangleMark` gain a `z:` parameter; `SurfacePlot(x:y:z:function:)` is the 3D extension of `LinePlot` for a mathematical surface z = f(x, y):

```swift
// iOS 26.0+ (incl. visionOS 26 for Chart3D/Chart3DPose -- see version-floor-registry)
@available(iOS 26.0, *)
struct PenguinScatter3D: View {
    @State private var pose = Chart3DPose(azimuth: .degrees(20), inclination: .degrees(7))
    var body: some View {
        Chart3D(penguins) { p in
            PointMark(x: .value("Flipper", p.flipperLength),
                      y: .value("Weight", p.weight),
                      z: .value("Beak", p.beakLength))
                .foregroundStyle(by: .value("Species", p.species))
        }
        .chartXAxisLabel("Flipper (mm)")
        .chartYAxisLabel("Weight (kg)")
        .chartZAxisLabel("Beak (mm)")            // one modifier per line -- a `;`-chained
                                                   // leading-dot after `;` is invalid Swift
        .chart3DPose($pose)                       // two-way bind so drag-to-rotate persists
        .chart3DCameraProjection(.automatic)       // default is .automatic, NOT .orthographic
        .frame(height: 320)
        .accessibilityLabel("3D scatter of penguin flipper, weight, and beak by species")
    }
}

// Mathematical surface:
@available(iOS 26.0, *)
var surface: some View {
    Chart3D { SurfacePlot(x: "X", y: "Y", z: "Z") { x, z in sin(x) * cos(z) } }
        .foregroundStyle(.blue.gradient)
}
```

`chart3DCameraProjection(_:)` cases are `.automatic` (default), `.orthographic` (parallel, preserves scale), `.perspective` (foreshortening -- reads "more 3D," distorts value comparison). `chart3DCameraProjection` ships on iOS/iPadOS/macOS/Mac Catalyst 26.0+ -- **not visionOS**, whereas `Chart3D` and `Chart3DPose` do include visionOS 26. Reach for 3D only when the spatial relationship IS the insight (clusters that separate only in 3D, a surface) -- occlusion and unreliable depth comparison make it harder to read than 2D with a color/size channel; never for "impressive."

## Availability + fallbacks

```swift
if #available(iOS 26.0, *) {
    Chart3D(samples) { s in
        PointMark(x: .value("A", s.a), y: .value("B", s.b), z: .value("C", s.c))
            .foregroundStyle(by: .value("Group", s.group))
    }
} else {
    // iOS 16-25: 2D scatter, 3rd variable → symbolSize + color, plus a "View as Table" affordance
    Chart(samples) { s in
        PointMark(x: .value("A", s.a), y: .value("B", s.b))
            .foregroundStyle(by: .value("Group", s.group))
            .symbolSize(by: .value("C", s.c))
    }
}
```

`SectorMark` gated behind `#available(iOS 17, *)` -- it hard-fails to compile on a lower deployment target. Chart entrance/re-selection transition animations gate on `\.accessibilityReduceMotion` per the double-gate contract (`references/accessibility/05-motion-accessibility.md`); any `Chart3D` auto-orbit entrance must gate the same way -- user-driven rotation is fine, an automatic one is not.

## Accessibility contract

A chart that conveys real information is NOT accessible until it has BOTH per-mark labels AND a chart descriptor -- neither alone is sufficient.

1. **Per-mark labels**: every `.value("Label", x)` string is what VoiceOver speaks for that dimension; add `.accessibilityLabel`/`.accessibilityValue` per mark for custom phrasing. Gate expensive label-building behind `UIAccessibility.isVoiceOverRunning` if it allocates -- the closure runs on every render for sighted users too.
2. **`AXChartDescriptor`**: `.accessibilityChartDescriptor(_:)` takes an **`AXChartDescriptorRepresentable`**, not a raw `AXChartDescriptor` -- conform a type and implement `makeChartDescriptor()`. This unlocks VoiceOver's "Play Audio Graph" rotor action (a sonified sweep of the data) and structured axis navigation -- required, not polish. `isContinuous: true` sonifies as a glide (line/area); `false` as discrete steps (bars/points).
3. `Canvas`-drawn charts are INVISIBLE to VoiceOver -- no accessibility tree exists for raw pixels. If you hand-draw a chart, supply the semantic layer yourself (`.accessibilityElement(children: .ignore)` + label + value + `.accessibilityChartDescriptor(...)`), or use `Chart`/`Chart3D` for free accessibility instead.
4. Honor `\.accessibilityDifferentiateWithoutColor` (add `.symbol(by:)`/dash) and `\.accessibilityReduceMotion` (skip chart entrance/transition animation) as environment reads, not afterthoughts.
5. `Chart3D` is the weakest a11y surface -- depth is inaccessible to low vision and unreliable for VoiceOver spatial reasoning. Always ship a 2D fallback (3rd variable as color/size) and a "View as Table" affordance.
6. Height discipline: inside a `ScrollView`, a `Chart` claims all offered vertical space. Give the outer container ONE `.frame(height:)` across loading/empty/error/success states, scaled with Dynamic Type -- never reuse the same constant for `.small` and `.accessibility5`.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `.chartXAxisLabel("Date"); .chartYAxisLabel("Revenue")` on separate lines joined by `;` | Leading-dot chaining after a `;`-separated statement is invalid Swift -- this does not compile as written | One modifier per line, no semicolons |
| `SectorMark` at an iOS 16 deployment target | Hard compile failure -- `SectorMark` is 17.0+ | Gate `#available(iOS 17, *)` or use `BarMark` |
| `.chart3DCameraProjection(.orthographic) // default` | `.automatic` is the real default, not `.orthographic` | State `.automatic` as default; choose deliberately |
| Truncated bar-chart y-axis to "show the difference better" | Data-integrity violation -- exaggerates magnitude | `.chartYScale(domain: 0...max)` |
| `Canvas`-drawn chart with no accessibility layer | Zero VoiceOver access -- invisible to assistive tech | `Chart`/`Chart3D`, or manual `accessibilityChartDescriptor` |
| Per-row sparkline built with a full `Chart` in a `LazyVGrid` | Latent perf CRITICAL -- axis/scale/legend machinery per cell | A plain `Path` for a 60×24 trend hint |
| Rainbow color scale for a magnitude heatmap | No perceptual order, fails CVD and looks unprofessional | Single-hue lightness ramp (`Gradient(colors: [.blue.opacity(0.1), .blue])`) |
| Two y-scales on one plot (dual-axis: a second series overlaid via a `ZStack` of `Chart`s or a rescaled second `yStart`) | The alignment of the two scales is arbitrary, so the chart invents a correlation the data does not contain -- the #1 chart-design mistake | Two stacked charts sharing an x-domain, small multiples, or index both series to a common base (=100 at t0) on one axis |

## Severity guide

CRITICAL: a `Canvas`-drawn chart shipped with zero accessibility layer, or a truncated y-axis baseline presented as fact. HIGH also covers a dual-axis overlay (two y-scales on one plot) presented as a single chart. HIGH: `SectorMark`/`Chart3D` used below its floor with no `#available` gate; color-only series encoding with no `.symbol(by:)` fallback. MEDIUM: missing `AXChartDescriptor` on a chart that already has per-mark labels; unbounded chart height inside a `ScrollView`. LOW: a legend shown for a 1-2 series chart where direct annotation would read faster. NIT: `.interpolationMethod(.catmullRom)` on count data that should use `.monotone`.

## See also

- `references/design/04-color-system.md` -- semantic colors, CVD-safe palette guidance (owner)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate for chart transitions (owner)
- `references/haptics/02-swiftui-sensory-feedback.md#basic-syntax` -- `.sensoryFeedback(.selection, trigger:)` for scrub feedback (owner)
- `references/design/11-media-content.md` -- image/video rendering pipeline for non-chart visual media
