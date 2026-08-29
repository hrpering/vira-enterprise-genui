import { expect, test } from "@playwright/test";

const panels = ["components", "layers", "views", "data", "actions"] as const;

test("renders and operates the real Experience Studio workbench without page errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();
  await expect(page.getByText("Vira Experience Studio", { exact: true })).toBeVisible();
  await expect(page.getByText("Properties", { exact: true })).toBeVisible();
  await expect(page.getByTestId("vira-studio-preview")).toBeVisible();

  for (const panel of panels) {
    await page.getByTestId(`vira-studio-panel-${panel}`).click();
    await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();
    await expect(page.getByText("Properties", { exact: true })).toBeVisible();
    await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);
  }

  await page.getByTestId("vira-studio-publish").click();
  await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);
  await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();

  expect(pageErrors).toEqual([]);
});
