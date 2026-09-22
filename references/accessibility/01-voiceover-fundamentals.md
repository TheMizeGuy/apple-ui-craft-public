# VoiceOver Fundamentals

VoiceOver is the screen reader built into iOS. It reads UI elements aloud and lets users navigate by swiping. Every interactive element must have a meaningful label, every decorative image must be hidden, and reading order must match visual logic.

## How VoiceOver works

A user enables VoiceOver in Settings > Accessibility > VoiceOver (or triple-click side button if configured). Then:

| Gesture | Action |
|---|---|
| Single tap | Select element (read aloud) |
| Single tap on selected | Re-read element |
| Swipe right/left | Move to next/previous element |
| Double tap | Activate selected element |
| Two-finger swipe up | Read all from top |
| Two-finger tap | Pause/resume reading |
| Three-finger swipe | Scroll page |
| Rotor (twist 2 fingers) | Switch between navigation modes (links, headings, etc.) |

## Accessibility labels

Every interactive element must have a meaningful label. SwiftUI provides automatic labels for many controls:

```swift
// Auto-labeled (no explicit label needed)
Button("Save") { }                           // VoiceOver reads: "Save, button"
Toggle("Notifications", isOn: $notif)        // "Notifications, switch button, off"
TextField("Email", text: $email)             // "Email, text field"
Label("Profile", systemImage: "person")      // "Profile"

// Needs explicit label
Image(systemName: "gearshape")
    .accessibilityLabel("Settings")
    // Without label: "icon"
    // With label: "Settings"

Image("logo")
    .accessibilityLabel("Acme Company logo")

Circle()
    .fill(.green)
    .accessibilityLabel("Online")
```

### The modern spelling

`accessibilityLabel(_:)` and its siblings -- `accessibilityValue`, `accessibilityHint`, `accessibilityIdentifier`, `accessibilityHidden`, `accessibilityAddTraits`, `accessibilityRemoveTraits`, `accessibilityInputLabels`, `accessibilitySortPriority`, `accessibilityActivationPoint` -- are the only spellings to write. The iOS 13-era `accessibility(label:)` / `accessibility(hint:)` / `accessibility(addTraits:)` family is soft-deprecated: Apple's documentation marks it deprecated and points at the modern spelling, with no compiler break today (`accessibility(selectionIdentifier:)` is the one member not marked). The replacements have back-deployed to iOS 14 since 2020, so no deployment target justifies the old form, and the fix is a rename with no behavior change.

### Label composition

For complex elements, combine information into a single readable label:

```swift
HStack {
    Image(systemName: "heart.fill")
        .foregroundStyle(.red)
    Text("3,247")
    Text("likes")
        .foregroundStyle(.secondary)
}
.accessibilityElement(children: .combine)
.accessibilityLabel("3,247 likes")
```

### Hidden labels

Decorative elements should be hidden from VoiceOver:

```swift
HStack {
    Image(systemName: "envelope.fill")
        .accessibilityHidden(true)  // Skip
    Text("Mail")
}
// VoiceOver reads: "Mail" only
```

### Long-form content

For Image with informative content (chart, photo with meaningful subject):

```swift
Image("chart-q4")
    .accessibilityLabel("Q4 sales")
    .accessibilityValue("$1.2 million, up 15% from Q3")
```

### Naming: the three tests

A label is a name, and a bad name fails twice -- once out of context for VoiceOver, once in translation. WWDC26's "Craft clear names for features and labels in your app" gives three tests a control name has to pass: it **belongs** (fits the interface language the rest of the app already speaks), it **sets expectations** (predicts what the user will get, in neutral industry-standard terms), and it **works everywhere** (survives translation and reads correctly on every platform you ship). Say a candidate inside a natural sentence to test it: "Turn on Enhance Dialogue" works; "Turn on Vocal Isolation" does not. Invented and metaphor-heavy names are the ones that read as nonsense when VoiceOver speaks them with no surrounding UI.

### System-generated descriptions are not your labels

iOS 27 ships Image Explorer, which gives VoiceOver and Magnifier users an Apple Intelligence description of any image system-wide, and Live Recognition, which answers a VoiceOver user's questions about the camera viewfinder. Neither is a developer API, and neither discharges the obligation above. A generated description carries no product knowledge -- it cannot know the chart is Q4 revenue or that the avatar is the message sender -- so an authored `accessibilityLabel` still wins, and a decorative image still gets `.accessibilityHidden(true)` rather than being left for the system to narrate.

## Accessibility traits

Traits tell VoiceOver how to describe and interact with an element.

```swift
Text("Welcome")
    .accessibilityAddTraits(.isHeader)      // "Welcome, heading"

VStack {
    // Custom card with tap gesture
}
.onTapGesture { ... }
.accessibilityAddTraits(.isButton)          // VoiceOver treats as button
.accessibilityLabel("View details")

Text("Updates every minute")
    .accessibilityAddTraits(.updatesFrequently)  // VoiceOver reads less aggressively

Text("Selected")
    .accessibilityAddTraits(.isSelected)    // "Selected, ..."
```

### Common traits

| Trait | Meaning |
|---|---|
| `.isButton` | Tappable element acting as button |
| `.isHeader` | Section heading |
| `.isLink` | Hyperlink |
| `.isSelected` | Currently selected (in a list/picker) |
| `.isImage` | Image element |
| `.playsSound` | Element plays sound when activated |
| `.isSearchField` | Search input |
| `.isModal` | Modal context (sheet, alert) |
| `.updatesFrequently` | Live data; suppress aggressive re-reading |
| `.causesPageTurn` | Activating navigates away |
| `.isToggle` | Toggle/switch |
| `.allowsDirectInteraction` | Pass-through for custom gestures |

**iOS 27.0 added no accessibility traits, modifiers or environment values.** Symbols that WWDC26 sessions made look new are older than they sound: `.causesPageTurn` is iOS 13, `.isTabBar` and `.isToggle` are iOS 17, `accessibilityLinkedGroup(id:in:)` is iOS 14. The only genuinely new iOS 27.0 accessibility symbols in the whole SDK are `AXSpeechAttributeSSML` and the three `AccessibilitySettings` application-accessibility members, both covered below, plus `MACaptionAppearanceDomain.videoConferencing` and AVKit's `AVPlaybackUserInterfaceMediaSelectionControllable` (`references/accessibility/07-cognitive-hearing-assistive.md`). An iOS-27-sounding SwiftUI or UIKit accessibility MODIFIER, TRAIT or ENVIRONMENT VALUE is a hallucination -- 27.0 added none. The right iOS 27 answer in this domain is almost always an iOS 13-18 API nobody wired up.

### Removing traits

```swift
Button("Custom") { }
    .accessibilityRemoveTraits(.isButton)  // Override default button trait
    .accessibilityAddTraits(.isLink)       // Add different trait
```

## A segmented picker used for navigation: `.pickerStyle(.tabs)`

A `Picker` that switches which content is shown is not choosing a value, but `.segmented` has always announced it as one -- VoiceOver tells the user they are setting a value when they are navigating. iOS 27 adds `TabsPickerStyle` for exactly this case: the same interaction, but VoiceOver reads it as tabs, and on macOS it is visually distinct from a picker that selects a value.

```swift
enum Scope: String, CaseIterable { case all, unread, flagged
    var label: String { rawValue.capitalized }
}
@State private var scope: Scope = .all

private var scopePicker: some View {
    Picker("Scope", selection: $scope) {
        ForEach(Scope.allCases, id: \.self) { Text($0.label).tag($0) }
    }
}

@ViewBuilder private var scopeControl: some View {
    if #available(iOS 27, *) {
        scopePicker.pickerStyle(.tabs)           // iOS 27.0+ (not watchOS)
    } else {
        scopePicker.pickerStyle(.segmented)      // iOS 26 fallback: supply the semantics by hand
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isTabBar)   // iOS 17+
    }
}
```

An iOS-27-minimum target drops the `else` branch; this is the general shape for every iOS 27 API in this library. Keep `.segmented` for what it is for -- choosing a value the surrounding content then reflects, like a sort order or a chart range.

## Reading order

VoiceOver reads elements in their natural top-to-bottom, leading-to-trailing order. When this isn't right, override:

```swift
ZStack {
    Text("Visually overlaid").accessibilitySortPriority(2)  // Read first (higher)
    Text("Below").accessibilitySortPriority(1)               // Read second
}
```

Higher `sortPriority` = earlier in reading order.

## Element grouping

Combine related elements so VoiceOver reads them as one:

```swift
VStack(alignment: .leading) {
    Text("John Doe")
        .font(.headline)
    Text("john@example.com")
        .font(.subheadline)
    Text("Last seen: 2 hours ago")
        .font(.caption)
        .foregroundStyle(.secondary)
}
.accessibilityElement(children: .combine)
.accessibilityLabel("John Doe, john@example.com, last seen 2 hours ago")
.accessibilityAddTraits(.isButton)  // If row is tappable
```

`children:` options:

| Value | Behavior |
|---|---|
| `.ignore` | Treat as one element, ignore children's labels |
| `.combine` | Treat as one element, combine children's labels |
| `.contain` | Treat as a container; children remain individually navigable |

## Custom actions

Expose alternative ways to perform actions (especially for swipe actions):

```swift
ItemRow(item: item)
    .swipeActions(edge: .trailing) {
        Button("Delete", role: .destructive) { delete(item) }
        Button("Archive") { archive(item) }
    }
    .accessibilityAction(named: "Delete") { delete(item) }
    .accessibilityAction(named: "Archive") { archive(item) }
```

Now VoiceOver users can perform these actions without needing to swipe.

### Default action

```swift
.accessibilityAction {
    // Triggered by double-tap on selected element
    primaryAction()
}
```

### Magic Tap

```swift
.accessibilityAction(.magicTap) {
    // Triggered by two-finger double-tap (e.g., play/pause music)
    togglePlayback()
}
```

### Escape

```swift
.accessibilityAction(.escape) {
    // Triggered by two-finger Z gesture (dismiss modal)
    dismiss()
}
```

## Custom rotor entries

The rotor is VoiceOver's secondary navigation mode (twist with two fingers). Add custom rotor entries for content types users want to jump between. Two forms exist; reach for the array form first -- it needs no `@Namespace`.

### Array form (default choice)

```swift
List {
    ForEach(articles) { article in
        ArticleRow(article: article)
    }
}
.accessibilityRotor("Headlines", entries: articles, entryID: \.id, entryLabel: \.title)
```

`accessibilityRotor(_:entries:entryID:entryLabel:)` builds the rotor directly from the same array driving the `List` -- no namespace, no per-row modifier.

### Namespace form (when entries aren't a flat array driving the view)

```swift
@Namespace private var namespace

List {
    ForEach(articles) { article in
        ArticleRow(article: article)
            .accessibilityRotorEntry(id: article.id, in: namespace)
    }
}
.accessibilityRotor("Headlines") {
    ForEach(articles) { article in
        AccessibilityRotorEntry(article.title, id: article.id, in: namespace)
    }
}
```

Both compile and both produce the same user-facing rotor. User can twist rotor to "Headlines" and swipe to jump between article titles.

## Long-form reading surfaces

A page of prose built from separate `Text` views reads to VoiceOver as disconnected islands: read-all stops at every paragraph and there is no line, word, or character navigation at all. WWDC26's "Enhance the accessibility of your reading app" sets three goals for any reading surface -- granular text navigation, uninterrupted continuous reading across elements and pages, and discoverable text selection -- and every mechanism is an older API most apps never wired up.

| Goal | Mechanism |
|---|---|
| Granular navigation (line / word / character) | Use a view that adopts `UITextInput`: `TextEditor`, a selectable `Text`, `UITextView`, `NSTextView`. Free there, absent from custom-rendered text |
| Continuous read across separate elements | `accessibilityLinkedGroup(id:in:)` (iOS 14+) in SwiftUI; `accessibilityNextTextNavigationElement` / `accessibilityPreviousTextNavigationElement` (iOS 18+) in UIKit |
| Automatic page turn during read-all | `.accessibilityAddTraits(.causesPageTurn)` (iOS 13+) on the last element of the page |
| Editing actions on VoiceOver's edit rotor | `UIAccessibilityCustomAction.category = UIAccessibilityCustomAction.editCategory` (iOS 18+) |

```swift
@Namespace private var page

ScrollView {
    LazyVStack(alignment: .leading, spacing: 16) {
        ForEach(chapter.paragraphs) { paragraph in
            Text(paragraph.text)
                .textSelection(.enabled)
                .accessibilityLinkedGroup(id: chapter.id, in: page)   // iOS 14+, not an iOS 27 API
        }
    }
}
```

`.textSelection(.enabled)` changed underneath you in iOS 27: in an app built with the iOS 27.0 SDK, a selectable `Text` supports interactive selection through the system text-selection UI, where it previously offered selection only through a callout menu (it also gained `TextRenderer` support in the same release). Selection becomes discoverable, and the `Text` now carries system gestures -- a custom tap or drag attached to a selectable `Text` contends with them, so attach it with `.highPriorityGesture(_:)` when yours must win.

Genuinely custom-rendered text -- a scanned page, handwriting, a bespoke layout engine -- gets none of this and has to adopt `UITextInput` in full (`selectionRects(for:)`, `text(in:)`, `tokenizer`, `selectedTextRange`) plus `UITextInteraction` for visible handles.

## Values for non-obvious state

Provide values for elements where the visual conveys state:

```swift
StarRatingView(rating: 4)
    .accessibilityLabel("Restaurant rating")
    .accessibilityValue("4 of 5 stars")

ProgressView(value: 0.7)
    .accessibilityLabel("Upload progress")
    .accessibilityValue("70 percent")

Slider(value: $volume)
    .accessibilityLabel("Volume")
    .accessibilityValue("\(Int(volume * 100)) percent")
```

## Custom controls: purpose, value, actions, feedback

WWDC26's "Refine accessibility for custom controls" frames every hand-built control against four questions. A label-only check answers one of the four:

| Question | Answered by |
|---|---|
| Purpose -- what is it? | `accessibilityLabel` |
| Value -- what is it set to? | `accessibilityValue` |
| Actions -- how do I change it? | `accessibilityAdjustableAction { }` for an incrementable value (UIKit: the `.adjustable` trait plus `accessibilityIncrement()`/`accessibilityDecrement()`), or named `accessibilityAction(named:)` entries |
| Feedback -- what happened? | `AccessibilityNotification.Announcement(_:).post()` (iOS 17+) when the change is not announced by anything else |

Two failures survive a label audit and are worth naming:

- **An adjustable control whose activation point never moves.** VoiceOver's double-tap lands wherever `accessibilityActivationPoint(_:)` says it does. On a custom slider or dial, that point has to track the current value, or the double-tap hits the wrong part of the track.
- **An announcement storm during a drag.** Post only when the value actually changed, and throttle to one announcement per settled value -- not one per gesture update.

A direct-touch surface (a drawing canvas, a drum pad) declares itself with `accessibilityDirectTouch(_:options:)` (iOS 17+): `.requiresActivation` when VoiceOver should activate the element before touches pass through, `.silentOnTouch` when the app supplies its own audio.

## Speech control with SSML (iOS 27)

`AXSpeechAttributeSSML` annotates a range of an accessibility attributed string with a W3C SSML 1.1 fragment. The assistive technology derives the SPOKEN form of that range from the fragment; the visible text and the Braille rendering are untouched. That is what makes it the only correct fix for a mispronounced word -- the long-standing hack of misspelling a brand name inside `accessibilityLabel` so VoiceOver says it right corrupts Braille output and Voice Control matching at the same time.

```swift
import Accessibility

// iOS 27.0+, every platform. The fragment governs the annotated range only.
let label = NSMutableAttributedString(string: "Open the SQL console")
label.addAttribute(
    .AXSpeechAttributeSSML,
    value: "<sub alias=\"sequel\">SQL</sub>",   // an SSML fragment scoped to the range: no <speak> wrapper
    range: (label.string as NSString).range(of: "SQL"))
consoleButton.accessibilityAttributedLabel = label   // any UIKit view or accessibility element
```

It applies to every accessibility attributed-string field -- `accessibilityAttributedLabel`, `accessibilityAttributedValue`, `accessibilityAttributedHint`, attributed announcement strings -- and takes precedence over the older single-purpose speech attributes on the ranges it covers. One fragment replaces the whole stack: pronunciation, inline language switching, pacing, emphasis, say-as interpretation. A malformed fragment is ignored and the underlying string is spoken normally, so a typo degrades rather than breaks. SwiftUI's `accessibilityLabel(_:)` takes `Text`, not an attributed string, so the fragment attaches on the attributed surface -- a UIKit-backed view, `AXCustomContent(attributedLabel:attributedValue:)` (iOS 14+), or an attributed announcement.

Below iOS 27 there is no back-deployed SSML path. Use the single-purpose speech attributes, which is what SwiftUI exposes as modifiers:

```swift
Text(orderCode).speechSpellsOutCharacters()        // iOS 15+ -- "A 1 1 8 3", not "A1183"
Text(expression).speechAlwaysIncludesPunctuation() // iOS 15+
// Attributed-string equivalents: accessibilitySpeechIPANotation,
// accessibilitySpeechLanguage, accessibilitySpeechPunctuation.
```

## Hint text

Hints provide additional context. Read after a delay if user pauses on element:

```swift
Button("Delete") { }
    .accessibilityHint("Permanently removes this item")
```

Use sparingly. Most controls are self-explanatory; hints add cognitive load.

## Accessibility actions for swipe

Always expose swipe actions as accessibility actions:

```swift
ItemRow(item: item)
    .swipeActions {
        Button("Delete") { delete() }
        Button("Edit") { edit() }
    }
    .accessibilityAction(named: "Delete") { delete() }
    .accessibilityAction(named: "Edit") { edit() }
```

Without this, VoiceOver users can't perform swipe actions.

## Is anything actually listening? (iOS 27)

`AccessibilitySettings.isApplicationAccessibilityEnabled` is the first supported answer to "is an assistive technology consuming my accessibility tree right now". It returns `true` once VoiceOver, Switch Control, Voice Control or Full Keyboard Access has requested access to this process's accessibility information, and it can flip during the process's lifetime.

```swift
import Accessibility

// iOS 27.0+, every platform. Gates COST, never correctness.
@available(iOS 27, *)
func chartDescriptors(for data: [Sample],
                      build: ([Sample]) -> [AXChartDescriptor]) -> [AXChartDescriptor] {
    AccessibilitySettings.isApplicationAccessibilityEnabled ? build(data) : []
}

// The value starts false and flips later -- rebuild when it changes or the data never appears.
@available(iOS 27, *)
func observeAccessibilityAttachment(_ rebuild: @escaping @MainActor () -> Void) async {
    let name = AccessibilitySettings.applicationAccessibilityEnabledDidChangeNotification
    for await _ in NotificationCenter.default.notifications(named: name) {
        await rebuild()
    }
}
```

Labels, traits, values, reading order and actions stay unconditional -- conditioning any of them on this flag ships a broken first frame, because nothing has attached yet when the first frame renders. Only expensive DERIVED data may be deferred: chart descriptors, large synthesized label strings, `accessibilityCustomContent` assembled from a fetch. Using it to hide, simplify, or degrade UI for assistive-technology users is the opposite of its purpose. Below iOS 27 there is no aggregate signal: check `UIAccessibility.isVoiceOverRunning` / `.isSwitchControlRunning` individually with their change notifications, or build the data unconditionally.

## Testing with VoiceOver

Triple-click side button shortcut:
1. Settings > Accessibility > Accessibility Shortcut > VoiceOver
2. Triple-click side/home button to toggle

Or use Accessibility Inspector on Mac (Xcode > Open Developer Tool > Accessibility Inspector). Run your app in Simulator and inspect every element.

### Accessibility Audit

In Xcode 15+ (`performAccessibilityAudit` is iOS 17.0+; `references/methodology/02-previews-design-qa.md` owns the audit mechanics):
```swift
func test_screenAccessibility() throws {
    let app = XCUIApplication()
    app.launch()
    
    try app.performAccessibilityAudit()
    // Reports unlabeled images, contrast issues, traits problems
}
```

### The App Store bar

A VoiceOver claim in an Accessibility Nutrition Label is not "we added labels". Apple's criterion is that users can complete ALL of the app's common tasks with VoiceOver, where common tasks means primary functionality, first-launch experience, login, purchase and settings. "VoiceOver works on the main list but the purchase sheet traps focus" is a label-compliance failure, not only a quality defect, and App Review can require a misleading label to be corrected. Full feature set, criteria and platform matrix: `references/accessibility/08-wcag-2-2-mapping.md#app-store-accessibility-nutrition-labels`.

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Decorative icon read aloud | Annoying, redundant | `.accessibilityHidden(true)` |
| Missing label on Image | "image" is read instead of meaning | `.accessibilityLabel("descriptive")` |
| Swipe actions only | VoiceOver users can't access them | Add `.accessibilityAction` |
| Reading order doesn't match visual | Confusing | `.accessibilitySortPriority` |
| Over-grouping (whole screen as one) | Lose granular navigation | Group only related items, not whole sections |
| Wrong trait | "Button" said for non-button | `.accessibilityRemoveTraits` then `.accessibilityAddTraits` |
| Missing value for state | "4" instead of "4 of 5 stars" | `.accessibilityValue` |
| Tap gesture without `.isButton` | VoiceOver doesn't know it's interactive | `.accessibilityAddTraits(.isButton)` |
| Custom controls without VoiceOver consideration | Inaccessible | `.accessibilityElement(children: .ignore) + label + value + traits + action` |
| Reading "Star, star, star, star, star, empty star" | Verbose, slow | Combine to "4 of 5 stars" |
| Segmented picker that switches which content is shown | VoiceOver announces navigation as value selection | `.pickerStyle(.tabs)` (iOS 27); `.segmented` + `.isTabBar` below it |
| Misspelling a word in `accessibilityLabel` so VoiceOver pronounces it right | Corrupts Braille output and Voice Control matching | An `AXSpeechAttributeSSML` fragment (iOS 27); speech attributes below it |
| Paragraphs as separate `Text` views with nothing linking them | Read-all stops at every paragraph; no granular navigation | `accessibilityLinkedGroup(id:in:)` (iOS 14+) plus `.textSelection(.enabled)` |
| Clever, invented, or metaphorical control name | Reads as nonsense out of context and translates badly | A name that belongs, sets expectations, and works everywhere |
| `isApplicationAccessibilityEnabled` gating labels or traits | False on the first frame -- semantics arrive too late or never | Gate only expensive derived data, and rebuild on the change notification |

## See also

- `references/accessibility/02-dynamic-type-adaptation.md#the-12-sizes` -- text scaling
- `references/accessibility/04-motor-interaction.md#touch-targets` -- accessibility for physical disabilities
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate, symbol/Phase/Keyframe gating
- `references/accessibility/08-wcag-2-2-mapping.md#app-store-accessibility-nutrition-labels` -- the Nutrition Label criteria a VoiceOver claim has to clear
