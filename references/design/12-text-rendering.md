# Advanced Text Rendering

> Owner: this file owns `TextRenderer`, `Text.Layout`, per-glyph/line text effects, `Text` composition, `AttributedString` in `Text`, and text-fitting (`lineLimit`, truncation, scaling). `references/design/03-typography-dynamic-type.md` owns font styles, weight/width/design, and inline spacing controls (`tracking`, `kerning`, `baselineOffset`, `leading`) -- cite it, don't restate. `references/design/13-canvas-shaders.md` owns writing and profiling Metal shaders; this file owns using a `Shader` to fill text.
> Floors: cite `references/_scaffolding/version-floor-registry.md`. Headline floor: `TextRenderer` requires **iOS 18.0+** -- DocC's `draw(layout:in:)` method page and the `Text.Layout` struct page both read "iOS 17.0+"; that is a DocC artifact, not the real floor. Gate everything TextRenderer-shaped on 18. Individual `Text.Layout` members can carry an earlier availability than the protocol that produces them -- see `Text.Layout.DrawingOptions` below.

`Text` in SwiftUI is a value type that composes: differently-styled runs, inline SF Symbols, and auto-formatted numbers/dates all wrap and Dynamic-Type-scale as one paragraph. `TextRenderer` (iOS 18+) lets you replace the drawing of that paragraph entirely, glyph by glyph, without dropping to Core Text or UIKit -- the most common way this goes wrong is moving text into a `Canvas` to get a custom effect, which silently erases the text from VoiceOver.

## The Apple way

- Compose with `+` and `Text`-returning modifiers before reaching for `AttributedString` or a custom renderer -- most "special" text is still fundamentally text, and the cheapest tool that preserves accessibility wins.
- `TextRenderer` changes only *drawing*. Font, Dynamic Type sizing, `AttributedString` runs, and the underlying string VoiceOver reads are untouched -- this is the load-bearing reason to prefer it over `Canvas` for any text effect.
- Every advanced-rendering surface must degrade to a legible, accessible baseline on older OSes and under Reduce Motion; the fallback is always a plain, full-fidelity string, never "left as an exercise."

## Text composition -- concatenation, inline symbols, formatted values

Only `Text`-returning modifiers are concatenable: `.foregroundStyle`, `.font`, `.bold()`, `.italic()`, `.underline()`, `.strikethrough()`, `.kerning()`, `.tracking()`, `.baselineOffset()`, `.textScale()`. View modifiers (`.padding`, `.background`) do not apply to the whole expression.

```swift
// iOS 13.0+
(
    Text("Storage ").font(.body)
    + Text("almost full").font(.body).bold().foregroundStyle(.red)
    + Text(". Upgrade to keep syncing.").font(.body).foregroundStyle(.secondary)
)
.multilineTextAlignment(.leading)

// Inline SF Symbol, baseline-aligned, wraps with the words
Text("Rated \(Image(systemName: "star.fill")) 4.9")
    .accessibilityLabel("Rated 4.9 out of 5")   // combined label so VoiceOver skips "star.fill"

// Formatted, localized, Dynamic-Type-correct -- never String(format:)
Text(4999.5, format: .currency(code: "USD"))          // "$4,999.50"
Text(Date.now, format: .dateTime.hour().minute())      // "2:45 PM"

// Live-updating, no Timer/TimelineView needed
Text(event.start, style: .relative)   // "2 hours ago" -- updates itself
Text(event.start, style: .timer)      // "05:23" counting -- call/workout timers
```

One `Text` wraps as a paragraph; `HStack { Text; Text }` cannot break a "word" across pieces and forces a rigid baseline. Concatenation keeps mixed styling on one accessibility element with a natural reading order.

Animate a changing number instead of hard-cutting it:

```swift
// iOS 16.0+
Text(score, format: .number)
    .contentTransition(.numericText(countsDown: score < previous))
    .animation(.snappy, value: score)   // gate per accessibility/03#reduce-motion -- use nil under RM
```

Pair timers/counters with `.monospacedDigit()` so digits don't jitter as they change.

## AttributedString in Text -- Markdown, runs, AttributeContainer

`Text(_ attributedContent: AttributedString)` (iOS 15+) renders styled spans; **string attributes take precedence over view modifiers** -- `Text(blueString).foregroundColor(.red)` still shows blue.

```swift
let s = try AttributedString(markdown: "**Thank you!** Visit our [site](https://example.com).")
Text(s)   // bold run + tappable link, styled automatically
```

**The #1 Markdown gotcha:** auto-parsing happens ONLY for `LocalizedStringKey` -- i.e. string *literals* and localized keys, never `String` variables:

```swift
Text("**Bold** works")             // literal -> LocalizedStringKey -> parses Markdown
let msg = "**Bold** fails"
Text(msg)                          // String variable -> verbatim, shows the asterisks
Text(try! AttributedString(markdown: msg))   // correct fix
```

Default (`.full`) Markdown parsing collapses newlines into one paragraph; preserve line breaks (release notes, chat, docs) with:

```swift
let opts = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
let s = try AttributedString(markdown: rawMarkdown, options: opts)
```

Build and mutate attributes directly, or bundle them in a reusable `AttributeContainer`:

```swift
var s = AttributedString("Balance: $1,240.00")
if let r = s.range(of: "$1,240.00") {
    s[r].foregroundColor = .green
    s[r].font = .title2.monospacedDigit().bold()
}
for run in s.runs { if run.link != nil { /* it's a link */ } }   // iterate styled spans
```

For a marker read by a `TextRenderer` instead of a rendered style, define a `CodableAttributedStringKey` and read it via `TextAttribute` (below), not `AttributedString` styling. `TextEditor` binds to `Binding<AttributedString>` (iOS 26) with `.attributedTextFormattingDefinition(_:)` constraining which attributes users may apply.

## TextRenderer -- custom drawing and per-glyph animation

```swift
// iOS 18.0+ / iPadOS 18.0+ / macOS 15.0+ / tvOS 18.0+ / visionOS 2.0+ / watchOS 11.0+
protocol TextRenderer: Animatable
func draw(layout: Text.Layout, in ctx: inout GraphicsContext)                    // required
func sizeThatFits(proposal: ProposedViewSize, text: TextProxy) -> CGSize         // optional -- reserve room for effects that draw outside the glyph box
func textRenderer<T>(_ renderer: T) -> some View where T: TextRenderer           // View modifier
```

`TextRenderer` refines `Animatable`: animate the renderer itself via its own `animatableData` and a single `withAnimation`/transition drives every glyph.

### The Text.Layout tree

`draw(layout:in:)` hands you a `Text.Layout`, a nested `RandomAccessCollection`: `Text.Layout` → `Text.Layout.Line` → `Text.Layout.Run` (contiguous glyphs sharing attributes) → `Text.Layout.RunSlice` (individual glyph slices). Each exposes `typographicBounds` (`.rect`, ascent/descent) for positioning; `layout.isTruncated: Bool` flags truncation.

```swift
let lines  = Array(layout)                                            // per-line effects
let runs   = layout.flatMap { line in line }                          // per-word/attribute-run effects
let slices = layout.flatMap { line in line.flatMap { run in run } }   // per-glyph effects
```

`GraphicsContext` is a value type -- **copy it per element** to isolate transforms/filters:

```swift
func draw(layout: Text.Layout, in ctx: inout GraphicsContext) {
    for line in layout {
        for run in line {
            var copy = ctx
            copy.opacity = 0.5
            copy.draw(run)
        }
    }
}
```

### Text.Layout.DrawingOptions -- earlier floor than the protocol

`ctx.draw(_ line: Text.Layout.Line, options: Text.Layout.DrawingOptions = .init())` draws a whole line. The set's sole documented flag is `disablesSubpixelQuantization` (disables subpixel quantization -- avoids jitter on per-frame-animated text), and it carries its own availability: **iOS 17.0+ / macOS 14.0+**, not 18. You can only reach it from inside an iOS-18 `draw(layout:in:)`, so the practical floor is still 18 -- cite the member's own annotation rather than inheriting the protocol floor blindly.

### Compile-ready exemplar -- per-glyph rise + fade, Reduce-Motion-gated

```swift
// iOS 18.0+
struct AppearanceRenderer: TextRenderer {
    var progress: Double                          // 0 = hidden, 1 = fully shown
    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    func draw(layout: Text.Layout, in ctx: inout GraphicsContext) {
        let slices = layout.flatMap { line in line.flatMap { run in run } }
        guard !slices.isEmpty else { return }
        for (i, slice) in slices.enumerated() {
            let start = Double(i) / Double(slices.count)
            let local = min(max((progress - start) / 0.35, 0), 1)
            var copy = ctx
            copy.opacity = local
            copy.translateBy(x: 0, y: (1 - local) * 12)   // rise 12pt
            copy.draw(slice)
        }
    }
}

struct AnimatedHeadline: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    var body: some View {
        Text("Welcome")
            .font(.largeTitle.bold())
            .textRenderer(AppearanceRenderer(progress: shown ? 1 : 0))
            .onAppear {
                if reduceMotion { shown = true }                                    // jump to end, no motion
                else { withAnimation(.easeOut(duration: 0.9)) { shown = true } }
            }
    }
}
```

Never `if reduceMotion { StaticView() } else { AnimatedView() }` for a text effect -- that remounts the subtree, causes identity churn, and can drop the accessible element mid-transition. Keep the same `TextRenderer`-attached view mounted and drive its animatable value straight to rest. Fallback for iOS < 18: wrap the `.textRenderer` call site in `if #available(iOS 18, *)` and otherwise show plain `Text` -- the renderer is purely decorative, so plain text is a full-fidelity fallback.

`draw` runs on the render thread every frame it animates -- keep it allocation-free (flatten once, no `String`/`Array` building inside the loop).

## TextAttribute -- targeting specific runs (iOS 18+)

`TextAttribute` is a `Hashable` marker you attach to a `Text` and read back inside `draw(layout:in:)` -- unlike `AttributedString` styling attributes, it carries *your* metadata (e.g. "this word should sparkle") that only your renderer understands.

```swift
protocol TextAttribute: Hashable                                                        // iOS 18.0+
func customAttribute<T>(_ value: T) -> Text where T: TextAttribute                       // on Text
subscript<T>(key: T.Type) -> T? where T: TextAttribute                                   // on Text.Layout.Run

struct Emphasis: TextAttribute {}   // no payload needed -- presence is the signal

let styled = Text("Tap ") + Text("Continue").customAttribute(Emphasis()) + Text(" to proceed")

// Inside draw(layout:in:):
if run[Emphasis.self] != nil {
    copy.addFilter(.shadow(color: .yellow, radius: 6))
}
```

Only one attribute of each type per `Text`; the innermost (most deeply nested) wins. Payloads are allowed too (`struct Wave: TextAttribute { var phase: Double }`), read via `run[Wave.self]?.phase`.

## Filling text with a gradient or shader

`foregroundStyle` accepts any `ShapeStyle`, so a gradient fills glyphs directly -- no masking hack, and it composes with Dynamic Type and VoiceOver:

```swift
// iOS 15.0+
Text("Liquid Glass")
    .font(.system(size: 48, weight: .bold, design: .rounded))
    .foregroundStyle(LinearGradient(colors: [.blue, .purple, .pink], startPoint: .leading, endPoint: .trailing))
```

`Shader` conforms to `ShapeStyle` (iOS 17+), so a Metal fragment shader can fill glyphs the same way -- `.foregroundStyle(ShaderLibrary.holographicFoil(.float(time)))`. Writing the `.metal` function, `ShaderLibrary` mechanics, and performance/pre-warming are owned by `references/design/13-canvas-shaders.md#writing-metal-shader-functions`; use a static gradient for a brand sheen and reserve a shader for continuous generative motion.

## Controlling how text fits

SwiftUI applies, in order: **tighten → scale down → truncate.** You control each stage.

```swift
// iOS 16.0+
Text(body).lineLimit(2, reservesSpace: true)   // ALWAYS occupies 2 lines' height -- kills layout jump as data loads
Text(body).lineLimit(1...3)                    // 1 to 3 lines, inclusive

// truncationMode -- where the ellipsis lands
Text("/Users/appleseed/Documents/Reports/Q3.pdf")
    .lineLimit(1)
    .truncationMode(.middle)   // .../Reports/Q3.pdf -- keeps start AND end; correct for paths/URLs/IDs

Text("1,234,567 followers")
    .lineLimit(1)
    .allowsTightening(true)          // shave inter-character spacing before truncating
    .minimumScaleFactor(0.6)         // may shrink to 60% before truncating -- floor ≥0.5, never a Dynamic Type substitute
```

`.truncationMode`: `.tail` (default, prose/sentences) · `.head` (keeps the end, e.g. a filename) · `.middle` (keeps both ends -- paths, URLs, "First … Last" identifiers). `minimumScaleFactor` is meaningful only with a line limit and fights users who enlarged text on purpose -- never use it as a substitute for Dynamic Type support. `textScale(.secondary, isEnabled:)` (iOS 17+) is the localization-safe relative shrink for a subordinate run (units, cents) -- correct across every script, unlike a hardcoded smaller point size.

Anti-pattern: `.frame(height: 44)` on a text row truncates at large Dynamic Type sizes -- use `minHeight` and let height grow.

## Text selection

```swift
// iOS 15.0+
Text(order.confirmationCode)      // "8F3K-92QX"
    .font(.body.monospaced())
    .textSelection(.enabled)      // long-press -> Copy / Share
```

`.textSelection(_:)` propagates to descendants; override a subtree with `.textSelection(.disabled)`. Enable for confirmation/2FA codes, IDs, addresses, phone numbers, error/log detail, quotes, formatted dates/amounts users may paste. Leave disabled for buttons, nav titles, ephemeral labels, tab bars. Editable selection (iOS 18+): `TextField`/`TextEditor` take a `Binding<TextSelection?>` to read/set the caret or range programmatically.

## Non-Latin typesetting

When a `Text`'s content language differs from the UI language, tell SwiftUI so it uses that language's line height and breaking rules -- wrong typesetting clips tall scripts (Thai, Devanagari, Arabic) or breaks CJK lines illegally:

```swift
// iOS 16+
Text(japaneseQuote).typesettingLanguage(.init(languageCode: .japanese))
```

Use `.explicit` behavior for content whose language you know at runtime (user-generated posts, quotes, lyrics). Never concatenate translated fragments with `+` in code -- grammatical order differs per language; use one `String(localized:)`/`LocalizedStringKey` with interpolation.

## Accessibility contract

`TextRenderer`/shader/gradient fills replace only *drawing* -- VoiceOver still reads the underlying `Text` string, and Dynamic Type sizing is already baked into the `Text.Layout` you receive; never bypass it with a hardcoded `.font(.system(size:))`. Do not move text into a `Canvas` to get a custom effect -- that erases the accessibility element entirely (owned by `references/design/13-canvas-shaders.md#accessibility-contract`). Gradient/shader fills must keep WCAG contrast against the background at every stop; test with Increase Contrast on. Decorative per-glyph motion is developer-owned under Reduce Motion (see the exemplar above) -- system text effects do not auto-gate custom renderers; the canonical double-gate contract lives at `references/accessibility/05-motion-accessibility.md#accessibility-contract`.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `Text(stringVariable)` expecting Markdown to render | Only string literals (`LocalizedStringKey`) auto-parse Markdown | `Text(try AttributedString(markdown: str))` |
| `if reduceMotion { Plain() } else { Animated() }` for a text effect | Remounts the subtree, identity churn, can drop the a11y element | Keep one view mounted, drive the animatable value to rest |
| Drawing text inside a `Canvas` for a custom look | `Canvas` is invisible to VoiceOver | `TextRenderer` -- keeps the semantic `Text` intact |
| `.frame(height: 44)` on a text row | Truncates at large Dynamic Type | `.minHeight`, let it grow |
| `minimumScaleFactor` with no `lineLimit` set | Does nothing | Add a finite `lineLimit` first |
| Glow/blur from a `TextRenderer` clipped at the edge | Effect draws outside the text's frame | `.padding()` around the `Text` |

## Severity guide

- **CRITICAL**: text moved into a `Canvas` (VoiceOver-invisible) or a custom renderer that bypasses Dynamic Type sizing.
- **HIGH**: `if/else` remount pattern used to gate a text animation on Reduce Motion.
- **MEDIUM**: gradient/shader text fill failing WCAG contrast at a gradient stop; `TextRenderer` gated on iOS 17 instead of 18.
- **LOW**: `Text.Layout.DrawingOptions.disablesSubpixelQuantization` mis-labeled iOS 18; missing translator `comment:` is a design/10 nit, not this file's.

## See also

- `references/design/03-typography-dynamic-type.md` -- font styles, `tracking`/`kerning`/`baselineOffset`/`leading`
- `references/design/10-content-and-writing.md#truncation-is-a-content-decision-not-just-an-api` -- what to write so truncation stays meaningful
- `references/design/13-canvas-shaders.md` -- writing `.metal` shader functions, `ShaderLibrary`, performance
- `references/accessibility/05-motion-accessibility.md#accessibility-contract` -- Reduce Motion double-gate contract
- `references/animation/03-advanced-animators.md#keyframeanimator` -- driving a `TextRenderer` from `KeyframeAnimator`
