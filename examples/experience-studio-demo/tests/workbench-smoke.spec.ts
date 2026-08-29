import { expect, test } from "@playwright/test";

const panels = ["components", "layers", "views", "data", "actions"] as const;
const fatalConsolePatterns = [
  "Each child in a list should have a unique",
  "Cannot read properties of undefined",
  "Cannot read properties of null",
] as const;

test("renders and operates the real Experience Studio workbench without page errors", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleRegressions: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (fatalConsolePatterns.some((pattern) => text.includes(pattern))) consoleRegressions.push(text);
  });

  await page.goto("/");

  await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();
  await expect(page.getByText("Vira Experience Studio", { exact: true })).toBeVisible();
  await expect(page.getByText("Properties", { exact: true })).toBeVisible();
  await expect(page.getByTestId("vira-studio-preview")).toBeVisible();
  await expect(page.getByText("Not published yet", { exact: true })).toBeVisible();

  for (const panel of panels) {
    await page.getByTestId(`vira-studio-panel-${panel}`).click();
    await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();
    await expect(page.getByText("Properties", { exact: true })).toBeVisible();
    await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);
  }

  await page.getByTestId("vira-studio-panel-layers").click();
  const canonicalRootLayer = page.getByTestId("vira-studio-layer-root");
  await expect(canonicalRootLayer).toBeVisible();
  await canonicalRootLayer.click();
  await expect(canonicalRootLayer).toHaveCSS("font-weight", "700");

  await page.getByTestId("vira-studio-publish").click();
  await expect(page.getByText(/^Published pegasus\.flight-discovery$/)).toBeVisible();
  await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);
  await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleRegressions).toEqual([]);
});
