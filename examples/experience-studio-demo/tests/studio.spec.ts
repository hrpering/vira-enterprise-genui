import { expect, test } from "@playwright/test";

test("commerce Studio uses canonical Brand and Workbench preview/publish paths", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Generic commerce authoring smoke surface" })).toBeVisible();
  await expect(page.getByTestId("brand-id")).toHaveText("commerce.brand");
  await expect(page.getByTestId("template-id")).toHaveText("product-card");
  await expect(page.getByTestId("experience-id")).toHaveText("commerce.template.product-card");
  await expect(page.getByTestId("view-count")).toHaveText("1");

  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByTestId("status")).toContainText("Preview ready · commerce.template.product-card · main");

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("status")).toContainText("Publication ready · commerce.template.product-card");

  await page.getByRole("button", { name: "Add confirmation view" }).click();
  await expect(page.getByTestId("view-count")).toHaveText("2");
  await expect(page.getByTestId("status")).toHaveText("Confirmation view added");
});
