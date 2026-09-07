import { expect, test } from "@playwright/test";

test("a non-technical user can create, AI-assist, version, publish, restore and republish an experience", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Vira Experience Studio" })).toBeVisible();
  await expect(page.getByTestId("brand-id")).toHaveText("commerce.brand");
  await expect(page.getByTestId("template-id")).toHaveText("product-card");
  await expect(page.getByTestId("experience-id")).toHaveText("commerce.template.product-card");
  await expect(page.getByTestId("view-count")).toHaveText("1");
  await expect(page.getByTestId("revision-count")).toHaveText("1");
  await expect(page.getByTestId("published-state")).toHaveText("Not published");
  await expect(page.getByTestId("application-release")).toHaveText("Not prepared");
  await expect(page.getByTestId("experience-pack-release")).toHaveText("Not prepared");
  await expect(page.getByTestId("staging-state")).toHaveText("Not staged");
  await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();

  await page.getByTestId("vira-studio-viewport-mobile").click();
  await expect(page.getByTestId("vira-studio-preview-viewport")).toHaveAttribute("data-preview-viewport", "mobile");
  await page.getByTestId("vira-studio-viewport-desktop").click();
  await expect(page.getByTestId("vira-studio-preview-viewport")).toHaveAttribute("data-preview-viewport", "desktop");

  await expect(page.getByTestId("ai-status")).toContainText("canonical Studio AI v2");
  await page.getByTestId("ai-apply").click();
  await expect(page.getByTestId("ai-status")).toHaveText("Applied · canonical Studio AI v2", { timeout: 5_000 });
  await expect(page.getByTestId("status")).toHaveText("Draft saved · r2");
  await expect(page.getByTestId("revision-count")).toHaveText("2");
  await expect(page.getByTestId("experience-id")).toHaveText("commerce.template.product-card");
  await expect(page.getByTestId("vira-studio-workbench").getByRole("button", { name: "Add item securely" }).first()).toBeVisible();

  await page.getByTestId("vira-studio-panel-views").click();
  await page.getByPlaceholder("checkout").fill("confirmation");
  await page.getByRole("button", { name: "Add screen" }).click();

  await expect(page.getByTestId("view-count")).toHaveText("2");
  await expect(page.getByTestId("status")).toHaveText("Draft saved · r3", { timeout: 5_000 });
  await expect(page.getByTestId("revision-count")).toHaveText("3");

  await page.getByTestId("revision-diff-3").click();
  await expect(page.getByTestId("revision-diff-summary")).toContainText("r2 → r3:");
  await expect(page.getByTestId("revision-diff-summary")).toContainText("change(s)");

  await page.getByTestId("vira-studio-publish").click();
  await expect(page.getByTestId("status")).toHaveText("Published · draft r3 · Application staged", { timeout: 5_000 });
  await expect(page.getByTestId("published-state")).toHaveText("Published r3");
  await expect(page.getByTestId("application-release")).toHaveText("commerce.application.product-card@0.0.3");
  await expect(page.getByTestId("experience-pack-release")).toHaveText("commerce/product-card@0.0.3");
  await expect(page.getByTestId("staging-state")).toHaveText("Active · staging");

  await page.getByTestId("ai-prompt").fill("Change the experience id to commerce.other.experience.");
  await page.getByTestId("ai-apply").click();
  await expect(page.getByTestId("ai-status")).toContainText("Rejected · IDENTITY_MISMATCH", { timeout: 5_000 });
  await expect(page.getByTestId("revision-count")).toHaveText("3");
  await expect(page.getByTestId("published-state")).toHaveText("Published r3");
  await expect(page.getByTestId("experience-id")).toHaveText("commerce.template.product-card");
  await expect(page.getByTestId("application-release")).toHaveText("commerce.application.product-card@0.0.3");
  await expect(page.getByTestId("experience-pack-release")).toHaveText("commerce/product-card@0.0.3");
  await expect(page.getByTestId("staging-state")).toHaveText("Active · staging");

  await page.getByTestId("revision-restore-1").click();
  await expect(page.getByTestId("status")).toHaveText("Restored r1 as new draft r4");
  await expect(page.getByTestId("view-count")).toHaveText("1");
  await expect(page.getByTestId("revision-count")).toHaveText("4");
  await expect(page.getByTestId("published-state")).toHaveText("Published r3");
  await expect(page.getByTestId("application-release")).toHaveText("commerce.application.product-card@0.0.3");
  await expect(page.getByTestId("experience-pack-release")).toHaveText("commerce/product-card@0.0.3");
  await expect(page.getByTestId("staging-state")).toHaveText("Active · staging");

  await page.getByTestId("vira-studio-publish").click();
  await expect(page.getByTestId("status")).toHaveText("Published · draft r4 · Application staged", { timeout: 5_000 });
  await expect(page.getByTestId("published-state")).toHaveText("Published r4");
  await expect(page.getByTestId("application-release")).toHaveText("commerce.application.product-card@0.0.4");
  await expect(page.getByTestId("experience-pack-release")).toHaveText("commerce/product-card@0.0.4");
  await expect(page.getByTestId("staging-state")).toHaveText("Active · staging");
});
