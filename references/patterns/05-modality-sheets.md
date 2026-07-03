# Modality: Sheets, Popovers, Alerts, and Confirmation Dialogs

> Owner: `references/patterns/05-modality-sheets.md` owns modal presentation -- sheets, `fullScreenCover`, popovers, alerts, `confirmationDialog` -- including detent chrome, sizing, background interaction, and dismissal ethics. Hierarchical/tab navigation lives in `references/design/07-navigation-patterns.md`.
> Floors: see `references/_scaffolding/version-floor-registry.md#ios-160` and `#ios-180` for the detent/sizing floors cited below.

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
        .presentationDetents([.bar, .medium, .large])
        .presentationDragIndicator(.visible)
}
```

| Detent | Height |
|---|---|
| `.bar` | Grabber-height, quick-glance content (mini player) |
| `.small` | Compact, above `.bar` |
| `.medium` | ~50% screen |
| `.large` | Near full screen (default) |
| `.fraction(0.3)` | Custom percentage |
| `.height(200)` | Fixed point height |

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

Use the `presenting:` form when the dialog needs the item it's acting on, instead of capturing it in outer state:

```swift
.confirmationDialog("Delete \(item.name)?", isPresented: $showDeleteConfirm, presenting: itemToDelete) { item in
    Button("Delete", role: .destructive) { delete(item) }
}
```

## Alerts

```swift
.alert("Error", isPresented: $showError) {
    Button("OK") { }
} message: {
    Text(errorMessage)
}

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

`.sheet`/`.popover`/`.alert`/`.confirmationDialog` presentation and dismissal transitions are system default and Reduce-Motion-safe with zero code -- one of the few motion surfaces the system fully owns. What you still own: a custom drag-to-dismiss gesture (like the haptic example above) carries no Reduce Motion obligation itself, since it's driven by direct manipulation, but any *programmatic* detent change you animate (`withAnimation { detent = .large }`) routes through the standard double-gate in `references/accessibility/05-motion-accessibility.md`.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `.fullScreenCover` for an ordinary create/edit form | Heavy-handed; removes the easy-exit affordance | `.sheet` with an appropriate detent |
| Custom alert view | Inconsistent chrome, no VoiceOver/Dynamic Type parity for free | `.alert()` or `.confirmationDialog()` |
| `presentationDetents` with a single option | No reason to use detents at all | Present at default size |
| `.interactiveDismissDisabled(true)` unconditionally | Roach-motel sheet if the in-sheet Cancel action is missing | Gate on real `hasChanges` state, always pair with a Cancel action |
| Haptic firing on every `DragGesture` sample | Buzzes continuously, reads as broken hardware | Fire once on a boolean state-transition edge |
| A single-detent sheet with a `selection` binding | Binding only matters with 2+ detents | Drop the binding, or add a second detent |

## Severity guide

CRITICAL: a required-data form with dismissal enabled silently discards user work. HIGH: `.fullScreenCover` used where a `.sheet` was expected, trapping the user. MEDIUM: missing `presentationDragIndicator` on a resizable sheet with no other resize affordance. LOW: haptic texture mismatch (e.g. `.selection` instead of `.impact` on a drag threshold).

## See also

- `references/design/07-navigation-patterns.md#deep-linking` -- hierarchical/tab navigation that these modals interrupt
- `references/haptics/02-swiftui-sensory-feedback.md` -- the full `.impact`/`.sensoryFeedback` contract
- `references/accessibility/05-motion-accessibility.md` -- the Reduce Motion double-gate for any modal content you animate yourself
- `~/Claude/vault/iOS Development/06 - SwiftUI Fundamentals.md#navigation` -- deep source
