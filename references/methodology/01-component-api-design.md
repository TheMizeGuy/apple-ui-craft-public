# Component API Design

> Owner: `references/methodology/01-component-api-design.md` owns the SHAPE decisions for a reusable SwiftUI component's public API -- data-in vs content-in initializers, sensible defaults and progressive disclosure, custom style protocols, generics, and `@resultBuilder` DSLs. The underlying property-wrapper MECHANICS (`@State`/`@Binding`/`@Observable` semantics, `@Entry` environment-value declaration, `ViewModifier`/`PreferenceKey` protocol shapes) are owned by `references/performance/04-state-architecture.md#viewmodifier-and-preferencekey` and `#entry-and-custom-environment-values` -- cite them, don't restate them. The Reduce Motion double-gate is owned by `references/accessibility/05-motion-accessibility.md`.
> Floors: `@Entry` = iOS 18.0+ (Xcode 16+ toolchain; back-deploys to iOS 13 -- hand-roll `EnvironmentKey` only when the build toolchain predates Xcode 16, per `references/_scaffolding/version-floor-registry.md#ios-180`). `.buttonStyle(.glass)`/`.glassProminent` = iOS 26.0+.

Every reusable SwiftUI component makes the same handful of API decisions Apple's own controls already made: does the caller pass DATA or CONTENT, where do optional knobs live, are variants Bool flags or semantic enums, and can a consumer re-skin the component without forking it. Get these right and a component reads as first-party; get them wrong and every call site fights an 8-parameter initializer full of Bools. The single organizing discipline is the one this reference library itself uses: one canonical owner per concept, everything else is a thin pointer -- apply that to a component library the same way you apply it to a reference tree.

## The Apple way

- The simplest correct usage is ONE line; every additional capability is opt-in via a defaulted parameter, a chainable modifier, or the environment.
- Required, per-instance DATA lives in `init`; optional, cross-cutting CONFIG lives on modifiers or environment -- never crammed into the initializer.
- Variants are semantic enums (`role: .destructive`, `.controlSize(.large)`), never boolean flags (`isDestructive: true`, `big: true`).
- Consumers who need to re-skin a component get a style protocol; consumers who need a one-off variation get a modifier. Neither should require forking the component's source.
- A component honors the SAME environment the system already threads through a subtree (`\.controlSize`, `\.isEnabled`, `\.dynamicTypeSize`, `\.accessibilityReduceMotion`) for free -- it does not reinvent a parallel configuration channel for things the environment already solves.

## The core decision: data-in, content-in, or style protocol

| Shape | Use when | Apple example | Your example |
|---|---|---|---|
| Parameterized `init` (data in) | Component fully owns its layout; caller supplies model values | `Label("Mail", systemImage: "envelope")`, `ProgressView(value:total:)` | `ProfileHeader(user:onEdit:)` |
| Single `@ViewBuilder` slot (content in) | Component is a container/decorator; caller owns the children | `ScrollView { }`, `GroupBox { }` | `Card { ... }` |
| Multiple named slots | Container with distinct regions | `Section(header:footer:content:)`, `GroupBox(label:content:)` | `Panel(header:body:footer:)` |
| Generic parameterized view | Reusable over a caller-supplied data type | `List(items) { }`, `ForEach` | `SelectableList<Item, Row>` |
| Style protocol | Consumers re-skin without re-implementing behavior | `ButtonStyle`, `LabelStyle` | see "Building your own styleable component" below |

For a single slot, put the `@ViewBuilder` LAST so it becomes the trailing closure, and capture the built value once in `init` rather than storing the closure and re-invoking it in `body` -- re-invocation defeats view identity and can re-run side effects:

```swift
struct Card<Content: View>: View {
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }   // built once
    var body: some View {
        content.padding(16).background(.background.secondary, in: .rect(cornerRadius: 16))
    }
}
Card { Text("Hi"); Button("Go") { } }   // reads like a native container
```

Multiple named slots follow `Section`'s convention: the MAIN content is the trailing (unlabeled) closure; secondary regions are labeled parameters that precede it, each defaulted to `{ EmptyView() }` so simple call sites stay short:

```swift
struct Panel<Header: View, Body: View, Footer: View>: View {
    private let header: Header; private let footer: Footer; private let body_: Body
    init(@ViewBuilder header: () -> Header,
         @ViewBuilder footer: () -> Footer = { EmptyView() },
         @ViewBuilder content: () -> Body) {
        self.header = header(); self.footer = footer(); self.body_ = content()
    }
    var body: some View { VStack(alignment: .leading) { header.font(.headline); body_; footer } }
}
```

A generic data-in slot is the ONE case where re-invoking a caller-supplied closure per element is correct -- it mirrors `List`/`ForEach`, driven by identity:

```swift
struct SelectableList<Item: Identifiable & Hashable, Row: View>: View {
    let items: [Item]
    @Binding var selection: Set<Item.ID>
    @ViewBuilder let row: (Item) -> Row     // legitimately re-invoked once per item
    var body: some View { List(items, selection: $selection) { row($0) } }
}
```

Also ship the "title-or-label" convenience overload Apple uses everywhere so 90% of callers write one line while power users get full control -- mirrors `Button(_:action:)`/`Button(action:label:)` and `Label(_:systemImage:)`/`Label(title:icon:)`:

```swift
extension Card where Content == Text {
    init(_ titleKey: LocalizedStringKey) { self.init { Text(titleKey) } }
}
Card("Quick")                 // convenience
Card { CustomHeader() }       // full control
```

## Sensible defaults + progressive disclosure

1. **Default every non-essential init parameter.** The default must be the SAFEST, most-neutral choice -- the value a zero-config instance needs to look correct for the majority case. Never require a caller to pass a value they will almost always leave unchanged.
2. **Optional CONFIG belongs on chainable modifiers, not the initializer.** An 8+ parameter `init` is a design smell (`Chart(data, showLegend:, showGrid:, animated:, cornerRadius:, barSpacing:)`); move it to modifiers backed by custom `@Entry` environment values (`.chartLegend(.visible).chartGridLines(.horizontal)`), the way `Chart` itself does.
3. **Kill the boolean trap.** Sequences of `Bool` flags (`Toast(isError:, isDismissible:, hasIcon:)`) are unreadable at the call site and do not scale. Replace with a semantic enum or `OptionSet`: `role: .destructive` not `isDestructive: true`; `Axis.Set` not `scrollsHorizontally:verticallyEnabled:`.
4. **Prefer additive evolution.** Because parameters are defaulted, you can ADD a capability (a new defaulted parameter, a new modifier) without breaking any existing call site. Never reorder or remove parameters of a shipped component -- treat the initializer signature as a public contract once it ships.

The checklist a component should pass before it ships: usable correctly in one line; the only non-defaulted `init` parameter is required data; optional config lives on modifiers/environment, not the initializer; variants are semantic enums, not booleans; it honors system environment (`\.isEnabled`, `\.controlSize`, `\.dynamicTypeSize`, `\.accessibilityReduceMotion`) for free; the zero-configuration instance looks correct; a new capability can be added later without breaking any existing call site.

## Style protocols: let consumers re-skin without re-implementing

The style-protocol pattern is how Apple lets you re-skin `Button`, `Toggle`, `Label`, `Gauge`, and `ProgressView` without re-implementing focus, accessibility traits, hit-testing, or keyboard handling. Reach for it before a bespoke wrapper view whenever the component is a design-system primitive many call sites will restyle:

```swift
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label                                   // the Button's label content
            .font(.headline).foregroundStyle(.white)
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(Color.accentColor, in: .capsule)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)   // isPressed is the ONLY interaction signal
    }
}
Button("Save") { save() }.buttonStyle(PrimaryButtonStyle())
```

`makeBody(configuration:)` is declared `@ViewBuilder @MainActor`; `BUTTONStyleConfiguration` exposes `.label` and `.isPressed: Bool` (iOS 26 adds `.role` so a style can react to `.destructive`/`.cancel`). Reserve `PrimitiveButtonStyle` for the rare case you must own the interaction yourself (custom gesture, long-press-to-fire, simultaneous gestures) -- it hands you `configuration.trigger()` instead of `isPressed`, so you synthesize press state. 95% of custom buttons should be plain `ButtonStyle`.

A style is not a `View`, but it CAN declare `@Environment` -- it resolves when `makeBody` runs:

```swift
struct PressScaleButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion   // gate per accessibility/05
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(reduceMotion ? nil : .smooth(duration: 0.18), value: configuration.isPressed)
    }
}
```

`LabelStyle`/`ToggleStyle` follow the identical `makeBody(configuration:)` shape with a different `Configuration` (`.title`/`.icon`, or `.label`/`.isOn: Binding<Bool>`). Two Apple power patterns worth copying: (1) MODIFY the current style instead of replacing it -- re-wrap `Toggle(configuration)` and add modifiers rather than rebuilding the control from scratch; (2) style-modifier evaluation order is outermost -> innermost, so apply the CUSTOM (modifying) style closer to the control than the base style, or the base style overrides it entirely. Built-in Liquid Glass button styles (`.glass`, `.glassProminent`, `Button.glassEffect(.regular.interactive())`) are owned by `references/design/02-liquid-glass.md#glass-buttons` -- prefer them before rolling a custom glass look.

## Building your own styleable component

When a component you own needs the SAME re-skinning power, ship a custom style protocol using Apple's exact six-part scaffold:

```swift
// 1. Configuration: the data the style renders. Type-erase caller content to AnyView.
struct CardStyleConfiguration {
    let label: Label; let isSelected: Bool
    struct Label: View { let underlying: AnyView; var body: some View { underlying } }
}
// 2. The style protocol. makeBody mirrors Apple's signature exactly.
protocol CardStyle {
    associatedtype Body: View
    typealias Configuration = CardStyleConfiguration
    @ViewBuilder @MainActor func makeBody(configuration: Configuration) -> Body
}
// 3. Type erasure so the style can live in the environment (associatedtype can't be stored directly).
struct AnyCardStyle: CardStyle {
    private let _makeBody: @MainActor (Configuration) -> AnyView
    init<S: CardStyle>(_ style: S) { _makeBody = { AnyView(style.makeBody(configuration: $0)) } }
    func makeBody(configuration: Configuration) -> some View { _makeBody(configuration) }
}
// 4. Environment slot with a default style (see performance/04 for @Entry mechanics).
extension EnvironmentValues { @Entry var cardStyle: AnyCardStyle = AnyCardStyle(.automatic) }
// 5. Public setter -- accept any concrete style, erase at the boundary.
extension View {
    func cardStyle<S: CardStyle>(_ style: S) -> some View { environment(\.cardStyle, AnyCardStyle(style)) }
}
// 6. The component reads its style from the environment and delegates rendering.
struct Card<Content: View>: View {
    @Environment(\.cardStyle) private var style
    private let content: Content; private let isSelected: Bool
    var body: some View {
        style.makeBody(configuration: .init(label: .init(underlying: AnyView(content)), isSelected: isSelected))
    }
}
```

Enable the `.cardStyle(.automatic)` dot-syntax ergonomic with a constrained static extension, exactly how `.buttonStyle(.bordered)` works:

```swift
struct DefaultCardStyle: CardStyle { func makeBody(configuration: Configuration) -> some View { configuration.label.padding(16) } }
extension CardStyle where Self == DefaultCardStyle { static var automatic: DefaultCardStyle { .init() } }
```

`AnyView` erasure defeats SwiftUI's structural diffing for the card body subtree -- acceptable for a card-sized unit, unsuitable for a hot list row rendered thousands of times (prefer a plain parameterized view or `ViewModifier` there instead). Skip the whole scaffold when there is a single call site or a single visual variant -- just write a parameterized `View`; when the variation is pure layout with no consumer override -- use a `ViewModifier`; when the caller only needs to vary a value (a color, a size) -- a custom `@Entry` environment value plus a convenience modifier is far cheaper than a style protocol.

## ViewModifier vs a plain View extension

`ViewModifier` is the correct unit the moment a repeated visual/behavioral treatment needs its OWN `@State`, reads `@Environment`, or must conform to `Animatable` for a custom interpolated effect -- a plain `extension View` function is a pure transform and cannot hold state:

| Need | Use |
|---|---|
| Pure static modifier chain, no own state | `extension View { func cardStyle() -> some View { padding(16)... } }` |
| Needs `@State` / `@Environment` / `@GestureState` / lifecycle | `ViewModifier` (a `View` extension can't hold state) |
| Needs to animate a value SwiftUI can't interpolate natively | `ViewModifier` conforming to `Animatable` -- deep-dive: `references/animation/03-advanced-animators.md#animatable-for-custom-shapes` |
| Child must report a value UP to an ancestor | `PreferenceKey` (below) |

ALWAYS wrap a `.modifier(FooModifier())` call in a named `View` extension so the modifier type stays an implementation detail and the call site reads like a native modifier -- a public `.modifier(CardModifier())` call site is itself a smell:

```swift
struct Shimmer: ViewModifier {
    @State private var phase: CGFloat = -1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func body(content: Content) -> some View {
        content.overlay(LinearGradient(colors: [.clear, .white.opacity(0.35), .clear],
                                        startPoint: .init(x: phase, y: 0.5), endPoint: .init(x: phase + 1, y: 0.5)).mask(content))
            .onAppear { guard !reduceMotion else { return }
                withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) { phase = 2 } }
    }
}
extension View { func shimmering() -> some View { modifier(Shimmer()) } }   // never a bare .modifier() call site
```

Name the wrapper like a native modifier -- verb or adjective (`.card()`, `.shimmering()`, `.badge(count:)`) -- never `.applyFooModifier()`. Full `ViewModifier` protocol mechanics and the `PreferenceKey` protocol shape (including the `AnimatableModifier`-is-deprecated note) are owned by `references/performance/04-state-architecture.md#viewmodifier-and-preferencekey`.

## PreferenceKey as a component's public reporting channel

State flows DOWN through parameters and environment; `PreferenceKey` is the only first-class channel for a child to report a fact UP to an ancestor -- a measured size, a computed title, an anchor for an overlay. When a reusable component itself needs to expose such a fact to its consumer (a card exposing its rendered content height, a tab bar reporting the frame of its selected item for an external indicator), treat the `PreferenceKey` type as PART of the component's public API: give it a clear, component-prefixed name (`CardHeightKey`, not `HeightKey`), document what `reduce` does semantically (widest wins, first-non-nil, concatenation), and expose a matching `.onXChange` convenience modifier rather than making the consumer call `.onPreferenceChange(_:)` against your internal key type directly. Never use a `PreferenceKey` to move ordinary app-model data up the tree -- that scope belongs one level higher; reserve it for values only the child can compute. Protocol mechanics, `reduce`/`defaultValue` semantics, `anchorPreference`, and the layout-thrash cost gotcha are owned by `references/performance/04-state-architecture.md#viewmodifier-and-preferencekey`.

## Environment-driven configuration for component libraries

The environment is the idiomatic channel for config that should CASCADE down a subtree and be OVERRIDABLE at any depth -- exactly how `.font`, `.tint`, `.controlSize`, and `.buttonStyle` work. Use it for cross-cutting component config; use `init` parameters for per-instance data. Threading a `spacing:`/`theme:` value through five intermediate initializers is the smell that says "this belongs in the environment":

```swift
extension EnvironmentValues { @Entry var cardEmphasis: CardEmphasis = .standard }   // iOS 18+, see performance/04
extension View { func cardEmphasis(_ emphasis: CardEmphasis) -> some View { environment(\.cardEmphasis, emphasis) } }
// CardStack().cardEmphasis(.prominent) configures every descendant Card; a nested Card can still
// locally override with its own .cardEmphasis(.quiet) without the parent knowing.
```

NEVER make callers write `.environment(\.cardEmphasis, .prominent)` directly -- always ship the convenience setter modifier (Apple's own guidance on `EnvironmentValues/subscript(_:)`). Trade-offs specific to component config: environment values are IMPLICIT, so discoverability is lower than an init parameter -- reserve it for genuinely cross-cutting config, keep required per-instance data as explicit `init` parameters; a nested `NavigationStack`/sheet presentation inherits environment from its presenter in modern SwiftUI, but a detached `UIHostingController` root does not, so re-inject theming config at any such boundary.

## Generics and @resultBuilder

Constrain a generic component to the MINIMUM protocol it actually uses (`Identifiable & Hashable`, not a bespoke fat protocol), and let `some View` return types keep the internal generic explosion (`VStack<TupleView<...>>`) hidden from callers:

```swift
struct Badge<Content: View>: View {                         // generic over label content
    let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View { content.padding(6).background(.tint, in: .capsule) }
}
```

`@ViewBuilder` (Apple's built-in result builder) already supports `if`/`else`, `switch`, `for-in`, and `#available` inside any slot -- for 95% of "let the caller pass children" needs, a `@ViewBuilder` closure IS the whole answer; do not write a custom builder for view content. Write a CUSTOM `@resultBuilder` only when children are a DOMAIN type (not `View`) you want declared inline with control flow -- a list of actions, form fields, or menu commands:

```swift
@resultBuilder
enum ActionBuilder {
    static func buildBlock(_ parts: [Action]...) -> [Action] { parts.flatMap { $0 } }
    static func buildExpression(_ a: Action) -> [Action] { [a] }
    static func buildOptional(_ a: [Action]?) -> [Action] { a ?? [] }              // if without else
    static func buildEither(first a: [Action]) -> [Action] { a }                  // if branch
    static func buildEither(second a: [Action]) -> [Action] { a }                 // else branch
    static func buildArray(_ a: [[Action]]) -> [Action] { a.flatMap { $0 } }      // for-in
}
struct ActionSheet { let actions: [Action]; init(@ActionBuilder _ actions: () -> [Action]) { self.actions = actions() } }
```

Minimum viable builder = `buildBlock` + `buildExpression` + `buildOptional` + `buildEither(first/second)`; add `buildArray` only for `for` loops, `buildLimitedAvailability` only for `#available`.

| | Plain `[Action]` parameter | Custom `@resultBuilder` |
|---|---|---|
| Cost | Zero boilerplate | ~30 lines of builder methods |
| Call site | `[Action(...), Action(...)]` | SwiftUI-native block with `if`/`for` |
| Worth it when | Internal / few call sites | A design-system DSL with MANY call sites |

Default to the plain array. A hand-rolled builder for a 3-call-site component is over-engineering.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| 8+ non-defaulted `init` parameters | Unreadable call site, brittle to reorder | Data-only `init`; optional config on modifiers/environment |
| `Bool` flags for variants (`isDestructive:`, `big:`) | Doesn't scale, unreadable at N flags | A semantic enum or `OptionSet` (`role: .destructive`) |
| Storing a `@ViewBuilder` closure and re-invoking it in `body` | Defeats view identity, can re-run side effects | Capture the built value once in `init` |
| A public `.modifier(FooModifier())` call site | Leaks an implementation type, reads awkwardly | Wrap in a named `View` extension |
| `AnyView`-erased style body on a hot list row | Defeats structural diffing at scale | Plain parameterized view or `ViewModifier` instead |
| `.environment(\.cardStyle, value)` at the call site | Bypasses the intended convenience API | Ship and require the setter modifier |
| A custom `@resultBuilder` for a 3-call-site internal component | Boilerplate with no ergonomic win | Plain array parameter |

## Severity guide

CRITICAL: a component that cannot be built correctly without reaching into private/internal types (broken encapsulation). HIGH: a shipped initializer signature reordered or a parameter removed (breaks every call site, non-additive evolution). MEDIUM: boolean-flag variants, or optional config crammed into `init` instead of modifiers/environment. LOW: a missing convenience string/`@ViewBuilder` overload pair. NIT: a custom `@resultBuilder` built for a component with one call site.

## See also

- `references/performance/04-state-architecture.md#viewmodifier-and-preferencekey` -- `ViewModifier`/`PreferenceKey` protocol mechanics and cost gotchas (owner)
- `references/performance/04-state-architecture.md#entry-and-custom-environment-values` -- `@Entry` declaration syntax and the two `@Environment` subscript forms (owner)
- `references/accessibility/05-motion-accessibility.md` -- the Reduce Motion double-gate used inside custom style/modifier bodies (owner)
- `references/design/02-liquid-glass.md#glass-buttons` -- built-in `.glass`/`.glassProminent` button styles to prefer before rolling a custom look
- `references/animation/03-advanced-animators.md#animatable-for-custom-shapes` -- `Animatable` conformance for custom interpolated `ViewModifier` effects
- `references/methodology/02-previews-design-qa.md` -- previewing every state and variant a component API exposes
