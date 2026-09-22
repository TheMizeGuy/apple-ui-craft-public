# State Architecture

> Owner: `references/performance/04-state-architecture.md` owns property-wrapper ownership rules (`@State`/`@Binding`/`@Bindable`/`@Environment`), `@Observable` runtime semantics (tracking granularity, `@ObservationIgnored`, derived state), `@Entry`/custom `EnvironmentValues`, view identity and `.task(id:)` lifecycle, `ViewModifier`/`PreferenceKey`, and the diagnostic link between mis-modeled state and the animation/layout bugs other files chase. `references/performance/01-swiftui-rendering.md` owns the re-render COST case for `@Observable` over `ObservableObject` (body-evaluation, `Equatable` views) -- this file owns which wrapper to reach for and why a given scope produces a given bug; the two are complementary, not duplicative.
> Floors: see `references/_scaffolding/version-floor-registry.md`. Headline floors: `@Observable` iOS 17+, `@Entry` iOS 18+ (Xcode 16 to compile; back-deploys to iOS 13). `@State` is a Swift macro when you build with Xcode 27 and the `State` property wrapper when you build with Xcode 26 or earlier -- a TOOLCHAIN gate, not a deployment floor; Apple states the new behavior back-deploys to iOS 17 aligned OSes.

Most bugs a reviewer files as "animation" or "layout" are state bugs wearing a visual costume: a transition that snaps instead of morphs, a badge that shows a stale count, a toggle that silently stops writing back. The fix in every one of these cases lives in *how state is owned, scoped, derived, and identified* -- not in the modifier the symptom appears on. This file is the decision layer underneath every other reference: read it before reaching for a spring curve or a transition to fix something that "just doesn't animate right."

## The decision table

| Scenario | Wrapper | Notes |
|---|---|---|
| View owns a value type (`Int`, `String`, struct) | `@State` | Always `private` |
| View owns an `@Observable` reference type | `@State private var model = Model()` | Replaces `@StateObject`. SwiftUI holds the storage, so the instance survives re-renders. Built with Xcode 27, `Model()` is evaluated once for the view's lifetime |
| Read-only reference passed from a parent | Plain `let`/`var`, no wrapper | Observation auto-tracks which properties `body` reads -- no wrapper needed to read |
| Two-way binding to a **value type** owned elsewhere | `@Binding` | Never for reference types -- a `@Binding` to a class property is a code smell |
| Two-way binding to one **property** of an `@Observable` object (`$object.property`) | `@Bindable` | Declared at the point of use, not required at the call site |
| Shared object via environment | `@Environment(MyType.self)` | Replaces `@EnvironmentObject`. A missing `.environment()` injection is a **crash with a clear message**, not a silent `nil` -- never make it Optional to paper over a missing wire |
| System or custom environment VALUES (color scheme, `\.dismiss`, your `@Entry` keys) | `@Environment(\.keyPath)` | Unrelated mechanism to the type-based form above, same property-wrapper name |

`@StateObject`/`@ObservedObject`/`@EnvironmentObject`/`@Published` are legacy on any iOS 17+ floor. The only reasons to reach for them: a screen must still support iOS 16, or the code wraps a Combine-publishing model from a package you don't own.

## @Observable runtime semantics

`@Observable` rewrites each stored property to route through a synthesized `ObservationRegistrar`. During `body`, every observable property the body READS is registered as a dependency; when one of those properties is WRITTEN, only views that read it re-evaluate. There is no `@Published`, no `objectWillChange`, no per-property annotation -- reads define the dependency graph, writes trigger it.

```swift
@Observable
final class FeedModel {
    var posts: [Post] = []
    @ObservationIgnored private var cache: [Post.ID: RenderedPost] = [:]
    @ObservationIgnored private let api: FeedAPI
    init(api: FeedAPI) { self.api = api }

    var unreadCount: Int { posts.filter(\.isUnread).count }   // computed -> auto-tracked, never desyncs
}
```

- **`@ObservationIgnored`** opts a stored property OUT of tracking: caches, injected service handles, cancellation tokens, anything whose mutation should never invalidate a view. Without it, mutating an internal cache registers as a change and can invalidate views that never display it -- a silent over-invalidation bug.
- **Derived state is a computed property, never a stored mirror.** Observation tracks computed properties automatically -- reading one registers dependencies on whatever stored properties it touches. Storing `unreadCount` and syncing it via `onChange`/`didSet` creates a second source of truth that desyncs; this is the origin of "the badge says N but the list shows N-1" bugs. Cache only after profiling proves the derivation is hot.
- **Collections of struct elements are the preferred shape.** An `@Observable` class holding `var items: [Item]` where `Item` is a struct: mutating, appending, or mutating `items[i].name` all trigger observation, because the array is the tracked stored property and struct mutation writes back through it. If `Item` must be a class, make it `@Observable` too, or mutating `item.name` won't invalidate views reading the array.
- **Nested `@Observable` objects compose.** A view reading `model.child.value` re-evaluates when `child.value` changes -- every hop in the read path just needs to be `@Observable`. A plain non-Observable class in the middle breaks the chain.
- `@Observable` does not persist itself. Mutating one updates the UI and writes nothing to disk; add an explicit `.onChange` -> encode step for anything that must survive relaunch.

For why per-property tracking is faster than `ObservableObject`'s whole-object invalidation, see `references/performance/01-swiftui-rendering.md#observable-vs-observedobject`.

### Bridging @Observable into a non-SwiftUI surface

A SwiftUI view never calls the observation API by hand -- SwiftUI arms and re-arms it for you. The hand-rolled case is a bridge: a UIKit view controller, a Metal renderer, a `CADisplayLink`-driven surface that has to re-render when one property of an `@Observable` model changes. On iOS 17 that meant `withObservationTracking(_:onChange:)` and the re-arm dance -- calling it again from inside its own `onChange` to keep observing, one notification at a time, with a window between them where changes are missed.

iOS 27 / Swift 6.4 (SE-0506) removes the dance:

```swift
// Returns a ~Copyable Token. Options: .willSet, .didSet, .deinit.
func withContinuousObservation(
    options: ObservationTracking.Options,
    apply: @escaping @isolated(any) @Sendable (borrowing ObservationTracking.Event) -> Void
) -> ObservationTracking.Token
```

```swift
@MainActor
final class WaveformRenderer {
    private let model: AudioModel
    // ~Copyable; held for the surface's lifetime. Releasing the renderer drops the token,
    // which unregisters the observation -- no deinit, no re-arming after each change.
    private let token: ObservationTracking.Token

    init(model: AudioModel) {
        self.model = model
        token = withContinuousObservation(options: [.didSet]) { [weak self, model] event in
            _ = model.level                  // this read is what establishes the tracked set
            // Event.matches(_:) takes a PartialKeyPath -- filter to the one property you draw.
            guard event.matches(\AudioModel.level) else { return }
            Task { @MainActor in self?.setNeedsRedraw() }
        }
    }
}
```

The `apply` closure tracks exactly the properties it reads -- a closure that only inspects the `Event` observes nothing -- and `cancel()` is `consuming`, so it can only be called on a token you own outright (a local), never from a class `deinit`. `Event.kind` distinguishes `.initial` / `.willSet` / `.didSet` / `.deinit`, and `matches(_:)` is the non-SwiftUI equivalent of field-granular invalidation -- without it, a bridge redraws on every property of the model. The shipped name is `withContinuousObservation`, not the proposal's `withContinuousObservationTracking`. Below iOS 27, keep `withObservationTracking(_:onChange:)` (iOS 17+) with the re-arm, or `Observations` (iOS 26+) for an async sequence of transactional changes.

## @State ownership and the initialization trap

`@State`'s initial value is used ONCE, when the view first acquires identity -- it is NOT re-applied when a parent passes a new value on a later render:

```swift
// WRONG -- displayed never updates when the parent's count changes
struct Badge: View {
    let count: Int
    @State private var displayed: Int
    init(count: Int) {
        self.count = count
        self._displayed = State(initialValue: count)   // runs once; stale forever after
    }
    var body: some View { Text("\(displayed)") }
}
```

Rule: never seed `@State` from a value that can change upstream and expect it to track. Read the parameter directly. If you genuinely need local editable state seeded from a parameter, reset it deliberately -- `.id(count)` to rebuild the view, or `.onChange(of: count) { _, new in displayed = new }`. Apple's own guidance is blunter: declare state `private` precisely to prevent setting it in an initializer, "which can conflict with the storage management that SwiftUI provides."

## @State is a macro when you build with Xcode 27

Build with Xcode 27 and the `@State` attribute resolves to a Swift macro rather than the `State<Value>` property-wrapper struct. Apple, on the macro: "A `State()` property instantiates its default value the first time SwiftUI instantiates the view." Under the property wrapper, `@State private var model = Model()` evaluated `Model()` every time the view struct re-instantiated -- many times over a view's lifetime -- and the initializer's cost was paid and thrown away on each one.

That retires the most-repeated SwiftUI performance finding there is. `@State private var model = SomeObservableClass()` is no longer an allocation bug to flag; on an Xcode 27 build it is the **recommended** shape for a view-owned `@Observable` view model, and the `@StateObject`-or-inject-it workaround exists only to serve Xcode 26 and earlier toolchains. Nothing needs gating: this is a toolchain behavior, not an `#available` one, and Apple states it back-deploys to iOS 17 aligned OSes.

What replaces that finding is a short list of source breaks Apple documents, all of which are genuine review material on an Xcode 27 migration:

| Break | Fix |
|---|---|
| A `@State` property with a declaration-site initial value that is ALSO assigned in `init` no longer compiles | Declare the type with no initial value and assign only in `init` -- or drop the `init` assignment |
| The macro suppresses the compiler-synthesized private memberwise `init` when every stored member is private | Extensions that called it must assign members explicitly |
| Generic-argument inference is less flexible than the wrapper's | Write the property's type explicitly |
| Composing `@State` with another property wrapper or macro is unsupported | Restructure so `@State` is the only attribute on the declaration |

The initialization trap above is unchanged by any of this: a `@State` seeded from an upstream parameter is still set once and stale forever after. The macro changes how often the default EXPRESSION runs, not when the stored value is adopted.

## @Binding vs @Bindable

Both produce `$`-prefixed syntax; they operate on different ownership models.

```swift
// @Binding -- borrowed VALUE-type storage owned elsewhere
struct ToggleRow: View {
    @Binding var isOn: Bool
    var body: some View { Toggle("On", isOn: $isOn) }
}

// @Bindable -- unlocks $-syntax on a PROPERTY of an @Observable reference type
struct ProfileEditor: View {
    @Bindable var model: ProfileModel        // model passed plainly at the call site
    var body: some View { TextField("Name", text: $model.displayName) }
}
```

Decision rule: struct/enum/primitive -> `@Binding`. One property of an already-`@Observable` class -> `@Bindable` on the parameter, then `$model.property`. Never `@Binding<MyObservableClass>` -- it compiles (`Binding` is generic over anything) but reintroduces whole-object invalidation on the enclosing view because the wrapping `Binding`'s getter re-runs on ANY property change, and it implies write access the caller must grant, which is meaningless for a reference type any holder can already mutate. Flag it MEDIUM in review; the fix is `@Bindable` or a plain `let`.

For `@Environment`-sourced objects, `@Bindable` needs a local shadow -- `@Environment` alone gives no `$`:

```swift
@Environment(AppSettings.self) private var settings
var body: some View {
    @Bindable var settings = settings
    Toggle("Haptics", isOn: $settings.enableHaptics)
}
```

Custom bindings via `Binding(get:set:)` adapt, clamp, or bridge a value before a control writes it:

```swift
TextField("Name", text: Binding(
    get: { model.name ?? "" },
    set: { model.name = $0.isEmpty ? nil : $0 }
))
```

`.constant(value)` gives a non-mutating binding for previews; `$items[id:]` (iOS 17+) or `ForEach($items) { $item in ... }` binds a single array element. Avoid heavy work inside a binding's `set` -- it runs on every keystroke/drag tick; defer real side effects to `.onChange`/`.task(id:)`.

## @Entry and custom environment values

```swift
// iOS 18+. One line per value -- replaces the hand-rolled EnvironmentKey + subscript pair.
extension EnvironmentValues {
    @Entry var cardStyle: CardStyle = .elevated
    @Entry var analytics: AnalyticsClient = .live
}
```

`@Entry` also covers `Transaction`, `ContainerValues`, and `FocusedValues` extensions with the same syntax. A hand-rolled `EnvironmentKey` struct in a codebase built with Xcode 16+ is a LOW/MEDIUM cleanup, not a defect.

**Keep `@Entry` defaults inert.** Against the iOS 27 SDK the macro warns when a default value is a class instance or a closure, and the warning is pointing at a real defect on both counts: a shared reference-type default invalidates every reader of the key when the instance changes, and a closure default captures state the author did not intend to share. The `analytics: AnalyticsClient = .live` line above is fine only because `AnalyticsClient` is a struct of function values that the app never mutates -- if it were a class, the live object belongs in a `@State`-owned `@Observable` injected with `.environment(instance)` and read with `@Environment(AnalyticsClient.self)`, not smuggled in as an environment default. Below iOS 27 there is no warning; apply the rule by hand.

| Form | Reads | Injected with |
|---|---|---|
| `@Environment(\.keyPath)` | A value in `EnvironmentValues` (system or your `@Entry`) | `.environment(\.keyPath, value)` |
| `@Environment(SomeType.self)` | An `@Observable` reference object | `.environment(instance)` -- no key path |

Mixing these up produces a confusing compiler error or, worse, code that compiles but silently reads a default because the injection form didn't match the declaration form.

**Injection is a runtime contract -- fail loud.** `@Environment(ModelData.self)` with no matching `.environment(model)` ancestor is a crash with a clear diagnostic, by design. Never make the type Optional to convert that loud, immediate failure into a silent nil-driven empty screen; inject at the highest common ancestor instead.

**When to reach for environment injection vs a parameter vs the store:** a parameter for anything one or two views use directly; `@Entry` for cross-cutting config read at varying depths (theme, a formatter, a preview/test flag) where threading it through every intermediate initializer is noise; `@Environment(Type.self)` for shared mutable app/session state. Screen-local ephemeral state (a search string, a sheet's `isPresented`) belongs in plain `@State` on the owning view -- putting it in the environment or a global store makes re-renders un-auditable. Rough rule of thumb: more than ~3 levels of pure pass-through justifies environment injection.

## View identity and .task(id:) lifecycle

SwiftUI keys `@State` and in-flight animations to the view's IDENTITY -- structural (position in the result-builder tree) or explicit (`.id(value)`, a `ForEach` `id`). Preserved identity across an update keeps `@State` and running animations alive; changed identity destroys the old view (`@State` resets, `.task`/`.onDisappear` fire) and builds a fresh one.

```swift
// The #1 identity anti-pattern -- both destroy-and-recreate every update:
ForEach(items, id: \.self) { ... }          // wrong unless items are stable & Hashable
ForEach(items) { ... }.id(UUID())           // fresh id every body -> everything rebuilt every frame
```

An unstable identity means SwiftUI cannot match old views to new: it drops `@State`, kills in-flight transitions (they snap instead of animate), and restarts any `.task`. Always key to a stable `Identifiable.id`. `.id(value)` deliberately forces teardown+rebuild -- the supported tool for hard-resetting a subtree's local state when a reused view (a detail editor for different records, a wizard step) must not leak state between contents:

```swift
EntityEditor(entity: entity).id(entity.id)   // new entity.id -> fresh editor, cleared @State
```

`.task(id:)` ties async work to BOTH the view's lifetime and a value:

```swift
// iOS 15.0+ for the whole overload -- `id:`, `name:`, `file:` and `line:` all back-deploy. The iOS 26.4 gate is on
// the separate executorPreference: overload (`references/performance/06-concurrency-ui.md` owns the .task floors).
nonisolated func task<T: Equatable>(
    id: T, name: String? = nil, priority: TaskPriority = .userInitiated,
    file: String = #fileID, line: Int = #line,
    _ action: sending @escaping @isolated(any) () async -> Void
) -> some View

struct UserDetailView: View {
    let userID: User.ID
    @State private var profile: Profile?
    var body: some View {
        Group { if let profile { ProfileCard(profile: profile) } else { ProgressView() } }
            .task(id: userID) {
                profile = nil                               // clear stale data before the await
                profile = try? await ProfileAPI.fetch(userID)
            }
    }
}
```

Whenever `id` changes (compared via `Equatable`), SwiftUI cancels the in-flight task and starts fresh -- this replaces the buggy `onChange(of: userID) { Task { ... } }` hand-roll, which does NOT cancel the previous request, so a fast A->B->C tap-through can let A's slow response land last and overwrite C's. Reserve `.task(id:)` for work whose result only the CURRENT id should be allowed to write back; if the async work is fire-and-forget and fine to let finish alongside a new one, a detached `Task` from `.onChange` is more honest about intent.

`onChange(of:)` (iOS 17+, two-value closure) is for side effects reacting to a change, not for deriving displayed state:

```swift
.onChange(of: query) { oldValue, newValue in runSearch(newValue) }
```

| Need | Use |
|---|---|
| Async load, auto-cancel on disappear/identity change | `.task` / `.task(id:)` |
| Re-load when a value changes | `.task(id:)` |
| Synchronous one-shot setup at appear | `.onAppear` |
| Side effect reacting to a value change | `.onChange(of:)` |
| Cleanup that MUST run on disappear | `.onDisappear` (not guaranteed on app termination) |

`.onAppear` fires every time a view re-appears (navigating back); don't treat it as "load once ever." See `references/performance/06-concurrency-ui.md#task-and-taskid` for the full `.task` cancellation semantics.

**Inside a lazy stack, neither `@State` nor `.onAppear` means what it does elsewhere.** A `LazyVStack`/`LazyHStack` prefetches by running `body` evaluation and layout BEFORE a subview appears, so `.onAppear`-based setup happens late and is thrown away when the prefetched view is discarded without ever appearing -- a row's per-render setup belongs in its initializer. And `@State` on a scrolled-off row is eventually DISCARDED: anything that must survive a scroll-out (an expanded/collapsed flag, an in-progress edit, a selection) belongs in the model or in a binding owned by the parent, not in row-local `@State`. `List` recycles rather than merely discarding, so the same rule applies there for a different reason. See `references/performance/02-scroll-list-performance.md#lazy-stacks-vs-list` for the container-level consequences.

## ViewModifier and PreferenceKey

`ViewModifier` is the correct unit when a repeated behavior needs its own state or lifecycle -- a plain `extension View` helper cannot hold `@State`:

```swift
struct CardChrome: ViewModifier {
    @State private var pressed = false
    func body(content: Content) -> some View {
        content
            .background(.regularMaterial, in: .rect(cornerRadius: 16))
            .scaleEffect(pressed ? 0.97 : 1)
    }
}
extension View { func cardChrome() -> some View { modifier(CardChrome()) } }
```

Always expose it through an `extension View` method so call sites read fluently. A `ViewModifier` conforming to `Animatable` (via `animatableData`) is the bridge to custom animatable effects.

State flows down through parameters and environment; `PreferenceKey` is the ONLY first-class channel for a child to report a value UP to an ancestor -- a measured size, a scroll offset, an anchor for an overlay:

```swift
private struct WidthKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}
Text(label).background(GeometryReader { proxy in
    Color.clear.preference(key: WidthKey.self, value: proxy.size.width)
})
.onPreferenceChange(WidthKey.self) { columnWidth = $0 }
```

`reduce` combines multiple children's values in tree order; `onPreferenceChange` fires only when the (`Equatable`) value actually changes. Do NOT reach for `PreferenceKey` to move ordinary app-model data up the tree -- that's a scope error, the state should have been owned higher. And do not use it to publish per-row geometry from a 10k-row list; that is a layout-thrash source -- prefer the dedicated iOS 17+ scroll-position APIs for scroll-offset UI.

## Scope: the failure mode that costs the most

The most expensive state bugs are not "wrong wrapper" -- they are the right wrapper at the wrong SCOPE. A shipped example: a `NavigationRouter` declared `@State private var router = NavigationRouter()` on the `@main App` struct, injected via `.environment(router)` into `WindowGroup`. On iPad Split View / Stage Manager, two tiles of the same scene shared the ONE router instance -- flipping a tab in window A visibly flipped window B's selected tab.

**Rule:** anything that should be independent per-window (`NavigationRouter`, per-tab `NavigationPath`, `@SceneStorage`-driven UI state, per-scene sheet presentation, `onOpenURL` handler closures) must be `@State` INSIDE the `WindowGroup`'s content view, never on the `App` struct. Only genuine app-wide singletons (auth session, a shared cache, `@UIApplicationDelegateAdaptor`) belong at the `App` level. Before approving any `@State` on an `App`/`Scene` conformer: "if the user opens a second window of this scene, should this be shared or duplicated?" If duplicated, it's scoped wrong today. Navigation-path persistence and deep-link restoration mechanics live in `references/design/07-navigation-patterns.md#deep-linking` -- this file owns the scope rule, that file owns the routing/restoration contract.

## Diagnosing visual bugs as state bugs

When another finding reads "flickers," "restarts its animation," or "snaps instead of morphing," trace the animated value back to its source before touching the animation modifier:

| Visible symptom | Underlying state defect |
|---|---|
| A transition "pops" instead of animating, or `matchedGeometryEffect` snaps | Unstable identity (`ForEach id: \.self`, `.id(UUID())` in body) -- SwiftUI destroyed and recreated instead of animating a continuing element |
| A view animates on unrelated changes elsewhere in the object | Over-broad observation -- the view reads the whole `@Observable` object instead of the one property driving its own content; decompose and read narrowly (`references/performance/01-swiftui-rendering.md#view-decomposition`) |
| An animation triggered in one window visibly plays in another | Scope-mismatched shared state (see above) |
| A value "double-settles" over two frames, or an `.animation(value:)` fires when nothing user-visible changed | The driving value is recomputed inline in `body` instead of cached in `@State`, producing spurious `Equatable` inequality between renders |
| A loading spinner flashes on every update, not just real loads | `.task(id:)` restarting because its `id` is derived from unstable state |

Before proposing a spring/timing fix for any of these: is the driving value's identity stable, is the observing view scoped to only what it needs, is the state owner scoped to the right lifetime, is the value precomputed rather than derived fresh in `body`. Only after ruling out all four is the defect actually in the animation layer.

## Testing @Observable mutation paths

`@Observable` erases the distinction `ObservableObject`/`@Published` used to make visible: every stored property triggers observation identically, whether mutated by a convenience method, a SwiftUI `Binding` write (`NavigationStack(path: $router.path)`), or a direct assignment from a deep-link handler. If cross-cutting behavior (persistence, logging, cascading updates) is added inside ONE method and assumed to cover "the property changing," it silently misses the other two paths. Test the SAME SHAPE a binding write uses -- direct property assignment, not a helper method:

```swift
func testSearchPathMutationIsObserved() {
    let router = NavigationRouter()
    var observedChange = false
    withObservationTracking { _ = router.searchPath } onChange: { observedChange = true }
    router.searchPath = NavigationPath([SomeDestination.results])   // direct assignment
    XCTAssertTrue(observedChange)
}
```

Any property SwiftUI binds to directly needs its side-effect logic in `didSet` on the stored property itself, or a test against direct assignment -- never assumed-covered because one call path exercises it.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `@State var displayed: Int` seeded from a parameter in `init` | Set once; never tracks upstream changes | Read the parameter directly, or reset via `.id()`/`.onChange` |
| `@Binding var model: SomeObservableClass` | Whole-object invalidation on every property change; meaningless write-gate for a reference type | `@Bindable var model: SomeObservableClass`, or a plain `let` if read-only |
| Storing a derived value and syncing with `onChange`/`didSet` | Second source of truth desyncs | Computed property on the `@Observable` model |
| `@Environment(ModelData.self) private var model: ModelData?` | Converts a loud crash into a silent empty screen | Non-optional; inject at the highest common ancestor |
| `NavigationRouter` declared `@State` on the `App` struct | Shared across every window/scene | `@State` inside `WindowGroup` content |
| `ForEach(items, id: \.self)` on non-stable elements, or `.id(UUID())` in body | Destroys and recreates every update; kills transitions and `@State` | Stable `Identifiable.id` |
| `onChange(of: id) { Task { load() } }` | No cancellation -- a stale slow response can overwrite a fresh one | `.task(id: id) { ... }` |
| `@Entry var client: SomeClass = .shared` | A reference-type environment default is shared mutable state and over-invalidates every reader; the iOS 27 SDK warns on it | Keep `@Entry` defaults to value types; inject live objects with `.environment(instance)` |
| Row-local `@State` holding something that must survive a scroll-out | A lazy stack discards state on scrolled-off subviews | Own it in the model or a parent binding |
| `.onAppear` doing a row's setup inside a lazy stack | Prefetching evaluates and lays out before appearance, so the setup lands late or is discarded | Do it in the row's initializer |
| Flagging `@State private var model = ExpensiveModel()` as an allocation bug on an Xcode 27 build | The macro evaluates the default once for the view's lifetime -- this is now the recommended shape | Flag it only for Xcode 26 and earlier toolchains |

## See also

- `references/performance/01-swiftui-rendering.md#observable-vs-observedobject` -- re-render cost of `@Observable` vs `ObservableObject`
- `references/performance/06-concurrency-ui.md#task-and-taskid` -- full `.task`/`.task(id:)` cancellation semantics and concurrency isolation
- `references/design/07-navigation-patterns.md#deep-linking` -- `NavigationPath` persistence, restoration, and scene-scoping for routers
- `references/animation/01-animation-fundamentals.md#reduce-motion-critical` -- `.animation(value:)` mechanics this file's Pattern 4 builds on
