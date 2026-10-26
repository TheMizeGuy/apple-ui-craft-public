// FIXTURE: conformance-web-controls
// Plants: conformance/control-look-alike, conformance/menu-chrome-on-content,
// color/literal-text-color
//
// Notification settings ported from a web page. The push switch is a Capsule
// and a Circle flipped by onTapGesture, with no switch trait, value or
// VoiceOver path; its row label is a literal near-black that measures
// 1.00:1 on the Dark Mode grouped row; and the digest-day row's whole text
// block is the label of a Menu left on the automatic style, so the system
// draws its menu capsule around two lines of content.

import SwiftUI

struct NotificationSettings: View {
    @State private var pushEnabled = true
    @State private var digestEnabled = false
    @State private var digestDay = "Monday"

    var body: some View {
        Form {
            Section("Alerts") {
                HStack {
                    Text("Push notifications")
                        .foregroundStyle(Color(red: 0.11, green: 0.11, blue: 0.12))
                    Spacer()
                    PillSwitch(isOn: $pushEnabled)
                }
                Toggle("Weekly digest", isOn: $digestEnabled)
                    .sensoryFeedback(.selection, trigger: digestEnabled)
                DigestDayRow(day: $digestDay)
            }
        }
        .navigationTitle("Notifications")
    }
}

struct PillSwitch: View {
    @Binding var isOn: Bool

    var body: some View {
        Capsule()
            .fill(isOn ? Color.green : Color(.systemGray4))
            .frame(width: 51, height: 31)
            .overlay(alignment: isOn ? .trailing : .leading) {
                Circle()
                    .fill(.white)
                    .padding(2)
            }
            .padding(.vertical, 7)
            .contentShape(Rectangle())
            .onTapGesture { isOn.toggle() }
    }
}

struct DigestDayRow: View {
    @Binding var day: String
    private let days = ["Monday", "Wednesday", "Friday"]

    var body: some View {
        Menu {
            Picker("Day", selection: $day) {
                ForEach(days, id: \.self) { Text($0) }
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("Digest day")
                Text("Sent every \(day) morning")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
