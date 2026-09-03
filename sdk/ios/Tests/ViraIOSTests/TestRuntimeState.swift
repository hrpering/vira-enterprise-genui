import Foundation
@testable import ViraIOS

func makeTestRuntimeCoreState(
  lifecycle: String = "active",
  revision: Int64 = 0,
  planState: String = #"{"counter":0,"items":[]}"#
) throws -> ViraIOSRuntimeCoreState {
  let json = """
  {
    "experienceId":"demo-runtime",
    "revision":\(revision),
    "lifecycle":"\(lifecycle)",
    "plan":{
      "version":"1",
      "id":"demo-plan",
      "intent":{"version":"1","namespace":"demo","name":"test"},
      "state":\(planState),
      "capabilities":{"required":[],"available":[],"future":[]}
    }
  }
  """
  switch ViraIOSRuntimeCoreState.decode(Data(json.utf8)) {
  case .failure(let issue): throw issue
  case .success(let value): return value
  }
}
