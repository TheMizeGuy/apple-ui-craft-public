# Exemplar: Accessibility-First Screen

> Status: signature-drafted, build-pending (requires Xcode build at iOS 18 + iOS 26 targets).
> Composes: `references/accessibility/01-voiceover-fundamentals.md` (rotors, custom actions), `references/accessibility/02-dynamic-type-adaptation.md` (Dynamic Type scale), `references/accessibility/03-visual-accessibility.md` (Increased Contrast, color independence), `references/accessibility/04-motor-interaction.md` (44pt targets, WCAG citations), `references/design/08-adaptive-layout-ipad.md` (`ViewThatFits` reflow), `references/haptics/02-swiftui-sensory-feedback.md`.
> Floors: `@AccessibilityFocusState`/`.accessibilityFocused` iOS 15.0+; `.accessibilityRepresentation`/`.accessibilityChildren` iOS 15.0+; `.accessibilityAdjustableAction` iOS 15.0+; `performAccessibilityAudit(for:)` filter overload current on XCTest.

An alerts inbox -- the canonical screen that needs every accessibility surface at once: one curated VoiceOver stop per row, Dynamic Type reflow via `ViewThatFits`, programmatic focus movement after an action, custom-control semantics borrowed from native controls, and an XCTest audit harness. This file is the composed target; each technique's full treatment lives in the accessibility reference files it draws from.

## The Apple way

- One row is ONE VoiceOver element (`.accessibilityElement(children: .ignore)` + a curated label/value), not five stops for icon, dot, title, detail, and meter.
- Static identity goes in the label; mutable state (unread, priority, flagged, time) goes in the value, so a re-read announces exactly what changed.
- `.accessibilityElement(children: .combine)` SWALLOWS each child's own action -- a combined/ignored element hides its children's default actions. Re-expose them via `.accessibilityActions { }` or you silently lose swipe-equivalent behavior for VoiceOver users.
- A hand-drawn custom control never reconstructs label+value+adjustable by hand -- map it to a REAL native control's semantics via `.accessibilityRepresentation`. VoiceOver then treats the custom view exactly like the native control: correct value announcement, swipe-to-adjust, Voice Control, Full Keyboard Access, all for free.

## Core APIs

### Reusable patterns absent from the base accessibility files

**Custom-drawn adjustable control → borrow a native control's semantics:**

```swift
struct BrightnessDial: View {
    @Binding var value: Double   // 0...100
    var body: some View {
        DialTrack(value: value)              // your Canvas/GeometryReader drawing
            .gesture(rotationGesture)        // your custom sighted gesture
            .accessibilityRepresentation {
                Slider(value: $value, in: 0...100, step: 1) { Text("Brightness") }
            }
    }
}
```

The visual view renders for sighted users; the `Slider` inside the representation is invisible but is the ONLY thing assistive tech sees -- correct value announcement, swipe-to-adjust, Voice Control, and Full Keyboard Access come free.

**`Canvas`/`Path` chart → synthetic per-datum accessibility elements:**

```swift
Canvas { ctx, size in /* draw bars */ }
    .accessibilityLabel("Lines of code per week")
    .accessibilityChildren {
        HStack { ForEach(dataSet) { d in
            RoundedRectangle(cornerRadius: 5)
                .accessibilityLabel("Week \(d.week)").accessibilityValue("\(d.lines) lines")
        } }
    }
```

`.accessibilityChildren(children:)` injects invisible child views the framework turns into navigable elements -- one VoiceOver stop per bar. (For Swift Charts, prefer `.chartXAxis`/`AXChartDescriptor` per `references/design/09-swift-charts.md` -- `accessibilityChildren` is for raw `Canvas`.)

**Programmatic VoiceOver focus after an off-screen state change:**

```swift
@AccessibilityFocusState private var focus: Field?
enum Field: Hashable { case email }

TextField("Email", text: $email).accessibilityFocused($focus, equals: .email)
if let emailError {
    Text(emailError).foregroundStyle(.red).accessibilityFocused($focus, equals: .email)
}
// on validation failure: focus = .email -- VoiceOver jumps to the offending field
```

**Announcing a change VoiceOver can't see:** `AccessibilityNotification.Announcement("3 alerts archived").post()` (iOS 17+) -- reserve for genuinely invisible changes; overuse is noise.

### Part A -- model, store, screen, header

```swift
import SwiftUI

struct AlertItem: Identifiable, Hashable {
    let id = UUID()
    var title: String, detail: String
    var category: Category
    var date: Date
    var isUnread: Bool, isFlagged: Bool
    var priority: Priority

    enum Priority: Int, CaseIterable, Comparable {
        case low, medium, high, urgent
        var name: String { switch self { case .low: "Low"; case .medium: "Medium"; case .high: "High"; case .urgent: "Urgent" } }
        static func < (l: Self, r: Self) -> Bool { l.rawValue < r.rawValue }
    }
    enum Category: String, CaseIterable {
        case security, billing, shipping, social
        var label: String { rawValue.capitalized }
        var symbol: String {
            switch self { case .security: "lock.shield.fill"; case .billing: "creditcard.fill"
                          case .shipping: "shippingbox.fill"; case .social: "person.2.fill" }
        }
        // Production: back with an asset-catalog color set carrying an Increased-Contrast
        // appearance -- a raw literal can't strengthen when the user turns that setting on.
        var tint: Color {
            switch self { case .security: .red; case .billing: .indigo; case .shipping: .orange; case .social: .teal }
        }
    }
}

@Observable
final class AlertsModel {
    var items: [AlertItem]
    init(items: [AlertItem] = .samples) { self.items = items }

    // Cheap derived filters for the rotors. Never rebuild a sort/filter INSIDE the rotor
    // closure -- it re-runs on every body eval even with VoiceOver off.
    var unread: [AlertItem] { items.filter(\.isUnread) }
    var flagged: [AlertItem] { items.filter(\.isFlagged) }
    var unreadCount: Int { unread.count }

    func markRead(_ item: AlertItem)   { mutate(item) { $0.isUnread = false } }
    func toggleRead(_ item: AlertItem) { mutate(item) { $0.isUnread.toggle() } }
    func toggleFlag(_ item: AlertItem) { mutate(item) { $0.isFlagged.toggle() } }
    func archive(_ item: AlertItem)    { items.removeAll { $0.id == item.id } }
    func markAllRead()                 { for i in items.indices { items[i].isUnread = false } }
    func adjustPriority(_ item: AlertItem, by delta: Int) {
        mutate(item) {
            let c = min(max($0.priority.rawValue + delta, 0), AlertItem.Priority.allCases.count - 1)
            $0.priority = AlertItem.Priority(rawValue: c) ?? $0.priority
        }
    }
    private func mutate(_ item: AlertItem, _ change: (inout AlertItem) -> Void) {
        guard let i = items.firstIndex(where: { $0.id == item.id }) else { return }
        change(&items[i])
    }
}

struct AccessibleAlertsScreen: View {
    @State private var model = AlertsModel()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(model.items) { item in
                        AlertRow(item: item,
                            onOpen: { model.markRead(item) },
                            onToggleFlag: { model.toggleFlag(item) },
                            onToggleRead: { model.toggleRead(item) },
                            onArchive: { withAnimation(reduceMotion ? nil : .spring(duration: 0.35, bounce: 0.2)) { model.archive(item) } },
                            onAdjustPriority: { delta in model.adjustPriority(item, by: delta) })
                    }
                } header: { AlertsSummaryHeader(unreadCount: model.unreadCount) }
            }
            .listStyle(.plain)
            .navigationTitle("Alerts")
            .toolbarTitleDisplayMode(.large)   // an inline title truncates to "…" at AX5
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { withAnimation(reduceMotion ? nil : .default) { model.markAllRead() } } label: {
                        Label("Mark all as read", systemImage: "envelope.open")
                    }
                    // Voice Control synonyms when the label diverges from visible glyph-only text.
                    .accessibilityInputLabels(["Mark all as read", "Read all", "Clear unread"])
                }
            }
            // Rotors: jump straight to unread/flagged -- array form keeps entry off the
            // per-frame body path (no Namespace form needed for same-hierarchy entries).
            .accessibilityRotor("Unread", entries: model.unread, entryID: \.id, entryLabel: \.title)
            .accessibilityRotor("Flagged", entries: model.flagged, entryID: \.id, entryLabel: \.title)
        }
    }
}

struct AlertsSummaryHeader: View {
    let unreadCount: Int
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) private var glyph: CGFloat = 34

    var body: some View {
        ViewThatFits(in: .horizontal) {                 // owner: design/08-adaptive-layout-ipad.md
            HStack(spacing: 12) { icon; text }
            VStack(alignment: .leading, spacing: 8) { icon; text }
        }
        .padding().frame(maxWidth: .infinity, alignment: .leading)
        .background { reduceTransparency ? AnyView(Color(.secondarySystemBackground)) : AnyView(Rectangle().fill(.regularMaterial)) }
        .clipShape(.rect(cornerRadius: 16))
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isHeader)
        .accessibilityLabel(Text(label))
    }
    private var icon: some View {
        Image(systemName: unreadCount == 0 ? "checkmark.seal.fill" : "bell.badge.fill")
            .font(.system(size: glyph)).foregroundStyle(unreadCount == 0 ? Color.green : Color.accentColor)
            .accessibilityHidden(true)
    }
    private var text: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(unreadCount == 0 ? "All caught up" : "\(unreadCount)").font(.largeTitle.weight(.bold)).monospacedDigit()
                .contentTransition(reduceMotion ? .identity : .numericText())
            Text(unreadCount == 0 ? "No unread alerts" : "Unread alerts").font(.subheadline).foregroundStyle(.secondary)
        }
    }
    private var label: String {
        switch unreadCount { case 0: "All caught up. No unread alerts."; case 1: "1 unread alert."; default: "\(unreadCount) unread alerts." }
    }
}
```

### Part B -- `AlertRow`, `PriorityMeter`, previews, XCTest audit

```swift
struct AlertRow: View {
    let item: AlertItem
    var onOpen: () -> Void, onToggleFlag: () -> Void, onToggleRead: () -> Void
    var onArchive: () -> Void, onAdjustPriority: (Int) -> Void

    /// Reduce Motion is read-only -- can't be forced in a #Preview. This override is the
    /// testable seam for previews/tests.
    var reduceMotionOverride: Bool? = nil
    @Environment(\.accessibilityReduceMotion) private var envReduceMotion
    @Environment(\.accessibilityDifferentiateWithoutColor) private var diffWithoutColor
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 28
    @ScaledMetric(relativeTo: .body) private var dotSize: CGFloat = 10
    @State private var pulse = false
    private var reduceMotion: Bool { reduceMotionOverride ?? envReduceMotion }

    var body: some View {
        rowContent
            .padding(.vertical, 6)
            .frame(minHeight: 44)   // WCAG 2.5.5 / HIG touch target -- see accessibility/04
            .contentShape(.rect)
            .onTapGesture(perform: onOpen)
            .overlay(alignment: .leading) {
                if item.isUnread && contrast == .increased {
                    Rectangle().fill(Color.accentColor).frame(width: 3)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(a11yLabel))
            .accessibilityValue(Text(a11yValue))
            .accessibilityHint("Double tap to open. Swipe up or down to change priority.")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(perform: onOpen)
            .accessibilityAdjustableAction { direction in
                switch direction { case .increment: onAdjustPriority(1); case .decrement: onAdjustPriority(-1); @unknown default: break }
            }
            // .combine SWALLOWS each child's own action -- re-expose them explicitly.
            .accessibilityActions {
                Button(item.isFlagged ? "Unflag" : "Flag", action: onToggleFlag)
                Button(item.isUnread ? "Mark as read" : "Mark as unread", action: onToggleRead)
                Button("Archive", role: .destructive, action: onArchive)
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                Button("Archive", systemImage: "archivebox", role: .destructive, action: onArchive)
            }
            .swipeActions(edge: .leading) {
                Button(item.isFlagged ? "Unflag" : "Flag",
                       systemImage: item.isFlagged ? "flag.slash" : "flag", action: onToggleFlag).tint(.orange)
                Button(item.isUnread ? "Read" : "Unread",
                       systemImage: item.isUnread ? "envelope.open" : "envelope", action: onToggleRead)
            }
            .sensoryFeedback(.selection, trigger: item.priority)
            .sensoryFeedback(.impact(weight: .light), trigger: item.isFlagged)
            .onAppear { if !reduceMotion { pulse = true } }
    }

    @ViewBuilder private var rowContent: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) { leading; center; Spacer(minLength: 8); trailing }
            VStack(alignment: .leading, spacing: 8) { HStack(spacing: 12) { leading; trailing }; center }
        }
    }
    private var leading: some View {
        ZStack(alignment: .topTrailing) {
            Image(systemName: item.category.symbol).font(.system(size: iconSize)).foregroundStyle(item.category.tint)
                .frame(width: iconSize + 8, height: iconSize + 8).accessibilityHidden(true)
            if item.isUnread {
                Circle().fill(Color.accentColor).frame(width: dotSize, height: dotSize)
                    .overlay { if diffWithoutColor { Circle().strokeBorder(.primary, lineWidth: 1) } }
                    .scaleEffect(pulse && !reduceMotion ? 1.0 : 0.82)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 1).repeatForever(autoreverses: true), value: pulse)
                    .accessibilityHidden(true)
            }
        }
    }
    private var center: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(item.title).font(.headline).fontWeight(item.isUnread ? .bold : .regular)
                .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
            Text(item.detail).font(.subheadline).foregroundStyle(.secondary)
                .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
            Text(item.date, format: .relative(presentation: .named)).font(.caption).foregroundStyle(.secondary)
        }
        .accessibilityHidden(true)
    }
    private var trailing: some View {
        HStack(spacing: 8) {
            if item.isFlagged { Image(systemName: "flag.fill").foregroundStyle(.orange).accessibilityHidden(true) }
            PriorityMeter(priority: item.priority).frame(width: 22, height: iconSize).accessibilityHidden(true)
        }
    }
    private var a11yLabel: String { "\(item.category.label) alert. \(item.title). \(item.detail)." }
    private var a11yValue: String {
        var p: [String] = []
        if item.isUnread { p.append("Unread") }
        p.append("\(item.priority.name) priority")
        if item.isFlagged { p.append("Flagged") }
        p.append(item.date.formatted(.relative(presentation: .named)))
        return p.joined(separator: ", ")
    }
}

/// Hand-drawn control. Inside a row it's `.accessibilityHidden(true)` because the row's value
/// already speaks the priority. STANDALONE, map it to native semantics instead:
///   PriorityMeter(priority: p).accessibilityRepresentation { Stepper("Priority", value: $raw, in: 0...3) }
struct PriorityMeter: View {
    let priority: AlertItem.Priority
    var body: some View {
        Canvas { ctx, size in
            let bars = AlertItem.Priority.allCases.count, gap: CGFloat = 2
            let barW = (size.width - gap * CGFloat(bars - 1)) / CGFloat(bars)
            for i in 0..<bars {
                let filled = i <= priority.rawValue
                let h = size.height * (CGFloat(i + 1) / CGFloat(bars))
                let rect = CGRect(x: CGFloat(i) * (barW + gap), y: size.height - h, width: barW, height: h)
                ctx.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(filled ? .accentColor : .gray.opacity(0.35)))
            }
        }
    }
}

extension AlertItem {
    static let samples: [AlertItem] = [
        .init(title: "Suspicious sign-in blocked", detail: "We blocked a sign-in from a new device in Berlin.",
              category: .security, date: .now.addingTimeInterval(-3600), isUnread: true, isFlagged: true, priority: .urgent),
        .init(title: "Payment received", detail: "Your invoice #4021 was paid in full.",
              category: .billing, date: .now.addingTimeInterval(-7200), isUnread: true, isFlagged: false, priority: .low),
        .init(title: "Package out for delivery", detail: "Order #A-1183 arrives today between 2 and 4 PM.",
              category: .shipping, date: .now.addingTimeInterval(-86400), isUnread: false, isFlagged: false, priority: .medium),
    ]
}

#Preview("Default") { AccessibleAlertsScreen() }
#Preview("Dynamic Type AX1") { AccessibleAlertsScreen().dynamicTypeSize(.accessibility1) }
#Preview("Dynamic Type AX5") { AccessibleAlertsScreen().dynamicTypeSize(.accessibility5) }
#Preview("Reduce Motion (row seam)") {
    // accessibilityReduceMotion is get-only -- this override is the injectable seam, not
    // .environment(\.accessibilityReduceMotion, true), which does not compile.
    List { AlertRow(item: .samples[0], reduceMotionOverride: true,
                     onOpen: {}, onToggleFlag: {}, onToggleRead: {}, onArchive: {}, onAdjustPriority: { _ in }) }
        .listStyle(.plain)
}
```

XCTest audit harness (same target), scoped incrementally:

```swift
func test_screenPassesAudit() throws {
    let app = XCUIApplication(); app.launch()
    try app.performAccessibilityAudit(for: [.contrast, .dynamicType, .elementDetection]) { issue in
        false   // return true to IGNORE a known false-positive
    }
}
```

## Availability + fallbacks

`.accessibilityRepresentation`, `.accessibilityChildren`, `@AccessibilityFocusState`, and `.accessibilityAdjustableAction` are all iOS 15.0+ -- no gate needed at this file's iOS 18+ floor. `AccessibilityNotification.Announcement(_:).post()` (iOS 17+) has a pre-17 fallback of `UIAccessibility.post(notification: .announcement, argument:)`.

## Accessibility contract

This IS the accessibility contract file -- every technique above is the primary subject, not a caveat. The one rule that generalizes: Reduce Motion / Reduce Transparency / Increase Contrast / colorSchemeContrast are get-only environment keys -- `.environment(\.accessibilityReduceMotion, true)` does not compile as a preview injection; thread your own `Bool?` override through a testable seam instead (`reduceMotionOverride` above), or verify via Simulator Settings/a physical device.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `.accessibilityElement(children: .combine)` with no re-exposed actions | Silently swallows each child's own action (swipe-equivalent behavior vanishes for VoiceOver) | `.accessibilityActions { }` re-exposing every action the row supports |
| N identically-named re-exposed actions ("Open link", "Open link") | Actions rotor shows indistinguishable duplicates | Number by position: "Open link (1 of 3)" |
| `AccessibilityRotorEntry(_:id:in: namespace)` always shown as if namespace were mandatory | The no-namespace form works for entries in the SAME hierarchy as the rotor | `AccessibilityRotorEntry(_:id:)` when entries live where the rotor is declared |
| Hand-rolled headings via styled `Text` with no `.isHeader` trait | Invisible to the rotor's "Headings" mode | `.accessibilityAddTraits(.isHeader)` on every hand-built heading |
| A rotor's `entries:` closure re-sorting/filtering inline | Re-runs the sort/filter on every body invalidation, even with VoiceOver off | Hoist the derived collection to a stored property |
| `.environment(\.accessibilityReduceMotion, true)` in a `#Preview` | Get-only `KeyPath` -- compile error | A `Bool?` override parameter as the testable seam |

## Severity guide

CRITICAL: a custom gesture-driven control with zero `accessibilityAction`/rotor equivalent -- VoiceOver users cannot complete the task at all. HIGH: `.combine` swallowing an action with no re-exposure. MEDIUM: color-only state encoding with no shape/label backup under Differentiate Without Color. LOW: duplicate unlabeled custom-action names. NIT: a hand-rolled heading missing `.isHeader`.

## See also

- `references/accessibility/01-voiceover-fundamentals.md` -- rotors, custom actions, VoiceOver fundamentals (owner)
- `references/accessibility/02-dynamic-type-adaptation.md` -- Dynamic Type scale (owner)
- `references/accessibility/03-visual-accessibility.md` -- Increased Contrast, Differentiate Without Color, get-only env keys (owner)
- `references/accessibility/04-motor-interaction.md` -- 44pt touch targets, WCAG citations (owner)
- `references/design/08-adaptive-layout-ipad.md` -- `ViewThatFits` reflow mechanics (owner)
- `references/haptics/02-swiftui-sensory-feedback.md` -- `.sensoryFeedback` vocabulary (owner)
