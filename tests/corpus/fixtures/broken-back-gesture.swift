// FIXTURE: broken-back-gesture
// Plants: flow/broken-pop-gesture
//
// navigationBarBackButtonHidden(true) with a hand-rolled replacement kills the
// interactive pop gesture -- the most-used navigation gesture on iOS. The bar
// looks identical in every screenshot; only the edge swipe is gone.

import SwiftUI

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
struct Workout: Identifiable { let id = UUID(); var name: String }

struct WorkoutDetail: View {
    let workout: Workout
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            Text(workout.name).font(.largeTitle)
        }
        .navigationTitle(workout.name)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    dismiss()
                } label: {
                    Label("Back", systemImage: "chevron.left")
                }
            }
        }
    }
}
