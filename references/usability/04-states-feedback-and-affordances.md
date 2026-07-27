# States, Feedback, and Affordances

> Owner: `references/usability/04-states-feedback-and-affordances.md` owns the completeness question (does every state exist), the latency contract (does every action get a response in time), and the affordance question (can a person tell what is interactive without being told). `references/patterns/04-loading-empty-error.md` owns the load-state MODEL and `ContentUnavailableView` mechanics; this file owns whether the set is complete and whether the feedback lands. Cite, don't restate.
> Floors: `ContentUnavailableView` incl. `.search` iOS 17.0+, `.redacted(reason:)` iOS 14.0+, `.sensoryFeedback` iOS 17.0+, `.refreshable` iOS 15.0+, `.contentTransition` iOS 16.0+, `.symbolEffect` iOS 17.0+ (`references/_scaffolding/version-floor-registry.md`).

Most SwiftUI screens ship one state. The happy one. The other seven exist as
whatever the layout does when the array is empty and the error is `nil`, which is
usually a blank screen with a navigation bar floating above nothing.

## The Apple way

- **Every screen enumerates its states and renders each deliberately.** Blank is
  a decision or it is a bug; there is no third option.
- **Every action gets a response inside 100ms**, even if the response is only
  "received".
- **The interface teaches itself.** If a screen needs a sentence of instruction
  to be operable, the affordance failed and the sentence is the patch.
- **Feedback is layered, not duplicated.** Visual change, then haptic where the
  event is physical or consequential, then sound only where the platform already
  makes sound.

## 1. The complete state set

Ten states. A screen review lists which exist and which were assumed.

| State | Required when | Correct treatment |
|---|---|---|
| Idle / not started | The screen can exist before a fetch | A prompt to act, never a spinner that never resolves |
| Loading, first time | Any async content | Skeleton via `.redacted(reason: .placeholder)`, or a spinner past 1s |
| Loading, refreshing | Content already on screen | `.refreshable`'s own indicator; never replace good content with a spinner |
| Loaded | Always | -- |
| Empty (no data yet) | Any collection | `ContentUnavailableView` WITH the action that creates the first item |
| Zero results (filtered) | Any search or filter | `ContentUnavailableView.search(text:)`, plus a way to relax the filter |
| Error | Any fallible operation | The cause, the next action, and the input intact |
| Offline | Any networked screen | Cached content marked as cached, or a stated offline state with queued writes |
| Partial | Any bulk or multi-source operation | What landed, what did not, retry for the remainder |
| Permission denied | Any capability-gated screen | What still works, plus a Settings control |

**Empty and zero results are different states and conflating them is a finding.**
"No workouts" when the user has never recorded one needs a Record button. "No
workouts" when a date filter excludes them all needs the filter cleared. Shipping
one view for both means one of the two audiences gets a dead end.

```swift
// Distinct, because the recovery is distinct.
if workouts.isEmpty && searchText.isEmpty && !hasActiveFilter {
    ContentUnavailableView {
        Label("No Workouts", systemImage: "figure.run")
    } description: {
        Text("Workouts you record appear here.")
    } actions: {
        Button("Record a Workout") { startRecording() }
    }
} else if visible.isEmpty {
    ContentUnavailableView.search(text: searchText)     // iOS 17+
        .overlay(alignment: .bottom) {
            Button("Clear Filters") { clearFilters() }.padding()
        }
}
```

## 2. Why a missing empty or error state is HIGH, not MEDIUM

A missing empty state is not a polish gap. It is the state **every new user sees
first**, on the screen the app most wants them to use. The person with the least
context gets the least information, at the moment they are deciding whether the
app works. A blank list with a title bar is indistinguishable from a failed
load, so the user's conclusion is "broken", not "empty".

A missing error state is worse: it is silent failure. The user acts, nothing
happens, and there is nothing to report. They will retry, and a retry against a
non-idempotent endpoint is how duplicate records happen.

## 3. Skeleton, spinner, progress, or nothing

| Expected duration | Treatment |
|---|---|
| Under 100ms | Nothing. A flashed spinner is worse than no spinner |
| 100ms to 1s | The control's own in-flight state; no full-screen takeover |
| 1s to 3s, layout known | `.redacted(reason: .placeholder)` skeleton matching the real layout |
| 1s to 3s, layout unknown | Indeterminate `ProgressView` |
| Over 3s, measurable | Determinate `ProgressView(value:total:)` with a real fraction |
| Over 3s, not measurable | Indeterminate, plus a statement of what is happening |
| Over 10s | Backgroundable, cancellable, and it survives the app being backgrounded |

```swift
// A skeleton that does not match the loaded layout causes a jump on arrival.
// Redact the REAL view, do not hand-build grey rectangles.
WorkoutRow(workout: .placeholder)
    .redacted(reason: .placeholder)
    .accessibilityHidden(true)     // never read placeholder content to VoiceOver
```

`.accessibilityHidden(true)` on skeletons is not optional: without it VoiceOver
reads the placeholder text as if it were content.

## 4. Feedback latency budgets

| Event | Budget | Consequence past it |
|---|---|---|
| Visual response to a tap | 100ms | The tap feels dropped; the user taps again |
| Haptic, where used | Same frame as the visual | A late haptic reads as a second, unrelated event |
| Progress indication | 1s | The screen reads as frozen |
| Completion confirmation | Immediately on completion | Silent success; see below |
| Scroll frame time | 8ms at 120Hz, 16ms at 60Hz | Visible jank; see `references/performance/02-scroll-list-performance.md` |

### Silent success

The most-missed feedback defect. An action whose outcome is invisible needs an
outcome confirmation, not merely a pressed state:

| Action | Why it is silent | Confirmation |
|---|---|---|
| Copy to pasteboard | Nothing on screen changes | A brief confirmation, plus `.sensoryFeedback(.success, trigger:)` |
| Save when already viewing the saved thing | The screen looks the same | State change on the control, plus haptic |
| Send in the background | The compose sheet dismisses either way | A durable indicator that it sent, or that it is queued |
| Add to an off-screen collection | The collection is not visible | Say which collection |
| Toggle a setting that acts later | No immediate effect | State what will happen and when |

A pressed state says the button was tapped. It does not say the thing happened.

```swift
// Layered: the visual state IS the confirmation; the haptic reinforces it.
Button("Copy Link") {
    UIPasteboard.general.string = link
    didCopy = true
}
.sensoryFeedback(.success, trigger: didCopy)
```

Haptics carry meaning, so they must be correct rather than merely present:
`.success` for completion, `.warning` for a recoverable problem, `.error` for a
failure, `.selection` for discrete value changes. A `.success` haptic on a
failed operation actively misinforms, and blind users may have nothing else. See
`references/haptics/02-swiftui-sensory-feedback.md`.

## 5. Affordances and signifiers

iOS has no hover, so the web's primary affordance channel does not exist. Every
signifier must be present in the resting state.

| Element | Signifier that it is interactive |
|---|---|
| List row that pushes | The disclosure chevron the system draws for `NavigationLink` |
| Button | A `Button` with a `buttonStyle`, not a `Text` with `.onTapGesture` |
| Tappable text | `Button` with `.buttonStyle(.plain)` plus tint, or a `Link` |
| Tappable image or icon | Wrapped in a `Button`; a 44pt `contentShape` |
| Card | A `Button` label, so it gets the pressed state for free |
| Toggle | The system `Toggle`, which carries the trait and the animation |
| Draggable | A grabber, or a visible drag handle; `.draggable` alone is invisible |
| Long-pressable | A `.contextMenu` is discoverable only by accident; pair it with a visible control |

```swift
// WRONG: no pressed state, no accessibility trait, no Voice Control target,
// and the tap area is the text bounds.
Text("Learn more").onTapGesture { open() }

// RIGHT
Button("Learn more") { open() }
    .buttonStyle(.plain)
    .foregroundStyle(.tint)
```

**Gestures with no visible control are invisible features.** Swipe actions,
context menus, long-press, and drag are discovery-optional by nature. Each one
either duplicates an action reachable from a visible control, or the feature is
undiscoverable and also unavailable to Switch Control and Voice Control users.
This is both a usability finding and an accessibility one; see
`references/accessibility/04-motor-interaction.md`.

## 6. Disabled state anti-patterns

| Anti-pattern | Why it fails | Right |
|---|---|---|
| Submit disabled until valid, with no explanation | The user cannot tell what is missing; the screen reads as broken | Enable it; validate on tap and show the errors |
| Disabled with no visual distinction beyond opacity | Fails contrast at AX sizes and in Increase Contrast | Distinct treatment, and state the reason |
| Disabled as the only signal of a required field | Invisible to VoiceOver users, who hear "dimmed" with no cause | Say why in the accessibility label |
| Disabled during a long operation with no progress | Indistinguishable from broken | Show progress on the control |

```swift
Button("Send") { submit() }
    .disabled(isSubmitting)                    // in-flight: legitimate
    .accessibilityHint(isSubmitting ? "Sending" : "")
// NOT: .disabled(!form.isValid) with nothing telling the user what is invalid
```

## 7. Optimistic updates and rollback

| Rule | Detail |
|---|---|
| Optimistic is correct for high-success, low-consequence actions | Like, favourite, reorder, toggle |
| Optimistic is wrong for payment, deletion, and anything irreversible | Show the real state |
| A rollback is always visible | A silent revert makes the user think they imagined it |
| The rollback restores the exact prior state | Including scroll and selection |

```swift
func toggleFavourite(_ item: Item) async {
    let previous = item.isFavourite
    item.isFavourite.toggle()                        // optimistic
    do { try await api.setFavourite(item.id, item.isFavourite) }
    catch {
        item.isFavourite = previous                  // rollback
        banner = .init(text: "Couldn't update. Try again.", style: .warning)  // VISIBLE
    }
}
```

**A silent optimistic rollback is a HIGH finding.** The user saw it work and
then saw it not work, with no explanation, which reads as an app that loses data.

## 8. Progress, partial, and streaming

| Case | Requirement |
|---|---|
| Determinate work | A real fraction, and it must not go backwards |
| Multi-item work | "12 of 47", not a percentage alone |
| Streaming text | Content appears incrementally with a visible cursor or generation indicator |
| Cancellable work | A cancel control, and cancelling actually cancels the `Task` |
| Background-eligible work | It survives backgrounding, or the user is told it will not |

For Apple Intelligence and other generative surfaces the platform expects a
specific treatment; see `references/platform/06-apple-intelligence-ui.md`.

## 9. Forcing every state

States that cannot be forced do not get reviewed. Build the switches first.

```swift
// Previews are the cheapest state harness in the platform. One per state.
#Preview("Empty")   { FeedView(model: .init(state: .loaded([]))) }
#Preview("Loading") { FeedView(model: .init(state: .loading)) }
#Preview("Error")   { FeedView(model: .init(state: .failed(AppError.offline))) }
#Preview("Partial") { FeedView(model: .init(state: .partial(sent: 45, failed: 2))) }
#Preview("AX5")     { FeedView(model: .preview).dynamicTypeSize(.accessibility5) }
#Preview("RTL")     { FeedView(model: .preview).environment(\.layoutDirection, .rightToLeft) }
```

| State | How to force it |
|---|---|
| Offline | Airplane mode, or Network Link Conditioner's 100% loss profile |
| Slow | Network Link Conditioner, Edge or 3G profile |
| Error | A debug menu that injects a failure, or a stubbed client |
| Empty | A signed-in account with no data, kept for exactly this |
| Permission denied | Settings, revoke, relaunch |
| Termination mid-task | Background, then stop from Xcode, then relaunch |
| Partial failure | A stub that fails a subset |

An app with no way to reach its error states will ship them untested, because
nobody can see them.

## Accessibility contract

- Skeletons are `accessibilityHidden(true)`.
- State changes that are only visual are announced (`.screenChanged` for a whole
  new state, `.announcement` for a transient one).
- `ProgressView` carries a label; a bare spinner announces nothing.
- Disabled controls state why they are disabled.
- Every gesture-only action has an equivalent reachable by VoiceOver, Switch
  Control, and Voice Control.
- Haptic feedback is never the sole channel; it is always paired with a visual
  or announced change.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| A blank screen for empty | Reads as broken to the user with the least context | `ContentUnavailableView` with the creating action |
| One view for empty and zero results | One of the two audiences gets a dead end | Two states, two recoveries |
| A spinner replacing loaded content on refresh | Destroys context the user was reading | `.refreshable`'s indicator over the existing content |
| A skeleton that does not match the loaded layout | Content jumps on arrival | Redact the real view |
| Skeleton readable by VoiceOver | Placeholder text announced as content | `.accessibilityHidden(true)` |
| `Text` plus `.onTapGesture` | No pressed state, no trait, no Voice Control target, tiny hit area | `Button` |
| A `.contextMenu` as the only path to an action | Undiscoverable; unavailable to Switch and Voice Control | Duplicate it on a visible control |
| Submit disabled until valid, silently | Unexplained dead end | Enable and validate on tap |
| Silent optimistic rollback | Reads as data loss | Show the failure |
| `.sensoryFeedback(.success)` on a failure | Actively misinforms, and may be the only channel a blind user has | Match the semantic |
| A spinner for a 60ms operation | Flashes; worse than nothing | No indicator under 100ms |

## Severity guide

| Severity | Example |
|---|---|
| CRITICAL | An action fails silently with no indication; a permission-denied screen with no path forward on the primary flow |
| HIGH | Missing empty state; missing error state; empty and zero-results conflated; silent optimistic rollback; a gesture-only action with no visible equivalent; no feedback within 100ms of a tap; a skeleton VoiceOver reads as content |
| MEDIUM | Spinner replacing loaded content on refresh; skeleton that does not match the layout; disabled submit with no explanation; missing offline state; a determinate operation shown as indeterminate |
| LOW | Spinner under 100ms; missing haptic on a consequential action; progress without a count |
| NIT | Empty-state illustration preference |

## See also

- `references/patterns/04-loading-empty-error.md` -- the load-state model and `ContentUnavailableView` mechanics
- `references/usability/02-forms-and-error-recovery.md` -- error copy, submission state, partial failure
- `references/usability/01-task-flows-and-journeys.md` -- dead ends, break tests
- `references/haptics/02-swiftui-sensory-feedback.md` -- `.sensoryFeedback` semantics
- `references/interaction/05-press-feedback-states.md` -- pressed states and press feel
- `references/accessibility/04-motor-interaction.md` -- gesture alternatives, target size
- `references/platform/06-apple-intelligence-ui.md` -- streaming and generative state
- `references/review/01-finding-format.md` -- the canonical finding template
