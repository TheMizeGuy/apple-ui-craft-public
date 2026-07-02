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

### Removing traits

```swift
Button("Custom") { }
    .accessibilityRemoveTraits(.isButton)  // Override default button trait
    .accessibilityAddTraits(.isLink)       // Add different trait
```

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

The rotor is VoiceOver's secondary navigation mode (twist with two fingers). Add custom rotor entries for content types users want to jump between:

```swift
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

User can twist rotor to "Headlines" and swipe to jump between article titles.

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

## Testing with VoiceOver

Triple-click side button shortcut:
1. Settings > Accessibility > Accessibility Shortcut > VoiceOver
2. Triple-click side/home button to toggle

Or use Accessibility Inspector on Mac (Xcode > Open Developer Tool > Accessibility Inspector). Run your app in Simulator and inspect every element.

### Accessibility Audit

In Xcode 16+:
```swift
func test_screenAccessibility() throws {
    let app = XCUIApplication()
    app.launch()
    
    try app.performAccessibilityAudit()
    // Reports unlabeled images, contrast issues, traits problems
}
```

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

## See also

- `02-dynamic-type-adaptation.md` -- text scaling
- `04-motor-interaction.md` -- accessibility for physical disabilities
- `~/Claude/vault/iOS Development/10 - Accessibility.md` -- full reference
