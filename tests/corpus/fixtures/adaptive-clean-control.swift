// FIXTURE: adaptive-clean-control
// Plants: NOTHING. This is the clean control and it must produce ZERO findings.
//
// It exists to catch the opposite failure from every other fixture: a reviewer
// that has learned to flag constructs rather than defects. Everything here is
// something the plugin's own references prescribe -- AnyLayout reflow at
// accessibility sizes, @ScaledMetric on an icon beside text, a reading measure
// on the detail column, NavigationSplitView at regular width, safeAreaInset for
// a custom bar, a Codable route, a draft owned above its presentation, a
// guarded sheet dismiss with a real Cancel, a confirmed destructive action, and
// all five reachable states with a recovery on each.
//
// A run that flags any of these has learned the wrong lesson and fails the gate.

import SwiftUI

// Minimal stubs so the fixture stands alone.
struct Workout: Identifiable, Hashable, Codable { var id = UUID(); var name: String; var calories: Int }
enum Route: Hashable, Codable { case workout(Workout.ID) }
enum LoadState<Value> { case loading, loaded(Value), failed(String) }

@Observable final class WorkoutDraft {
    var name = ""
    var hasUnsavedContent: Bool { !name.isEmpty }
    func flush() {}
    func clear() { name = "" }
}

@Observable final class WorkoutStore {
    var state: LoadState<[Workout]> = .loading
    func load() async { state = .loaded([]) }
    func delete(_ workout: Workout) async {}
}

// MARK: - Root

struct WorkoutsScreen: View {
    @State private var store = WorkoutStore()
    @State private var selection: Workout.ID?
    @State private var searchText = ""

    var body: some View {
        // Regular width earns its space with a second column; compact collapses
        // to a stack automatically.
        NavigationSplitView {
            listColumn
                .navigationTitle("Workouts")
        } detail: {
            if let selection, let workout = workout(for: selection) {
                WorkoutDetail(workout: workout, store: store)
            } else {
                ContentUnavailableView("Select a Workout", systemImage: "figure.run")
            }
        }
        .task { await store.load() }
    }

    @ViewBuilder
    private var listColumn: some View {
        switch store.state {
        case .loading:
            List(Workout.placeholders) { WorkoutRow(workout: $0) }
                .redacted(reason: .placeholder)
                .accessibilityHidden(true)

        case .failed(let message):
            ContentUnavailableView {
                Label("Couldn't Load Workouts", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Try Again") { Task { await store.load() } }
            }

        case .loaded(let workouts) where workouts.isEmpty:
            ContentUnavailableView {
                Label("No Workouts", systemImage: "figure.run")
            } description: {
                Text("Workouts you record appear here.")
            } actions: {
                Button("Record a Workout") { }
            }

        case .loaded(let workouts):
            let visible = filter(workouts)
            if visible.isEmpty {
                ContentUnavailableView.search(text: searchText)
            } else {
                List(visible, selection: $selection) { WorkoutRow(workout: $0) }
                    .searchable(text: $searchText)
            }
        }
    }

    private func filter(_ workouts: [Workout]) -> [Workout] {
        searchText.isEmpty ? workouts : workouts.filter { $0.name.localizedStandardContains(searchText) }
    }

    private func workout(for id: Workout.ID) -> Workout? {
        guard case .loaded(let workouts) = store.state else { return nil }
        return workouts.first { $0.id == id }
    }
}

// MARK: - Row

struct WorkoutRow: View {
    let workout: Workout

    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 24

    var body: some View {
        // Restacks vertically at accessibility sizes instead of truncating.
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 12))

        layout {
            Image(systemName: "flame.fill")
                .font(.system(size: iconSize))
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            Text(workout.name)
            Spacer(minLength: 8)
            Text(workout.calories, format: .number)
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .layoutPriority(1)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Detail

struct WorkoutDetail: View {
    let workout: Workout
    let store: WorkoutStore

    @State private var isConfirmingDelete = false
    @State private var isEditing = false
    @State private var draft = WorkoutDraft()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("\(workout.calories) calories")
                    .font(.title2)
                Text("Recorded on your iPhone.")
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: 700, alignment: .leading)   // reading measure: width EARNED
            .frame(maxWidth: .infinity)
            .padding()
        }
        .navigationTitle(workout.name)
        // Joins the safe area, so the last row of content stays reachable.
        .safeAreaInset(edge: .bottom) {
            Button("Edit Workout") { isEditing = true }
                .buttonStyle(.borderedProminent)
                .frame(minHeight: 44)
                .padding()
        }
        .toolbar {
            Button("Delete", systemImage: "trash", role: .destructive) {
                isConfirmingDelete = true
            }
        }
        .confirmationDialog("Delete \(workout.name)?",
                            isPresented: $isConfirmingDelete,
                            titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await store.delete(workout) } }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This can't be undone.")
        }
        .sheet(isPresented: $isEditing) {
            EditSheet(draft: draft)
                .interactiveDismissDisabled(draft.hasUnsavedContent)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { draft.flush() }
        }
    }
}

// MARK: - Edit sheet

struct EditSheet: View {
    @Bindable var draft: WorkoutDraft
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isNameFocused: Bool
    @State private var isConfirmingDiscard = false
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $draft.name)
                    .textContentType(.name)
                    .focused($isNameFocused)
                    .submitLabel(.done)
            }
            .navigationTitle("Edit Workout")
            .toolbar {
                // Guarding the dismiss gesture obliges us to provide the exit.
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if draft.hasUnsavedContent { isConfirmingDiscard = true } else { dismiss() }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        guard !isSaving else { return }   // guards double-submit
                        isSaving = true
                        Task { defer { isSaving = false }; await save() }
                    } label: {
                        if isSaving { ProgressView() } else { Text("Save") }
                    }
                    .disabled(isSaving)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { isNameFocused = false }
                }
            }
            .confirmationDialog("Discard changes?",
                                isPresented: $isConfirmingDiscard,
                                titleVisibility: .visible) {
                Button("Discard", role: .destructive) { draft.clear(); dismiss() }
                Button("Keep Editing", role: .cancel) { }
            }
        }
    }

    private func save() async { dismiss() }
}

extension Workout {
    static let placeholders = [
        Workout(name: "Morning Run", calories: 320),
        Workout(name: "Evening Swim", calories: 410)
    ]
}
