# Navigation and Information Architecture

> Owner: `references/usability/03-navigation-and-information-architecture.md` owns the STRUCTURE question: which navigation model, how deep, how broad, where am I, how do I get back, and does the structure survive a deep link. `references/design/07-navigation-patterns.md` owns the navigation APIs and their correct usage; `references/cross-platform/01-ipados-multiplatform.md` owns the iPad sidebar and multi-window mechanics. Cite, don't restate.
> Floors: `NavigationStack` / `NavigationSplitView` iOS 16.0+, `Tab` value-based `TabView` and `.tabViewStyle(.sidebarAdaptable)` iOS 18.0+, `.tabViewBottomAccessory` iOS 26.0+, `.navigationTransition(.zoom)` iOS 18.0+, `.searchable` iOS 15.0+ (`references/_scaffolding/version-floor-registry.md`).

The navigation bar can be pixel-perfect while the structure underneath it is
unusable. This file reviews the structure. The test is not "does the tab bar look
right", it is "can a person say where they are, get back, and share where they
were".

## The Apple way

- **One navigation model per app, chosen deliberately.** Two systems competing
  for the same region (a custom bottom bar above the real tab bar, a hamburger
  drawer beside a tab bar) is the most common structural defect on iOS and it is
  always a port from another platform.
- **The navigation title is the breadcrumb.** iOS has no breadcrumb control
  because it does not need one: the title says where you are and the back button
  says where you came from. That contract only holds if titles are set, distinct,
  and match the label that got you there.
- **Push for continuation, present for interruption.** A pushed screen is deeper
  into the same thing. A sheet is a side task with its own completion.
- **Every screen is reachable by a value, not by a closure.** That is what makes
  deep links, restoration, and Handoff possible.

## 1. Navigation models

| Model | Use when | SwiftUI | Fails when |
|---|---|---|---|
| Flat, single screen | One job, no hierarchy | A `NavigationStack` with no destinations | A second job appears and gets bolted on as a sheet |
| Tabbed | 2 to 5 co-equal top-level areas, each independently useful | `TabView` with `Tab` | A 6th area arrives and lands in "More", where it is invisible |
| Hierarchical | Content nests naturally: list to detail to sub-detail | `NavigationStack(path:)` | Depth passes 3 and the user cannot get back to a known place |
| Split | iPad, Mac, and any list-plus-detail on a wide window | `NavigationSplitView` | It is shipped only for iPhone and the iPad gets a stretched phone |
| Modal-driven | A task with its own completion, entered from anywhere | `.sheet`, `.fullScreenCover` | Modals stack three deep and the user cannot tell what dismissing returns to |
| Search-first | The corpus is large and browsing is not the point | `.searchable` on the root | Search is the only path and there is no browse fallback |

**The 5-item tab limit is a structural constraint, not a style guide.** A sixth
tab does not become a sixth tab; the system collapses items into "More" and the
sixth onward become a nested list nobody visits. If the app has six top-level
areas, the information architecture is wrong, not the tab bar. Consolidate, or
move to `.sidebarAdaptable` where the platform allows a sidebar.

```swift
// iOS 18+ value-based tabs: selection is a value, so it is restorable and
// deep-linkable. The string-tag form is not.
TabView(selection: $selectedTab) {
    Tab("Today", systemImage: "calendar", value: .today) { TodayView() }
    Tab("Trends", systemImage: "chart.xyaxis.line", value: .trends) { TrendsView() }
    Tab(value: .search, role: .search) { SearchView() }   // gets the system search placement
}
.tabViewStyle(.sidebarAdaptable)   // becomes a sidebar on iPad and Mac, stays a tab bar on iPhone
```

**A tab set that changes shape has to clamp its selection.** In apps built with the iOS 27.0 and iPadOS 27.0 SDKs, `TabView` enforces that its selection resolves to a visible tab and can crash when it does not. Any app that hides tabs conditionally -- feature flags, entitlement state, `TabViewCustomization`, sign-in gating -- or restores a selection from `@SceneStorage`/`@AppStorage` must validate the restored value against the currently visible set on appear and whenever that set changes, resetting to a known-visible tab otherwise. It fires on a recompile alone, with no deployment-target bump, which makes it a CRITICAL finding for any non-static tab set.

**Segmented control or tabs is a semantics question.** A segmented control that switches which content is shown has always been announced to VoiceOver as a value picker, which misdescribes the control. From iOS 27, `.pickerStyle(.tabs)` (not watchOS) reads as tabs; `.segmented` stays correct for choosing a value. Reviewing an in-page segmented control now means asking which of the two jobs it does; below iOS 27 the manual equivalent is `.segmented` plus the `isTabBar` trait (iOS 17+) on the container.

### Push versus present: the decision table

The single most-violated iOS structural rule, and the one that most makes an app
feel non-native.

| Situation | Correct | Signal you got it wrong |
|---|---|---|
| Detail of a list item | Push | A detail in a sheet, so there is no back button and no swipe-back |
| Create a new object | Present (sheet) | A create form pushed onto a stack, so Cancel has to be hand-built and the swipe-back saves a half-object |
| Edit an existing object in place | Push, or a sheet if it is a distinct mode | Both used for the same object in different places in the same app |
| A step in the current task | Push | A sheet per step, stacking modals |
| Something the user must resolve before continuing | Alert or full-screen cover | A dismissible sheet for a blocking decision |
| A destination from a tab that is not the current tab | Switch the tab, then push | Presenting the other tab's content modally, so the tab bar lies about where the user is |

## 2. Depth and breadth

| Measure | Threshold | Severity past it |
|---|---|---|
| Push depth on the primary path | 3 | 4 MEDIUM, 5+ HIGH |
| Push depth anywhere | 4 (5 for tooling) | HIGH past it |
| Stacked modals | 1 | 2 MEDIUM, 3+ HIGH |
| Ungrouped peer items in one list | 9 | MEDIUM past it |
| Top-level areas | 5 | HIGH past it: the platform hides the surplus |
| Taps to reach the most-used screen from cold launch | 2 | MEDIUM at 3, HIGH past 3 |

Depth is measured on the real path, not the shortest theoretical one. If the
most-used screen is four pushes from launch and there is no shortcut, that is the
number, and the fix is a shortcut (a widget, a Control, an App Intent, a pinned
row), not a re-count.

## 3. Wayfinding: knowing where you are

Every screen answers "where am I" exactly once. Zero answers means lost, two
means confused.

| Signal | Rule |
|---|---|
| Navigation title | Set on every screen. A screen with no title inherits ambiguity |
| Title display mode | `.large` on a tab root, `.inline` on pushed detail. A large title three levels deep reads as a root and breaks the depth cue |
| Selected tab | Exactly one, and it matches the content |
| Back button label | Shows the parent's title. If the parent had no title, the back button says "Back", which tells the user nothing |
| Sidebar selection (iPad) | Persists and matches the detail column |

```swift
// The back button label is the parent's navigationTitle. This is why an
// untitled parent produces a useless "Back" and why titles are a wayfinding
// requirement rather than a decoration.
.navigationTitle("Workouts")
.navigationBarTitleDisplayMode(.large)     // root
// child:
.navigationTitle(workout.name)
.navigationBarTitleDisplayMode(.inline)
```

**Label drift is a finding.** The tab label, the navigation title, the section
header that led here, and the heading in the content should not be four
different words for one thing. Drift means nobody owns the vocabulary, and the
user cannot form a mental map.

## 4. Back behaviour

| Requirement | Rule |
|---|---|
| The interactive pop gesture works on every pushed screen | Breaking it is HIGH; it is the most-used navigation gesture on the platform |
| Back preserves the previous screen's state | Scroll position, selection, filter, search text |
| Back never resubmits | A pushed confirmation screen must not re-fire on return |
| Back from a detail returns to its list, at the row | Not to the top of the list |
| Sheet dismiss returns to the presenting context | Not to the root |
| The system back button is preferred over a custom one | A custom one usually kills the gesture |

```swift
// This kills the interactive pop gesture. If you must do it, restore the
// gesture deliberately; do not ship it as-is.
.navigationBarBackButtonHidden(true)
.toolbar { ToolbarItem(placement: .topBarLeading) { Button("Back") { dismiss() } } }
```

List state restoration on back is the one people forget:

```swift
// iOS 17+: scroll position is a value you own, so it survives a pop.
@State private var scrolledID: Workout.ID?
List(workouts, selection: $selection) { ... }
    .scrollPosition(id: $scrolledID)
```

## 5. Deep links and restoration survival

The structural test: **can the app be re-entered at this screen?** Three
independent mechanisms depend on the same property, so failing one usually means
failing all three.

| Mechanism | Needs |
|---|---|
| Universal link / `onOpenURL` | A route value the URL maps to |
| Scene restoration after termination | A `Codable` path persisted in `@SceneStorage` |
| Handoff / `NSUserActivity` | A route value serialisable into the activity |
| Widget, Control, Live Activity tap | A `widgetURL` or `AppIntent` that resolves to a route |
| Spotlight result | Same, plus a parent context to return to |

```swift
enum Route: Hashable, Codable {
    case workout(Workout.ID)
    case settings
    case trends(period: Period)
}

.onOpenURL { url in
    guard let route = Route(url: url) else { return }
    router.path = [route]                 // a value, so it is also restorable
}
```

| Defect | Severity |
|---|---|
| Deep link lands at the root instead of the target | HIGH |
| Deep link crashes on a deleted or inaccessible entity | CRITICAL |
| Deep link to a gated screen loses the target after sign-in | HIGH |
| Spotlight or notification lands on a detail with no route to its list | MEDIUM |
| Termination returns to root with a draft in progress | HIGH (see `references/usability/01-task-flows-and-journeys.md`) |
| A restored tab selection pointing at a tab that is no longer visible | CRITICAL on a 27.0-SDK build: `TabView` can crash rather than fall back |
| No `NSUserActivity` on the primary content screen | MEDIUM: no Handoff, no Spotlight, no Siri Suggestions |

## 6. Grouping and labelling

| Rule | Detail |
|---|---|
| Group in the user's vocabulary | Not the database's, not the team's |
| No "Misc", "Other", "More" as a group name | It means the taxonomy failed; the contents belong somewhere real |
| Section headers say what the section contains | Not what the engineer called the model |
| Labels are nouns for places, verbs for actions | A tab is a place; a toolbar button is an action |
| Alphabetical only when the user knows the name | Otherwise order by frequency or recency |
| Icon plus label on tabs | Icon-only tabs are guesses, and they fail Voice Control ("tap Trends" needs the word) |

## 7. Modals, toolbars, and small windows

| Surface | Constraint |
|---|---|
| Tab bar | 5 items; a `role: .search` tab gets the system placement; the selection must always resolve to a visible tab |
| Toolbar placement | Past 5 controls in one placement, group into a `Menu`. On iOS 27, rank what survives with `visibilityPriority(_:)` -- lowest priority overflows first -- rather than letting the system choose; `references/design/07-navigation-patterns.md` owns the API |
| Search scope bar (UIKit) | In apps built with the iOS 27.0 SDK, center search-bar placement puts the scope bar inline on the search field's own row. It reclaims a row of chrome and shortens the space each scope title gets: re-check any search UI with more than three scopes or long titles |
| Sheet detents | The primary action must be reachable at the smallest offered detent |
| iPhone SE / smallest window | Everything above must still hold at 320pt of width |
| iPad Slide Over | A compact-width window on a large device: the split view must collapse, not clip |
| Stage Manager / Mac | The window can be resized to arbitrary sizes with no notification; see `references/usability/05-adaptive-review-method.md` |
| iPhone Duo | Not a new platform: a compact-width layout on the outer display and a regular-width layout on the inner one covers every pose, and a `NavigationSplitView` collapses and expands the way it already does between size classes. Bars move to the side, so a toolbar item needs **both** a title and a symbol (the system will not present a title-only or custom-view item vertically), and items group with `ToolbarItemGroup`/`UIBarButtonItemGroup` rather than manual spacers. Keep text-only buttons to a minimum. `references/cross-platform/01-ipados-multiplatform.md` owns the layout rules |

## 8. Reviewing IA and navigation

Produce this table before writing findings. It is the artifact.

| Screen | Reached from | Model | Title set | Depth | Back preserves | Deep-linkable | Exit paths |
|---|---|---|---|---|---|---|---|

Source-only recipe:

```bash
# Every destination and how it is reached
grep -rn "navigationDestination\|NavigationLink\|\.sheet(\|\.fullScreenCover(\|Tab(" --include=*.swift .
# Screens with no title (wayfinding gap, and a useless back button for the child)
grep -rLn "navigationTitle" --include=*.swift $(grep -rln "NavigationStack\|navigationDestination" --include=*.swift .)
# Custom back buttons -- each one is a broken pop gesture until proven otherwise
grep -rn "navigationBarBackButtonHidden" --include=*.swift .
# Deep-link surface
grep -rn "onOpenURL\|widgetURL\|NSUserActivity\|onContinueUserActivity" --include=*.swift .
# Competing navigation: a custom bottom bar in an app that also has a TabView
grep -rn "TabView" --include=*.swift . && grep -rn "safeAreaInset(edge: .bottom)" --include=*.swift .
```

Driven recipe: from every tab root, push to maximum depth and swipe back at each
level; open the app's universal link in a clean install; terminate at depth 3 and
relaunch; rotate at depth 3; run it in Slide Over.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| A hamburger drawer on iPhone | Hides the whole structure behind one control; not a platform pattern | Tab bar, or `.sidebarAdaptable` |
| A custom bottom bar above the tab bar | Two navigations competing for one region | One model |
| 6+ top-level areas | The platform hides everything past 5 in "More" | Consolidate the IA |
| Detail presented as a sheet | No back button, no swipe-back, no depth cue | Push it |
| Create form pushed onto the stack | Swipe-back commits a half-created object | Present it |
| `.large` title on a level-3 screen | Reads as a root; destroys the depth cue | `.inline` past the root |
| No `navigationTitle` on a parent | Its children's back buttons say "Back" | Title every screen |
| `NavigationLink(destination:)` for a linkable screen | Not a value, so no deep link and no restoration | `navigationDestination(for:)` with a `Codable` route |
| Back returning to the top of the list | Loses the user's place in long content | `.scrollPosition(id:)` |
| Icon-only tab bar | Guessing game; breaks Voice Control | Icon and label |
| A persisted tab selection bound straight to the `TabView` | On a 27.0-SDK build it can crash when that tab is hidden | Clamp to the visible set on appear and on every change |
| A toolbar item with a title and no symbol | The system cannot present it vertically on iPhone Duo, so it drops out of the side bar | Give every toolbar item both a title and a symbol |
| "More" or "Other" as a section name | The taxonomy failed | Name the real category |

## Severity guide

| Severity | Example |
|---|---|
| CRITICAL | The user cannot reach a core area; a deep link crashes; back is impossible from a screen on the primary path |
| HIGH | Two navigation systems competing; 6+ top-level areas; the interactive pop gesture broken; a deep link landing at the root; push depth 5+; a detail with no route back to its list; the auth gate losing the deep-link target |
| MEDIUM | No title on a screen; `.large` title at depth 3; label drift between tab, title, and heading; more than 9 ungrouped peers; stacked modals two deep; back losing scroll position |
| LOW | "More" as a section name; alphabetical ordering where frequency would serve; a missing `NSUserActivity` on a secondary screen |
| NIT | Tab ordering preference |

## See also

- `references/design/07-navigation-patterns.md` -- the navigation APIs and their correct usage
- `references/usability/01-task-flows-and-journeys.md` -- entry inventory, break tests, carried state
- `references/usability/05-adaptive-review-method.md` -- window sizes, Slide Over, Stage Manager
- `references/cross-platform/01-ipados-multiplatform.md` -- sidebar, multi-window, iPad specifics
- `references/platform/09-scene-lifecycle.md` -- scene restoration, `@SceneStorage`
- `references/platform/02-app-intents-system.md` -- intent and Shortcut entry points
- `references/review/01-finding-format.md` -- the canonical finding template
