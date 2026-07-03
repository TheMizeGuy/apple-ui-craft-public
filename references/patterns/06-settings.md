# Settings and Preferences

> Owner: `references/patterns/06-settings.md` owns settings-screen construction -- the `Form`/grouped-section shell, the native row vocabulary (`Toggle`/`Picker`/`Stepper`/`NavigationLink`/`LabeledContent`/`Button`), `@AppStorage`-backed persistence, and deep-linking out to the system Settings app. Account-specific rows (sign-in, sign-out, credential state, account deletion) are owned by `references/patterns/09-auth-account.md#account-settings-screen` -- this file only says where an account section sits in the hierarchy. Empty/loading states inside a settings list are owned by `references/patterns/04-loading-empty-error.md`. Liquid Glass API details are owned by `references/design/02-liquid-glass.md`.
> Floors: see `references/_scaffolding/version-floor-registry.md#ios-160` for `scrollContentBackground`, `references/_scaffolding/version-floor-registry.md#ios-170` for `Section(_:isExpanded:)`, and `#ios-180` for `containerBackground(_:for:)`.

A native Settings screen is built from one primitive (`Form`) and a small, fixed vocabulary of row types -- reach for anything else and the screen stops reading as Apple-built. Most settings bugs aren't visual; they're state that silently fails to persist, or an OS-owned toggle the app tries to fake.

## The Apple way

`Form` on iOS defaults to the grouped, inset appearance -- rounded card sections on a `systemGroupedBackground`, hairline separators, correct row insets -- with zero style modifiers. Reach for `.listStyle(.insetGrouped)` only when you build the screen from a raw `List` instead of a `Form`.

```swift
struct SettingsView: View {
    var body: some View {
        NavigationStack {
            Form {
                Section("General") {
                    Toggle("Notifications", isOn: $notificationsEnabled)
                    Picker("Appearance", selection: $appearance) {
                        ForEach(Appearance.allCases) { Text($0.label).tag($0) }
                    }
                }
                Section {
                    LabeledContent("Version", value: appVersion)
                } header: { Text("About") }
            }
            .navigationTitle("Settings")
        }
    }
}
```

Group related rows into `Section`s -- two to six rows per section is the Settings-app rhythm; one giant flat section reads wrong. The current initializer is `Section(content:header:footer:)`, used with trailing-closure syntax `Section { … } header: { … } footer: { … }`; the header-first `Section(header:footer:content:)` ordering is deprecated (iOS 13.0-27.0) -- never emit it in new code.

### In-app vs. defer-to-system

Build a `Form` for preferences the APP owns; deep-link to iOS Settings for anything the OS owns.

| Belongs to the OS (link out, don't rebuild) | Belongs in your app's `Form` |
|---|---|
| Notification permission on/off | Which notification categories to send |
| Location / Camera / Mic / Photos permission | How the app uses granted data |
| Cellular data allowance | In-app quality/download defaults |
| System Face ID / passcode | An app-level "Require Face ID to open" toggle you enforce |
| System font size / Bold Text / Display Zoom | Nothing -- inherit for free via Dynamic Type |

Rule of thumb: if changing it requires an OS toggle, show current status with `LabeledContent` and a `Button` that deep-links via `openSettingsURLString`; never fake it. The legacy Settings bundle (a `Settings.bundle` that surfaces prefs *inside* the iOS Settings app) is discouraged for modern apps -- users expect settings inside the app itself, where they can be dynamic and validated.

## Row vocabulary

A native Settings screen draws from six row types. Using the right one is most of what makes a screen read as Apple-built rather than reinvented.

```swift
// 1. Toggle -- boolean switch, right-aligns automatically in a Form
Toggle("Notifications", isOn: $notificationsEnabled)

// 2. Picker -- inside a Form the DEFAULT style is .navigationLink: label left,
// current selection in gray on the right, chevron, tap pushes a checkmark list.
Picker("Appearance", selection: $appearance) {
    ForEach(Appearance.allCases) { Text($0.label).tag($0) }
}
Picker("Sort", selection: $sort) { /* … */ }.pickerStyle(.menu)        // inline pop-up, short list
Picker("View", selection: $mode) { /* … */ }.pickerStyle(.segmented)   // 2-4 mutually exclusive VIEW modes, not values

// 3. Stepper -- bounded integer/value
Stepper("Reminders: \(count)", value: $count, in: 0...10)

// 4. NavigationLink -- drill into a sub-screen; pair with LabeledContent for a summary value
NavigationLink(value: Route.wifiDetail) {
    LabeledContent("Wi-Fi", value: ssidName)     // "Wi-Fi · HomeNetwork ·" -- the real Settings pattern
}

// 5. LabeledContent -- read-only value row, label-left/value-right in secondary gray
LabeledContent("Version", value: appVersion)

// 6. Button -- an action row, full-width tappable and left-aligned by default
Button("Clear Cache") { clearCache() }
Button("Sign Out", role: .destructive) { signOut() }   // renders red
```

Tag types on a `Picker` must match the selection binding's type exactly, or the row renders blank with no error. `LabeledContent` beats a hand-built `HStack { Text; Spacer; Text }` -- it groups as one VoiceOver element and gets correct trailing alignment for free; `HStack` reads as two disjoint elements. `TextField`/`SecureField` cover editable text (`.textContentType`/`.keyboardType` set so AutoFill and the right keyboard appear); the full field-modifier contract lives in `references/patterns/09-auth-account.md#credential-field-stack`.

## Persisting state: @AppStorage vs. an @Observable model

`@AppStorage` is the fast path for a flat scalar with no cross-field logic -- each row's control binds directly to a `UserDefaults`-backed property:

```swift
struct SettingsView: View {
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true
    @AppStorage("appearance") private var appearance: Appearance = .system
    @AppStorage("launchCount", store: UserDefaults(suiteName: "group.com.example.app"))
    private var launchCount = 0
}
// Enum RawRepresentable with a String/Int RawValue works directly in @AppStorage.
```

Pass an app-group `store:` when a widget or extension must read the same value. When settings have derived state, validation, or side effects, hold them in an `@Observable` model injected via `.environment`, bind with a local `@Bindable`:

```swift
@Observable final class AppSettings {
    var darkMode = false
    var fontSize: Double = 16
}

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings
    var body: some View {
        @Bindable var settings = settings          // required to get $bindings
        Form {
            Toggle("Dark Mode", isOn: $settings.darkMode)
        }
    }
}
```

Three gotchas that show up only on a real device:

1. **`@Observable` does not persist itself.** Mutating a property updates the UI but writes nothing to disk -- add an explicit `.onChange(of: settings.enableHaptics) { _, _ in settings.persist() }` per persisted property.
2. **A slider bound straight to the model fans out a persist storm mid-drag.** Every tick fires mutation + persist + body re-eval. Use a draft-during-drag binding that commits once on `onEditingChanged`, and render the live readout with `.monospacedDigit()` so it doesn't jitter.
3. **Chained `.onChange` collapses the type-checker past roughly 9-15 modifiers on one view.** Split persistence observers across a few small `ViewModifier`s instead of stacking them all on one `Form`.

## Search in a large settings screen

Add `.searchable` only when the screen is genuinely long (dozens of rows) -- a two-section settings screen never needs it:

```swift
NavigationStack {
    Form { /* filtered sections */ }
        .searchable(text: $query, prompt: "Search Settings")
}
```

Filter your section/row model by `query` and render the empty-result state per `references/patterns/04-loading-empty-error.md` (`ContentUnavailableView.search(text:)`) when nothing matches.

## Appearance and language

```swift
enum AppearanceMode: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var colorScheme: ColorScheme? {           // nil = follow system
        switch self { case .system: nil; case .light: .light; case .dark: .dark }
    }
}

@main
struct MyApp: App {
    @AppStorage("appearanceMode") private var mode: AppearanceMode = .system
    var body: some Scene {
        WindowGroup { ContentView() }
            .preferredColorScheme(mode.colorScheme)   // set ONCE at the root scene
    }
}
```

Set `preferredColorScheme` once, at the root -- per-view calls create inconsistent islands. `nil` is essential for the `system` case; passing `.light` there defeats the option entirely. For a localized app, prefer the system's per-app Language pane (driven by the bundle's declared localizations) over an in-app language switcher:

```swift
Button("Language") {
    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
}
```

There is no first-class public API to change the running app's language live; the legacy `AppleLanguages` defaults-key approach requires a relaunch and doesn't retranslate already-rendered views -- avoid it in production. To preview a locale in SwiftUI, override the environment instead: `.environment(\.locale, Locale(identifier: "fr"))`.

## Deep-linking to system Settings

```swift
@Environment(\.openURL) private var openURL

Button("Open Settings") {
    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
}

// Notifications get their own constant (iOS 16+) that lands directly on the Notifications pane
if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
```

There is no public API to deep-link into an arbitrary Settings sub-pane -- both constants land on your app's own page in Settings. Pair the button with an explanatory row driven by the current authorization status; never auto-navigate the user there without an explicit tap. `Link` rows for help/privacy/contact content, and the `requestReview()` env action for an in-app rating affordance, are covered in `references/patterns/07-feedback-reviews-notifications.md`.

## Settings under Liquid Glass (iOS 26+)

A `Form` presented normally -- full-screen, pushed in a `NavigationStack` -- already renders with the correct grouped Liquid Glass look: the nav bar and any tab bar float as glass, section cards sit on the grouped background, and nothing in this file changes. The complication is a settings `Form` living inside a `.sheet`, where the form's own opaque background fights the sheet's translucent glass surface.

```swift
.sheet(isPresented: $showSettings) {
    NavigationStack {
        Form { /* … */ }
            .scrollContentBackground(.hidden)     // iOS 16.0+ -- expose the sheet's glass
    }
}
```

Clear the same background on a pushed sub-screen inside that sheet so translucency stays continuous:

```swift
DetailView()
    .containerBackground(.clear, for: .navigation)   // iOS 18.0+
```

Switch the hidden background dynamically at a partial detent, since at `.large` the content behind the sheet is gone and a hidden background can read wrong (especially across light/dark):

```swift
Form { /* … */ }
    .scrollContentBackground(detent == .medium ? .hidden : .automatic)
    .presentationDetents([.medium, .large], selection: $detent)
```

Do not wrap individual settings rows in `.glassEffect()` -- grouped rows are content, not floating controls; Liquid Glass belongs on the navigation chrome the system already handles. A full-screen settings `Form` in a `NavigationStack` needs zero glass modifiers of its own -- the hidden-background trick is a sheet-only remedy.

## macOS: Settings scene + SettingsLink

macOS owns its preferences window through a dedicated `Settings { }` scene rather than a pushed screen:

```swift
// macOS 14+
SettingsLink { Text("Settings…") }                         // a view that opens the Settings scene
// or, imperatively:
@Environment(\.openSettings) private var openSettings       // macOS 14+ ONLY
Button("Settings…") { openSettings() }
```

`SettingsLink`, `openSettings`, and the `Settings` scene are macOS-only -- they do not exist on iOS; don't reach for them in an iOS settings screen. Full Mac Catalyst/macOS windowing conventions are owned by `references/cross-platform/04-macos-catalyst.md`.

## Account section placement

An account/sign-in section belongs near the BOTTOM of the settings hierarchy -- after general preferences, before or alongside About -- with sign-out as a plain (non-red) row and account deletion isolated in its own trailing destructive section. The full profile-header, sign-out, credential-recovery, and account-deletion craft is owned by `references/patterns/09-auth-account.md#account-settings-screen`; this file only fixes where that section sits.

## Accessibility contract

`Form` auto-associates each control's label with the control for VoiceOver -- a `Picker`/`Toggle` announces its label and value with no extra work, which is why `LabeledContent`/`Label` are preferred over a hand-built `HStack`. A decorative leading icon inside `Label`'s icon slot is already ignored by VoiceOver; don't add a manual `.accessibilityHidden` unless you built a raw `Image` outside `Label`. On iOS 18/Xcode 26 a `Picker` row inside a `Form` realizes in the accessibility tree as an `XCUIElement.button` (the row is the tap target), not the `otherElement` container older iOS versions produced -- a UI test that only queries `otherElements`/`staticTexts` for a picker row gives a false "not visible" negative; probe every realization a Form row can take. Add `.accessibilityIdentifier(_:)` to interactive rows for stable UI-test hooks -- identifiers are invisible to users and stable across localization.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `preferredColorScheme` set per-view instead of once at the root | Creates inconsistent appearance islands across the app | One call at the `WindowGroup` root, driven by an `@AppStorage` enum |
| A custom in-app language switcher | No first-class API retranslates already-rendered views; fragile across OS versions | Deep-link to the system per-app Language pane |
| `HStack { Text; Spacer; Text }` instead of `LabeledContent` | Reads as two disjoint VoiceOver elements, loses trailing alignment for free | `LabeledContent(label, value:)` |
| Custom-drawn switches, chevrons, or checkmarks | Inconsistent chrome, no VoiceOver/Dynamic Type parity for free | Native `Toggle`/`Picker`/`NavigationLink` |
| `.pickerStyle(.wheel)` in a settings list | Wheels are for inline data entry, not discrete settings values | Default `.navigationLink` style (pushes a checkmark list) |
| Wrapping an individual settings row in `.glassEffect()` | Grouped rows are content, not floating controls -- muddies the hierarchy | Leave glass to the system-owned nav/tab chrome |
| `@Observable` settings model with no persist step | UI updates but nothing survives relaunch | Explicit `.onChange` → `persist()` per mutable property |
| Faking an OS-owned toggle (e.g. a local "Notifications" switch that doesn't call `UNUserNotificationCenter`) | Diverges from the real system state the first time it's checked elsewhere | `LabeledContent` showing real status + a deep-link button |

## Severity guide

CRITICAL: a preference silently fails to persist (missing `@Observable` persist step), or an app fakes an OS-owned permission toggle instead of reflecting real state. HIGH: `Picker` selection tag type mismatches the binding (row renders blank), or a `Form` inside a glass sheet fights its own opaque background. MEDIUM: wrong row type for the data (custom stack instead of `LabeledContent`), missing `.searchable` on a genuinely long screen. LOW: header/footer casing or tone that doesn't match Settings-app convention.

## See also

- `references/patterns/09-auth-account.md#account-settings-screen` -- account/sign-out/delete rows this file only places
- `references/patterns/04-loading-empty-error.md` -- `ContentUnavailableView.search` for empty search results
- `references/patterns/07-feedback-reviews-notifications.md` -- `Link` rows for support/privacy and the review-request action
- `references/design/02-liquid-glass.md#accessibility-auto-adaptation` -- Reduce Transparency behavior a `Form` inherits for free
- `references/accessibility/02-dynamic-type-adaptation.md` -- Dynamic Type scaling for row labels and footers
- `references/cross-platform/04-macos-catalyst.md` -- full macOS Settings-scene and windowing conventions
- `~/Claude/vault/iOS Development/06 - SwiftUI Fundamentals.md#form` -- deep source
