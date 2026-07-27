// FIXTURE: destructive-no-confirm
// Plants: forms/destructive-unguarded, forms/bulk-without-count
//
// Two irreversible paths with neither confirmation nor undo. The swipe-to-delete
// destroys one record on a reflex gesture; "Delete All" destroys every record
// without stating how many. Both are one tap from the resting state.

import SwiftUI

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
struct Workout: Identifiable { let id = UUID(); var name: String }

struct WorkoutList: View {
    @State private var workouts: [Workout] = []

    var body: some View {
        List {
            ForEach(workouts) { Text($0.name) }
                .onDelete { offsets in
                    workouts.remove(atOffsets: offsets)
                    Task { await store.deletePermanently(offsets) }
                }
        }
        .navigationTitle("Workouts")
        .toolbar {
            Button("Delete All", role: .destructive) {
                workouts.removeAll()
                Task { await store.deleteAll() }
            }
        }
    }
}

enum store {
    static func deletePermanently(_ offsets: IndexSet) async {}
    static func deleteAll() async {}
}
