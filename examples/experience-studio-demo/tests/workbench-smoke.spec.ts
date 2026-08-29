import { expect, test } from "@playwright/test";

const panels = ["components", "layers", "views", "data", "actions"] as const;

function formatDiagnostics(input: {
  readonly pageErrors: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly requestFailures: readonly string[];
  readonly bodyText: string;
}): string {
  return [
    `page errors: ${input.pageErrors.length === 0 ? "none" : input.pageErrors.join(" | ")}`,
    `console errors: ${input.consoleErrors.length === 0 ? "none" : input.consoleErrors.join(" | ")}`,
    `request failures: ${input.requestFailures.length === 0 ? "none" : input.requestFailures.join(" | ")}`,
    `body: ${input.bodyText.trim() || "<empty>"}`,
  ].join("\n");
}

test("renders and operates the real Experience Studio workbench without page errors", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown failure"}`);
  });

  const response = await page.goto("/");
  expect(response?.ok(), `demo navigation failed with HTTP ${response?.status() ?? "no response"}`).toBe(true);

  const workbench = page.getByTestId("vira-studio-workbench");
  const studioError = page.getByTestId("vira-studio-error");

  await expect
    .poll(async () => (await workbench.count()) + (await studioError.count()) + pageErrors.length, {
      message: "Experience Studio did not mount or report a controlled Studio error",
    })
    .toBeGreaterThan(0);

  if ((await studioError.count()) > 0) {
    const message = (await studioError.first().textContent()) ?? "Unknown controlled Studio error";
    throw new Error(`Experience Studio reported a controlled error: ${message}`);
  }

  if ((await workbench.count()) === 0) {
    throw new Error(formatDiagnostics({
      pageErrors,
      consoleErrors,
      requestFailures,
      bodyText: await page.locator("body").innerText(),
    }));
  }

  await expect(workbench).toBeVisible();
  await expect(page.getByText("Vira Experience Studio", { exact: true })).toBeVisible();
  await expect(page.getByText("Properties", { exact: true })).toBeVisible();
  await expect(page.getByTestId("vira-studio-preview")).toBeVisible();

  for (const panel of panels) {
    await page.getByTestId(`vira-studio-panel-${panel}`).click();
    await expect(workbench).toBeVisible();
    await expect(page.getByText("Properties", { exact: true })).toBeVisible();
    await expect(studioError).toHaveCount(0);
  }

  await page.getByTestId("vira-studio-publish").click();
  await expect(page.getByText("Published pegasus.flight-discovery", { exact: true })).toBeVisible();
  await expect(studioError).toHaveCount(0);
  await expect(workbench).toBeVisible();

  expect(pageErrors, formatDiagnostics({
    pageErrors,
    consoleErrors,
    requestFailures,
    bodyText: await page.locator("body").innerText(),
  })).toEqual([]);
});