// FIXTURE: conformance-clean-control
// Plants: NOTHING. This is the clean control for the conformance checks: a
// correct review files no finding here.
//
// Every construct is the prescribed counterpart of a conformance plant, plus
// the exemptions those checks carry: a drag held in @GestureState with its
// outcome written on success, a required consent step that locks dismissal and
// says why, a camera preview that alone ignores the safe area, a
// sidebar-adaptable TabView, a Toggle restyled through ToggleStyle, a custom
// dial bridged with accessibilityRepresentation, a Menu whose label is a
// row's text block restyled plain beside a toolbar Menu that keeps the
// system chrome on its short Label, SF Symbols beside one custom symbol, and
// semantic text colors throughout.
//
// A run that flags any of these has learned to match constructs, not defects.

import SwiftUI

// Minimal stubs so the fixture stands alone.
final class CallSession { var contactName = "Ana"; func end() {} }
struct RemoteFeed: View { let call: CallSession; var body: some View { Color.black } }
struct SelfPreview: View { var body: some View { Color.gray } }
final class CaptureSession {}
@Observable final class CameraModel {
    let session = CaptureSession()
    var isAuthorized = true
    var captureCount = 0
    func capture() { captureCount += 1 }
}
struct CameraPreview: UIViewRepresentable {
    let session: CaptureSession
    func makeUIView(context: Context) -> UIView { UIView() }
    func updateUIView(_ uiView: UIView, context: Context) {}
}
@Observable final class Account {
    var needsConsent = true
    func acceptTerms() { needsConsent = false }
    func signOut() { needsConsent = false }
}
@Observable final class TrailMapModel {
    var markerCount = 0
    func locate() {}
    func dropMarker() { markerCount += 1 }
}
struct TrailMap: View { let model: TrailMapModel; var body: some View { Color.green } }
struct AreaView: View { let title: String; var body: some View { Text(title) } }
let termsSummary = "We updated how trip photos are stored. Read the summary, then accept or decline."

enum Area: Hashable { case today, trips, saved, settings }
enum MapStyleChoice: Hashable { case standard, satellite }

enum Corner: CaseIterable, Identifiable {
    case topLeading, topTrailing, bottomLeading, bottomTrailing
    var id: Self { self }
    var name: String {
        switch self {
        case .topLeading: "top leading corner"
        case .topTrailing: "top trailing corner"
        case .bottomLeading: "bottom leading corner"
        case .bottomTrailing: "bottom trailing corner"
        }
    }
    var alignment: Alignment {
        switch self {
        case .topLeading: .topLeading
        case .topTrailing: .topTrailing
        case .bottomLeading: .bottomLeading
        case .bottomTrailing: .bottomTrailing
        }
    }
    static func nearest(to point: CGPoint, in size: CGSize) -> Corner {
        switch (point.x < size.width / 2, point.y < size.height / 2) {
        case (true, true): .topLeading
        case (false, true): .topTrailing
        case (true, false): .bottomLeading
        case (false, false): .bottomTrailing
        }
    }
}

// MARK: - Root

struct TravelRoot: View {
    @State private var area: Area = .today
    @State private var account = Account()

    var body: some View {
        TabView(selection: $area) {
            Tab("Today", systemImage: "sun.max", value: Area.today) {
                NavigationStack { AreaView(title: "Today").navigationTitle("Today") }
            }
            Tab("Trips", systemImage: "suitcase", value: Area.trips) {
                TripMapScreen()
            }
            Tab("Saved", systemImage: "bookmark", value: Area.saved) {
                NavigationStack { AreaView(title: "Saved").navigationTitle("Saved") }
            }
            Tab("Settings", systemImage: "gearshape", value: Area.settings) {
                SettingsScreen()
            }
        }
        .tabViewStyle(.sidebarAdaptable)
        .sensoryFeedback(.selection, trigger: area)
        .sheet(isPresented: $account.needsConsent) {
            TermsUpdateSheet(onAccept: account.acceptTerms, onDecline: account.signOut)
        }
    }
}

// MARK: - Consent

struct TermsUpdateSheet: View {
    let onAccept: () -> Void
    let onDecline: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(termsSummary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
            }
            .navigationTitle("Updated Terms")
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 12) {
                    Button("Accept") { onAccept() }
                        .buttonStyle(.borderedProminent)
                    Button("Decline") { onDecline() }
                }
                .controlSize(.large)
                .padding()
            }
        }
        .interactiveDismissDisabled()   // a required step: Accept or Decline is the only way on
    }
}

// MARK: - Map toolbar

struct TripMapScreen: View {
    @State private var map = TrailMapModel()
    @State private var mapStyle = MapStyleChoice.standard

    var body: some View {
        NavigationStack {
            TrailMap(model: map)
                .navigationTitle("Trips")
                .toolbar {
                    ToolbarItemGroup(placement: .primaryAction) {
                        Menu {
                            Picker("Map Style", selection: $mapStyle) {
                                Text("Standard").tag(MapStyleChoice.standard)
                                Text("Satellite").tag(MapStyleChoice.satellite)
                            }
                        } label: {
                            Label("Map Style", systemImage: "map")
                        }
                        Button("Locate Me", systemImage: "location") { map.locate() }
                        Button { map.dropMarker() } label: {
                            Label {
                                Text("Drop Marker")
                            } icon: {
                                Image("custom.trail.marker")
                                    .symbolRenderingMode(.hierarchical)
                            }
                        }
                    }
                }
                .sensoryFeedback(.success, trigger: map.markerCount)
        }
    }
}

// MARK: - Settings

struct SettingsScreen: View {
    @State private var pushEnabled = true
    @State private var volume = 0.6
    @State private var alertSound = "Chime"
    private let sounds = ["Chime", "Bell", "Pulse"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Notifications") {
                    Toggle("Push notifications", isOn: $pushEnabled)
                        .toggleStyle(.check)
                        .sensoryFeedback(.selection, trigger: pushEnabled)
                    Menu {
                        Picker("Alert Sound", selection: $alertSound) {
                            ForEach(sounds, id: \.self) { Text($0) }
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Alert sound")
                            Text(alertSound)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(.rect)
                    }
                    .menuStyle(.button)
                    .buttonStyle(.plain)
                }
                Section("Alert Volume") {
                    VolumeDial(volume: $volume)
                        .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle("Settings")
        }
    }
}

struct CheckToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            HStack {
                configuration.label
                Spacer()
                Image(systemName: configuration.isOn ? "checkmark.circle.fill" : "circle")
                    .imageScale(.large)
                    .foregroundStyle(configuration.isOn ? Color.accentColor : Color.secondary)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityRepresentation {
            Toggle(isOn: configuration.$isOn) { configuration.label }
                .toggleStyle(.switch)
        }
    }
}

extension ToggleStyle where Self == CheckToggleStyle {
    static var check: CheckToggleStyle { .init() }
}

struct VolumeDial: View {
    @Binding var volume: Double
    @ScaledMetric(relativeTo: .body) private var scaledDiameter: CGFloat = 120
    @GestureState private var previousAngle: Double? = nil

    private var diameter: CGFloat { min(scaledDiameter, 220) }

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(Color(.systemFill), lineWidth: 10)
                Circle()
                    .trim(from: 0, to: volume)
                    .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: diameter, height: diameter)
            .contentShape(Circle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .updating($previousAngle) { value, previous, _ in
                        let current = angle(at: value.location)
                        if let previous {
                            var delta = current - previous
                            if delta > .pi { delta -= 2 * .pi } else if delta < -.pi { delta += 2 * .pi }
                            volume = min(max(volume + delta / (2 * .pi), 0), 1)
                        }
                        previous = current
                    }
            )
            Text(volume, format: .percent.precision(.fractionLength(0)))
                .monospacedDigit()
                .foregroundStyle(.secondary)
        }
        .accessibilityRepresentation {
            Slider(value: $volume, in: 0...1) { Text("Alert Volume") }
        }
    }

    private func angle(at point: CGPoint) -> Double {
        Double(atan2(point.x - diameter / 2, diameter / 2 - point.y))
    }
}

// MARK: - Call

struct CallScreen: View {
    let call: CallSession
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @GestureState(reset: { _, transaction in
        transaction.animation = UIAccessibility.isReduceMotionEnabled ? nil : .spring(duration: 0.4, bounce: 0.2)
    }) private var drag: CGSize = .zero
    @State private var corner: Corner = .topTrailing
    @State private var stageSize: CGSize = .zero
    @State private var isMuted = false

    private var settle: Animation? { reduceMotion ? nil : .spring(duration: 0.4, bounce: 0.2) }

    var body: some View {
        selfView
            .offset(drag)
            .gesture(
                DragGesture(coordinateSpace: .named("stage"))
                    .updating($drag) { value, state, _ in state = value.translation }
                    .onEnded { value in
                        let landing = reduceMotion ? value.location : value.predictedEndLocation
                        withAnimation(settle) { corner = .nearest(to: landing, in: stageSize) }
                    }
            )
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: corner.alignment)
            .coordinateSpace(.named("stage"))
            .onGeometryChange(for: CGSize.self) { $0.size } action: { stageSize = $0 }
            .background { RemoteFeed(call: call).ignoresSafeArea() }
            .safeAreaInset(edge: .bottom) { controls }
            .sensoryFeedback(.impact(weight: .light), trigger: corner)
    }

    private var selfView: some View {
        SelfPreview()
            .aspectRatio(3 / 4, contentMode: .fit)
            .containerRelativeFrame(.horizontal) { width, _ in width / 4 }
            .clipShape(.rect(cornerRadius: 16))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Your camera")
            .accessibilityActions {
                ForEach(Corner.allCases) { target in
                    Button("Move to \(target.name)") { corner = target }
                }
            }
    }

    private var controls: some View {
        HStack(spacing: 24) {
            Button { isMuted.toggle() } label: {
                Label(isMuted ? "Unmute" : "Mute", systemImage: isMuted ? "mic.slash.fill" : "mic.fill")
                    .labelStyle(.iconOnly)
                    .frame(minWidth: 44, minHeight: 44)
            }
            Button(role: .destructive) { call.end() } label: {
                Label("End Call", systemImage: "phone.down.fill")
                    .labelStyle(.iconOnly)
                    .frame(minWidth: 44, minHeight: 44)
            }
        }
        .font(.title2)
        .buttonStyle(.glass)
        .sensoryFeedback(.selection, trigger: isMuted)
        .padding()
    }
}

// MARK: - Capture

struct CaptureScreen: View {
    @State private var camera = CameraModel()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    var body: some View {
        if camera.isAuthorized {
            viewfinder
        } else {
            ContentUnavailableView {
                Label("Camera Access Is Off", systemImage: "camera")
            } description: {
                Text("Allow camera access in Settings to take photos.")
            } actions: {
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
                .buttonStyle(.borderedProminent)
                Button("Not Now") { dismiss() }
            }
        }
    }

    private var viewfinder: some View {
        ZStack {
            CameraPreview(session: camera.session)
                .ignoresSafeArea()
                .accessibilityLabel("Viewfinder")
            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Label("Close", systemImage: "xmark")
                            .labelStyle(.iconOnly)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(.glass)
                    Spacer()
                }
                Spacer()
                Button { camera.capture() } label: {
                    Label("Take Photo", systemImage: "camera.circle.fill")
                        .labelStyle(.iconOnly)
                        .font(.largeTitle)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.glass)
                .sensoryFeedback(.impact, trigger: camera.captureCount)
            }
            .padding()
        }
    }
}
