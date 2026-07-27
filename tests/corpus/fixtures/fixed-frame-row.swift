// FIXTURE: fixed-frame-row
// Plants: adaptive/fixed-frame, density/leftover-sizing
//
// The single most common adaptive defect in shipped SwiftUI. The title is
// pinned to a number, so the size proposal stopped mattering: at AX5 on a
// narrow window the value truncates, and on an iPad the same row spends 700pt
// of width on nothing. One line causes both.

import SwiftUI

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
struct Workout: Identifiable { let id = UUID(); var name: String; var calories: Int }

struct WorkoutRow: View {
    let workout: Workout

    var body: some View {
        HStack {
            Image(systemName: "flame.fill")
                .frame(width: 24, height: 24)
            Text(workout.name)
                .frame(width: 120, alignment: .leading)
            Spacer()
            Text(workout.calories, format: .number)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

struct WorkoutList: View {
    let workouts: [Workout]

    var body: some View {
        List(workouts) { WorkoutRow(workout: $0) }
            .navigationTitle("Workouts")
    }
}
