# Core Haptics Engine

For custom haptic patterns beyond the built-in feedback types. Use Core Haptics when you need:
- Custom timing or sequences
- Dynamic intensity/sharpness modulation
- Audio and haptic synchronization
- AHAP file playback (designer-authored patterns)

For most apps, the built-in `.sensoryFeedback` and `UIFeedbackGenerator` are sufficient. Reach for Core Haptics only for distinctive haptic experiences (games, music apps, productivity tools with rich feedback).

## CHHapticEngine

The gateway to the haptic server. Create, configure, start, manage lifecycle.

### Creating and starting

```swift
import CoreHaptics

// iOS 17+ (@Observable). See references/_scaffolding/version-floor-registry.md.
@Observable
final class HapticEngineManager {
    private var engine: CHHapticEngine?

    func start() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }

        do {
            engine = try CHHapticEngine()
            try engine?.start()

            // Reset handler: engine may stop unexpectedly (e.g., audio session interruption)
            engine?.resetHandler = { [weak self] in
                do {
                    try self?.engine?.start()
                } catch {
                    print("Failed to restart engine: \(error)")
                }
            }

            // Stopped handler: engine stopped due to system event
            engine?.stoppedHandler = { reason in
                print("Engine stopped: \(reason)")
            }
        } catch {
            print("Failed to start engine: \(error)")
        }
    }

    func stop() {
        engine?.stop()
    }
}
```

### When to start/stop

Drive the engine lifecycle from `\.scenePhase`, not UIKit's `applicationDidEnterBackground`/`applicationWillEnterForeground` -- those app-delegate callbacks have no place in a SwiftUI-first haptics file and don't fire for scene-based multiwindow apps the way a single-delegate mental model implies.

```swift
struct ContentView: View {
    @State private var hapticManager = HapticEngineManager()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        MainContent()
            .onAppear { hapticManager.start() }
            .onChange(of: scenePhase) { _, newPhase in
                switch newPhase {
                case .active:
                    hapticManager.start()
                case .background, .inactive:
                    hapticManager.stop()   // Save resources
                @unknown default:
                    break
                }
            }
    }
}
```

## CHHapticEvent

A single haptic event in a pattern.

### Event types

| Type | Description |
|---|---|
| `hapticTransient` | Brief haptic (default duration) |
| `hapticContinuous` | Sustained haptic with explicit duration |
| `audioCustom` | Custom audio sample played alongside haptic |
| `audioContinuous` | Sustained audio |

### Event parameters

| Parameter | Range | Effect |
|---|---|---|
| `hapticIntensity` | 0.0 - 1.0 | Strength of vibration |
| `hapticSharpness` | 0.0 - 1.0 | Sharp (high) vs soft (low) |
| `attackTime` | `TimeInterval` seconds, can exceed 1.0 | Fade-in time (continuous only) |
| `decayTime` | `TimeInterval` seconds, can exceed 1.0 | Fade-out time (continuous only) |
| `releaseTime` | 0.0 - 1.0 | Release fade |
| `sustained` | 0 or 1 | Whether to sustain at peak |

Only `hapticIntensity` and `hapticSharpness` are normalized 0.0-1.0. `attackTime`/`decayTime`/`releaseTime` are time-based (`TimeInterval` seconds) -- a 2-second attack is legal, not clamped to 1.0.

### Building a transient event

```swift
let event = CHHapticEvent(
    eventType: .hapticTransient,
    parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.8),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.6)
    ],
    relativeTime: 0
)
```

### Building a continuous event

```swift
let event = CHHapticEvent(
    eventType: .hapticContinuous,
    parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.5),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.3),
        CHHapticEventParameter(parameterID: .attackTime, value: 0.1),
        CHHapticEventParameter(parameterID: .decayTime, value: 0.2)
    ],
    relativeTime: 0,
    duration: 1.0  // 1 second sustained
)
```

## CHHapticPattern

A sequence of events.

```swift
func playButtonTapPattern() throws {
    let event = CHHapticEvent(
        eventType: .hapticTransient,
        parameters: [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.6),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.8)
        ],
        relativeTime: 0
    )
    
    let pattern = try CHHapticPattern(events: [event], parameters: [])
    let player = try engine?.makePlayer(with: pattern)
    try player?.start(atTime: CHHapticTimeImmediate)
}
```

### Multi-event pattern (success confirmation)

```swift
func playSuccessPattern() throws {
    let firstTap = CHHapticEvent(
        eventType: .hapticTransient,
        parameters: [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.5),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5)
        ],
        relativeTime: 0
    )
    
    let secondTap = CHHapticEvent(
        eventType: .hapticTransient,
        parameters: [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.8)
        ],
        relativeTime: 0.1  // 100ms after first
    )
    
    let pattern = try CHHapticPattern(events: [firstTap, secondTap], parameters: [])
    let player = try engine?.makePlayer(with: pattern)
    try player?.start(atTime: CHHapticTimeImmediate)
}
```

## Dynamic parameters

Modulate parameters during playback (e.g., for a force-feedback effect):

```swift
let event = CHHapticEvent(
    eventType: .hapticContinuous,
    parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.5),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5)
    ],
    relativeTime: 0,
    duration: 2.0
)

let pattern = try CHHapticPattern(events: [event], parameters: [])
let player = try engine?.makeAdvancedPlayer(with: pattern)

try player?.start(atTime: CHHapticTimeImmediate)

// Modulate intensity over time
let intensityCurve = CHHapticParameterCurve(
    parameterID: .hapticIntensityControl,
    controlPoints: [
        .init(relativeTime: 0, value: 0.5),
        .init(relativeTime: 1.0, value: 1.0),
        .init(relativeTime: 2.0, value: 0.0)
    ],
    relativeTime: 0
)

try player?.scheduleParameterCurve(intensityCurve, atTime: CHHapticTimeImmediate)
```

## AHAP files

Designer-authored haptic patterns in JSON format. Lets non-developers create complex haptic experiences.

### Example AHAP

```json
{
    "Version": 1.0,
    "Pattern": [
        {
            "Event": {
                "Time": 0,
                "EventType": "HapticTransient",
                "EventParameters": [
                    { "ParameterID": "HapticIntensity", "ParameterValue": 1.0 },
                    { "ParameterID": "HapticSharpness", "ParameterValue": 0.5 }
                ]
            }
        },
        {
            "Event": {
                "Time": 0.1,
                "EventType": "HapticContinuous",
                "EventDuration": 0.5,
                "EventParameters": [
                    { "ParameterID": "HapticIntensity", "ParameterValue": 0.7 },
                    { "ParameterID": "HapticSharpness", "ParameterValue": 0.3 }
                ]
            }
        }
    ]
}
```

### Loading and playing AHAP

```swift
guard let url = Bundle.main.url(forResource: "celebration", withExtension: "ahap") else { return }

do {
    try engine?.playPattern(from: url)
} catch {
    print("Failed to play pattern: \(error)")
}
```

## Audio and haptic sync

Core Haptics can play synchronized audio, but a custom audio event REQUIRES a registered resource -- `CHHapticEvent(eventType: .audioCustom, parameters:relativeTime:)` with no `audioResourceID` does not compile. Register the resource first, then build the event from `audioResourceID:`:

```swift
let resourceID = try engine?.registerAudioResource(audioFileURL)

let audioEvent = CHHapticEvent(
    audioResourceID: resourceID!,
    parameters: [
        CHHapticEventParameter(parameterID: .audioVolume, value: 1.0),
        CHHapticEventParameter(parameterID: .audioPitch, value: 0.0)
    ],
    relativeTime: 0
)

let hapticEvent = CHHapticEvent(
    eventType: .hapticTransient,
    parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0)
    ],
    relativeTime: 0  // Play simultaneously
)

let pattern = try CHHapticPattern(events: [audioEvent, hapticEvent], parameters: [])
```

## Common patterns

### Button tap (standard feel)

```swift
let event = CHHapticEvent(
    eventType: .hapticTransient,
    parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.6),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.8)
    ],
    relativeTime: 0
)
```

### Soft confirmation

```swift
let event = CHHapticEvent(
    eventType: .hapticTransient,
    parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.4),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.3)
    ],
    relativeTime: 0
)
```

### Error (sharp double-tap)

```swift
let firstTap = CHHapticEvent(
    eventType: .hapticTransient,
    parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 1.0)
    ],
    relativeTime: 0
)

let secondTap = CHHapticEvent(
    eventType: .hapticTransient,
    parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 1.0)
    ],
    relativeTime: 0.08
)
```

### Heartbeat (continuous + transient)

```swift
let beat1 = CHHapticEvent(
    eventType: .hapticTransient,
    parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5)
    ],
    relativeTime: 0
)

let beat2 = CHHapticEvent(
    eventType: .hapticTransient,
    parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.7),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5)
    ],
    relativeTime: 0.15
)

// Repeats every second
```

## When NOT to use Core Haptics

| Don't use Core Haptics for | Use instead |
|---|---|
| Standard button taps | `.sensoryFeedback(.impact(weight: .light))` |
| Toggle confirmation | `.sensoryFeedback(.selection)` |
| Success/failure feedback | `.sensoryFeedback(.success)` / `.sensoryFeedback(.error)` |
| Selection changes | `.sensoryFeedback(.selection)` |
| Anything covered by built-in feedback | Built-in feedback |

Core Haptics is for:
- Games (custom rumble for explosions, hits, environmental)
- Music apps (rhythm-synced haptics)
- Productivity tools with rich feedback (drawing apps with brush feel)
- Apps with brand-specific signature haptics

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Not checking hardware support | Crashes on iPad / non-haptic devices | `CHHapticEngine.capabilitiesForHardware().supportsHaptics` |
| No engine reset handler | Engine stops silently after backgrounding | Implement `resetHandler` |
| Engine never stopped | Battery drain | Stop on app background |
| Custom haptic for standard feedback | Reinventing the wheel | Use built-in `.sensoryFeedback` |
| Loading AHAP every play | I/O overhead | Cache the pattern |
| Audio without registering resource | Crash | Register `audioResourceID` first |
| Modulating non-modulatable parameter | Silent failure | Use `Control` variants (`hapticIntensityControl`) |

## See also

- `references/haptics/01-haptic-design-principles.md#haptic-placement-matrix` -- when to design custom patterns
- `references/haptics/02-swiftui-sensory-feedback.md#built-in-feedback-types` -- prefer this when built-ins suffice
- `references/platform/09-scene-lifecycle.md` -- `\.scenePhase` lifecycle in depth
- `~/Claude/vault/iOS Development/77 - Core Haptics and Sensory Feedback.md` -- full reference with AHAP grammar
