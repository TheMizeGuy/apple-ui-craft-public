// FIXTURE: conformance-gestures
// Plants: conformance/drag-state-strands-on-cancel, conformance/swipe-dismiss-disabled
//
// The self-view tile's drag offset lives in @State and is zeroed only in
// .onEnded, which SwiftUI skips when the system cancels the drag, so the tile
// strands off its corner. The read-only What's New sheet hardcodes
// interactiveDismissDisabled with nothing to protect, so swipe-down is dead.

import SwiftUI

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
final class CallSession { var contactName = "Ana"; func end() {} }
struct RemoteFeed: View { let call: CallSession; var body: some View { Color.black } }
struct SelfPreview: View { var body: some View { Color.gray } }
struct ReleaseNote: Identifiable { let id = UUID(); var title: String; var detail: String }
let releaseNotes = [ReleaseNote(title: "Live Captions", detail: "Captions appear while the other person speaks.")]

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

struct CallScreen: View {
    let call: CallSession
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var corner: Corner = .topTrailing
    @State private var dragOffset: CGSize = .zero
    @State private var stageSize: CGSize = .zero
    @State private var isMuted = false

    private var settle: Animation? { reduceMotion ? nil : .spring(duration: 0.4, bounce: 0.2) }

    var body: some View {
        selfView
            .offset(dragOffset)
            .gesture(
                DragGesture(coordinateSpace: .named("stage"))
                    .onChanged { dragOffset = $0.translation }
                    .onEnded { value in
                        let landing = reduceMotion ? value.location : value.predictedEndLocation
                        withAnimation(settle) {
                            corner = .nearest(to: landing, in: stageSize)
                            dragOffset = .zero
                        }
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

struct AboutScreen: View {
    @State private var isShowingWhatsNew = false

    var body: some View {
        Form {
            Section {
                Button("What's New") { isShowingWhatsNew = true }
            }
        }
        .navigationTitle("About")
        .sheet(isPresented: $isShowingWhatsNew) {
            WhatsNewSheet()
        }
    }
}

struct WhatsNewSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    ForEach(releaseNotes) { note in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(note.title)
                                .font(.headline)
                            Text(note.detail)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
            }
            .navigationTitle("What's New")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .interactiveDismissDisabled()
    }
}
