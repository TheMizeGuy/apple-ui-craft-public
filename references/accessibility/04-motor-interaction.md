# Motor / Interaction Accessibility

Users have varying motor abilities. Tremors, limited mobility, single-hand use, prosthetics, switch devices -- your app must serve all of them. Touch targets, alternative inputs, and gesture alternatives are non-negotiable.

## Touch targets

**44 x 44 pt minimum.** This is Apple's hard rule -- no exceptions. WCAG cites two different levels here; don't conflate them: **2.5.8 Target Size (Minimum)** is Level AA and requires only 24 CSS px (WCAG 2.2); **2.5.5 Target Size (Enhanced)** is Level AAA and is the one that asks for 44 CSS px, but AAA criteria are aspirational, not baseline-required. Apple's 44pt is its own hard rule independent of which WCAG level you target -- ship 44pt regardless.

| Surface | Minimum size |
|---|---|
| Buttons | 44x44pt |
| List row tap area | 44x44pt minimum height |
| Toggle switches | 44x44pt frame |
| Navigation back button | 44x44pt frame |
| Tab bar items | 44x44pt frame |
| Toolbar buttons | 44x44pt frame |
| Image buttons (heart, star) | 44x44pt frame |

### Extending hit area without changing visual size

```swift
// Visual icon is 24pt, hit area is 44pt
Button {
    action()
} label: {
    Image(systemName: "heart")
        .font(.system(size: 24))
        .frame(width: 44, height: 44)
}

// Or with contentShape (preserves smaller visual but extends tap)
Image(systemName: "heart")
    .font(.system(size: 24))
    .padding(10)  // 24 + 10*2 = 44
    .contentShape(Rectangle())
    .onTapGesture { action() }
```

### 8pt spacing between targets

Tightly-packed targets even at 44pt are hard to hit with a tremor. Provide 8pt minimum spacing between adjacent targets.

```swift
HStack(spacing: 8) {
    Button(action1) { Image(systemName: "house").frame(width: 44, height: 44) }
    Button(action2) { Image(systemName: "star").frame(width: 44, height: 44) }
    Button(action3) { Image(systemName: "person").frame(width: 44, height: 44) }
}
```

## Switch Control

Switch Control lets users navigate iOS with one or more external switches (sip-and-puff, head movement, jelly button). The system scans through items; user activates with a switch.

Every interactive element must be reachable via item-by-item scanning. SwiftUI handles this automatically for system controls. Custom controls need:

```swift
CustomTappableView()
    .accessibilityElement()
    .accessibilityAddTraits(.isButton)
    .accessibilityLabel("Custom action")
    .accessibilityAction { performAction() }
```

### Testing Switch Control

Settings > Accessibility > Switch Control > set up a switch (can use external Bluetooth switch or iPad screen tap as switch). Then walk through your app. Every action must be reachable.

## Voice Control

Voice Control lets users activate UI by speaking labels:

> "Tap Save"
> "Tap Settings"

Voice Control reads accessibility labels. It also reads visible text on elements. If a button shows "Save" but its accessibility label is "Save changes to file", BOTH must work.

```swift
Button("Save changes") { }
    .accessibilityInputLabels(["Save changes", "Save", "Confirm"])
```

### Show Voice Control labels

User can say "Show names" to see overlay labels on every element. Test with this enabled.

### When labels diverge from visible text

If you must use a non-visible label for VoiceOver brevity, ensure Voice Control still works:

```swift
Button {
    addItem()
} label: {
    Image(systemName: "plus")
}
.accessibilityLabel("Add new item")        // VoiceOver reads this
.accessibilityInputLabels(["Add", "Plus", "New", "Add item"])  // Voice Control accepts these
```

## Drag operations have single-pointer alternatives (WCAG 2.5.7)

If your app has drag-and-drop, provide a tap-based alternative.

```swift
ItemRow(item: item)
    .draggable(item)  // Drag for users who can
    .contextMenu {
        Button("Move to...") {
            showMovePicker = true  // Tap-based alternative
        }
    }
```

## No complex gestures required (WCAG 2.5.1 Pointer Gestures)

Multi-finger gestures, force touch, edge swipes -- these can be impossible for users with limited dexterity. Provide simpler alternatives. WCAG 2.5.1 (Level A) is the citation for "give path-based/multi-point gestures a single-pointer alternative" -- don't confuse it with 2.5.4 Motion Actuation, which is the separate criterion for device-motion triggers (shake-to-undo, tilt-to-scroll), not gestures.

| Complex gesture | Alternative |
|---|---|
| Long press menu | Add a "more" button (...) that opens the menu |
| Swipe to delete | Edit mode with delete buttons |
| Two-finger tap | Single-tap "options" button |
| Pinch zoom | +/- buttons |
| Force touch peek | Long press menu (already simpler) |
| Edge swipe back | Back button always present |
| Three-finger drag | Single-finger drag alternative |

## Native VoiceOver bridge APIs

VoiceOver has its own gesture vocabulary for zoom, scroll, and drag/drop that bypasses standard touch handling entirely. Expose these modifiers so a custom view built on `MagnificationGesture`/`DragGesture` still works under VoiceOver -- a "+/-" button is a workaround; these modifiers make the ORIGINAL gesture itself accessible.

```swift
// iOS 16.0+. VoiceOver's zoom rotor invokes this instead of a MagnificationGesture.
CustomImageView()
    .accessibilityZoomAction { action in
        switch action.direction {
        case .zoomIn: zoomLevel *= 1.25
        case .zoomOut: zoomLevel /= 1.25
        @unknown default: break
        }
    }

// iOS 16.0+. VoiceOver's three-finger scroll invokes this on a custom scrollable view
// (List/ScrollView already expose scroll to VoiceOver automatically -- this is for
// canvases, custom maps, and other non-standard scrollable content).
CustomScrollableView()
    .accessibilityScrollAction { edge in
        scrollToNext(in: edge)
    }

// iOS 16.0+. Disambiguates drag source/destination for VoiceOver when a view has
// more than one drag or drop interaction.
FileIcon(filename: filename)
    .accessibilityDragPoint(.center, description: Text("Move \(filename)"))

DropZoneView()
    .accessibilityDropPoint(.center, description: Text("Drop into \(folderName)"))
```

## Keyboard shortcuts (iPad and Mac)

External keyboards on iPad/Mac let motor-impaired users navigate without touch.

```swift
Button("Save") { save() }
    .keyboardShortcut("s", modifiers: .command)
```

Key actions to support:
- Save (`⌘S`)
- New (`⌘N`)
- Open (`⌘O`)
- Find (`⌘F`)
- Delete (Delete key)
- Cancel/Dismiss (Escape)
- Tab (move between fields)
- Arrow keys (navigate lists)
- Return (activate selected)

```swift
TextField("Search", text: $query)
    .focused($searchFocused)
    .onSubmit { performSearch() }
    .keyboardShortcut(.defaultAction)  // Return triggers it

Button("Cancel") { dismiss() }
    .keyboardShortcut(.cancelAction)  // Escape triggers it
```

## Focus Not Obscured (WCAG 2.4.11)

When a user navigates with Switch Control or Voice Control, the focused element must not be hidden by sticky headers, toolbars, or keyboards.

```swift
ScrollView {
    Form { ... }
}
.scrollIndicators(.visible)
// SwiftUI auto-handles focus visibility, but custom sticky overlays may obscure
```

If you have a custom sticky overlay, use `.safeAreaInset(edge:)` so the system knows to scroll content above it.

## Redundant entry avoided (WCAG 3.3.7)

Forms shouldn't ask for information already provided. Use:

- `@AppStorage` to remember preferences
- iCloud Keychain for credentials
- AutoFill for known fields:

```swift
TextField("Email", text: $email)
    .textContentType(.emailAddress)
    .autocorrectionDisabled()
    .keyboardType(.emailAddress)

SecureField("Password", text: $password)
    .textContentType(.password)
```

## Accessible authentication (WCAG 3.3.8)

Login should support biometrics, passkeys, and password managers. No CAPTCHA. No "click all the buses" tests.

```swift
SignInWithAppleButton(
    onRequest: { request in
        request.requestedScopes = [.fullName, .email]
    },
    onCompletion: { result in
        handleSignIn(result)
    }
)

// Passkeys
let credentialID = challenge.publicKey.credentialID
let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
    relyingPartyIdentifier: "example.com"
)
```

## Auto-fill suggestions

```swift
TextField("Address", text: $address)
    .textContentType(.fullStreetAddress)
    .autocorrectionDisabled()

TextField("ZIP", text: $zip)
    .textContentType(.postalCode)
    .keyboardType(.numberPad)
```

## Avoid timing-dependent interactions

If your UI requires holding, swiping a precise distance, or completing an action within a time window, provide alternatives.

```swift
// Bad: must hold for 3 seconds
LongPressGesture(minimumDuration: 3.0)

// Better: tap to start, tap to confirm
@State private var confirmingDelete = false

Button("Delete") {
    if confirmingDelete {
        delete()
    } else {
        confirmingDelete = true
        // Auto-cancel after 5 seconds
    }
}
```

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Touch targets < 44pt | Inaccessible | `.frame(minWidth: 44, minHeight: 44)` or `.contentShape(Rectangle())` extension |
| Tightly packed icons (e.g., 32pt + 4pt spacing) | Mis-taps | 44pt + 8pt spacing |
| Swipe-to-delete only | No alternative | Add edit mode or context menu |
| Missing keyboard shortcuts on iPad | No keyboard support | Add `.keyboardShortcut()` |
| Drag-only operations | Inaccessible to users without precise motor control | Provide tap alternative |
| CAPTCHA | Cognitive + motor barrier | Use Sign in with Apple or passkeys |
| Force-touch only feature | Inaccessible | Provide long-press fallback |
| Edge swipe only navigation | Inaccessible for one-hand users | Always have back button |
| Small text fields | Hard to tap | Field height >= 44pt |
| Submit button at far edge | Awkward reach for one-hand | Multiple submit affordances |

## See also

- `references/accessibility/01-voiceover-fundamentals.md` -- VoiceOver accessibility
- `references/accessibility/02-dynamic-type-adaptation.md#the-12-sizes` -- text scaling
- `references/accessibility/03-visual-accessibility.md#reduce-motion` -- color, motion, contrast
