# Xcode Previews as a Design Tool and Design QA

> Owner: `references/methodology/02-previews-design-qa.md` owns using `#Preview`/`PreviewModifier`/`@Previewable` as a design-QA surface, the mandatory per-screen variant matrix, the Accessibility Inspector, and `performAccessibilityAudit(for:_:)` as the automated craft-QA gate. The get-only vs writable accessibility environment-key split is owned by `references/patterns/01-gotchas-anti-patterns.md#the-preview-environment-key-trap` -- cite it, don't restate the table. VoiceOver label/trait/rotor content is owned by `references/accessibility/01-voiceover-fundamentals.md`.
> Floors: `#Preview` macro = iOS 17.0+/Xcode 15+ (replaces `PreviewProvider`, which still compiles but is superseded). `PreviewModifier` and `@Previewable` = iOS 18.0+/Xcode 16+. `performAccessibilityAudit` = iOS 17.0+/Xcode 15+.

Previews only enforce craft when a view is architected to be previewable and every meaningful state actually has one. Treat `#Preview` as Apple's fastest design-QA surface, not a "does it compile" toy: emit a preview per state, run the matrix below on every non-trivial screen, then close the gap previews cannot reach (system accessibility settings) with the Accessibility Inspector and an automated `performAccessibilityAudit` gate in CI.

## The Apple way

- A first-party-quality screen has an intentional design for EVERY state, not just the happy path -- loading, empty, error, minimum content, and overflow each get a named preview.
- Previews render a PARTIAL environment: no `.task` side effects unless in Live mode, mock data, and no real system accessibility settings. They catch layout/visual/state-design defects early; they do not replace a simulator/device run for interaction fidelity, real data, performance, or live accessibility settings.
- Architect the view to BE previewable: inject dependencies instead of constructing them in `init`, and separate side effects (fetch in a model method or `.task`) from `body`.

## `#Preview` basics and migrating off `PreviewProvider`

```swift
#Preview("Loaded") { FeedView(model: .loaded(.sampleFeed)) }
```

`PreviewProvider` still compiles but is superseded -- migrate opportunistically:

| `PreviewProvider` | `#Preview` |
|---|---|
| `static var previews: some View { MyView() }` | `#Preview { MyView() }` |
| `.previewDisplayName("Name")` | `#Preview("Name") { ... }` |
| `.previewLayout(.sizeThatFits)` | `#Preview(traits: .sizeThatFitsLayout) { ... }` |
| `.previewLayout(.fixed(w,h))` | `#Preview(traits: .fixedLayout(width:height:)) { ... }` |
| `.environment(\.colorScheme, .dark)` | `.preferredColorScheme(.dark)` inside the closure |
| `.previewDevice(...)` | canvas device picker (no trait equivalent) |
| Multiple `Group { }` children | multiple `#Preview` blocks |

`#Preview` also works for UIKit/AppKit: return a `UIView`/`UIViewController` from the closure and the same variant matrix applies, replacing the slow, flaky `@IBDesignable`/`prepareForInterfaceBuilder()` path.

**Traits vs modifiers -- use the right layer.** Traits (`.landscapeLeft`, `.sizeThatFitsLayout`, `.modifier(...)`) are passed to the MACRO and shape the canvas/container; view modifiers (`.dynamicTypeSize`, `.preferredColorScheme`) are applied INSIDE the closure body and shape the view itself.

```swift
#Preview("Badge", traits: .sizeThatFitsLayout) { StatusBadge(.online) }   // shrink-wraps to intrinsic size
#Preview("Card", traits: .fixedLayout(width: 320, height: 96)) { PriceCard(.sample) }
#Preview("Landscape", traits: .landscapeLeft) { DashboardView() }
```

`.sizeThatFitsLayout` is the single highest-value trait for component craft: it renders at true intrinsic size instead of a full screen, so it catches oversized padding and content-sizing bugs a full-device canvas hides. Device choice (iPhone vs iPad) is the canvas DEVICE PICKER, not a trait -- there is no `#Preview` device trait.

Widgets use a distinct macro overload that supplies a timeline, so the canvas can scrub across every state a widget will render:

```swift
#Preview("Small", as: .systemSmall) { WeatherWidget() } timeline: {
    WeatherEntry(date: .now, temp: 72, condition: .clear)
    WeatherEntry(date: .now.addingTimeInterval(3600), temp: 68, condition: .rain)
}
```

## The mandatory design-QA variant matrix

Generate this fixed set for every non-trivial screen -- together they catch roughly 90% of layout-craft regressions before the simulator ever launches:

```swift
#Preview("Default") { ProfileView(user: .preview) }                                   // 1. baseline
#Preview("Dark") { ProfileView(user: .preview).preferredColorScheme(.dark) }            // 2. contrast, glass legibility
#Preview("xxxLarge") { ProfileView(user: .preview).dynamicTypeSize(.xxxLarge) }         // 3. largest STANDARD size
#Preview("AX1") { ProfileView(user: .preview).dynamicTypeSize(.accessibility1) }        // 4. first crack point
#Preview("AX5") { ProfileView(user: .preview).dynamicTypeSize(.accessibility5) }        // 4. worst case, 310% scale
#Preview("Arabic RTL") {                                                                // 5. mirroring, hardcoded leading/trailing
    ProfileView(user: .preview).environment(\.locale, Locale(identifier: "ar"))
        .environment(\.layoutDirection, .rightToLeft)
}
#Preview("German") { ProfileView(user: .preview).environment(\.locale, Locale(identifier: "de")) }  // 6. longest-string locale
#Preview("Landscape", traits: .landscapeLeft) { ProfileView(user: .preview) }           // 7. horizontal adaptation
#Preview("Empty") { ProfileView(user: .preview, items: []) }                            // 8. content edge cases
#Preview("Overflow") { ProfileView(user: .longNamePreview, items: .many) }
```

Only FOUR accessibility-relevant environment values are injectable in a `#Preview` at all -- `colorScheme` (prefer `.preferredColorScheme(_:)`), `dynamicTypeSize` (prefer `.dynamicTypeSize(_:)`, also accepts a range), `locale`, and `layoutDirection`. Every other visual-accessibility setting (Reduce Motion, Reduce Transparency, Increase Contrast, Differentiate Without Color, Bold Text, Smart Invert) is a GET-ONLY environment value and cannot compile inside `.environment(_:_:)` in a preview closure at all -- see `references/patterns/01-gotchas-anti-patterns.md#the-preview-environment-key-trap` (owner) for the full get-only/writable split and why the compile error happens. Reach for the Xcode canvas's own Variants/accessibility-override controls, or the Environment Overrides described below, to exercise those states.

## `PreviewModifier` and `@Previewable`

Two Xcode-16-era additions make previews a real design tool instead of a toy. `PreviewModifier` builds EXPENSIVE shared context (a SwiftData `ModelContainer`, an injected store) ONCE and caches it across every preview that applies it:

```swift
struct SampleData: PreviewModifier {
    static func makeSharedContext() async throws -> ModelContainer {
        let container = try ModelContainer(for: Snack.self, configurations: .init(isStoredInMemoryOnly: true))
        Snack.sampleData.forEach { container.mainContext.insert($0) }
        return container
    }
    func body(content: Content, context: ModelContainer) -> some View { content.modelContainer(context) }
}
#Preview(traits: .modifier(SampleData())) {
    @Previewable @Query var snacks: [Snack]
    SnackView(snack: snacks.first!)
}
```

`makeSharedContext()` is `async throws`, so a throw surfaces as a preview error instead of a crash; the returned context is cached and reused for every preview applying that modifier type -- eight variant previews build the container ONCE, not eight times.

`@Previewable` lets `#Preview` declare a dynamic property (`@State`, `@Bindable`, `@Query`, `@FocusState`) directly at the top of the closure instead of forcing a wrapper view, enabling a real two-way binding in Live mode:

```swift
#Preview("Toggle bound") {
    @Previewable @State var isOn = true
    Toggle("Notifications", isOn: $isOn)   // real two-way binding, live in the canvas
}
```

`@Previewable` must sit at the START of the `#Preview` body, attached to a dynamic property, and only works inside the macro. With it, an interactive Live-mode preview exercises real state transitions (toggle, drag, increment) with zero scaffold view -- the fastest way to design/QA a stateful component.

## Architecting views to be previewable

- Inject dependencies; never construct a network client or read a singleton in `init` -- a view that news up its own dependency cannot preview offline.
- Separate the view from side effects: fetch inside the model's `.task`/method, not `body`. Previews render `body` without running `.task` unless in Live mode, so pre-seed the model instead.
- Give every model static mock factories (`.preview`, `.empty`, `.longNamePreview`) so all variant previews share one source of truth and mock drift becomes impossible.
- Keep mock JSON/images in a **Preview Content** folder marked a Development Asset in target settings -- it is stripped from the production build, so preview-only assets never ship.
- Wrap a view in `NavigationStack`/`TabView` inside the preview when it needs that context to look right (`#Preview { NavigationStack { DetailView(item: .preview) } }`) -- otherwise the preview QAs a title/toolbar that will not exist in context; base mechanics owned by `references/design/07-navigation-patterns.md#navigationstack-ios-16`.

## Accessibility Inspector and `performAccessibilityAudit`

Previews catch layout craft; the Accessibility Inspector and the automated audit catch what previews structurally cannot -- contrast ratios, hit-region sizes, missing descriptions, clipped text at large type. Launch via **Xcode > Open Developer Tool > Accessibility Inspector**, pointed at the simulator or a device. Three modes:

1. **Inspection** -- hover/select any element to read its label, value, traits, hint, and frame; confirms an icon-only control announces what you intend.
2. **Audit tab** -- runs the same automated auditor as `performAccessibilityAudit` on the current screen and lists issues by category with a screenshot pointer.
3. **Contrast calculator** -- measures foreground/background ratio against WCAG thresholds (4.5:1 normal text, 3:1 large text/UI components); use it to verify custom colors -- system semantic colors pass automatically.

The automated form is the single highest-leverage accessibility test: one XCUITest call runs the same auditor as the Inspector, with zero per-element assertions:

```swift
import XCTest

final class AccessibilityAuditTests: XCTestCase {
    func testHomeScreenPassesAudit() throws {
        let app = XCUIApplication()
        app.launch()
        try app.performAccessibilityAudit()   // defaults to auditTypes: .all
    }
}
```

The corrected signature labels its first parameter `for:` (a widely-copied unlabeled form does not compile):

```swift
func performAccessibilityAudit(
    for auditTypes: XCUIAccessibilityAuditType = .all,
    _ issueHandler: ((XCUIAccessibilityAuditIssue) throws -> Bool)? = nil
) throws
```

| `XCUIAccessibilityAuditType` | Catches |
|---|---|
| `.contrast` | Foreground/background below the WCAG ratio |
| `.dynamicType` | Text that doesn't support, or breaks at, large Dynamic Type |
| `.textClipped` | Clipped or overlapping text (often only visible at AX sizes) |
| `.hitRegion` | Touch targets smaller than 44x44 pt |
| `.elementDetection` | Elements the system can't detect/parse |
| `.sufficientElementDescription` | Missing or insufficient accessibility labels |
| `.trait` | Incorrect or missing accessibility traits |
| `.all` | Everything above (default) |

Run a subset when only one dimension matters: `try app.performAccessibilityAudit(for: [.contrast, .dynamicType])`. The `issueHandler` closure returns `true` to SUPPRESS a known/acceptable issue (test still passes) and `false`/`nil` to let it fail -- never blanket-suppress a whole `auditType` to force CI green; suppress the single named element with a comment explaining why:

```swift
try app.performAccessibilityAudit { issue in
    guard let el = issue.element else { return false }
    return issue.auditType == .contrast && el.identifier == "decorative-hairline"
}
```

Sweep the audit across critical Dynamic Type sizes -- this is the pattern that finds real bugs, since `.textClipped`/`.dynamicType` only fire where layouts actually crack:

```swift
for size in ["UICTContentSizeCategoryL", "UICTContentSizeCategoryAccessibilityL",
             "UICTContentSizeCategoryAccessibilityXXXL"] {
    let app = XCUIApplication()
    app.launchArguments += ["-UIPreferredContentSizeCategoryName", size]
    app.launch()
    try app.performAccessibilityAudit(for: [.dynamicType, .textClipped, .contrast])
}
```

`references/accessibility/01-voiceover-fundamentals.md` (owner) covers the zero-argument `performAccessibilityAudit()` form as one line inside its VoiceOver testing workflow, plus the VoiceOver label/trait content the audit's `.sufficientElementDescription`/`.trait` categories check against -- this file owns the audit API mechanics, the CI-gate pattern, and the Dynamic-Type sweep.

## Environment Overrides: exercising states previews cannot inject

Get-only accessibility settings (Reduce Motion, Reduce Transparency, Increase Contrast, Bold Text, Differentiate Without Color, Smart Invert) cannot be baked into a `#Preview`. Exercise them on one of three surfaces instead: (1) the Xcode canvas Variants button, which exposes accessibility overrides without editing code; (2) a RUNNING app's Xcode debug bar > Environment Overrides, toggled live against the simulator/device; (3) Simulator > Settings > Accessibility, or the Simulator Features menu shortcuts. Because these cannot be preview-injected, write the view so a plain `@Environment` READ plus an ordinary `if`/ternary drives the adaptation -- that branch is exercisable via Environment Overrides at runtime and testable by an automated audit; a pattern that reads the flag indirectly or hardcodes the animation cannot be verified at all.

## Troubleshooting common preview failures

| Symptom | Cause | Fix |
|---|---|---|
| "Cannot preview in this file" / build failed | A compile error anywhere in the linked module | Build the app target (Cmd+B); the preview inherits the real error |
| Preview times out / spins | Heavy work in `init`/`body`, real network, huge data | Move work out of `body`; use an in-memory `ModelContainer`; smaller mock |
| Crash: force-unwrap of an empty query | `snacks.first!` before sample data seeded | Seed via `PreviewModifier.makeSharedContext()`; guard the unwrap |
| SwiftData preview renders empty | No container, or not seeded | `.modifier(SampleData())` trait with an `isStoredInMemoryOnly: true` container |
| `@Previewable` won't compile | Not at the start of the `#Preview` body, or on a non-dynamic property | Move it to the first line; only `@State`/`@Query`/etc. |
| Env-key injection won't compile | Injecting a get-only accessibility value | Use canvas overrides / Environment Overrides instead |
| Preview stale / not updating | Auto-refresh paused | Cmd+Option+P to resume; Cmd+Option+Return toggles the canvas |
| Works in preview, breaks on device | Preview skips `.task`, uses mock data | Also run in the simulator before shipping -- a preview is a design surface, not a substitute for a real run |

## Accessibility contract

Previews cover the four writable environment values directly; every get-only visual-accessibility setting must instead be exercised through Environment Overrides or the automated audit, per the section above. None of this file introduces new motion -- if a preview drives a `Live`-mode animation, confirm the underlying view reads `\.accessibilityReduceMotion` and has a non-animated fallback per `references/accessibility/05-motion-accessibility.md` (owner of the double-gate); flipping Reduce Motion in Environment Overrides while a Live preview or running app is active is the fastest way to confirm the gate actually fires.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| A non-trivial view with zero `#Preview` | Craft is unverifiable; CRITICAL finding | Add at least a baseline preview |
| `.environment(\.accessibilityReduceMotion, true)` inside a `#Preview` | Get-only key, does not compile | Read the flag via `@Environment` in the view; toggle via Environment Overrides |
| Only a full-screen preview for a small component | Hides oversized padding / intrinsic-size bugs | Add a `.sizeThatFitsLayout` variant |
| Blanket-suppressing a whole `auditType` in `performAccessibilityAudit` to force CI green | Defeats the audit entirely | Suppress one named element with a justifying comment |
| Storing a `@ViewBuilder`/mock closure and duplicating it per preview variant | Mock drift across variants | Static factories on the model (`.preview`, `.empty`, `.longNamePreview`) |
| Only testing the happy-path state | Loading/empty/error/overflow ship undesigned | A named preview per meaningful state |

## Severity guide

CRITICAL: missing preview on a non-trivial screen, or an `.environment(_:_:)` injection of a get-only key that fails to compile. HIGH: a clipped/truncated element or sub-44pt hit target at AX5, a contrast failure, or a Live-mode animation with no Reduce Motion fallback. MEDIUM: no empty/error state design, missing RTL check, or non-Apple-metric padding revealed by `.sizeThatFitsLayout`. LOW: a missing component-size or extra-locale preview. NIT: an unhedged claim about SDK-unverified preview behavior.

## See also

- `references/patterns/01-gotchas-anti-patterns.md#the-preview-environment-key-trap` -- the full get-only vs writable accessibility environment-key table (owner)
- `references/accessibility/01-voiceover-fundamentals.md` -- VoiceOver labels/traits/rotor content the audit's description/trait categories check (owner)
- `references/accessibility/03-visual-accessibility.md#color-contrast` -- contrast thresholds the Inspector's calculator measures against
- `references/accessibility/05-motion-accessibility.md` -- the Reduce Motion double-gate exercised via Environment Overrides (owner)
- `references/performance/01-swiftui-rendering.md` -- why heavy `body` work stalls previews the same way it stalls real rendering
- `references/methodology/01-component-api-design.md` -- the component-API shapes this variant matrix is designed to QA
