import { expect, test } from "@playwright/test";

test("Canvas v2 authoring controls remain keyboard-operable", async ({ page }) => {
  const id = `demo.keyboard-${Date.now()}`;
  await page.goto("/");
  await page.getByTestId("create-template-composable-canvas").click();
  await page.getByTestId("new-experience-id").fill(id);
  await page.getByTestId("create-experience").click();
  await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();

  for (const panel of ["components", "layers", "views"] as const) {
    const control = page.getByTestId(`vira-studio-panel-${panel}`);
    await control.focus();
    await expect(control).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);
  }

  await page.getByTestId("vira-studio-panel-layers").focus();
  await page.keyboard.press("Enter");
  const titleLayer = page.getByTestId("vira-studio-layer-title");
  await titleLayer.focus();
  await expect(titleLayer).toBeFocused();
  await page.keyboard.press("Enter");

  for (const tab of ["content", "design", "data", "actions"] as const) {
    const control = page.getByTestId(`vira-studio-inspector-${tab}`);
    await control.focus();
    await expect(control).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);
  }

  const publish = page.getByTestId("vira-studio-publish");
  await publish.focus();
  await expect(publish).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("publication-status")).toHaveText("Published live");
});
