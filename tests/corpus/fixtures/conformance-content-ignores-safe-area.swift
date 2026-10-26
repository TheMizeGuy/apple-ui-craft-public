// FIXTURE: conformance-content-ignores-safe-area
// Plants: conformance/content-ignores-safe-area
//
// .ignoresSafeArea() sits on the whole capture stack instead of the camera
// preview alone, so the Close button lays out under the status bar and the
// rounded display corner, and the shutter sits over the home indicator.

import SwiftUI

// Minimal stubs so the fixture stands alone. Not part of the planted defect.
final class CaptureSession {}
@Observable final class CameraModel {
    let session = CaptureSession()
    var isAuthorized = true
    var captureCount = 0
    func capture() { captureCount += 1 }
}
struct CameraPreview: UIViewRepresentable {
    let session: CaptureSession
    func makeUIView(context: Context) -> UIView { UIView() }
    func updateUIView(_ uiView: UIView, context: Context) {}
}

struct CaptureScreen: View {
    @State private var camera = CameraModel()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    var body: some View {
        if camera.isAuthorized {
            viewfinder
        } else {
            ContentUnavailableView {
                Label("Camera Access Is Off", systemImage: "camera")
            } description: {
                Text("Allow camera access in Settings to take photos.")
            } actions: {
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
                .buttonStyle(.borderedProminent)
                Button("Not Now") { dismiss() }
            }
        }
    }

    private var viewfinder: some View {
        ZStack {
            CameraPreview(session: camera.session)
                .accessibilityLabel("Viewfinder")
            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Label("Close", systemImage: "xmark")
                            .labelStyle(.iconOnly)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(.glass)
                    Spacer()
                }
                Spacer()
                Button { camera.capture() } label: {
                    Label("Take Photo", systemImage: "camera.circle.fill")
                        .labelStyle(.iconOnly)
                        .font(.largeTitle)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.glass)
                .sensoryFeedback(.impact, trigger: camera.captureCount)
            }
            .padding()
        }
        .ignoresSafeArea()
    }
}
