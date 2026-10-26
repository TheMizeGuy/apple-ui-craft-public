// FIXTURE: conformance-hamburger-drawer
// Plants: conformance/hamburger-drawer
//
// The four top-level sections are reached only through a menu button that
// slides a drawer in from the leading edge. There is no TabView, so nothing on
// screen says where the user is or that the other sections exist.

import SwiftUI

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
enum Area: CaseIterable, Identifiable {
    case today, trips, saved, settings
    var id: Self { self }
    var title: String {
        switch self {
        case .today: "Today"
        case .trips: "Trips"
        case .saved: "Saved"
        case .settings: "Settings"
        }
    }
    var systemImage: String {
        switch self {
        case .today: "sun.max"
        case .trips: "suitcase"
        case .saved: "bookmark"
        case .settings: "gearshape"
        }
    }
}
struct AreaView: View { let area: Area; var body: some View { Text(area.title) } }

struct TravelRoot: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var area: Area = .today
    @State private var isMenuOpen = false

    private var slide: Animation? { reduceMotion ? nil : .spring(duration: 0.35, bounce: 0) }

    var body: some View {
        ZStack(alignment: .leading) {
            NavigationStack {
                AreaView(area: area)
                    .navigationTitle(area.title)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Menu", systemImage: "line.3.horizontal") {
                                withAnimation(slide) { isMenuOpen.toggle() }
                            }
                        }
                    }
            }
            if isMenuOpen {
                SideMenu(selection: $area, isOpen: $isMenuOpen, animation: slide)
                    .transition(reduceMotion ? .opacity : .move(edge: .leading))
                    .accessibilityAddTraits(.isModal)
            }
        }
        .sensoryFeedback(.selection, trigger: area)
    }
}

struct SideMenu: View {
    @Binding var selection: Area
    @Binding var isOpen: Bool
    let animation: Animation?

    var body: some View {
        HStack(spacing: 0) {
            List(Area.allCases) { item in
                Button {
                    withAnimation(animation) {
                        selection = item
                        isOpen = false
                    }
                } label: {
                    Label(item.title, systemImage: item.systemImage)
                }
                .accessibilityAddTraits(item == selection ? .isSelected : [])
            }
            .containerRelativeFrame(.horizontal) { width, _ in width * 0.8 }
            Button { close() } label: {
                Rectangle()
                    .fill(.ultraThinMaterial)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close Menu")
        }
        .accessibilityAction(.escape) { close() }
    }

    private func close() {
        withAnimation(animation) { isOpen = false }
    }
}
