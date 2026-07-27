// FIXTURE: draft-in-sheet
// Plants: flow/draft-in-sheet
//
// The draft lives in @State inside the presented view, so it dies three ways:
// a swipe-down dismiss (unguarded), a background-then-terminate, and any
// re-presentation. Every screenshot of this sheet is correct.

import SwiftUI

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
struct Message: Identifiable { let id = UUID(); var subject: String }
struct MessageRow: View { let message: Message; var body: some View { Text(message.subject) } }
let messages: [Message] = []
enum api { static func send(subject: String, body: String) async {} }

struct ComposeSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var subject = ""
    @State private var body_ = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Subject", text: $subject)
                TextEditor(text: $body_)
                    .frame(minHeight: 200)
            }
            .navigationTitle("New Message")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") { send() }
                }
            }
        }
    }

    private func send() {
        Task { await api.send(subject: subject, body: body_) }
        dismiss()
    }
}

struct InboxView: View {
    @State private var isComposing = false

    var body: some View {
        List(messages) { MessageRow(message: $0) }
            .navigationTitle("Inbox")
            .toolbar {
                Button("Compose", systemImage: "square.and.pencil") { isComposing = true }
            }
            .sheet(isPresented: $isComposing) {
                ComposeSheet()
            }
    }
}
