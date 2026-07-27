// FIXTURE: stretched-phone-ipad
// Plants: density/stretched-phone
//
// List-plus-detail content in a single column on a target that supports iPad.
// Nothing here clips, nothing overflows, every screenshot is clean -- and on a
// 13-inch iPad the app is a phone with air around it. This is the defect the
// density dimension exists for, and the one that reads as taste without a
// measurement attached.

import SwiftUI

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
struct Workout: Identifiable, Hashable { let id = UUID(); var name: String; var calories: Int }

struct ContentView: View {
    @State private var workouts: [Workout] = []

    var body: some View {
        NavigationStack {
            List(workouts) { workout in
                NavigationLink(value: workout) {
                    HStack {
                        Text(workout.name)
                        Spacer()
                        Text(workout.calories, format: .number)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Workouts")
            .navigationDestination(for: Workout.self) { WorkoutDetail(workout: $0) }
        }
    }
}

struct WorkoutDetail: View {
    let workout: Workout
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(workout.name).font(.largeTitle)
                Text("\(workout.calories) calories")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
        .navigationTitle(workout.name)
    }
}
