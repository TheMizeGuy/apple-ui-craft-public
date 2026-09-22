# Swift Concurrency in UI

> Owner: `references/performance/06-concurrency-ui.md` owns `.task`/`.task(id:)` cancellation semantics, `@MainActor` UI isolation and moving work off it, approachable concurrency (`@concurrent`, `nonisolated(nonsending)`, default actor isolation), structured concurrency inside views (`async let`, `TaskGroup`), `AsyncStream`/`AsyncSequence` as SwiftUI inputs, and the debounced-cancellable-Task idiom. `references/performance/04-state-architecture.md#view-identity-and-taskid-lifecycle` owns identity-driven cancellation as a STATE concept; this file owns the concurrency mechanics underneath it.
> Floors: see `references/_scaffolding/version-floor-registry.md`. `task(id:name:priority:file:line:_:)` and `task(name:priority:file:line:_:)` are both iOS 15.0+ and back-deploy, while the `executorPreference:` overload is iOS 26.4+. The approachable-concurrency defaults cited below are an Xcode project setting (Swift 6.2 onward), not an iOS deployment floor.

Smooth UI means the main actor stays free to render; every state mutation SwiftUI observes must happen there, and every expensive computation must not. `.task` is the seam that ties async work to a view's lifetime, and the approachable-concurrency defaults reshape how much of that seam you have to think about by hand.

## .task and .task(id:)

```swift
// iOS 15.0+ / macOS 12.0+ / tvOS 15.0+ / watchOS 8.0+ / visionOS 1.0+ for BOTH overloads below.
// Verified against the iOS 27 SDK.
nonisolated func task(
    name: String? = nil,
    priority: TaskPriority = .userInitiated,
    file: String = #fileID, line: Int = #line,
    _ action: sending @escaping @isolated(any) () async -> Void
) -> some View

nonisolated func task<T: Equatable>(
    id: T, name: String? = nil, priority: TaskPriority = .userInitiated,
    file: String = #fileID, line: Int = #line,
    _ action: sending @escaping @isolated(any) () async -> Void
) -> some View
```

`.task` starts before the view appears and cancels automatically on disappear or identity change -- no manual `onAppear`/`onDisappear` bookkeeping. `.task(id:)` adds one thing: whenever `id` changes, SwiftUI cancels the in-flight task and starts a fresh one.

```swift
struct UserProfileView: View {
    let userID: User.ID
    @State private var user: User?
    var body: some View {
        Group { if let user { ProfileContent(user: user) } else { ProgressView() } }
            .task(id: userID) {
                user = nil                                    // clear stale data before the await
                user = try? await UserService.shared.fetch(id: userID)
            }
    }
}
```

Default `priority` is `.userInitiated` -- not `.medium`, don't state a made-up default. `id` must conform to `Equatable`, not `Hashable`. The `name`/`file`/`line` params surface the task in Instruments with a readable label; the overload carrying them is documented at iOS 15.0 and ships with `@export(implementation)`, so it back-deploys -- use it freely. Do NOT conflate it with `task(name:executorPreference:priority:file:line:action:)`, the `TaskExecutor` overload, which is the one gated at iOS 26.4 on every platform. Naming tasks pays off concretely from Instruments 27, where task tracks group into named Swift Task Collection tracks and each task gets a Profile detail built from samples taken while it was running.

**A frame-timing nuance, not a documented mechanism:** work in a `.task` closure written before the first `await` can be observed running within the same update pass, on the caller's actor -- state you set there can land without a visible render hop. Treat this as an observable behavior to design around, not as a citable API guarantee about how `.task` is internally implemented; do not attribute it to a specific primitive by name in shipping documentation.

### The cancellation gotcha

Swift task cancellation is COOPERATIVE: SwiftUI calls `cancel()` on the prior task when `id` changes, but the body KEEPS RUNNING until it (a) awaits a cancellable suspension point that throws `CancellationError`, (b) checks `Task.isCancelled`, or (c) returns.

A plain **non-throwing** `await` (`await someTask.value` on a `Task<Void, Never>`, or `await someActor.method()`) does NOT throw on cancellation -- it returns normally and the body marches on. On a rapid A -> B -> C identity transition, the cancelled B body can complete AFTER C started, writing stale state over C's:

```swift
.task(id: account.id) {
    guard account.isSignedIn else { return }
    await app.inFlightPurge?.value          // non-throwing: returns even if cancelled
    guard !Task.isCancelled else { return }  // REQUIRED cooperative check -- the most-missed guard
    await syncData(for: account.id)
}
```

`try await` on Apple's cancellable primitives (`URLSession.data`, `Task.sleep`, `url.lines`) DOES throw `CancellationError`, so a guard there is optional -- but a bare non-throwing `await` never does. Rule: add an explicit `guard !Task.isCancelled else { return }` immediately after every non-throwing `await` where proceeding under a stale assumption is unsafe.

### Cleanup that must survive the cancellation (Swift 6.4)

The other half of the same problem: `.task` cancels on disappear or `id` change, which silently kills the cleanup an author wrote at the END of that task -- flushing an analytics event, committing a draft, releasing a hardware session. Swift 6.4 (Xcode 27) gives that cleanup two language-level tools.

SE-0493 allows `await` inside a `defer` block: "any asynchronous code you write in a `defer` block is awaited and runs to completion before it exits." SE-0504 adds `withTaskCancellationShield`, which temporarily prevents code from observing cancellation status -- inside the shield `Task.isCancelled` reads `false` and cancellation does not propagate into child tasks, `async let`, or task groups:

```swift
// Swift 6.4 language/stdlib feature (SE-0504). No Apple DocC symbol page.
public func withTaskCancellationShield<Value, Failure>(
    _ operation: () throws(Failure) -> Value
) throws(Failure) -> Value

public nonisolated(nonsending) func withTaskCancellationShield<Value, Failure>(
    _ operation: nonisolated(nonsending) () async throws(Failure) -> Value
) async throws(Failure) -> Value
```

```swift
.task(id: draft.id) {
    defer {
        // Runs to completion even though the task is being cancelled.
        await withTaskCancellationShield { await DraftStore.commit(draft) }
    }
    try? await editor.stream(draft)
}
```

Shield only the cleanup, never the work: a shielded fetch is an uncancellable fetch, which is the bug cancellation exists to prevent. Below Swift 6.4, hoist the cleanup into a detached task or an actor that outlives the view and guard it explicitly against `Task.isCancelled`.

## @MainActor isolation and moving work off it

The new-project default since Xcode 26 is **Default Actor Isolation = MainActor** (the "Approachable Concurrency" build setting) -- every type is implicitly `@MainActor` unless you opt out, so single-threaded UI code compiles cleanly under strict concurrency with no annotations. You must be deliberate about opting OUT for background work. This default, `nonisolated(nonsending)` as the safe default for plain `nonisolated async` functions, and synchronous-start task semantics are documented in Swift Evolution SE-0461, SE-0466, and SE-0472 -- cite the proposals, not blog posts, when a review needs the authoritative rule.

**A bare `nonisolated async` does not get you off the main actor -- Apple says so in its own release notes.** From the iOS 27 notes: "With approachable-concurrency defaults that infer `MainActor` isolation, an unannotated `nonisolated` async method runs on the main actor, defeating the intent of off-main reading and writing. Conforming types that previously used `nonisolated` should switch to `@concurrent` to match." Apple applied that to its own SDK -- `DocumentReader.read(from:progress:)` and `DocumentWriter.write(content:to:previous:progress:)` are declared `@concurrent`, not `nonisolated`. So `nonisolated func decode() async` written as a "get off main" device is a defect with a first-party citation, not a style preference, and `@concurrent` is the only correct annotation for CPU-heavy UI-adjacent work. State which Default Actor Isolation setting the project uses before making the finding: with it set to `nonisolated` (the pre-Swift-6.2 model) the old inference applies.

Instruments 27's **Swift Executors** instrument is the tool that settles the argument on a device: the Main Actor track shows whether a supposedly-`@concurrent` function is still running there. See `references/performance/03-launch-memory-instruments.md#instruments-which-tool-answers-which-question`.

```swift
@MainActor @Observable
final class ProfileViewModel {
    var user: User?
    func load() async {
        // the await may hop off the main actor internally; we resume back on it
        user = try? await userService.fetchProfile()   // safe main-actor write
    }
}
```

`@MainActor` on an `async` method does NOT monopolize the main thread for the whole call -- each `await` is a suspension point where the thread is released; you resume on the main actor afterward.

**`@concurrent` (Swift 6.2)** marks an `async` function to run on the cooperative thread pool, off the caller's actor -- reach for it for CPU-heavy work (JSON decode, image resize, parsing) so it never blocks the UI:

```swift
@MainActor @Observable final class FeedModel {
    var items: [Item] = []
    func reload(_ data: Data) async { items = await Self.decode(data) }

    @concurrent
    static func decode(_ data: Data) async -> [Item] { try! JSONDecoder().decode([Item].self, from: data) }
}
```

`@concurrent` is mutually exclusive with `@MainActor`, custom global actors, and `nonisolated(nonsending)`, and only applies to `async` functions. Under the same approachable-concurrency model, a plain `nonisolated async` function is `nonisolated(nonsending)` by default -- it runs in the CALLER's execution context with no forced hop to the global executor; reach for `@concurrent` only when you explicitly want the work to leave the caller's actor. `Task.detached` runs with NO inherited actor context or priority -- prefer `@concurrent` or a dedicated `actor`; legitimate uses are narrow fire-and-forget work that must not inherit `@MainActor` (a background cache-feeding downsample).

```swift
actor ImageCache {
    private var store: [URL: UIImage] = [:]
    func image(for url: URL) -> UIImage? { store[url] }
    func insert(_ img: UIImage, for url: URL) { store[url] = img }
}
```

An `actor` is the tool for shared mutable state that must live OFF the main actor.

| Symptom | Cause | Fix |
|---|---|---|
| Beachball on load | Sync decode/parse in body or before the first `.task` `await` | `@concurrent` static func |
| Hang while scrolling | Image decode on main | `Task.detached` downsample + cache (see `references/performance/02-scroll-list-performance.md`) |
| UI freeze on save | Synchronous disk/DB write on `@MainActor` | Move to an `actor` or `@concurrent` |
| Legacy "publishing from background thread" warning | Mutating an `@MainActor` model off-actor | `await MainActor.run { ... }` or make the caller `@MainActor` |

## Structured concurrency inside views

A screen needing several independent fetches uses `async let` so total latency is the SLOWEST call, not the sum:

```swift
@MainActor @Observable final class DashboardModel {
    var profile: Profile?; var feed: [Post] = []; var notifications: [Notice] = []
    func load(userID: User.ID) async {
        async let p = api.profile(userID)          // all three start immediately
        async let f = api.feed(userID)
        async let n = api.notifications(userID)
        (profile, feed, notifications) = try! await (p, f, n)   // resumes on the main actor
    }
}
```

`withTaskGroup` is for a DYNAMIC set of parallel operations -- but its child-task closures are `@Sendable` and run OFF the calling actor, so they cannot touch a `@MainActor` non-`Sendable` store directly. This does not compile under Swift 6:

```swift
// WRONG -- self is @MainActor @Observable (non-Sendable), captured into a Sendable group closure.
await withTaskGroup(of: Void.self) { group in
    for id in ids { group.addTask { await self.refresh(id) } }
}
```

The fix is an array of independently-isolated `Task` handles, each inheriting `@MainActor`:

```swift
func refreshAll(_ ids: [Item.ID]) async {
    let tasks = ids.map { id in Task { @MainActor in await self.refresh(id) } }
    for t in tasks { await t.value }
}
```

If you genuinely need `TaskGroup` semantics over `@MainActor` work, wrap the same `Task { @MainActor in }` handles inside `withTaskGroup` -- same idea, more verbose. The real fix for CPU work is moving the PURE computation into a `@concurrent`/`nonisolated` function (which IS `Sendable`-safe) and keeping only the assignment on `@MainActor`.

## AsyncStream and AsyncSequence as SwiftUI inputs

Any callback-, delegate-, or `NotificationCenter`-based source (location updates, Bluetooth, a `CLLocationManagerDelegate`) becomes a first-class SwiftUI input by wrapping it in `AsyncStream` and driving it from a `.task` loop -- the view stays declarative and the loop's teardown handles cleanup:

```swift
func locationUpdates() -> AsyncStream<CLLocation> {
    AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
        let delegate = LocationDelegate { continuation.yield($0) }
        locationManager.delegate = delegate
        locationManager.startUpdatingLocation()
        continuation.onTermination = { _ in locationManager.stopUpdatingLocation() }   // fires on cancel OR finish
    }
}

// consume in .task -- the loop ends when the view disappears (cancellation propagates)
.task {
    for await loc in locationUpdates() { location = loc }   // main-actor write, drives re-render
}
```

Because `.task` cancels on disappear and cancellation propagates into the `for await` loop, the stream's `onTermination` fires and the underlying manager stops -- no leak, no manual teardown. Pick the buffering policy deliberately: `.unbounded` (default) risks unbounded memory on a hot source; `.bufferingNewest(1)` is correct for most UI (only the latest value matters -- location, scrubber position, live sensor readouts); `.bufferingOldest(n)` for an event log where early events matter more. Many Apple APIs already vend `AsyncSequence` with no wrapper needed: `for await note in NotificationCenter.default.notifications(named:)`, `for try await line in url.lines`.

## Debounced async work with a cancellable Task handle

Search-as-you-type, live validation, and autosave all need "run this N ms after the last input, cancelling any in-flight call." Under `@Observable` (no Combine, no `@Published`), the idiom is a stored, cancellable `Task` handle:

```swift
@MainActor @Observable
final class SearchViewModel {
    var query = ""
    private(set) var results: [SearchResult] = []
    @ObservationIgnored private var searchTask: Task<Void, Never>?   // not view state -- excluded from tracking

    func queryChanged(_ newValue: String) {
        query = newValue
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }               // fast typist keeps cancelling
            do {
                let hits = try await searchService.search(newValue)
                guard !Task.isCancelled else { return }            // guard AFTER the network hop too
                results = hits
            } catch is CancellationError { } catch { }
        }
    }
}
```

Three things make this correct: `@ObservationIgnored` on the Task handle (the cancellation token isn't view state; every write to it would otherwise invalidate the view for no visual reason); TWO `Task.isCancelled` checks, one after the sleep and one after the network `await` (the network call may resolve after the user typed again); `[weak self]` if the sleeping task can outlive the view/session that owns it. Alternatively, `.task(id: query) { ... }` hosts the same debounce view-locally with automatic cancel-on-id-change, trading testability for less code.

## The async-loading state machine

The reusable shape for "screen that loads data" is a four-case enum driven by `.task`, with `.refreshable` reusing the same load function and an explicit retry path:

```swift
enum Loadable<Value> { case idle, loading, loaded(Value), failed(Error) }

@MainActor @Observable
final class FeedModel {
    private(set) var state: Loadable<[Post]> = .idle
    func load() async {
        if case .loaded = state {} else { state = .loading }   // don't flash a spinner over good content on refresh
        do {
            let posts = try await api.feed()
            guard !Task.isCancelled else { return }
            withAnimation(.smooth(duration: 0.3)) { state = .loaded(posts) }
        } catch is CancellationError { return } catch { state = .failed(error) }
    }
}
```

```swift
.task { await model.load() }            // cold load; auto-cancels on disappear
.refreshable { await model.load() }      // system owns the spinner; reuses the same load() so the two never drift
```

Never build a custom pull-to-refresh -- `.refreshable` suspends the system control until the async closure returns, and matches the rubber-band feel and haptics you cannot replicate by hand. `ContentUnavailableView` (iOS 17+) is the native empty/error surface for the `.failed`/empty-`.loaded` branches.

## Animating async-loaded content in

Wrap the post-`await` assignment so the appearing content animates, and pass `AsyncImage` a `transaction:` so its phase change animates too -- without it, a loaded image hard-cuts over its placeholder:

```swift
AsyncImage(url: url, transaction: Transaction(animation: .smooth(duration: 0.4))) { phase in
    switch phase {
    case .success(let image): image.resizable().transition(.opacity)
    case .failure: Image(systemName: "photo").foregroundStyle(.tertiary)
    case .empty: Rectangle().fill(.quaternary)
    @unknown default: EmptyView()
    }
}
.frame(width: 120, height: 120)
```

Pair `withAnimation` (or scoped `.animation(_, value:)`) around the state write with a `.transition` on the conditional branch, and key it on the loaded value's identity so the transition actually fires: `.animation(.smooth(duration: 0.35), value: model.article?.id)`. `AsyncImage` has no HTTP cache before iOS 27 -- every appearance re-downloads unless you own a caching pipeline yourself. From iOS 27 it caches per the server's HTTP headers, and `asyncImageURLSession(_:)` injects one `URLSession` (your `URLCache`, cache policy, auth headers) for every `AsyncImage` in a subtree; `references/performance/02-scroll-list-performance.md#asyncimage-caching-and-session-control----ios-27` owns that pipeline. The decode side is unchanged on every version: `AsyncImage` decodes at source resolution and never downsamples, so caching never makes it the right default for a scrolling cell.

Every animated commit above -- the `Loadable` state's `withAnimation`, the `AsyncImage` `Transaction`, and `.animation(_, value:)` -- must respect Reduce Motion. Route them through one shared accessor rather than gating each call site independently:

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion
func settle(_ base: Animation) -> Animation? { reduceMotion ? nil : base }   // Animation has no .identity; nil is the sentinel
// withAnimation(settle(.smooth(duration: 0.3))) { state = .loaded(posts) }
// AsyncImage(url: url, transaction: Transaction(animation: settle(.smooth(duration: 0.4)))) { ... }
```

`references/accessibility/05-motion-accessibility.md` owns the full Reduce Motion double-gate contract (`withAnimation` AND `.animation(_:value:)` share one accessor) -- this file's job is to apply it to the async-load seam, not restate it.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `withTaskGroup` closures touching a `@MainActor @Observable` store | Won't compile -- non-Sendable capture into a Sendable closure | Array of `Task { @MainActor in ... }` handles |
| `onChange(of: id) { Task { load() } }` | No cancellation; a stale slow response can overwrite fresh state | `.task(id: id) { await load() }` |
| Passing an `@Observable` model into `Task.detached` | Won't compile (non-Sendable) | Extract `Sendable` data first, or a `@concurrent` static func |
| Missing `Task.isCancelled` guard after a non-throwing `await` | Cancelled work keeps running and writes stale state | Explicit guard immediately after |
| Custom pull-to-refresh control | Can't match system rubber-band/haptics | `.refreshable { await load() }` |
| Debounce token stored without `@ObservationIgnored` | Every cancel/reassign invalidates the view | `@ObservationIgnored private var searchTask: Task<Void, Never>?` |
| Assuming `AsyncImage` caches across appearances pre-iOS 27 | Re-downloads every time | Own a caching pipeline, or gate the assumption behind `#available(iOS 27, *)` |
| `nonisolated func work() async` used to move work off the main actor | Under MainActor-by-default it runs in the caller's context -- the main actor | `@concurrent` |
| Cleanup written at the end of a `.task` body | Cancellation kills it before it runs | `defer { await ... }` (SE-0493), wrapped in `withTaskCancellationShield` when it must not observe the cancellation |
| `withTaskCancellationShield` around the actual work | An uncancellable fetch -- the bug cancellation exists to prevent | Shield only the cleanup |

## See also

- `references/performance/04-state-architecture.md#view-identity-and-taskid-lifecycle` -- identity-driven cancellation as a state-ownership concept
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate contract this file's async-load animations follow
- `references/performance/01-swiftui-rendering.md` -- image handling and decode-off-main for lists
- `references/performance/02-scroll-list-performance.md` -- off-main image decode/downsample during scroll
- `references/design/07-navigation-patterns.md#empty-states-ios-17` -- `ContentUnavailableView` styling for `.failed`/empty branches
