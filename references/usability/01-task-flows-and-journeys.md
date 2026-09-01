# Task Flows and Journeys

> Owner: `references/usability/01-task-flows-and-journeys.md` owns the flow map, step and effort budgets, carried state, dead ends, progressive disclosure, and the break tests. `references/design/07-navigation-patterns.md` owns the navigation APIs; this file owns whether a person can finish. Cite, don't restate.
> Floors: `NavigationStack` iOS 16.0+, `@SceneStorage` iOS 14.0+, `.onOpenURL` iOS 14.0+, `.interactiveDismissDisabled(_:)` iOS 15.0+, `.presentationDetents` iOS 16.0+, `.scrollPosition` iOS 17.0+ (`references/_scaffolding/version-floor-registry.md`).

Every other dimension this plugin reviews is judgeable from one rendered frame:
Liquid Glass adoption, type hierarchy, semantic color, symbol weight, spacing,
contrast, spring feel. A flow defect is not in any frame. A three-step invite
sheet whose step 2 drops the addresses typed in step 1 when the user swipes back
renders identically, on every device, in both appearances, to one that keeps
them. Both screenshots are correct. The defect is in the sequence, and the
sequence was never opened.

That is how a screen-perfect app ships a task nobody can finish. **A review that
only ever looks at one screen at a time can approve any amount of broken flow.**

## The Apple way

iOS differs from every other platform on one point that changes this whole file:
**the system is a participant in every flow.** It backgrounds the app mid-task,
terminates it under memory pressure without warning, covers it with permission
and StoreKit sheets it did not ask for, and hands it entry points that land in
the middle of a flow rather than at its front door. A flow designed only from its
own first screen, on a device that never rings, is a flow designed for a
condition that does not occur.

First-party apps hold four rules:

1. **Every task survives termination.** The user is never punished for the
   system killing the app. Draft state is restorable, and it restores to the
   step it was on, not to the root.
2. **Every entry point lands somewhere coherent.** A widget tap, Siri phrase,
   Shortcut, Spotlight result, universal link, Handoff continuation, or App Clip
   invocation either resolves to the right screen with the right state or
   redirects to one that makes sense. Never a crash, never an empty form that
   will submit.
3. **Back always means back.** The interactive pop gesture works on every pushed
   screen, and it preserves what was typed. A custom back button that breaks the
   edge swipe breaks the single most-used gesture on the platform.
4. **Destructive and irreversible work is confirmed or undoable, never both
   silent.** See `references/usability/02-forms-and-error-recovery.md`.

## 1. Name the task before reviewing anything

No flow can be judged against nothing. Fill this in first, from the app, not
from a design doc that may not exist:

```text
Actor:      who they are and what they already know
Trigger:    what makes them start
Task:       one sentence, in their words, with a verb
Success:    the observable condition that ends the task
Entry:      every route or surface the task can start from
Exit:       every way out: completion, abandonment, error, interruption, termination
Frequency:  once ever / daily / per incident / per purchase
```

**If Success cannot be filled with something observable, that is finding number
one and it outranks everything visual.** "The user is engaged" is not a success
condition. "The workout appears in the list with today's date and Health has the
sample" is. A flow with no stated success condition ships a final screen that
confirms nothing, because nobody could say what to confirm.

Frequency changes every other judgement here. A once-ever task (account setup,
Health permissions) can afford explanation, a review step, and a slower
sequence. A per-incident task (log a glucose reading, silence an alarm, reply to
a message) can afford none of it, and the same explanatory paragraph that helps
in the first is pure cost in the second.

**Entry deserves more attention on iOS than anywhere else.** Enumerate it
literally, because each of these arrives at a different depth:

| Entry surface | Where it lands | What the review must check |
|---|---|---|
| App icon, cold launch | Root, or restored state | Does it restore, or dump the user at the root having lost the draft? |
| Widget / Control tap | A `widgetURL` or `AppIntent` target | Does the deep link resolve when signed out, or when the entity was deleted? |
| Live Activity tap | The activity's target screen | Same, plus: is the activity stale? |
| Siri / App Intent / Shortcut | Mid-flow, often with parameters pre-filled | Can the intent complete without ever showing UI, and does it say so? |
| Spotlight result | A detail screen, no parent context | Is there a route back to the list, or is the user stranded? |
| Universal link / `onOpenURL` | Arbitrary depth | Auth gate that returns to the target afterwards, not to the root |
| Handoff / `NSUserActivity` | The continuing screen | Does the receiving device have the state the sending one had? |
| Notification tap | The referenced object | Object deleted since? Permission revoked since? |
| App Clip | A single task, no app installed | Can that one task complete with no account? |
| Share sheet / `Transferable` | An import or compose screen | Malformed payload path |

A flow whose review only walked the app-icon path has reviewed one of ten
entrances.

## 2. Write the flow map

Half of all flow defects are visible in this table before the app is even built,
because a cell is empty.

| Step | Entry condition | Input required | State carried in | State produced | Failure modes | Exit paths |
|---|---|---|---|---|---|---|

Worked example, a three-step invite sheet with two defects the map exposes:

| Step | Entry condition | Input required | State carried in | State produced | Failure modes | Exit paths |
|---|---|---|---|---|---|---|
| 1. Add addresses | Admin on team screen | 1 to 50 addresses | Team id | Address list | Malformed, already a member, over seat limit | Next, Cancel |
| 2. Choose role | Step 1 valid | Role per address | (empty) | Role map | None listed | Next, Back |
| 3. Confirm and send | Step 2 valid | None | Role map | Invitations | Partial send failure | Send, Back |

Two findings fall straight out of the table:

- Step 2 carries in nothing, so the addresses typed in step 1 are not in scope at
  step 2. Back cannot restore them, the swipe-back gesture loses them, and a
  scene restoration after termination loses them. That is the defect from the
  opening paragraph, found by reading a table.
- Step 2 lists no failure modes. That is never true. It means nobody designed the
  failure, not that failure cannot happen: a role can be revoked between steps,
  the seat limit can be consumed by another admin mid-flow, the network can drop
  between two screens of one sheet.

What an empty cell means:

| Empty cell | What it actually means |
|---|---|
| State carried in | The step re-asks for data the app already holds (WCAG 3.3.7 Redundant Entry), or silently loses it |
| Failure modes | Failure was not designed, so it surfaces as a generic alert or a blank screen |
| Exit paths | Dead end. See section 5 |
| State produced | The step does nothing the flow needs. Ask why it exists |
| Two steps producing the same state | One of them can be merged away |

### Reading the map out of SwiftUI source

The flow map is recoverable from code without running anything. The shape of the
navigation state tells you what can survive:

```swift
// RESTORABLE: the path is value-typed, Codable, and scene-persisted.
@Observable final class Router {
    var path: [Route] = []          // Route: Hashable & Codable
}

struct RootView: View {
    @State private var router = Router()
    @SceneStorage("nav") private var encodedPath: Data?

    var body: some View {
        NavigationStack(path: $router.path) {
            HomeView()
                .navigationDestination(for: Route.self, destination: destination)
        }
        .task { restore() }
        .onChange(of: router.path) { _, new in
            encodedPath = try? JSONEncoder().encode(new)
        }
    }
}
```

```swift
// NOT RESTORABLE: NavigationLink(destination:) with no path binding.
// Nothing outside the view hierarchy knows where the user is, so termination,
// Handoff, and deep links all land at the root.
NavigationLink("Detail") { DetailView(item: item) }
```

Grep recipe for a source-only review:

```bash
# Navigation surface: which screens are reachable, and is the path value-typed?
grep -rn "NavigationStack\|navigationDestination\|NavigationLink\|NavigationSplitView" --include=*.swift .
# Every entry point that can land mid-flow
grep -rn "onOpenURL\|onContinueUserActivity\|widgetURL\|AppIntent\|NSUserActivity\|didReceiveResponse" --include=*.swift .
# Restoration surface: what survives termination
grep -rn "@SceneStorage\|@AppStorage\|scenePhase\|userActivity(" --include=*.swift .
# Modal surface: what can be dismissed by a gesture, and what guards it
grep -rn "\.sheet(\|\.fullScreenCover(\|interactiveDismissDisabled\|presentationDetents" --include=*.swift .
# Submit handlers and their failure branches
grep -rn "func save\|func submit\|try await\|\.task {\|Task {" --include=*.swift . | head -50
```

## 3. Step and effort budgets

Budgets, not laws. A finding needs the count; these say which counts are worth
reporting.

| Measure | Budget | Severity past it |
|---|---|---|
| Taps from entry to success, returning user, primary task | 3 | 4 to 5 MEDIUM, 6 or more HIGH |
| Screens before a first-run user sees any value | 3 | HIGH past 3 with no skip |
| Screens for a task that collects 3 fields or fewer | 1 | MEDIUM at 2, HIGH at 3 |
| Fields collected before the first useful output | Only those the output needs | HIGH for each field the output does not need |
| Primary decisions per screen (choices that change the path) | 1 | MEDIUM at 2 to 3, HIGH past 3 |
| Data the user must re-enter that the app already holds | 0 | HIGH, and a WCAG 3.3.7 failure |
| Facts shown on step N, needed on step N+1, not displayed there | 0 | HIGH |
| Permission prompts before the user has seen the feature that needs them | 0 | HIGH: a cold prompt is the most common cause of a permanent denial |
| Steps whose only content is a confirmation of readiness | 0 | MEDIUM |

Count taps and keystrokes along the primary path and put the numbers in the
finding. A budget without a count is an opinion, and opinions lose triage.

**The permission row is iOS-specific and it is the expensive one.** A denied
permission is not retryable in-app; the user must be sent to Settings. Asking
before the value is visible converts a recoverable "not now" into a permanent
no, and no amount of later UI polish undoes it. Every permission prompt in the
flow map needs a preceding step that shows why.

## 4. State that carries forward

The single highest-yield question in an iOS flow review: what does the user have
at this moment that the next moment must not destroy?

There are four ways state dies on iOS, and only the first exists on the web:

| Killer | Mechanism | What must survive |
|---|---|---|
| Navigation | Pop, swipe-back, sheet dismiss, tab switch | Typed input, scroll position, selection |
| Backgrounding | `scenePhase` moves to `.background` | Everything, because termination may follow with no further callback |
| Termination | Jetsam under memory pressure, or a force quit | Draft content, and the step the user was on |
| Interruption | Call, alarm, permission sheet, StoreKit sheet, Face ID | In-flight async work and the focused field |

The rule: **anything the user typed, chose, or scrolled to belongs somewhere
that outlives the view.** `@State` inside the presented view is the wrong home
for all of it.

```swift
// WRONG: draft dies on dismiss, on swipe-back, and on termination.
struct ComposeView: View {
    @State private var body_ = ""
}

// RIGHT: draft is owned above the presentation and persisted on the way down.
@Observable final class ComposeDraft {
    var text = "" { didSet { persist() } }
    func persist() { UserDefaults.standard.set(text, forKey: "draft.compose") }
}

struct ComposeView: View {
    @Bindable var draft: ComposeDraft
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TextEditor(text: $draft.text)
            .onChange(of: scenePhase) { _, phase in
                if phase != .active { draft.persist() }   // background may be the last callback
            }
    }
}
```

Sheets deserve their own check, because the dismiss gesture is silent and
unprompted:

```swift
.sheet(isPresented: $isComposing) {
    ComposeView(draft: draft)
        // Guard the gesture ONLY when there is something to lose, and always
        // give the user a way out when you do -- a disabled dismiss with no
        // Cancel button is a trap, which is worse than the data loss.
        .interactiveDismissDisabled(draft.hasUnsavedContent)
}
```

Reviewer rule: a `.sheet` or `.fullScreenCover` containing a text field, picker,
or multi-step form and carrying no `interactiveDismissDisabled` and no draft
persistence is a HIGH finding. The user swipes down by reflex.

## 5. Dead ends

A dead end is any screen with no onward action toward the task or out of it.
They are the most common flow defect and the easiest to find, because they are
enumerable from the state set rather than from walking.

| Screen | Dead end when | The missing exit |
|---|---|---|
| Success | Confirms and stops | The next action, or a route back to where the task started |
| Error | States a failure with no control | Retry, and a path that does not require retry |
| Empty | "No items" and nothing else | The action that creates the first item |
| Zero results | "No matches" and nothing else | Clear the filter, broaden, or a suggestion |
| Permission denied | "Enable in Settings" as prose | `UIApplication.openSettingsURLString`, plus what still works without it |
| Offline | A blank screen or a spinner forever | Cached content, and a statement that it is cached |
| Signed out mid-task | Dumped at the login root | Return to the target after sign-in |
| Object deleted (arrived from a notification or widget) | Blank detail, or a crash | A statement that it is gone, and a route to the list |

```swift
// Every terminal state gets a route out. ContentUnavailableView takes actions.
ContentUnavailableView {
    Label("No Workouts", systemImage: "figure.run")
} description: {
    Text("Workouts you record appear here.")
} actions: {
    Button("Record a Workout") { startRecording() }   // the missing exit
}
```

The permission dead end is worth calling out separately because iOS makes it
irreversible in-app:

```swift
// Not prose. A control.
Button("Open Settings") {
    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
    UIApplication.shared.open(url)
}
```

## 6. Progressive disclosure

Disclosure is right when it hides detail a minority needs, and wrong when it
hides a decision, a requirement, or a warning.

| Hidden thing | Verdict |
|---|---|
| Advanced settings a minority changes | Correct: `DisclosureGroup`, or a pushed detail screen |
| A required field | HIGH: the user cannot submit and cannot see why |
| A destructive consequence | CRITICAL: consent that requires expansion is not consent |
| The price, or what is being agreed to | CRITICAL, and an App Review risk on a paywall |
| The primary action, behind an overflow menu | HIGH |
| A validation error, inside a collapsed section | HIGH: see `references/usability/02-forms-and-error-recovery.md` |

Sheet detents are a disclosure mechanism and inherit the same rule:

```swift
.presentationDetents([.medium, .large])
// A .medium detent that hides the confirm button is the "primary action behind
// a disclosure" defect wearing a sheet. Either the primary control is reachable
// at the smallest detent, or the smallest detent is not offered.
```

## 7. Cognitive load, with counts instead of vibes

| Measure | Threshold | Why |
|---|---|---|
| Peer options at one level (tabs, list sections, menu items) | 9 | Past this, users scan instead of choose |
| Tab bar items | 5 | Platform limit; a 6th becomes "More", which hides the 6th onward |
| Primary actions competing on one screen | 1 | Two primaries is no primary |
| Words of body copy in front of the first control | 30 | See `references/review/03-density-and-economy.md` |
| Simultaneous new concepts in onboarding | 3 | `references/patterns/03-onboarding-tipkit.md` |
| Toolbar controls in one placement | 5 | Past this, group into a menu |

Counts are evidence. "The screen feels busy" is not.

## 8. Multi-step and wizard patterns

| Requirement | Threshold | Severity if absent |
|---|---|---|
| Steps are named, not numbered only | Always | MEDIUM |
| Progress is visible and shows the total | Past 2 steps | MEDIUM |
| Back preserves every field | Always | HIGH |
| Save-and-exit exists | Past 3 steps | HIGH |
| Review step before an irreversible commit | Always, when irreversible | HIGH |
| The flow is resumable after termination | Past 2 steps | HIGH |

On iOS, "resumable after termination" is not optional past two steps. The system
will terminate a backgrounded app, and a user who was three screens into a form
when a call arrived will return to a root screen having lost everything, with no
error and nobody to blame in the code.

## 9. Search and filter

| Behaviour | Expected | Defect |
|---|---|---|
| Empty query state | Recent searches, or suggestions | A blank screen |
| Zero results | Names the query, offers a relaxation | "No results" alone |
| In-flight | Feedback within 100ms | A frozen list |
| Scope | `.searchScopes` when the corpus is heterogeneous | One undifferentiated result list |
| Debounce | 200 to 400ms | Every keystroke firing a request, or a 1s lag |
| Suggestions | `.searchSuggestions` where a controlled vocabulary exists | Free text only |
| Cancel | Restores the pre-search list and its scroll position | Dumps the user at the top |

A search review that never triggered the empty-query state and the zero-results
state has not reviewed search.

## 10. How to review a flow rather than a screen

Three modes, mirroring `references/review/02-evidence-pipeline.md`. State which
one was used, because the confidence differs.

**Mode A, driven (simulator or device available).** Walk the flow end to end,
capturing each step, then run the break tests below at every step. Highest
confidence; flow claims are direct observations.

**Mode B, code reconstruction (source, no runtime).** Build the entry inventory
and the navigation surface with the grep recipe in section 2; trace each submit
path and its failure branches; list every `dismiss()` and every navigation
mutation. Medium confidence. Every runtime claim is labelled inferred and the
finding cites the line that supports it.

**Mode C, screenshots only.** Flow claims are limited to what the frames show in
sequence. The correct flow verdict is **not assessed**, never clean. Reporting a
clean flow verdict from static frames is a false negative on exactly the defect
class the frames cannot contain.

### The break tests

Run at every step, not only at the end. This is the whole method, and eight of
the eleven are iOS-specific.

| Test | Action | Pass condition |
|---|---|---|
| Back | Interactive pop gesture from the screen edge, not the button | Previous step, every field intact, no duplicate record. The gesture must work at all: a custom `navigationBarBackButtonHidden` with a hand-rolled button usually kills it |
| Sheet dismiss | Swipe the sheet down mid-task | Draft survives, or the gesture is guarded and a Cancel path exists |
| Background and return | Home gesture, wait, reopen | Same screen, same state, same scroll position |
| Termination | Background the app, then terminate it from Xcode or force quit, then relaunch | The step and the draft are restored, or a restart that says so |
| Interrupt | Trigger a system sheet mid-flow (permission, Face ID, StoreKit) | In-flight work resumes or reports; focus returns; nothing is submitted twice |
| Deep entry | Open the flow's universal link, widget, or Shortcut in a clean install | The right screen, or an auth gate that returns there afterwards |
| Handoff | Start on one device, continue on another | The receiving device has the state, or declines cleanly |
| Invalid | Submit empty, then garbage | Field-level errors, focus moved to the first, nothing retyped |
| Abandon and return | Leave the flow, come back an hour later | A resumable draft, or a clean restart. Never a half-created record with no path to finish it |
| Double submit | Double-tap the submit control | Exactly one record. `Task {}` in a button action with no in-flight guard fails this |
| Slow and offline | Network Link Conditioner, then airplane mode | Feedback under 100ms, progress past 1s, a stated failure with the input intact |

**A flow review that did not press back and did not terminate the app is not a
flow review.**

## Accessibility contract

Flow work carries three obligations that are easy to miss because they are not
visual:

- **VoiceOver focus on step change.** Pushing a screen or switching a wizard
  step must move focus to the new content, not leave it on the vanished button.
  Use `AccessibilityFocusState`, and post
  `.screenChanged` on transitions the system does not handle.
- **Announce state that only appeared visually.** A submit that succeeds with a
  toast is silent to VoiceOver unless the change is announced.
- **WCAG 3.3.7 Redundant Entry** is a flow criterion, not a form criterion. Any
  step that re-asks for data an earlier step supplied fails it.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `@State` draft inside a presented sheet | Dies on swipe-dismiss and on termination | Own the draft above the presentation; persist on `scenePhase` change |
| `NavigationLink(destination:)` for a deep-linkable screen | No path binding, so deep links and restoration land at the root | `NavigationStack(path:)` with a `Codable` route enum |
| Custom back button with `navigationBarBackButtonHidden(true)` | Kills the interactive pop gesture, the most-used navigation gesture on iOS | Keep the system button, or re-attach the gesture deliberately |
| Permission prompt on first launch | Converts "not now" into a permanent denial | Prompt at the moment of use, after showing the value |
| `Button { Task { await save() } }` with no in-flight flag | Double-tap creates two records | Disable while in flight, or guard with a task handle |
| Wizard with no save-and-exit past 3 steps | The OS terminates the app and destroys the work | Persist per step; restore to the step |
| Success screen with no onward action | Dead end at the moment of highest intent | Offer the next task or a route back |
| Reviewing only the app-icon entry | Nine other entrances land mid-flow, unreviewed | Enumerate entries from section 1's table |

## Severity guide

| Severity | Flow defects |
|---|---|
| CRITICAL | The primary task cannot be completed on a supported path; typed input is destroyed with no warning and no recovery; an irreversible action fires with neither confirmation nor undo; a dead end on the primary path; a deep link that crashes |
| HIGH | Input lost on back, sheet dismiss, or termination; a step re-asks for data the app holds; the interactive pop gesture is broken; no save-and-exit past 3 steps; a cold permission prompt; the success state does not confirm success; zero results with no relaxation; a half-created record with no path to finish it |
| MEDIUM | 4 to 5 steps where 3 suffice; unnamed wizard steps; a disclosure hiding what most users need; more than 9 peer options at one level; two competing primary actions; explanatory prose in front of the primary control |
| LOW | Step indicator without a total; debounce outside the useful window; no recent-search affordance; a skippable step with no skip |
| NIT | Step ordering preference with no measured cost |

Flow findings quote the step. "Step 2 of 4 (Choose role) carries no address
state; the swipe-back gesture returns to step 1 with an empty field list" is a
finding. "The flow feels disjointed" is not.

## See also

- `references/usability/02-forms-and-error-recovery.md` -- validation timing, error copy, undo, data-loss prevention
- `references/usability/03-navigation-and-information-architecture.md` -- navigation models, wayfinding, back and deep-link contracts
- `references/usability/04-states-feedback-and-affordances.md` -- the complete state set, latency budgets, affordances
- `references/review/01-finding-format.md` -- the canonical finding template every flow finding uses
- `references/review/02-evidence-pipeline.md` -- evidence modes and what each one may claim
- `references/review/03-density-and-economy.md` -- copy length in front of controls, action distance
- `references/design/07-navigation-patterns.md` -- the navigation APIs themselves
- `references/patterns/03-onboarding-tipkit.md` -- first-run sequencing and TipKit
- `references/platform/09-scene-lifecycle.md` -- `scenePhase`, restoration, multi-window
- `references/platform/02-app-intents-system.md` -- intent-driven entry points
