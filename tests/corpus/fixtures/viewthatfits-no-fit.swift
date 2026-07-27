// FIXTURE: viewthatfits-no-fit
// Plants: adaptive/viewthatfits-no-fitting-candidate, adaptive/no-scaled-metric
//
// ViewThatFits renders its LAST candidate when none fit. Here every candidate
// is a horizontal arrangement of the same fixed-width pieces, so at AX5 the
// modifier added to prevent clipping produces exactly the clipping it was added
// to prevent. The fixed 32pt icon beside scaling text is the second defect.

import SwiftUI

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
struct Metric { var label: String; var value: String }

struct MetricRow: View {
    let metric: Metric

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 16) {
                Image(systemName: "chart.bar.fill").frame(width: 32, height: 32)
                Text(metric.label)
                Spacer()
                Text(metric.value)
            }
            HStack(spacing: 8) {
                Image(systemName: "chart.bar.fill").frame(width: 32, height: 32)
                Text(metric.label)
                Spacer()
                Text(metric.value)
            }
        }
        .padding()
    }
}
