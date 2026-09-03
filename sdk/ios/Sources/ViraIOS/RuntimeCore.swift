import Foundation
import ViraStudioExperienceWire

public enum ViraIOSRuntimeCoreLifecycle: String, Codable, Equatable {
  case created
  case mounting
  case active
  case updating
  case completed
  case cancelled
  case failed
  case disposed
}

public struct ViraIOSRuntimeCoreState: Equatable {
  public let experienceId: String
  public let revision: Int64
  public let lifecycle: ViraIOSRuntimeCoreLifecycle
  public let plan: ViraJSONValue

  fileprivate init(
    experienceId: String,
    revision: Int64,
    lifecycle: ViraIOSRuntimeCoreLifecycle,
    plan: ViraJSONValue
  ) {
    self.experienceId = experienceId
    self.revision = revision
    self.lifecycle = lifecycle
    self.plan = plan
  }

  public static func decode(_ data: Data) -> Result<ViraIOSRuntimeCoreState, ViraIOSIssue> {
    do {
      let raw = try JSONDecoder().decode(ViraJSONValue.self, from: data)
      guard viraIOSValidateCanonicalJSON(raw),
            case .object(let object) = raw,
            Set(object.keys) == Set(["experienceId", "revision", "lifecycle", "plan"]),
            case .string(let experienceId)? = object["experienceId"],
            viraIOSRuntimeExperienceId(experienceId),
            case .number(let revisionNumber)? = object["revision"],
            revisionNumber.isFinite,
            revisionNumber >= 0,
            revisionNumber.rounded(.towardZero) == revisionNumber,
            revisionNumber <= Double(VIRA_IOS_MAX_SAFE_INTEGER),
            case .string(let lifecycleRaw)? = object["lifecycle"],
            let lifecycle = ViraIOSRuntimeCoreLifecycle(rawValue: lifecycleRaw),
            let rawPlan = object["plan"],
            let plan = viraIOSNormalizeExperiencePlan(rawPlan) else {
        return .failure(.init(
          code: .invalidRuntimeState,
          path: "$",
          message: "native Runtime Core state is invalid"
        ))
      }
      return .success(.init(
        experienceId: experienceId,
        revision: Int64(revisionNumber),
        lifecycle: lifecycle,
        plan: plan
      ))
    } catch {
      return .failure(.init(
        code: .invalidRuntimeState,
        path: "$",
        message: "native Runtime Core state could not be decoded"
      ))
    }
  }
}

private enum ViraIOSRuntimePreparedAction {
  case patch(ViraIOSPatch)
  case lifecycle(ViraIOSRuntimeCoreLifecycle)
  case host
}

private enum ViraIOSPatchOperation {
  case set(path: [String], value: ViraJSONValue)
  case remove(path: [String])
  case merge(path: [String], value: [String: ViraJSONValue])
  case append(path: [String], value: ViraJSONValue)
  case replace(path: [String], value: ViraJSONValue)
}

private struct ViraIOSPatch {
  let operations: [ViraIOSPatchOperation]
}

private struct ViraIOSJSONBudget {
  var nodes = 0
  var totalStringUnits = 0
}

private let viraIOSUnsafePatchKeys: Set<String> = ["__proto__", "prototype", "constructor"]
private let viraIOSRuntimeTerminal: Set<ViraIOSRuntimeCoreLifecycle> = [.completed, .cancelled, .failed, .disposed]

private func viraIOSStringUnits(_ value: String) -> Int { value.utf16.count }

private func viraIOSValidateCanonicalJSON(_ value: ViraJSONValue) -> Bool {
  var budget = ViraIOSJSONBudget()
  return viraIOSValidateCanonicalJSON(value, depth: 0, budget: &budget)
}

private func viraIOSValidateCanonicalJSON(
  _ value: ViraJSONValue,
  depth: Int,
  budget: inout ViraIOSJSONBudget
) -> Bool {
  guard depth <= 64 else { return false }
  budget.nodes += 1
  guard budget.nodes <= 100_000 else { return false }

  switch value {
  case .null, .bool:
    return true
  case .number(let number):
    return number.isFinite && !(number == 0 && number.sign == .minus)
  case .string(let string):
    let units = viraIOSStringUnits(string)
    guard units <= 1_048_576 else { return false }
    budget.totalStringUnits += units
    return budget.totalStringUnits <= 4_194_304
  case .array(let array):
    guard array.count <= 50_000 else { return false }
    for child in array {
      if !viraIOSValidateCanonicalJSON(child, depth: depth + 1, budget: &budget) { return false }
    }
    return true
  case .object(let object):
    guard object.count <= 50_000 else { return false }
    for (key, child) in object {
      let keyUnits = viraIOSStringUnits(key)
      guard keyUnits <= 4_096 else { return false }
      budget.totalStringUnits += keyUnits
      guard budget.totalStringUnits <= 4_194_304 else { return false }
      if !viraIOSValidateCanonicalJSON(child, depth: depth + 1, budget: &budget) { return false }
    }
    return true
  }
}

private func viraIOSSemanticSegment63(_ value: String) -> Bool {
  guard !value.isEmpty, viraIOSStringUnits(value) <= 63 else { return false }
  let scalars = Array(value.unicodeScalars)
  guard let first = scalars.first, first.value >= 97, first.value <= 122 else { return false }
  var previousHyphen = false
  for scalar in scalars.dropFirst() {
    let lower = scalar.value >= 97 && scalar.value <= 122
    let digit = scalar.value >= 48 && scalar.value <= 57
    let hyphen = scalar.value == 45
    guard lower || digit || hyphen else { return false }
    if hyphen && previousHyphen { return false }
    previousHyphen = hyphen
  }
  return scalars.last?.value != 45
}

private func viraIOSSemanticNamespace255(_ value: String) -> Bool {
  guard !value.isEmpty, viraIOSStringUnits(value) <= 255 else { return false }
  return value.split(separator: ".", omittingEmptySubsequences: false)
    .allSatisfy { viraIOSSemanticSegment63(String($0)) }
}

private func viraIOSSafePlanId(_ value: String) -> Bool {
  guard !value.isEmpty, viraIOSStringUnits(value) <= 128 else { return false }
  return value.range(of: "^[A-Za-z0-9][A-Za-z0-9._:-]*$", options: .regularExpression) != nil
}

private func viraIOSRuntimeExperienceId(_ value: String) -> Bool {
  viraIOSSafePlanId(value)
}

private func viraIOSNormalizeIntent(_ value: ViraJSONValue) -> ViraJSONValue? {
  guard case .object(let object) = value else { return nil }
  let allowed: Set<String> = ["version", "namespace", "name", "confidence", "parameters"]
  guard Set(object.keys).isSubset(of: allowed),
        case .string("1")? = object["version"],
        case .string(let namespace)? = object["namespace"],
        viraIOSSemanticNamespace255(namespace),
        case .string(let name)? = object["name"],
        viraIOSSemanticSegment63(name) else { return nil }

  var normalized: [String: ViraJSONValue] = [
    "version": .string("1"),
    "namespace": .string(namespace),
    "name": .string(name),
  ]
  if let confidenceValue = object["confidence"] {
    guard case .number(let confidence) = confidenceValue,
          confidence.isFinite,
          !(confidence == 0 && confidence.sign == .minus),
          confidence >= 0,
          confidence <= 1 else { return nil }
    normalized["confidence"] = .number(confidence)
  }
  if let parameters = object["parameters"] {
    guard case .object = parameters, viraIOSValidateCanonicalJSON(parameters) else { return nil }
    normalized["parameters"] = parameters
  }
  return .object(normalized)
}

private func viraIOSNormalizeCapability(_ value: ViraJSONValue) -> (value: ViraJSONValue, id: String)? {
  guard case .object(let object) = value,
        Set(object.keys) == Set(["version", "id"]),
        case .string("1")? = object["version"],
        case .string(let id)? = object["id"],
        viraIOSSemanticNamespace255(id) else { return nil }
  return (.object(["version": .string("1"), "id": .string(id)]), id)
}

private func viraIOSNormalizeExperiencePlan(_ value: ViraJSONValue) -> ViraJSONValue? {
  guard viraIOSValidateCanonicalJSON(value), case .object(let object) = value else { return nil }
  let allowed: Set<String> = ["version", "id", "intent", "state", "capabilities"]
  guard Set(object.keys).isSubset(of: allowed),
        case .string("1")? = object["version"],
        case .string(let id)? = object["id"],
        viraIOSSafePlanId(id),
        let intentRaw = object["intent"],
        let intent = viraIOSNormalizeIntent(intentRaw),
        case .object(let state)? = object["state"],
        case .object(let capabilities)? = object["capabilities"],
        Set(capabilities.keys).isSubset(of: Set(["required", "available", "future"])) else { return nil }

  var seen = Set<String>()
  var total = 0
  var normalizedBuckets: [String: ViraJSONValue] = [:]
  for bucket in ["required", "available", "future"] {
    let raw = capabilities[bucket] ?? .array([])
    guard case .array(let entries) = raw, entries.count <= 256 else { return nil }
    total += entries.count
    guard total <= 256 else { return nil }
    var normalized: [ViraJSONValue] = []
    for entry in entries {
      guard let parsed = viraIOSNormalizeCapability(entry), seen.insert(parsed.id).inserted else { return nil }
      normalized.append(parsed.value)
    }
    normalizedBuckets[bucket] = .array(normalized)
  }

  return .object([
    "version": .string("1"),
    "id": .string(id),
    "intent": intent,
    "state": .object(state),
    "capabilities": .object(normalizedBuckets),
  ])
}

private func viraIOSCanTransition(
  _ from: ViraIOSRuntimeCoreLifecycle,
  _ to: ViraIOSRuntimeCoreLifecycle
) -> Bool {
  switch from {
  case .created: return to == .mounting || to == .cancelled || to == .failed
  case .mounting: return to == .active || to == .cancelled || to == .failed
  case .active: return to == .updating || to == .completed || to == .cancelled || to == .failed
  case .updating: return to == .active || to == .completed || to == .cancelled || to == .failed
  case .completed, .cancelled, .failed: return to == .disposed
  case .disposed: return false
  }
}

private func viraIOSPatchPath(_ value: String) -> [String]? {
  guard viraIOSStringUnits(value) >= 2,
        viraIOSStringUnits(value) <= 1_024,
        value.hasPrefix("/") else { return nil }
  for scalar in value.unicodeScalars where scalar.value <= 31 || scalar.value == 127 { return nil }

  var output: [String] = []
  for raw in value.dropFirst().split(separator: "/", omittingEmptySubsequences: false) {
    guard !raw.isEmpty else { return nil }
    let string = String(raw)
    var index = string.startIndex
    while index < string.endIndex {
      if string[index] == "~" {
        let next = string.index(after: index)
        guard next < string.endIndex, string[next] == "0" || string[next] == "1" else { return nil }
        index = string.index(after: next)
      } else {
        index = string.index(after: index)
      }
    }
    let decoded = string.replacingOccurrences(of: "~1", with: "/").replacingOccurrences(of: "~0", with: "~")
    guard !viraIOSUnsafePatchKeys.contains(decoded) else { return nil }
    for scalar in decoded.unicodeScalars where scalar.value <= 31 || scalar.value == 127 { return nil }
    output.append(decoded)
  }
  return output
}

private func viraIOSPatchValueIsSafe(_ value: ViraJSONValue) -> Bool {
  guard viraIOSValidateCanonicalJSON(value) else { return false }
  switch value {
  case .array(let values): return values.allSatisfy(viraIOSPatchValueIsSafe)
  case .object(let object):
    return object.keys.allSatisfy { !viraIOSUnsafePatchKeys.contains($0) }
      && object.values.allSatisfy(viraIOSPatchValueIsSafe)
  default: return true
  }
}

private func viraIOSParsePatch(_ value: ViraJSONValue) -> ViraIOSPatch? {
  guard case .object(let object) = value,
        Set(object.keys) == Set(["version", "operations"]),
        case .string("1")? = object["version"],
        case .array(let operations)? = object["operations"],
        operations.count <= 256 else { return nil }

  var parsed: [ViraIOSPatchOperation] = []
  for operation in operations {
    guard case .object(let fields) = operation,
          case .string(let op)? = fields["op"],
          case .string(let pathRaw)? = fields["path"],
          let path = viraIOSPatchPath(pathRaw) else { return nil }
    if op == "remove" {
      guard Set(fields.keys) == Set(["op", "path"]) else { return nil }
      parsed.append(.remove(path: path))
      continue
    }
    guard ["set", "merge", "append", "replace"].contains(op),
          Set(fields.keys) == Set(["op", "path", "value"]),
          let patchValue = fields["value"],
          viraIOSPatchValueIsSafe(patchValue) else { return nil }
    switch op {
    case "set": parsed.append(.set(path: path, value: patchValue))
    case "append": parsed.append(.append(path: path, value: patchValue))
    case "replace": parsed.append(.replace(path: path, value: patchValue))
    case "merge":
      guard case .object(let mergeValue) = patchValue else { return nil }
      parsed.append(.merge(path: path, value: mergeValue))
    default: return nil
    }
  }
  return .init(operations: parsed)
}

private func viraIOSArrayIndex(_ token: String, count: Int) -> Int? {
  guard token.range(of: "^(0|[1-9][0-9]*)$", options: .regularExpression) != nil,
        let index = Int(token), index >= 0, index < count else { return nil }
  return index
}

private func viraIOSPatchTarget(
  _ current: ViraJSONValue,
  path: [String],
  index: Int,
  operation: ViraIOSPatchOperation
) -> ViraJSONValue? {
  guard index < path.count else { return nil }
  let token = path[index]
  let isLeaf = index == path.count - 1

  switch current {
  case .object(var object):
    if isLeaf {
      switch operation {
      case .set(_, let value): object[token] = value
      case .replace(_, let value): guard object[token] != nil else { return nil }; object[token] = value
      case .remove: guard object.removeValue(forKey: token) != nil else { return nil }
      case .append(_, let value):
        guard case .array(var array)? = object[token] else { return nil }
        array.append(value)
        object[token] = .array(array)
      case .merge(_, let value):
        guard case .object(var target)? = object[token] else { return nil }
        for (key, child) in value { target[key] = child }
        object[token] = .object(target)
      }
      return .object(object)
    }
    guard let child = object[token],
          let updated = viraIOSPatchTarget(child, path: path, index: index + 1, operation: operation) else { return nil }
    object[token] = updated
    return .object(object)

  case .array(var array):
    guard let childIndex = viraIOSArrayIndex(token, count: array.count) else { return nil }
    if isLeaf {
      switch operation {
      case .set(_, let value), .replace(_, let value): array[childIndex] = value
      case .remove: array.remove(at: childIndex)
      case .append(_, let value):
        guard case .array(var target) = array[childIndex] else { return nil }
        target.append(value)
        array[childIndex] = .array(target)
      case .merge(_, let value):
        guard case .object(var target) = array[childIndex] else { return nil }
        for (key, child) in value { target[key] = child }
        array[childIndex] = .object(target)
      }
      return .array(array)
    }
    guard let updated = viraIOSPatchTarget(array[childIndex], path: path, index: index + 1, operation: operation) else { return nil }
    array[childIndex] = updated
    return .array(array)

  default:
    return nil
  }
}

private func viraIOSApplyPatch(_ plan: ViraJSONValue, _ patch: ViraIOSPatch) -> ViraJSONValue? {
  var current = plan
  for operation in patch.operations {
    let path: [String]
    switch operation {
    case .set(let value, _), .remove(let value), .merge(let value, _), .append(let value, _), .replace(let value, _): path = value
    }
    guard let updated = viraIOSPatchTarget(current, path: path, index: 0, operation: operation) else { return nil }
    current = updated
  }
  return viraIOSNormalizeExperiencePlan(current)
}

@MainActor
final class ViraIOSRuntimeCoreSession {
  private var stateValue: ViraIOSRuntimeCoreState

  init(state: ViraIOSRuntimeCoreState) {
    self.stateValue = state
  }

  func state() -> ViraIOSRuntimeCoreState { stateValue }

  func prepare(
    actionType: String,
    payload: [String: ViraJSONValue]
  ) -> Result<ViraIOSRuntimePreparedAction, ViraIOSIssue> {
    guard ViraIOSSemanticIdentifier.isNamespace(actionType) else {
      return .failure(.init(code: .runtimeReductionFailed, path: "$.action.type", message: "runtime action type is invalid"))
    }
    guard viraIOSValidateCanonicalJSON(.object(payload)) else {
      return .failure(.init(code: .invalidEventPayload, path: "$.action.payload", message: "runtime action payload is not canonical JSON"))
    }

    if actionType == "runtime.patch.apply" {
      guard payload.count == 1, let patchRaw = payload["patch"] else {
        return .failure(.init(code: .invalidEventPayload, path: "$.action.payload", message: "runtime patch action requires exactly patch"))
      }
      guard !viraIOSRuntimeTerminal.contains(stateValue.lifecycle) else {
        return .failure(.init(code: .runtimeReductionFailed, path: "$.lifecycle", message: "runtime patch is rejected in terminal lifecycle"))
      }
      guard stateValue.revision < VIRA_IOS_MAX_SAFE_INTEGER else {
        return .failure(.init(code: .revisionOverflow, path: "$.revision", message: "runtime revision cannot be incremented safely"))
      }
      guard let patch = viraIOSParsePatch(patchRaw) else {
        return .failure(.init(code: .runtimeReductionFailed, path: "$.action.payload.patch", message: "runtime patch is invalid"))
      }
      return .success(.patch(patch))
    }

    if actionType == "runtime.lifecycle.transition" {
      guard payload.count == 1,
            case .string(let targetRaw)? = payload["target"],
            let target = ViraIOSRuntimeCoreLifecycle(rawValue: targetRaw),
            viraIOSCanTransition(stateValue.lifecycle, target) else {
        return .failure(.init(code: .runtimeReductionFailed, path: "$.action.payload.target", message: "runtime lifecycle transition is invalid"))
      }
      guard stateValue.revision < VIRA_IOS_MAX_SAFE_INTEGER else {
        return .failure(.init(code: .revisionOverflow, path: "$.revision", message: "runtime revision cannot be incremented safely"))
      }
      return .success(.lifecycle(target))
    }

    guard !viraIOSRuntimeTerminal.contains(stateValue.lifecycle) else {
      return .failure(.init(code: .runtimeActionUnhandled, path: "$.lifecycle", message: "runtime action is unavailable in terminal lifecycle"))
    }
    return .success(.host)
  }

  func reduceAllowed(_ prepared: ViraIOSRuntimePreparedAction) -> Result<Bool, ViraIOSIssue> {
    switch prepared {
    case .host:
      return .success(false)
    case .lifecycle(let target):
      guard stateValue.revision < VIRA_IOS_MAX_SAFE_INTEGER else {
        return .failure(.init(code: .revisionOverflow, path: "$.revision", message: "runtime revision cannot be incremented safely"))
      }
      stateValue = .init(
        experienceId: stateValue.experienceId,
        revision: stateValue.revision + 1,
        lifecycle: target,
        plan: stateValue.plan
      )
      return .success(true)
    case .patch(let patch):
      if patch.operations.isEmpty { return .success(false) }
      guard stateValue.revision < VIRA_IOS_MAX_SAFE_INTEGER else {
        return .failure(.init(code: .revisionOverflow, path: "$.revision", message: "runtime revision cannot be incremented safely"))
      }
      guard let plan = viraIOSApplyPatch(stateValue.plan, patch) else {
        return .failure(.init(code: .runtimeReductionFailed, path: "$.action.payload.patch", message: "runtime patch could not be applied canonically"))
      }
      stateValue = .init(
        experienceId: stateValue.experienceId,
        revision: stateValue.revision + 1,
        lifecycle: stateValue.lifecycle,
        plan: plan
      )
      return .success(true)
    }
  }
}
