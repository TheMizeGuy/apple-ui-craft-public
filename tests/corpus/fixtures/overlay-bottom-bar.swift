// FIXTURE: overlay-bottom-bar
// Plants: adaptive/overlay-instead-of-safe-area-inset
//
// A custom bar added with .overlay(alignment: .bottom) does not inset the
// scroll content, so the last row of every list is permanently underneath it
// and cannot be scrolled clear. It looks correct in every screenshot, because
// screenshots do not scroll to the end.

import SwiftUI

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
struct Workout: Identifiable { let id = UUID(); var name: String }

struct WorkoutListWithBar: View {
    let workouts: [Workout]

    var body: some View {
        List(workouts) { Text($0.name) }
            .navigationTitle("Workouts")
            .overlay(alignment: .bottom) {
                HStack {
                    Button("Record", systemImage: "plus.circle.fill") { }
                    Spacer()
                    Button("Filter", systemImage: "line.3.horizontal.decrease") { }
                }
                .padding()
                .background(.regularMaterial)
            }
    }
}
