# Haptic Design Principles

Haptics are not decoration. A haptic communicates that something happened or that the user crossed a threshold. Used well, haptics make software feel physical. Used poorly, they fatigue the user and they turn the feature off.

## The Apple philosophy

| Principle | Implementation |
|---|---|
| Haptics confirm actions | Save succeeded, item deleted, threshold crossed |
| Haptics complement -- never replace -- visual/audio | If the screen shows nothing, the haptic alone is meaningless |
| Match haptic weight to action significance | Heavy haptic for irreversible action, light for minor toggle |
| Less is more | An app with 5 well-placed haptics beats one with 50 poorly-placed |
| Check hardware capability, not user preference | `CHHapticEngine.capabilitiesForHardware()` reports DEVICE hardware support -- it cannot read the user's System Haptics toggle (Settings > Sounds & Haptics > System Haptics). There is no readable API for that preference; the OS silently no-ops haptics when it's off |
| Test on real hardware | Simulator has no Taptic Engine; feel cannot be judged from code |

## Haptic placement matrix

The two-column rule: haptics either CONFIRM or NOTIFY. Anything else is misuse.

### Where haptics belong

| Interaction | Haptic | Why |
|---|---|---|
| Successful async operation (save, send, sync) | `.success` | Confirms completion when visual focus may be elsewhere |
| Failed async operation | `.error` | Communicates failure even when user looked away |
| Toggle switch | `.selection` or `.impact(weight: .light)` | Confirms state change |
| Destructive action confirmed | `.impact(weight: .medium)` | Weight communicates irreversibility |
| Picker / segment change | `.selection` | Light tick for context switch |
| Pull-to-refresh completion | `.success` | Confirms fresh data |
| Drag snap to grid / position | `.impact(flexibility: .rigid)` | Communicates alignment |
| Long press threshold reached | `.impact(weight: .heavy)` | Confirms activation |
| Slider crossing value boundary | `.selection` | Marks crossing a threshold |
| Reorder drop | `.impact(weight: .medium)` | Confirms drop |
| Swipe action triggered | `.impact(weight: .medium)` | Confirms commit |
| Notification arrival (foreground) | `.warning` or `.success` | Awareness without sound |
| Achievement unlock | `.success` (or `.notificationOccurred(.success)`) | Celebration |

### Where haptics DO NOT belong

| Interaction | Why no haptic |
|---|---|
| Regular navigation push/pop | System animation already provides feedback feel |
| Scroll | Continuous action -- haptic fatigue |
| Keyboard typing | System keyboard has its own haptics |
| View appearing | Nothing the user caused |
| Timer tick (except final) | Repetition causes desensitization |
| Decorative animation | Haptics confirm actions, not visuals |
| Loading spinner | Continuous; no event to confirm |
| Initial app launch | Not a user action |
| Pull-to-refresh starting | Confirms RESULT, not start |
| Hover (Mac/iPad pointer) | System provides hover feel |

## Match haptic to weight of action

Action significance maps to haptic weight. `.impact(weight:)` and `.impact(flexibility:)` are two separate factories on two independent axes -- weight is how heavy the impact feels, flexibility is how rigid or soft the colliding surface feels. Never mix their cases (`.impact(weight: .rigid)` does not compile).

| Action significance | Haptic |
|---|---|
| Toggle a small UI option | `.selection` (lightest) |
| Tap an interactive element | `.impact(weight: .light)` |
| Confirm a button press | `.impact(weight: .medium)` (default) |
| Commit a destructive action | `.impact(weight: .heavy)` |
| Operation completed | `.success` |
| Operation failed | `.error` |
| Notification | `.warning` |

| Surface feel | Haptic |
|---|---|
| Snap to grid / alignment (crisp, hard stop) | `.impact(flexibility: .rigid)` |
| Soft elastic settle | `.impact(flexibility: .soft)` |
| Firm, cushioned contact | `.impact(flexibility: .solid)` |

## Haptic types reference

### Selection feedback

```swift
.sensoryFeedback(.selection, trigger: selectedTab)
```

- Lightest tactile sensation
- Use for: picker scroll, segment changes, list selection
- Communicates: "you crossed a boundary"

### Impact feedback

```swift
.sensoryFeedback(.impact(weight: .light), trigger: tapped)
.sensoryFeedback(.impact(weight: .medium), trigger: confirmed)       // default
.sensoryFeedback(.impact(weight: .heavy), trigger: committed)
.sensoryFeedback(.impact(flexibility: .soft), trigger: bounced)
.sensoryFeedback(.impact(flexibility: .rigid), trigger: snapped)
```

- Physical sensation -- collisions, snaps
- Weight and flexibility are separate factories: `.impact(weight:)` takes `.light`/`.medium`/`.heavy` (default `.medium`); `.impact(flexibility:)` takes `.rigid`/`.soft`/`.solid` (no default -- must specify explicitly)

| Weight | Feel | Use case |
|---|---|---|
| `.light` | Subtle tap | Toggle switches, minor interactions |
| `.medium` (default) | Moderate tap | Button presses, selections |
| `.heavy` | Strong thud | Significant actions, confirmations |

| Flexibility | Feel | Use case |
|---|---|---|
| `.rigid` | Sharp, crisp | Snapping to grid, alignment |
| `.soft` | Gentle, cushioned | Elastic bouncing, soft collisions |
| `.solid` | Firm, cushioned stop | Dense-object contact |

### Notification feedback

```swift
.sensoryFeedback(.success, trigger: saveCompleted)
.sensoryFeedback(.warning, trigger: warningShown)
.sensoryFeedback(.error, trigger: saveFailed)
```

- Communicate task outcomes
- DO NOT repurpose -- users learn these patterns

### Custom intensity (impact)

```swift
.sensoryFeedback(.impact(weight: .heavy, intensity: 0.7), trigger: pressed)
```

Intensity 0.0 to 1.0.

### Increment/decrement (iOS 17+)

```swift
.sensoryFeedback(.increase, trigger: counter)
.sensoryFeedback(.decrease, trigger: counter)
```

- Pair with stepper / +/- controls

For `.start`/`.stop` (real, watchOS-primary) and the complete `SensoryFeedback` surface, see `references/haptics/02-swiftui-sensory-feedback.md#built-in-feedback-types` -- that file is the owner.

## Anti-patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| Haptic on every cell tap in a list | Fatigue | Reserve for meaningful state changes |
| `.heavy` for minor actions | Desensitizes user | Match weight to action significance |
| Repurposing `.success`/`.error` for wrong semantics | Confusing -- brain learns these patterns | Use documented meanings |
| Haptic without visual feedback | User doesn't know what happened | Pair haptic with visible state change |
| Haptic on derived state | Fires on unrelated reloads | Bind to explicit user-action trigger |
| Missing `.prepare()` for time-sensitive haptic | ~50ms latency on first trigger | Call `prepare()` in `touchesBegan` or gesture start |
| Creating generator per trigger | Allocation overhead | Reuse generator instance |
| Haptic as the ONLY feedback channel | iPad and accessibility users get nothing | Always provide visual/audio backup |
| Haptic that contradicts visual | Confusing | Match haptic to visual weight |
| Continuous haptics during scroll | Fatigue, battery drain | Selection feedback only at meaningful boundaries |
| Haptic on app launch | User didn't cause anything | Remove |
| Decorative haptic with no semantic meaning | Reduces meaning of legitimate haptics | Remove |

## Hardware availability

| Platform | Haptics |
|---|---|
| iPhone (7+) | Full Taptic Engine |
| iPad | NO HAPTICS -- `.sensoryFeedback` silently does nothing |
| Mac (Force Touch trackpad) | Limited |
| Apple Watch | Limited (WKInterfaceDevice.play) |
| Apple TV | None |
| Vision Pro | None |

**Critical implication:** Never rely on haptics as the sole feedback. iPad users and accessibility users with haptics disabled will miss it entirely.

## Accessibility considerations

| Setting | Behavior |
|---|---|
| Settings > Sounds & Haptics > System Haptics (off) | All haptics silently no-op. No readable API reports this state -- `capabilitiesForHardware()` only reports device hardware, never the user's toggle |
| Reduce Motion enabled | Some app-level haptics may want to be reduced (e.g., decorative ones) -- use judgment |
| Low Power Mode | System may attenuate haptics |

Haptics are a complement to visual feedback, never a replacement. The visual must work without haptics.

## Testing haptics

Cannot be done in simulator. Always:

1. Build to a real iPhone (any model with Taptic Engine: iPhone 7 and later)
2. Test the interaction many times
3. Compare to similar interactions in first-party Apple apps:
   - Toggle a setting in Settings.app
   - Refresh in Mail.app
   - Long press an icon on Home Screen
   - Slide to delete in Mail
   - Take a screenshot (volume up + side button)
4. Adjust intensity and weight if your haptic feels off

## See also

- `references/haptics/02-swiftui-sensory-feedback.md#built-in-feedback-types` -- the SwiftUI API (owner of `SensoryFeedback`, weight/flexibility, start/stop)
- `references/haptics/03-core-haptics-engine.md#chhapticengine` -- Core Haptics for custom patterns
