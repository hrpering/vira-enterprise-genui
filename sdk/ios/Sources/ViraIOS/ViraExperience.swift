#if canImport(UIKit)
import Foundation
import UIKit

/// Stable customer-facing iOS entrypoint. Runtime/session/registry ownership stays inside Vira.
@MainActor
public final class ViraExperience {
  public let view: UIView

  private let session: ViraIOSRuntimeSession
  private let surface: ViraIOSUIKitSurfaceController

  private init(session: ViraIOSRuntimeSession, surface: ViraIOSUIKitSurfaceController) {
    self.session = session
    self.surface = surface
    self.view = surface.view
  }

  public static func create(
    mountEnvelopeJSON: String,
    runtimeStateJSON: String,
    permissionPolicyJSON: String,
    host: ViraIOSHostAdapter,
    renderers: [any ViraIOSUIKitRenderer]
  ) -> Result<ViraExperience, ViraIOSIssue> {
    guard let envelopeData = mountEnvelopeJSON.data(using: .utf8),
          let stateData = runtimeStateJSON.data(using: .utf8),
          let permissionData = permissionPolicyJSON.data(using: .utf8) else {
      return .failure(.init(code: .invalidEnvelope, path: "$", message: "Vira Experience inputs must be UTF-8 JSON"))
    }

    let envelope: ViraIOSMountEnvelope
    switch ViraIOSMountEnvelope.decode(envelopeData) {
    case .failure(let issue): return .failure(issue)
    case .success(let value): envelope = value
    }
    let runtimeState: ViraIOSRuntimeCoreState
    switch ViraIOSRuntimeCoreState.decode(stateData) {
    case .failure(let issue): return .failure(issue)
    case .success(let value): runtimeState = value
    }
    guard runtimeState.experienceId == envelope.document.id else {
      return .failure(.init(
        code: .invalidRuntimeState,
        path: "$.runtimeState.experienceId",
        message: "runtime state belongs to a different Experience"
      ))
    }
    let permissionPolicy: ViraIOSPermissionPolicy
    switch ViraIOSPermissionPolicy.decode(permissionData) {
    case .failure(let issue): return .failure(issue)
    case .success(let value): permissionPolicy = value
    }

    let session: ViraIOSRuntimeSession
    do {
      session = try ViraIOSRuntimeSession(
        envelope: envelope,
        host: host,
        runtimeState: runtimeState,
        permissionPolicy: permissionPolicy
      )
    } catch let issue as ViraIOSIssue {
      return .failure(issue)
    } catch {
      return .failure(.init(code: .invalidEnvelope, path: "$", message: "Vira Experience session creation failed"))
    }

    switch ViraIOSUIKitSurfaceController.create(session: session, renderers: renderers) {
    case .failure(let issue):
      session.dispose()
      return .failure(issue)
    case .success(let surface):
      return .success(ViraExperience(session: session, surface: surface))
    }
  }

  public func dispose() {
    surface.dispose()
    session.dispose()
  }
}
#endif
