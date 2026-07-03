# Localization, RTL, and String Catalogs

> Owner: `references/accessibility/06-localization-rtl.md` owns String Catalog authoring (`.xcstrings`), pluralization/grammar-agreement mechanics, right-to-left mirroring, and locale-aware value formatting. `references/design/10-content-and-writing.md` owns writing/tone; cite it for content strategy, this file for the plumbing that makes translated content correct.
> Floors: cite `references/_scaffolding/version-floor-registry.md#ios-160` / `#ios-150-and-earlier` for version-gated members. Stated inline: `String.LocalizationOptions.replacements` = iOS 16.0+; `#bundle` macro compiles with Xcode 26 / Swift 6.2, runtime floor iOS 15.0+ (back-deployable, not iOS-26-gated).

Localization is not "translate the strings" -- it is translated strings, an equally translated accessibility layer, layout that survives text 35% longer than English, mirrored layout for RTL languages, and locale-correct numbers/dates/currency. Most of that is free if you use the right API; almost all of it breaks silently (compiles, ships, wrong) when hand-rolled.

## The Apple way

- `.xcstrings` String Catalogs are the only current localization format (Xcode 15+); `.strings`/`.stringsdict` are legacy-migrate-only targets, never a new recommendation.
- Every user-facing string goes through ONE interpolated, localized call site -- never `Text(prefix + name + suffix)` or a hand-split ternary. Concatenation and ternaries both hard-code English grammar and word order into the source, and non-English locales ship the English branch verbatim.
- Localize the accessibility layer too: `accessibilityLabel`/`Hint`/`Value` are user-facing text. An unlocalized `String` literal there ships English audio to every locale even when the visible label is translated.
- RTL mirroring is mostly automatic if you used semantic layout APIs (`leading`/`trailing`, `HStack`, SF Symbol `.forward`/`.backward`). The bugs live in the narrow set of things that are direction-agnostic by construction: raw geometry, `Canvas`/`Path`, `.offset(x:)`, custom-drawn glyphs.

## Core APIs -- the four localized-string types

| Type | Layer | Resolves | Use for |
|---|---|---|---|
| `LocalizedStringKey` | SwiftUI view code | At render, current env locale | Implicit -- what `Text("...")` string-literal init takes |
| `String(localized:)` | Anywhere, eager | Immediately, `Locale.current` (or `locale:`) | Accessibility labels, `AttributedString`, view-model strings, anywhere you need a plain `String` now |
| `LocalizedStringResource` (iOS 16+) | Model/API boundary, deferred | At DISPLAY time, not creation | Widgets, Live Activities, App Intents -- anything serialized/scheduled ahead of render; a plain `String` freezes the locale active when it was captured |
| `String.LocalizationValue` | The interpolation payload | -- | The `ExpressibleByStringInterpolation` type the three above accept; captures `\(count)` -> `%lld`, `\(name)` -> `%@` |

```swift
// SwiftUI Text -- implicit LocalizedStringKey, comment via the explicit initializer
Text("save_button", comment: "Button that persists the current recipe (not 'save money')")

// String(localized:) -- eager, for non-Text contexts
let title = String(localized: "save_button", defaultValue: "Save", table: "Recipes",
                    comment: "Button that persists edited recipe fields")

// LocalizedStringResource -- deferred, for Live Activities / Widgets / App Intents
struct OrderActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var statusText: LocalizedStringResource   // NOT String -- re-resolves per render
    }
}
```

`Text(someStringVariable)` -- a bare `String` through the `StringProtocol` initializer -- is NEVER localized, no matter the runtime value; it's the #1 silent-ship trap. Only a string LITERAL, or an explicit `Text(LocalizedStringKey(someStringVariable))` when the value genuinely is a lookup key, localizes.

### `#bundle` macro

Resolves the correct resource bundle at the call site automatically, replacing the "forgot `bundle: .module`" bug class in Swift packages:

```swift
// #bundle requires Xcode 26 / Swift 6.2 to COMPILE; the resolved availability floor
// is iOS 15.0+/macOS 12.0+ -- it back-deploys, it is NOT gated to iOS 26.
String(localized: "greeting", bundle: #bundle, comment: "Onboarding welcome line")
Text("greeting", bundle: #bundle)
```

Comments are load-bearing, not optional -- they are the ONLY context a translator has. `String(localized: "save", comment: "")` ships wrong-context translations for every overloaded English word ("Save" the recipe vs. "Save" a discount vs. "Save" a life are three different words in most languages).

## Pluralization: CLDR categories and the singular-canonical-key trap

String Catalogs implement Unicode CLDR plural rules -- up to six category slots per language (`zero`, `one`, `two`, `few`, `many`, `other`); English uses only `one`/`other`, Arabic uses all six, Polish/Russian split three ways. Never hand-roll `count == 1 ? ... : ...` -- that is itself the bug (below).

**The trap (a confirmed, twice-shipped production bug pattern):** for an interpolated count, SwiftUI extracts `\(count)` to a format specifier (`%lld`) and the exact literal STRING -- written in the SINGULAR -- becomes the String Catalog key. The plural variation block lives under that singular-shaped key.

```swift
// WRONG -- hand-splits English grammar; the ternary's plural branch is a SEPARATE,
// never-pluralized catalog key. Every non-English locale ships the English plural verbatim.
Text(count == 1 ? "1 data point" : "\(count) data points")

// RIGHT -- one interpolated call site, singular-shaped source literal.
// Xcode extracts key "%lld data point"; add the plural variation UNDER that exact key.
Text("\(count) data point")
```

The JSON path is `strings."%lld data point".localizations.<lang>.variations.plural.{one,other}.stringUnit.value` -- not a top-level `stringUnit`. A CI catalog-coverage test that only checks "does *a* `stringUnit` exist" passes while the plural slots stay empty; assert on the `variations.plural` node specifically for every shipped locale. A composed VoiceOver label describing the same count must interpolate the identical singular-shaped literal so it resolves to the SAME key -- otherwise visual and VoiceOver users get two independently-drifting translations of "the same" plural.

## Automatic grammar agreement (inflection)

Spanish/French/German/Arabic/Hebrew require adjectives and articles to agree with an interpolated term's gender/number -- `^[...](inflect: true)` tells the system to inflect the wrapped run using the surrounding grammatical context, at render, with zero per-language string variants:

```swift
Text("Add ^[\(itemCount) \(item.name)](inflect: true) to your cart")
// English: "Add 1 apple" / "Add 3 apples" -- the framework inflects the noun to match itemCount.
```

For a runtime term whose gender the framework can't infer (a contact name, user-entered text), annotate an `AttributedString` explicitly:

```swift
var name = AttributedString("María")
name.inflect = true
name.morphology.grammaticalGender = .feminine
Text("Welcome, ^[\(name)](inflect: true)")   // adjacent articles/adjectives agree with feminine
```

## RTL mirroring: what auto-flips, what doesn't

For Arabic, Hebrew, Persian, Urdu the whole UI mirrors. Semantic APIs mirror for free; absolute geometry does not.

| Auto-mirrors (free) | Does NOT auto-mirror (the real bug surface) |
|---|---|
| `HStack` child order, `leading`/`trailing` alignment/padding | `.offset(x:)`, `.position(x:)`, raw `CGPoint` math |
| `List`/`Form` rows, disclosure indicators, back-chevron | `Path`/`Canvas` custom drawing (a speech-bubble tail, custom slider fill) |
| `NavigationStack` push/pop direction, `TabView` | `.rotationEffect` / hand-drawn arrow glyphs |
| Corner-specific `.rect(topLeadingRadius:...)` | `UIKit` `.forceLeftToRight` (never set this) |

```swift
@Environment(\.layoutDirection) private var layoutDirection
var isRTL: Bool { layoutDirection == .rightToLeft }

// Mirror custom offset/Canvas content manually:
CustomBadge().offset(x: isRTL ? -12 : 12)
CustomTailBubble().scaleEffect(x: isRTL ? -1 : 1, y: 1, anchor: .center)
```

**Mirror by meaning, not by default.** Photos, logos, avatars must NOT flip. Directional affordances (a reply arrow, a "next" chevron) MUST flip:

```swift
Image("cover").resizable().scaledToFill()                          // decorative -- never mirror
Image("custom_forward_arrow").flipsForRightToLeftLayoutDirection(true)  // directional -- opt in (default off)
```

SF Symbols already carry per-locale direction metadata: `chevron.forward`/`.backward` and `arrow.forward`/`.backward` auto-flip; `arrow.right`/`.left` do NOT (they are absolute by name). **Rule: use `.forward`/`.backward` for any symbol expressing navigation or progression, never `.left`/`.right`.** Symbols with no directional meaning (`heart`, `star`, `gear`) are untouched. Maps, diagrams, media scrubbers, and real-world-direction progress usually should NOT mirror; navigation, tab order, and sliders SHOULD.

## Text expansion survival

German/Finnish/Dutch run ~35% longer than English, some strings double; Russian ~20% longer; CJK is shorter but taller. Sizing any control to the English string is the #1 localization layout bug class.

```swift
Text(descriptionKey).lineLimit(nil).fixedSize(horizontal: false, vertical: true)   // grow down, never clip
Text(titleKey).lineLimit(2, reservesSpace: true)                                    // iOS 16+: fixed 2-line slot, no height jump
```

`.minimumScaleFactor(0.8)` is a silent no-op with no `lineLimit` set -- it only shrinks with a FINITE line limit. Reserve scaling for atomic single-line labels (tab titles); prefer wrapping for body text. A hardcoded `.frame(width: 220)` sized to an English label is the trap -- at large Dynamic Type plus a longer translation, the label truncates. Scale the container instead: `@ScaledMetric` (`references/design/03-typography-dynamic-type.md#custom-dimensions-that-scale-scaledmetric`), or reflow with `ViewThatFits`. Numbers/URLs embedded in RTL text need bidi isolation (`"\u{2066}example.com\u{2069}"`, LRI...PDI) to avoid Unicode-bidi reordering.

## Locale-aware value formatting

Never hand-assemble a number, date, or price -- grouping separators, decimal marks, calendars, and currency placement are all locale-specific, and `FormatStyle` reads `\.locale` automatically:

```swift
Text(1234.5, format: .number)                              // 1,234.5 (en) / 1.234,5 (de)
Text(Decimal(19.99), format: .currency(code: "USD"))        // symbol + placement from locale; code = the money's currency
Text(date, format: .dateTime.day().month().year())          // fields requested, order decided by locale
Text(names.formatted(.list(type: .and)))                    // "Ana, Ben, and Chen" / "Ana, Ben und Chen"
```

Buddhist, Japanese, Hijri, and Hebrew calendars change the YEAR NUMBER, not just the format -- `Date.FormatStyle` renders the correct calendar automatically when it reads `\.calendar`; a hand-interpolated `"\(year)"` shows the Gregorian year everywhere.

## `String.LocalizationOptions.replacements` (iOS 16.0+)

The named-replacement API is a `var replacements: [any CVarArg]?` **property** on `String.LocalizationOptions`, consumed via `String(localized:options:)` -- there is no `.replacing(arguments:)` method; that name does not exist on this type:

```swift
// iOS 16.0+ -- replacements is a property you SET, not a method you call
var options = String.LocalizationOptions()
options.replacements = [userName]
let greeting = String(localized: "Welcome back, %@", options: options)
```

## Testing localization and RTL

Bugs cluster at the corners -- locale x Dynamic Type x layout direction:

```swift
#Preview("DE · AX5") {
    ContentView().environment(\.locale, Locale(identifier: "de_DE")).dynamicTypeSize(.accessibility5)
}
#Preview("RTL · Arabic") {
    ContentView().environment(\.locale, Locale(identifier: "ar")).environment(\.layoutDirection, .rightToLeft)
}
```

| Pseudolanguage (Edit Scheme > Run > Options > App Language) | Catches |
|---|---|
| Double-Length Pseudolanguage | Truncation from text expansion |
| Accented Pseudolanguage | Un-extracted (hardcoded) strings -- they stay un-accented |
| Right-to-Left Pseudolanguage | Mirroring + expansion at once -- run it even before shipping a real RTL translation |

`simctl` screenshot automation has a re-launch trap: `-AppleLanguages`/`-AppleLocale` launch arguments work on a cold launch but are LOST across `simctl terminate` + relaunch. Persist the locale in defaults instead: `xcrun simctl spawn <udid> defaults write <bundle-id> AppleLanguages -array es`, then terminate/relaunch. Minimum coverage matrix per screen: `en`/`.large` baseline, `de`/`.xxxLarge` (expansion + big type), `ar`/RTL/`.large` (mirroring), `ar`/RTL/`.accessibility3` (mirroring + expansion + big type -- where things actually break), `ja`/`.large` (CJK line breaking). For CI, assert on the String Catalog's `variations.plural` JSON node per locale, not a source-grep guard -- a guard that special-cases any `Text(...)` containing `\(` interpolation as "already localized" says nothing about whether the plural slot is populated.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `Text(prefix + name + suffix)` | Word order is locale-specific; hard-codes English grammar | One interpolated `Text("Hello, \(name)!")` |
| `count == 1 ? "1 item" : "\(count) items"` | Splits the plural key across two unrelated catalog entries; non-English locales ship English plurals | Single interpolated `Text("\(count) item")`, plural variation under the singular key |
| Unlocalized `accessibilityLabel("Delete")` string literal without going through the catalog machinery correctly | VoiceOver speaks English in every locale even when the visible label is translated | `accessibilityLabel(String(localized: "Delete", comment: "..."))` |
| `.frame(width: 220)` sized to the English label | Truncates at AX3+ with a longer translation | `@ScaledMetric` or `ViewThatFits` |
| `arrow.right`/`.left` SF Symbol for "next"/"back" | Does not mirror in RTL | `arrow.forward`/`.backward` (auto-mirrors) |
| `.offset(x: 12)` on a custom badge | Absolute geometry doesn't mirror | `.offset(x: isRTL ? -12 : 12)` |
| `"$" + String(amount)` | Wrong symbol/placement/decimal convention per locale | `Text(Decimal(amount), format: .currency(code:))` |
| `.replacing(arguments:)` on `String.LocalizationOptions` | Method does not exist | Set the `replacements` property, then `String(localized:options:)` |

## Severity guide

- **CRITICAL**: accessibility labels/hints never localized -- VoiceOver ships English audio in every locale; or a plural key mis-split across a hand-rolled ternary so a non-English locale ships wrong grammar.
- **HIGH**: fixed-width/fixed-height container clips translated text at default or large Dynamic Type.
- **MEDIUM**: directional SF Symbol (`.left`/`.right`) used for a navigation affordance instead of `.forward`/`.backward`; custom-drawn directional glyph missing `flipsForRightToLeftLayoutDirection`.
- **LOW**: missing translator `comment:`; hardcoded number/date/currency formatting that happens to look right in English.

## See also

- `references/design/10-content-and-writing.md` -- writing/tone strategy, truncation-as-content-decision (OWNER of content craft)
- `references/design/03-typography-dynamic-type.md#custom-dimensions-that-scale-scaledmetric` -- `@ScaledMetric`, Dynamic Type layout adaptation
- `references/accessibility/01-voiceover-fundamentals.md` -- VoiceOver label/hint/value contract this file's localized strings feed into
- `references/accessibility/02-dynamic-type-adaptation.md` -- the AX1-AX5 scale this file's expansion corner-cases against
- `references/patterns/00-screen-archetypes-index.md` -- where localization QA fits in a screen's build checklist
- `~/Claude/vault/iOS Development/` -- String Catalogs, RTL, Foundation formatting deep source
