import Foundation

public enum ViraIOSIssueCode: String, Equatable, Sendable {
  case invalidEnvelope = "INVALID_ENVELOPE"
  case invalidRendererRegistry = "INVALID_RENDERER_REGISTRY"
  case missingRenderer = "MISSING_RENDERER"
  case extraRenderer = "EXTRA_RENDERER"
  case invalidSessionState = "INVALID_SESSION_STATE"
  case invalidLifecycleEvent = "INVALID_LIFECYCLE_EVENT"
  case invalidLifecycleSource = "INVALID_LIFECYCLE_SOURCE"
  case revisionOverflow = "REVISION_OVERFLOW"
  case instanceMismatch = "INSTANCE_MISMATCH"
  case invalidHost = "INVALID_HOST"
  case invalidSnapshot = "INVALID_SNAPSHOT"
  case staleSnapshot = "STALE_SNAPSHOT"
  case sessionDisposed = "SESSION_DISPOSED"
  case viewNotFound = "VIEW_NOT_FOUND"
  case dataReadFailed = "DATA_READ_FAILED"
  case dataValueInvalid = "DATA_VALUE_INVALID"
  case repeatLimitExceeded = "REPEAT_LIMIT_EXCEEDED"
  case invalidSlotTarget = "INVALID_SLOT_TARGET"
  case nodeCycle = "NODE_CYCLE"
  case rendererFailed = "RENDERER_FAILED"
  case interactionNotFound = "INTERACTION_NOT_FOUND"
  case actionPending = "ACTION_PENDING"
  case unmappedAction = "UNMAPPED_ACTION"
  case invalidEventPayload = "INVALID_EVENT_PAYLOAD"
  case permissionDenied = "PERMISSION_DENIED"
  case confirmationRequired = "CONFIRMATION_REQUIRED"
  case unsupportedRuntimeAction = "UNSUPPORTED_RUNTIME_ACTION"
  case hostDispatchFailed = "HOST_DISPATCH_FAILED"
  case invalidHostResult = "INVALID_HOST_RESULT"
  case disposed = "DISPOSED"
}

public struct ViraIOSIssue: Error, Equatable, Sendable {
  public let code: ViraIOSIssueCode
  public let path: String
  public let message: String

  public init(code: ViraIOSIssueCode, path: String, message: String) {
    self.code = code
    self.path = path
    self.message = message
  }
}