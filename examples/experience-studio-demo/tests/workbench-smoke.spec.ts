import { expect, test } from "@playwright/test";

const fatalConsolePatterns = [
  "Each child in a list should have a unique",
  "Cannot read properties of undefined",
  "Cannot read properties of null",
] as const;

function watchPage(page: import("@playwright/test").Page, pageErrors: string[], consoleRegressions: string[]): void {
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (fatalConsolePatterns.some((pattern) => text.includes(pattern))) consoleRegressions.push(text);
  });
}

test("creates, publishes, serves, unpublishes and deletes a real Studio experience", async ({ page, context }) => {
  const pageErrors: string[] = [];
  const consoleRegressions: string[] = [];
  watchPage(page, pageErrors, consoleRegressions);

  const id = `demo.e2e-${Date.now()}`;
  const name = "Lifecycle flight demo";

  await page.goto("/");
  await expect(page.getByText("Your experiences", { exact: true })).toBeVisible();
  await expect(page.getByText("Starter GenUI experiences", { exact: true })).toBeVisible();

  await page.getByTestId("create-template-flight-search").click();
  await page.getByTestId("new-experience-name").fill(name);
  await page.getByTestId("new-experience-id").fill(id);
  await page.getByTestId("create-experience").click();

  await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Search flights", { exact: true })).toBeVisible();
  await expect(page.getByTestId("publication-status")).toHaveText("Draft only");
  await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);

  for (const panel of ["components", "layers", "views", "data", "actions"] as const) {
    await page.getByTestId(`vira-studio-panel-${panel}`).click();
    await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();
    await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);
  }

  await page.getByTestId("vira-studio-publish").click();
  await expect(page.getByTestId("publication-status")).toHaveText("Published live");
  const liveLink = page.getByTestId("open-live");
  await expect(liveLink).toBeVisible();
  await expect(liveLink).toHaveAttribute("href", `/live/${id}`);

  const livePage = await context.newPage();
  watchPage(livePage, pageErrors, consoleRegressions);
  await livePage.goto(`/live/${id}`);
  await expect(livePage.getByTestId("live-experience")).toBeVisible();
  await expect(livePage.getByText(name, { exact: true })).toBeVisible();
  await expect(livePage.getByText("Search flights", { exact: true })).toBeVisible();
  await expect(livePage.locator(".vira-search-card")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("unpublish-experience").click();
  await expect(page.getByTestId("publication-status")).toHaveText("Draft only");
  await expect(page.getByTestId("open-live")).toHaveCount(0);

  await livePage.reload();
  await expect(livePage.getByTestId("live-not-published")).toBeVisible();
  await expect(livePage.getByText("This experience is not published", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("delete-experience").click();
  await expect(page.getByText("Your experiences", { exact: true })).toBeVisible();
  await expect(page.getByTestId(`experience-${id}`)).toHaveCount(0);

  await livePage.reload();
  await expect(livePage.getByTestId("live-not-published")).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(consoleRegressions).toEqual([]);
});
