# Loading, Empty, and Error States

> Owner: `references/patterns/04-loading-empty-error.md` owns `ContentUnavailableView` (every variant, including `.search`), `.redacted(reason:)` skeletons, the load-state model, and retry/offline UI affordances. `references/design/07-navigation-patterns.md#empty-states-ios-17` and `#pull-to-refresh` carry only a one-line entry point; this file is the full contract. Transport-layer mechanics (exact backoff math, `URLSession` tuning) are touched only as far as they shape what the user sees on screen.
> Floors: `ContentUnavailableView`, incl. `.search`, is iOS 17.0+ -- NOT 18 (`references/_scaffolding/version-floor-registry.md#ios-170`). `.redacted(reason:)` is iOS 14.0+; its `.privacy` case is iOS 15.0+ (`#ios-150-and-earlier`). `.privacySensitive(_:)` is iOS 15.0+.

The single biggest structural mistake in a SwiftUI screen is scattering `isLoading`, `error`, and `items.isEmpty` as independent booleans and rendering the wrong combination -- a spinner AND an empty view, or a full error over content that was still good. Model every screen as ONE enum with associated values so illegal states are unrepresentable, and give each terminal state its own deliberate treatment: loading, empty, error, success.

## The load-state model

```swift
enum LoadState<Value> {
    case idle, loading
    case loaded(Value)
    case failed(Error)
}

@Observable final class FeedModel {
    private(set) var state: LoadState<[Item]> = .idle
    func load() async {
        state = .loading
        do { state = .loaded(try await api.fetchItems()) }
        catch { state = .failed(error) }
    }
}
```

The view switches ONCE; empty is derived from `.loaded([])`, never a parallel bool:

```swift
switch model.state {
case .idle, .loading: FeedSkeleton()
case .loaded(let items) where items.isEmpty:
    ContentUnavailableView { Label("No Items Yet", systemImage: "tray") }
        description: { Text("Items you create appear here.") }
        actions: { Button("Create Item") { showCreate = true }.buttonStyle(.borderedProminent) }
case .loaded(let items):
    List(items) { ItemRow(item: $0) }.refreshable { await model.load() }
case .failed(let error):
    ErrorStateView(error: error) { await model.load() }
}
```

## Loading

| Situation | Use | Why |
|---|---|---|
| You know the shape (list rows, a profile card) | Skeleton (`.redacted`) | Reserves space, zero layout shift on arrival |
| Indeterminate, unknown result shape | `ProgressView()` spinner | No structure to preview |
| Determinate (download, multi-step) | `ProgressView(value:total:)` | Communicates remaining time |
| Refresh over content already on screen | Nothing, or a tiny inline spinner | Content is usable -- don't block it |
| Sub-~200ms expected | Nothing | A flashed spinner reads as jank; delay showing it ~150-200ms |

Build the skeleton from the SAME row view fed placeholder data, not a hand-drawn stand-in -- geometry stays pixel-identical, so nothing shifts when real data lands:

```swift
List(isLoading ? Item.placeholders(count: 8) : items) { item in
    ItemRow(item: item)
}
.redacted(reason: isLoading ? .placeholder : [])
.disabled(isLoading)   // redacted rows must not be tappable
```

`.unredacted()` opts a child back in (a live spinner over redacted rows). `RedactionReasons` is an `OptionSet` you can extend for a DIFFERENT purpose than loading -- privacy. Pair a custom `.privacy` reason with `.privacySensitive(_:)` (iOS 15.0+) to mark specific content for redaction without touching the rest of the view:

```swift
Text(balance, format: .currency(code: "USD"))
    .privacySensitive()                                    // marks this content as sensitive
// elsewhere, applying the reason redacts every .privacySensitive view under it:
ContentView().redacted(reason: shouldHideBalances ? .privacy : [])
```

`.privacySensitive()` composes with the SAME `.redacted(reason:)` call site loading uses -- branch on `@Environment(\.redactionReasons)` if a screen needs to distinguish "loading" from "hidden for privacy" and render a different placeholder glyph for each (dashes for a hidden balance, gray bars for loading). `AsyncImage` (iOS 15+) has its own three-phase loading state -- always use the phase closure (`references/performance/02-scroll-list-performance.md#asyncimage-with-phase-handling`), never the two-argument form:

```swift
AsyncImage(url: url) { phase in
    switch phase {
    case .empty: ProgressView()
    case .success(let image): image.resizable().scaledToFill()
    case .failure: Image(systemName: "photo").foregroundStyle(.secondary)
    @unknown default: Color.clear
    }
}
```

## Empty

Three causes need three treatments -- collapsing all of them into one generic "Nothing here" is the most common empty-state mistake:

```swift
if selectedWorkspace == nil {
    ContentUnavailableView("Select a Workspace", systemImage: "folder")     // 1. no scope selected -- check FIRST
} else if items.isEmpty && !searchText.isEmpty {
    ContentUnavailableView.search(text: searchText)                        // 2. filtered/searched to zero
} else if items.isEmpty {
    ContentUnavailableView {                                                // 3. never had data
        Label("No Items", systemImage: "tray")
    } description: { Text("Items you create will appear here.") }
      actions: { Button("Create Item") { showCreateSheet = true }.buttonStyle(.bordered).controlSize(.large) }
} else {
    List(items) { ItemRow(item: $0) }
}
```

`.search(text:)` -- and the environment-reading static var `.search` -- are iOS 17.0+, the SAME floor as the base initializer. A common over-correction is bumping `.search` to iOS 18 because it "feels newer"; don't -- it shipped alongside the type, and gating it behind an `#available(iOS 18, *)` wall is an unnecessary compatibility tax. `controlSize(.large)` on the empty-state action button is not cosmetic: the default control size in this context can render under the 44pt floor on compact layouts (`references/accessibility/04-motor-interaction.md#touch-targets`). Check "no scope selected" FIRST, before falling through to a loading/failure branch, or the user sees a confusing generic error for a state that isn't actually an error. `ContentUnavailableView` REPLACES the scrollable content; `.overlay {}` on an empty `List` is an Apple-documented alternative, but don't leave the `List`'s own chrome (section headers, a `.refreshable` spinner) visible underneath it -- that reads as two half-rendered UIs stacked.

## Error and offline

`ContentUnavailableView` is equally the native full-screen ERROR surface, not just empty. Distinguish by copy and SF Symbol, never one generic "Something went wrong":

```swift
ContentUnavailableView {
    Label(isOffline ? "You're Offline" : "Couldn't Load",
          systemImage: isOffline ? "wifi.slash" : "exclamationmark.icloud")
} description: {
    Text(isOffline ? "Check your connection and try again." : error.localizedDescription)
} actions: {
    Button("Try Again") { Task { await retry() } }.buttonStyle(.borderedProminent)
}
```

Offline vs. server error is a COPY decision, not a chrome decision -- detect offline specifically (`URLError.notConnectedToInternet`, or a proactive `NWPathMonitor` reading) and say so; a user acts on "you're offline" immediately, but "something went wrong" sends them to support for a problem they could self-diagnose. `error.localizedDescription` is why errors conform to `LocalizedError` -- surfacing a raw `Error` dumps a Swift type name to the user. Keep to ONE primary `.borderedProminent` action; a secondary ("Contact Support") is a plain `Button` below it, never a second prominent one. `alert` is for a transient, interrupting failure the user must acknowledge (a failed save); `ContentUnavailableView` is the durable representation of "this screen has no content because a load failed" -- it persists and carries the retry in one place.

A proactive offline banner (non-blocking, over cached content) uses a lightweight `@Observable` wrapper around `NWPathMonitor`:

```swift
.safeAreaInset(edge: .top) {
    if !network.isConnected {
        Label("No Internet Connection", systemImage: "wifi.slash")
            .font(.footnote).padding(8).frame(maxWidth: .infinity).background(.red.opacity(0.2))
    }
}
```

Reachability is a HINT, never a gate -- don't skip firing a request because `isConnected == false`; a satisfied path can still fail (captive portal, DNS, backend down) and an unsatisfied one may recover before your timeout fires. Fire the request, classify the failure. Use `NWPathMonitor` only for the proactive banner and to trigger a single auto-retry when connectivity is REGAINED -- debounce on a satisfied-route CHANGE, not every callback, or a Wi-Fi/cellular handoff burst fires several redundant reconnects.

## Retry affordances

A failed mutation on a screen that ALREADY has content must never swap to a full error view -- that destroys usable data. Surface it as a transient toast/banner and keep the content:

```swift
.overlay(alignment: .top) {
    if let err = vm.refreshError {
        Label(err.userMessage, systemImage: "exclamationmark.triangle.fill")
            .padding(8).background(.regularMaterial, in: .capsule)
            .task { try? await Task.sleep(for: .seconds(3)); vm.refreshError = nil }
    }
}
```

`.refreshable`'s own self-cancel trap: SwiftUI runs its closure as a Task owned by the refreshing view. If your refresh flips `.loaded` -> `.loading`, the view hosting `.refreshable` is torn down and rebuilt, which CANCELS the Task running the refresh -- pull-to-refresh appears to do nothing. Fix: keep the prior `.loaded` value on screen during a refresh; only enter `.loading` on a cold start with nothing cached:

```swift
func refresh() async {
    let hadPrior: Bool
    if case .loaded = state { hadPrior = true } else { hadPrior = false; state = .loading }
    do { state = .loaded(try await api.fetch()) }
    catch { if !hadPrior { state = .failed(error) } else { refreshError = error } }
}
```

`.refreshable` also has NO host on `ContentUnavailableView` -- it isn't scrollable, so the gesture no-ops. Ship both: `.refreshable` on the populated list, an explicit "Try Again" button on the empty/error surface. The manual Retry button must re-enter `.loading` through the SAME entry point (guards a double-tap from firing two concurrent loads) and disable itself while in flight:

```swift
Button("Try Again") { Task { await vm.load() } }.buttonStyle(.borderedProminent).disabled(vm.isLoading)
```

A dashboard aggregating independent sections (profile, feed, notifications) must not let ONE failed section fail the whole screen -- model each section's own `LoadState`, load them with `async let`/a `TaskGroup` so a slow source doesn't block the others, and render an inline, section-scoped error row with its own Retry rather than swapping the entire screen to `ContentUnavailableView`. A single pull-to-refresh at the top level re-tries every failed section at once.

Auto-retry, when you have it, is a UX discipline as much as an algorithm: retry only TRANSIENT transport failures (timeout, connection lost, DNS) with capped exponential backoff, never 4xx client errors, and always tell the user a countdown rather than spinning silently through a multi-second sleep. After a few silent attempts, stop and hand control to the manual Retry surface -- infinite silent retry drains battery and hides a real outage.

## Success

Momentary success (saved, sent, added) gets acknowledgment without a modal wall -- a subtle haptic, an inline checkmark, a brief auto-dismissing overlay. Reserve a full success SCREEN for terminal, celebratory flows (purchase complete, onboarding done); a "Success!" alert the user must tap OK on for a routine save is web-form thinking ported to iOS:

```swift
Image(systemName: isSaved ? "checkmark.circle.fill" : "circle")
    .contentTransition(.symbolEffect(.replace))   // one-shot, discrete -- system-auto-gated under Reduce Motion
    .sensoryFeedback(.success, trigger: isSaved)
```

## Accessibility contract

Redacted skeleton rows must be `.disabled(true)` (or `.allowsHitTesting(false)`) -- an ungated skeleton is tappable/navigable to VoiceOver and Switch Control even though it shows only placeholder content. A shimmer sweep over a skeleton is optional polish and IS motion -- gate it behind `@Environment(\.accessibilityReduceMotion)`; an ungated repeating shimmer is exactly the continuous, non-stoppable motion Reduce Motion exists to suppress (`references/accessibility/05-motion-accessibility.md#accessibility-contract`). The `.contentTransition(.symbolEffect(.replace))` success checkmark above is a ONE-SHOT discrete effect the system already reduces under Reduce Motion -- do not add a redundant gate there; that auto-gating boundary is owned by `references/accessibility/03-visual-accessibility.md#reduce-motion`. `controlSize(.large)` on every `ContentUnavailableView` action button keeps it at the 44pt floor (`references/accessibility/04-motor-interaction.md#touch-targets`).

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Parallel `isLoading`/`error`/`isEmpty` bools | Renders conflicting combinations (spinner + empty view) | One `LoadState` enum, switched once |
| Full-screen spinner over content you know the shape of | Layout jumps when data replaces it | `.redacted(reason: .placeholder)` skeleton of the real row |
| One generic "Something went wrong" for every failure | User can't self-diagnose an offline state | Branch offline vs. server vs. unknown by copy and symbol |
| `ContentUnavailableView.search` over-gated to iOS 18 | Ships an unnecessary `#available` wall | It's iOS 17.0+, same floor as the base initializer |
| Redacted rows still tappable | VoiceOver/Switch Control can activate placeholder content | `.disabled(true)` while loading |
| Refresh flips `.loaded` -> `.loading` | Self-cancels the `.refreshable` Task | Keep the prior value on screen; cold-path `.loading` only |
| `.refreshable` on `ContentUnavailableView` | Non-scrollable; the gesture no-ops | Explicit Retry button on the empty/error surface |
| Failed refresh replaces the list with a full error view | Destroys usable content | Toast/banner, keep the content |
| One dashboard section's failure blanks the whole screen | Blocks unrelated, working content | Per-section `LoadState` + inline retry |
| Blocking "Success!" alert on every routine save | Web-form thinking ported to iOS | Silent success + `.sensoryFeedback(.success,…)` |

## Severity guide

CRITICAL: a redacted skeleton left tappable/navigable, or a background refresh failure that wipes content already on screen. HIGH: `ContentUnavailableView.search` mis-gated to iOS 18 (an unshippable `#available` wall for no reason), or one generic error message across offline/server/unknown causes. MEDIUM: `.refreshable`'s self-cancel trap shipping unfixed, or a shimmer effect with no Reduce Motion gate. LOW: an empty-state action button missing `.controlSize(.large)`.

## See also

- `references/design/07-navigation-patterns.md#empty-states-ios-17` -- the one-line entry point this file supersedes with the full taxonomy
- `references/design/07-navigation-patterns.md#pull-to-refresh` -- basic `.refreshable`; this file owns the self-cancel pitfall and per-section failure UI
- `references/performance/02-scroll-list-performance.md#asyncimage-with-phase-handling` -- the list-cell image-loading path this file's `AsyncImage` phase pattern feeds
- `references/haptics/02-swiftui-sensory-feedback.md#built-in-feedback-types` -- `.success`/`.error`/`.warning` triggers for load outcomes
- `references/patterns/09-auth-account.md#flow-states-loading-cancel-error-success` -- this same load-state discipline applied to a sign-in flow
- `references/accessibility/04-motor-interaction.md#touch-targets` -- the 44pt floor for `ContentUnavailableView` actions
- `references/accessibility/05-motion-accessibility.md#accessibility-contract` -- the Reduce Motion double-gate for shimmer/transition motion
