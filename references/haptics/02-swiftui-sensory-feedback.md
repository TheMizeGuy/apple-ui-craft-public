# SwiftUI .sensoryFeedback (iOS 17+)

The modern, declarative way to add haptics. Bind feedback to a trigger value; haptic fires when the trigger changes.

## Basic syntax

```swift
.sensoryFeedback(.success, trigger: saveCompleted)
```

When `saveCompleted` changes, the success haptic plays.

## Built-in feedback types

```swift
// Selection
.sensoryFeedback(.selection, trigger: selectedTab)

// Impact (default style)
.sensoryFeedback(.impact, trigger: tapped)

// Impact with weight (.light/.medium/.heavy, default .medium)
.sensoryFeedback(.impact(weight: .light), trigger: tapped)
.sensoryFeedback(.impact(weight: .medium), trigger: tapped)
.sensoryFeedback(.impact(weight: .heavy), trigger: tapped)

// Impact with flexibility (.rigid/.soft/.solid, no default -- separate factory, not a Weight case)
.sensoryFeedback(.impact(flexibility: .soft), trigger: bounced)
.sensoryFeedback(.impact(flexibility: .rigid), trigger: snapped)

// Impact with custom intensity (either factory)
.sensoryFeedback(.impact(weight: .heavy, intensity: 0.7), trigger: pressed)
.sensoryFeedback(.impact(flexibility: .rigid, intensity: 0.7), trigger: pressed)

// Notifications
.sensoryFeedback(.success, trigger: saveCompleted)
.sensoryFeedback(.warning, trigger: warningShown)
.sensoryFeedback(.error, trigger: saveFailed)

// Increment / decrement (iOS 17+)
.sensoryFeedback(.increase, trigger: counter)
.sensoryFeedback(.decrease, trigger: counter)

// Start / stop
.sensoryFeedback(.start, trigger: timerStarted)
.sensoryFeedback(.stop, trigger: timerStopped)

// Alignment / level (drag snap)
.sensoryFeedback(.alignment, trigger: snapped)
.sensoryFeedback(.levelChange, trigger: levelCrossed)

// Path completion (drawing finished)
.sensoryFeedback(.pathComplete, trigger: pathFinished)
```

## Conditional feedback

When the haptic depends on the change:

```swift
.sensoryFeedback(trigger: favoriteToggled) { oldValue, newValue in
    return newValue ? .success : .impact(weight: .light)
}
```

Returning `nil` skips the haptic for that change:

```swift
.sensoryFeedback(trigger: counter) { oldValue, newValue in
    if newValue > oldValue { return .increase }
    if newValue < oldValue { return .decrease }
    return nil
}
```

## Real-world examples

### Save button

```swift
@State private var saveCompleted = false

Button("Save") {
    Task {
        try await saveData()
        saveCompleted.toggle()
    }
}
.sensoryFeedback(.success, trigger: saveCompleted)
```

### Tab change

```swift
@State private var selectedTab = 0

TabView(selection: $selectedTab) {
    Tab("Home", systemImage: "house").tag(0) { HomeView() }
    Tab("Search", systemImage: "magnifyingglass").tag(1) { SearchView() }
}
.sensoryFeedback(.selection, trigger: selectedTab)
```

### Toggle

```swift
@State private var notificationsEnabled = false

Toggle("Notifications", isOn: $notificationsEnabled)
    .sensoryFeedback(.selection, trigger: notificationsEnabled)
```

### Destructive action

```swift
@State private var deleteCount = 0

Button("Delete", role: .destructive) {
    delete()
    deleteCount += 1
}
.sensoryFeedback(.impact(weight: .medium), trigger: deleteCount)
```

### Drag snap

```swift
@State private var dragOffset: CGSize = .zero
@State private var snapCount = 0

.gesture(
    DragGesture()
        .onChanged { value in
            let snapped = snap(to: gridSize, value.translation)
            if snapped != dragOffset {
                dragOffset = snapped
                snapCount += 1  // Triggers haptic
            }
        }
)
.sensoryFeedback(.impact(flexibility: .rigid), trigger: snapCount)
```

### Async outcome (success or failure)

```swift
@State private var operationResult: OperationResult?

Button("Submit") {
    Task {
        do {
            try await submit()
            operationResult = .success
        } catch {
            operationResult = .failure
        }
    }
}
.sensoryFeedback(trigger: operationResult) { _, newValue in
    switch newValue {
    case .success: .success
    case .failure: .error
    case nil: nil
    }
}
```

### Pull to refresh

```swift
@State private var refreshCompleted = 0

List { ... }
    .refreshable {
        await refresh()
        refreshCompleted += 1
    }
    .sensoryFeedback(.success, trigger: refreshCompleted)
```

### Long press threshold

```swift
@State private var longPressActive = false

Circle()
    .gesture(
        LongPressGesture(minimumDuration: 0.5)
            .onEnded { _ in
                longPressActive = true
            }
    )
    .sensoryFeedback(.impact(weight: .heavy), trigger: longPressActive)
```

## UIKit fallback

For pre-iOS 17 or UIKit:

```swift
// Impact
let impact = UIImpactFeedbackGenerator(style: .medium)
impact.prepare()                 // Reduces ~50ms latency on first trigger
impact.impactOccurred()

// With intensity
impact.impactOccurred(intensity: 0.7)

// Notification
let notification = UINotificationFeedbackGenerator()
notification.notificationOccurred(.success)

// Selection
let selection = UISelectionFeedbackGenerator()
selection.selectionChanged()

// Spatial canvas (iOS 17.5+)
let canvas = UICanvasFeedbackGenerator()
canvas.alignmentOccurred(at: location)
canvas.pathCompleted(at: location)
```

### Reuse generators

Don't create generators per trigger -- reuse instances:

```swift
class HapticManager {
    static let shared = HapticManager()
    
    let lightImpact = UIImpactFeedbackGenerator(style: .light)
    let mediumImpact = UIImpactFeedbackGenerator(style: .medium)
    let selection = UISelectionFeedbackGenerator()
    let notification = UINotificationFeedbackGenerator()
    
    private init() {
        lightImpact.prepare()
        mediumImpact.prepare()
        selection.prepare()
    }
}
```

### Bridging UIKit to SwiftUI

If you need UIKit haptics in a SwiftUI view (e.g., for spatial canvas haptics):

```swift
struct MyView: View {
    let canvas = UICanvasFeedbackGenerator()
    
    var body: some View {
        Rectangle()
            .gesture(
                DragGesture()
                    .onChanged { value in
                        canvas.alignmentOccurred(at: value.location)
                    }
            )
            .onAppear { canvas.prepare() }
    }
}
```

## API availability matrix

| API | Minimum iOS | Framework |
|---|---|---|
| `UIImpactFeedbackGenerator` | iOS 10 | UIKit |
| `UISelectionFeedbackGenerator` | iOS 10 | UIKit |
| `UINotificationFeedbackGenerator` | iOS 10 | UIKit |
| `CHHapticEngine` | iOS 13 | CoreHaptics |
| `UICanvasFeedbackGenerator` | iOS 17.5 | UIKit |
| `.sensoryFeedback` modifier | iOS 17 | SwiftUI |
| `SensoryFeedback` enum | iOS 17 | SwiftUI |
| `.impact(weight:intensity:)` | iOS 17, visionOS 26.0 | SwiftUI |
| `.impact(flexibility:intensity:)` | iOS 17, visionOS 26.0 | SwiftUI |
| `.start` / `.stop` | iOS 17 (watchOS-primary) | SwiftUI |

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Bind `.sensoryFeedback` to derived state | Fires on unrelated reloads | Bind to explicit user-action trigger (counter, toggle) |
| Missing `.prepare()` (UIKit) | ~50ms latency | Call before time-sensitive haptic |
| Create generator per trigger | Allocation overhead | Reuse generator instances |
| Haptic on `.onAppear` | Not user-initiated | Remove |
| Haptic on every list cell tap | Fatigue | Reserve for meaningful actions |
| `.heavy` impact for minor toggle | Desensitizes | Match weight to action significance |
| Use `.error` for warning | Wrong semantics | Use `.warning` or `.error` per actual meaning |
| Test only on simulator | Can't feel haptics | Test on physical device |
| Rely on haptic alone | iPad users get nothing | Always pair with visual feedback |

## See also

- `references/haptics/01-haptic-design-principles.md#haptic-placement-matrix` -- when and where to use haptics
- `references/haptics/03-core-haptics-engine.md#chhapticengine` -- custom patterns beyond built-in feedback
