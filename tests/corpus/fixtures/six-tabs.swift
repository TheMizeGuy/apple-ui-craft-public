// FIXTURE: six-tabs
// Plants: ia/tab-overflow, ia/missing-navigation-title
//
// A sixth tab does not become a sixth tab. The system collapses the surplus
// into "More", so Settings becomes a row in a list nobody visits -- an
// information-architecture defect wearing a tab bar. The Trends screen also
// sets no navigationTitle, so anything pushed from it gets a back button
// reading "Back", which tells the user nothing.

import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            TodayView().tabItem { Label("Today", systemImage: "calendar") }
            TrendsView().tabItem { Label("Trends", systemImage: "chart.xyaxis.line") }
            WorkoutsView().tabItem { Label("Workouts", systemImage: "figure.run") }
            AwardsView().tabItem { Label("Awards", systemImage: "trophy") }
            SharingView().tabItem { Label("Sharing", systemImage: "person.2") }
            SettingsView().tabItem { Label("Settings", systemImage: "gear") }
        }
    }
}

struct TrendsView: View {
    var body: some View {
        NavigationStack {
            List { Text("This week") }
        }
    }
}

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
struct TodayView: View { var body: some View { NavigationStack { Text("Today").navigationTitle("Today") } } }
struct WorkoutsView: View { var body: some View { NavigationStack { Text("Workouts").navigationTitle("Workouts") } } }
struct AwardsView: View { var body: some View { NavigationStack { Text("Awards").navigationTitle("Awards") } } }
struct SharingView: View { var body: some View { NavigationStack { Text("Sharing").navigationTitle("Sharing") } } }
struct SettingsView: View { var body: some View { NavigationStack { Text("Settings").navigationTitle("Settings") } } }
