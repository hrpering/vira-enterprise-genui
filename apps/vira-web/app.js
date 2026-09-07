const fields = {
  environment: document.querySelector("#environment"),
  buildSha: document.querySelector("#build-sha"),
  releaseId: document.querySelector("#release-id"),
  status: document.querySelector("#metadata-status"),
};

try {
  const response = await fetch("/build.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`metadata request failed with ${response.status}`);
  const metadata = await response.json();
  fields.environment.textContent = String(metadata.environment ?? "unknown");
  fields.buildSha.textContent = String(metadata.buildSha ?? "unknown");
  fields.releaseId.textContent = String(metadata.releaseId ?? "unknown");
  fields.status.textContent = "Build metadata loaded.";
} catch (error) {
  fields.status.textContent = `Build metadata unavailable: ${error instanceof Error ? error.message : "unknown error"}`;
}
