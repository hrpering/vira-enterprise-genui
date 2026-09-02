import { expect, test } from "@playwright/test";

test("mounts Flight and Recipe together without cross-instance state bleed", async ({ page }) => {
  const fatalErrors: string[] = [];
  page.on("pageerror", (error) => fatalErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") fatalErrors.push(message.text());
  });

  await page.goto("/proof");

  const flight = page.getByTestId("flight-experience");
  const recipe = page.getByTestId("recipe-experience");
  const flightView = page.getByTestId("flight-view");

  await expect(flightView).toHaveText("flight-search");
  await expect(recipe.getByText("4 servings", { exact: true })).toBeVisible();
  await expect(recipe.getByRole("button", { name: "♡ Save recipe" })).toHaveAttribute("aria-pressed", "false");

  await page.getByTestId("recipe-increase").click();
  await expect(recipe.getByText("5 servings", { exact: true })).toBeVisible();
  await expect(flightView).toHaveText("flight-search");

  await page.getByTestId("recipe-favorite").click();
  await expect(recipe.getByRole("button", { name: "♥ Saved" })).toHaveAttribute("aria-pressed", "true");
  await expect(flightView).toHaveText("flight-search");

  await page.getByTestId("flight-advance").click();
  await expect(flightView).toHaveText("flight-results");
  await expect(recipe.getByText("5 servings", { exact: true })).toBeVisible();
  await expect(recipe.getByRole("button", { name: "♥ Saved" })).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("flight-cheapest").click();
  await expect(flightView).toHaveText("fare-comparison");
  await expect(recipe.getByText("5 servings", { exact: true })).toBeVisible();
  await expect(recipe.getByRole("button", { name: "♥ Saved" })).toHaveAttribute("aria-pressed", "true");

  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(fatalErrors).toEqual([]);
});
