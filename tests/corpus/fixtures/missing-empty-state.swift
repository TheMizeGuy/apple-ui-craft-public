// FIXTURE: missing-empty-state
// Plants: state/missing-empty, state/empty-vs-zero-results-conflated
//
// Two states are missing and one is conflated. An empty collection renders a
// bar over nothing, which reads as broken to the user with the least context;
// and the filtered-to-nothing case shares that non-existent treatment, so the
// two audiences that need different recoveries both get none.

import SwiftUI

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
struct Workout: Identifiable { let id = UUID(); var name: String }

struct WorkoutList: View {
    @State private var workouts: [Workout] = []
    @State private var searchText = ""

    private var visible: [Workout] {
        searchText.isEmpty ? workouts : workouts.filter { $0.name.contains(searchText) }
    }

    var body: some View {
        List(visible) { workout in
            Text(workout.name)
        }
        .searchable(text: $searchText)
        .navigationTitle("Workouts")
        .task { workouts = await store.load() }
    }
}

enum store { static func load() async -> [Workout] { [] } }
