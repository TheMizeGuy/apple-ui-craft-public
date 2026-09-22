# Modality: Sheets, Popovers, Alerts, and Confirmation Dialogs

> Owner: `references/patterns/05-modality-sheets.md` owns modal presentation -- sheets, `fullScreenCover`, popovers, alerts, `confirmationDialog` -- including detent chrome, sizing, placement, background interaction, and dismissal ethics. Hierarchical/tab navigation lives in `references/design/07-navigation-patterns.md`.
> Floors: see `references/_scaffolding/version-floor-registry.md#ios-160` and `#ios-180` for the detent/sizing floors cited below; `presentationPlacement(_:)`, `NavigationTransition.crossFade` and `dismissalConfirmationDialog(_:shouldPresent:actions:)` are iOS 27.0 (`references/_scaffolding/version-floor-registry.md`).

Modal presentation interrupts the user's current context to ask something or show something transient. Picking the wrong modal -- a sheet where an alert belongs, a `fullScreenCover` where a sheet would do -- is one of the most common HIG violations in shipping apps, and getting detent or dismissal chrome wrong is the fastest way to make an otherwise-native screen feel amateur.

## The decision

| Need | Use | Why |
|---|---|---|
| Create/edit form, browse a related list | `.sheet` | Dismissible, keeps context underneath |
| Required first-run flow, an immersive/blocking task | `.fullScreenCover` | Blocks return to prior context until explicitly dismissed |
| Supplementary info anchored to a control (iPad-friendly) | `.popover` | Non-modal on regular width; falls back to sheet-like presentation in compact width |
| Confirm a destructive or significant action | `.confirmationDialog` | Action-oriented, supports multiple buttons |
| Critical info requiring acknowledgment, or short text input | `.alert` | Blocking, minimal, unmissable |
| Quick choice from a short list, non-destructive | `.confirmationDialog` or `Menu` | `confirmationDialog` for action lists tied to one trigger; `Menu` for a persistent control |

```swift
// Sheet: create/edit, keeps context
.sheet(isPresented: $showCreateSheet) {
    NavigationStack { CreateView() }
}

// fullScreenCover: blocking first-run or immersive step
.fullScreenCover(isPresented: $showOnboarding) {
    OnboardingFlow()
}
```

Reach for `.fullScreenCover` only when the content is genuinely immersive or a required blocking step. Using it for an ordinary create/edit form is the single most common modality misuse -- it removes the "back out easily" affordance a sheet gives for free.

## Sheets

```swift
@State private var showCreateSheet = false

Button("Create") { showCreateSheet = true }
    .sheet(isPresented: $showCreateSheet) {
        NavigationStack { CreateView() }
    }

// Item-driven
@State private var editingItem: Item?

ItemRow(item: item)
    .onTapGesture { editingItem = item }
    .sheet(item: $editingItem) { item in EditView(item: item) }
```

### Detents (iOS 16+)

```swift
.sheet(isPresented: $showSheet) {
    SheetContent()
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
}
```

| Detent | Height |
|---|---|
| `.medium` | ~50% screen |
| `.large` | Near full screen (default) |
| `.fraction(0.3)` | Custom percentage |
| `.height(200)` | Fixed point height |

`.bar` and `.small` in Apple's sample are developer-defined, not built-ins: `extension PresentationDetent { static let bar = Self.custom(BarDetent.self); static let small = Self.height(100) }` with a `CustomPresentationDetent` whose `height(in:)` returns `max(44, context.maxDetentValue * 0.1)`.

For programmatic control, bind a selection:

```swift
@State private var detent: PresentationDetent = .medium

FilterControls(onExpand: { detent = .large })
    .presentationDetents([.medium, .large], selection: $detent)
```

`selection` must be one of the values in the `detents` set or SwiftUI ignores it. The binding updates on *settle*, not continuously mid-drag -- don't hang scrub-style effects off it.

### Scroll-vs-resize handoff

The single most common "this sheet fights me" bug: a `ScrollView` inside a resizable sheet, where a swipe resizes the sheet instead of scrolling content.

```swift
ThreadView()
    .presentationDetents([.medium, .large])
    .presentationContentInteraction(.scrolls)   // iOS 16.4+; swipe scrolls first, resize only at the grabber
```

`.scrolls` for reading-first sheets (comments, chat, articles); `.resizes` (default) for a control sheet that happens to overflow; `.automatic` grows to the next detent before scrolling -- correct for a short Maps-style card, wrong for a long list.

### presentationSizing (iOS 18+)

Detents govern iPhone bottom sheets; on regular-width iPad/Mac a sheet is a centered card, and `presentationSizing` controls its footprint independent of detents:

```swift
.presentationSizing(
    .page
        .fitted(horizontal: false, vertical: true)   // hug content height, full page width
        .sticky(horizontal: false, vertical: true))   // don't jitter-resize on small content changes
```

`.automatic`, `.form` (narrower, for forms/settings), `.page` (a sheet of paper), `.fitted` (content-driven sizing) are the base values; `.fitted(...)`/`.sticky(...)` refine an individual axis.

### Background interaction

By default a sheet is fully modal -- the dimmed backdrop eats taps. A Maps/Now-Playing-style sheet that stays non-blocking at small heights needs `presentationBackgroundInteraction`:

```swift
MapOverlaySheet()
    .presentationDetents([.height(120), .medium, .large])
    .presentationBackgroundInteraction(.enabled(upThrough: .height(120)))
```

`.enabled(upThrough:)` keeps the background live while the sheet rests at or below that detent, then disables passthrough once the user drags past it. Pair with `.presentationBackground(.thinMaterial)`; on iOS 26 the sheet already floats on Liquid Glass, so avoid stacking a second opaque background over it.

### Chrome

```swift
SheetContent()
    .presentationBackground(.thinMaterial)   // translucent blur instead of opaque system background
    .presentationCornerRadius(20)            // nil restores the system default
    .presentationCompactAdaptation(.none)    // keep the specified style even in compact width
```

Control sizing no longer leaks into a sheet. In apps built with the 27.0 SDKs, `controlSize`, `buttonSizing`, `buttonRepeatBehavior`, `menuIndicatorVisibility` and `ButtonBorderShape` reset to their defaults inside sheets and popovers. That is the right model -- presented content is its own environment -- but it silently reverts any design that set one of those once at the root and relied on the sheet inheriting it. Apply them inside the sheet's own content, which also works correctly below iOS 27.

### Placement (iOS 27)

Sheets stopped being bottom-anchored-only. `presentationPlacement(_:)` (iOS 27.0+; the modifier and `.automatic` on every platform, the explicit `.center`/`.leading`/`.trailing` cases on iOS/iPadOS/Mac Catalyst only) positions the sheet within the presenting view; sheets are the only presentation that respects it:

```swift
.sheet(isPresented: $showInspectorSheet) {
    if #available(iOS 27, *) {
        InspectorSheet()
            .presentationPlacement(.trailing)   // .automatic / .center / .leading / .trailing
            .presentationDetents([.large])
    } else {
        InspectorSheet()
            .presentationDetents([.large])      // pre-27: the system owns placement
    }
}
```

The UIKit counterpart is `UISheetPresentationController.preferredPlacement` with `UISheetPresentationController.Placement` (iOS 27.0+, no macOS/tvOS/watchOS). Below iOS 27 there is no API-level control, so the fallback branch is the same sheet with the modifier dropped. An app whose deployment target is iOS 27 drops the branch entirely.

Placement is a layout decision, not a cosmetic one, because the sheet's toolbar orientation follows from it. On the iPhone Duo inner display the system presents a sheet's toolbar horizontally for `.center` and `.leading` placements and vertically for `.trailing`; on the outer display it presents sheet bars vertically by default. Inspectors never get vertical bars, and in a split view the detail's bars go vertical while the sidebar's stay horizontal. If a sheet's bars are not adapting at all, the cause is almost always a hand-rolled bar: vertical presentation only reaches a `toolbar(content:)` attached to a `NavigationStack` or `NavigationSplitView`, never a custom `UIToolbar`/`UINavigationBar` stand-in. That is the concrete argument against custom chrome. `references/cross-platform/01-ipados-multiplatform.md` owns the Duo layout rules themselves.

### Cross-fade presentation (iOS 27)

`NavigationTransition.crossFade` fades a sheet in over the presenting content instead of sliding it up:

```swift
.sheet(isPresented: $showViewer) {
    if #available(iOS 27, *) {
        MediaViewer().navigationTransition(.crossFade)   // iOS 27.0+; not macOS
    } else {
        MediaViewer()                                     // the default sheet transition
    }
}
```

A third option beside the default slide and the iOS 18 `.zoom` matched-geometry transition. Reach for it when there is no source element to zoom from and a slide would imply a hierarchy the flow does not have -- a full-bleed media viewer, an interstitial. It exists on every 27 platform except macOS, so a modifier shared with a Mac target needs a platform branch as well as the availability one; below iOS 27 the fallback is the default sheet transition, shown above. One open bug to know: a `fullScreenCover` combining `.navigationTransition(_:)` with a `@FocusState` set in `.onAppear` gets a two-step keyboard animation.

### UIKit presentation traits (built with the 27.0 SDK)

In apps built with the iOS 27.0 SDK, a presented view controller inherits its trait collection by walking up its view's superview chain through the presentation's intermediate views, instead of jumping straight to the presentation controller. A custom `UIPresentationController` that injected an overridden size class or interface style into its presented content can now be bypassed by an intermediate view -- in a SwiftUI app, that means a `UIHostingController` presented through custom presentation can receive the real hierarchy's size class and flip its adaptive layout on first present. Set the override on a view in the presentation's superview chain rather than on the presentation controller.

## Drag-to-dismiss and interactiveDismissDisabled ethics

Swipe-down-to-dismiss and tap-outside-to-dismiss are free on `.sheet`. That is exactly the problem for a form with unsaved edits:

```swift
struct EditItemSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var draft: Item
    @State private var showDiscardConfirm = false

    private var hasChanges: Bool { draft != original }

    var body: some View {
        NavigationStack {
            Form { /* ... */ }
                .interactiveDismissDisabled(hasChanges)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            hasChanges ? (showDiscardConfirm = true) : dismiss()
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { save(); dismiss() }
                    }
                }
        }
        .confirmationDialog("Discard changes?", isPresented: $showDiscardConfirm) {
            Button("Discard", role: .destructive) { dismiss() }
        }
    }
}
```

On iPad the sheet is not the only thing that can disappear out from under unsaved work -- the window can close. `dismissalConfirmationDialog(_:shouldPresent:actions:)` (iOS 27.0+, iOS/iPadOS/Catalyst; macOS 15.0) is the sanctioned guard for that, and it is a different hook from `interactiveDismissDisabled`:

```swift
var body: some View {
    let form = Form { /* … */ }
        .interactiveDismissDisabled(hasChanges)             // the swipe-down gesture

    if #available(iOS 27, *) {
        form.dismissalConfirmationDialog(
            "Discard this draft?", shouldPresent: hasChanges // window closure
        ) {
            Button("Discard", role: .destructive) { discard() }
        }
    } else {
        form                                                 // pre-27: the swipe guard is the whole guard
    }
}
```

A form holding unsaved work needs both: `interactiveDismissDisabled` covers the drag, `dismissalConfirmationDialog` covers the close. Below iOS 27 there is no iOS window-close hook, which is why the fallback branch is bare -- and why a long or costly form should autosave a draft rather than rely on either dialog.

`interactiveDismissDisabled(_:)` (iOS 15+) takes a `Bool` -- pass `true` only while there IS something to lose, computed from real state (`hasChanges`), never hardcoded `true`. Disabling dismissal unconditionally turns the sheet into a roach motel: no swipe, no tap-outside, and an in-sheet Cancel action becomes MANDATORY since the user's only other way out is gone. Use `.cancellationAction`/`.confirmationAction` toolbar placements, not `.topBarLeading`/`.topBarTrailing` -- they position and style Cancel/Save per-platform and mark Save as the bold default action. Read `@Environment(\.dismiss)` from the child instead of passing an `isPresented` binding down; it works identically whether the child was presented as a sheet or pushed.

## Haptic conventions

Fire a haptic once on a state transition, never on every drag sample:

```swift
@State private var willDismiss = false   // crosses true once past the commit line

sheet
    .gesture(DragGesture()
        .onChanged { v in willDismiss = v.translation.height > 120 }
        .onEnded { v in if willDismiss { dismiss() } })
    .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.7), trigger: willDismiss)
```

`.impact(flexibility: .soft)` is the right texture for a rubber-band threshold crossing (a drag committing to dismiss); `.selection` for a picker/detent snap between fixed stops; `.impact(flexibility: .rigid)` for a hard mechanical detent. Never `.success`/`.warning` for a continuous gesture -- those are notification haptics and read as system alerts, not touch feedback. See `references/haptics/02-swiftui-sensory-feedback.md` for the full `.impact`/`.sensoryFeedback` contract this file only samples.

## Confirmation dialogs

```swift
Button("Delete", role: .destructive) { showDeleteConfirm = true }
    .confirmationDialog("Delete this item?", isPresented: $showDeleteConfirm) {
        Button("Delete", role: .destructive) { delete() }
        Button("Cancel", role: .cancel) { }
    } message: {
        Text("This cannot be undone.")
    }
```

When the dialog acts on a specific item, drive it from the item itself rather than a parallel `Bool`:

```swift
@State private var pendingDeletion: Item?

listContent
    .confirmationDialog(Text("Delete this item?"), item: $pendingDeletion) { item in
        Button("Delete \(item.name)", role: .destructive) { delete(item) }
    }
```

## Alerts

**Drive an alert from the thing it is about, not from a `Bool` beside it.** Xcode 27 ships item- and error-driven `alert` and `confirmationDialog` modifiers, and they back-deploy in full: they run on iOS 15 / macOS 12 / tvOS 15 / watchOS 8 / visionOS 1 and later. The requirement is Xcode 27, not a deployment target -- there is no `#available` gate here:

```swift
// Error-driven: one optional, no Bool to drift out of sync with it
@State private var loadError: AppError?          // AppError: LocalizedError

content
    .alert(error: $loadError) {
        Button("Try Again") { Task { await reload() } }
        Button("Cancel", role: .cancel) { }
    }

// Item-driven: the alert body receives the value, so it can never render stale
@State private var conflict: SyncConflict?

content
    .alert(Text("Version Conflict"), item: $conflict) { conflict in
        Button("Keep Mine") { resolve(conflict, .local) }
        Button("Keep Theirs") { resolve(conflict, .remote) }
    }
```

Binding the alert to the payload kills a whole bug class: the `@State var showError = false` plus `@State var error: MyError?` pair that shows an alert with empty or stale text when one is set and the other is not. `alert(error:)` also forces the error type to conform to `LocalizedError`, so `errorDescription` and `recoverySuggestion` become real sentences instead of a Swift type dump. The argument label is `item` (`item data: Binding<T?>` in the declaration). `confirmationDialog` also carries `titleVisibility: Visibility = .automatic`. Only `alert(_:item:actions:message:)` takes a `LocalizedStringKey` title; `alert(_:item:actions:)` and both `confirmationDialog(_:item:...)` overloads take a `Text`, and the `alert(error:...)` forms take no title at all.

Only if the project must still build with Xcode 26 or earlier does the `isPresented` Bool plus a separate optional payload remain the shape to write.

An alert with no payload keeps `isPresented` permanently -- there is no item to bind to:

```swift
// Text input (iOS 16+)
.alert("Rename", isPresented: $showRename) {
    TextField("Name", text: $newName)
    Button("Save") { rename() }
    Button("Cancel", role: .cancel) { }
}
```

## Popovers

```swift
.popover(isPresented: $showInfo) {
    InfoView()
        .frame(width: 300, height: 200)
        .presentationCompactAdaptation(.popover)  // Force popover even on iPhone
}
```

Popovers are iPad's non-modal answer to a sheet -- they point at the control that triggered them and dismiss on an outside tap without a full-screen block. On iPhone compact width they collapse to a sheet-like presentation by default; force popover behavior with `.presentationCompactAdaptation(.popover)` only when the anchored-arrow affordance matters more than following iPhone convention.

## Accessibility contract

`.sheet`/`.popover`/`.alert`/`.confirmationDialog` presentation and dismissal transitions are system-owned: the system applies its own Motion settings to them, and your code neither can nor needs to gate them. Do not describe them as crossfading under bare Reduce Motion -- `references/accessibility/05-motion-accessibility.md` owns that fact, and the crossfade preference is `accessibilityPrefersCrossFadeTransitions` (iOS 26.4+). What you still own: a custom drag-to-dismiss gesture (like the haptic example above) carries no Reduce Motion obligation itself, since it's driven by direct manipulation, but any *programmatic* detent change you animate (`withAnimation { detent = .large }`) routes through the standard double-gate in `references/accessibility/05-motion-accessibility.md`.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `.fullScreenCover` for an ordinary create/edit form | Heavy-handed; removes the easy-exit affordance | `.sheet` with an appropriate detent |
| Custom alert view | Inconsistent chrome, no VoiceOver/Dynamic Type parity for free | `.alert()` or `.confirmationDialog()` |
| `presentationDetents` with a single option | No reason to use detents at all | Present at default size |
| `.interactiveDismissDisabled(true)` unconditionally | Roach-motel sheet if the in-sheet Cancel action is missing | Gate on real `hasChanges` state, always pair with a Cancel action |
| Haptic firing on every `DragGesture` sample | Buzzes continuously, reads as broken hardware | Fire once on a boolean state-transition edge |
| A single-detent sheet with a `selection` binding | Binding only matters with 2+ detents | Drop the binding, or add a second detent |
| `@State var showAlert = false` beside `@State var error: E?` | The two drift; the alert shows stale or empty text | One binding: `alert(error:)` or `alert(_:item:)` (Xcode 27, runs back to iOS 15) |
| Unsaved-work sheet guarded only by `interactiveDismissDisabled` | Covers the swipe, not an iPad window closing | Add `dismissalConfirmationDialog(_:shouldPresent:actions:)` on iOS 27 |
| Root-level `controlSize`/`ButtonBorderShape` styling a sheet's controls | Resets to default inside sheets and popovers in 27.0-SDK builds | Apply inside the sheet's own content |
| A hand-rolled `UIToolbar`/`UINavigationBar` stand-in on a sheet | The system never presents custom chrome vertically on iPhone Duo | `toolbar(content:)` on a `NavigationStack`/`NavigationSplitView` |

## Severity guide

CRITICAL: a required-data form with dismissal enabled silently discards user work. HIGH: `.fullScreenCover` used where a `.sheet` was expected, trapping the user. MEDIUM: missing `presentationDragIndicator` on a resizable sheet with no other resize affordance. LOW: haptic texture mismatch (e.g. `.selection` instead of `.impact` on a drag threshold).

## See also

- `references/design/07-navigation-patterns.md#deep-linking` -- hierarchical/tab navigation that these modals interrupt
- `references/animation/04-transitions-geometry.md#transitions` -- how `.crossFade` sits beside `.zoom` and the custom-transition toolbox
- `references/cross-platform/01-ipados-multiplatform.md` -- the iPhone Duo layout rules a sheet's placement feeds into
- `references/haptics/02-swiftui-sensory-feedback.md` -- the full `.impact`/`.sensoryFeedback` contract
- `references/accessibility/05-motion-accessibility.md` -- the Reduce Motion double-gate for any modal content you animate yourself
