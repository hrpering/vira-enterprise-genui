import { expect, test } from "@playwright/test";

const BOOKING_VIEWS = [
  "flight-search",
  "flight-results",
  "fare-comparison",
  "traveller-details",
  "seat-selection",
  "baggage",
  "extras",
  "booking-review",
  "confirmation",
] as const;

const PRIMITIVE_LABELS = [
  "Input",
  "Textarea",
  "Select",
  "Checkbox",
  "Radio group",
  "Field group",
  "Alert",
  "Progress",
  "Spinner",
  "Empty state",
] as const;

const fatalConsolePatterns = [
  "Each child in a list should have a unique",
  "Cannot read properties of undefined",
  "Cannot read properties of null",
  "prop key must be one semantic segment",
] as const;

function watchPage(page: import("@playwright/test").Page, pageErrors: string[], consoleRegressions: string[]): void {
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (fatalConsolePatterns.some((pattern) => text.includes(pattern))) consoleRegressions.push(text);
  });
}

test("creates, authors and publishes the full nine-view booking journey", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleRegressions: string[] = [];
  watchPage(page, pageErrors, consoleRegressions);

  const id = `demo.booking-journey-${Date.now()}`;
  const name = "Full booking journey E2E";

  await page.goto("/");
  const gallery = page.getByTestId("starter-gallery");
  await expect(gallery).toBeVisible();
  const journeyCard = gallery.locator('[data-template="booking-journey"]');
  await expect(journeyCard).toBeVisible();
  await expect(journeyCard.locator(".template-card-copy > strong")).toHaveText("Full booking journey");

  await page.getByTestId("create-template-booking-journey").click();
  await page.getByTestId("new-experience-name").fill(name);
  await page.getByTestId("new-experience-id").fill(id);
  await page.getByTestId("create-experience").click();

  await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);

  await page.getByTestId("vira-studio-panel-views").click();
  for (const viewId of BOOKING_VIEWS) {
    const label = viewId === "flight-search" ? `${viewId} • entry` : viewId;
    await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: "confirmation", exact: true }).click();
  const preview = page.getByTestId("vira-studio-preview");
  await expect(preview.getByText("Booking ready", { exact: true })).toBeVisible();
  await expect(preview.getByText("Ready for the host checkout handoff.", { exact: true })).toBeVisible();
  await expect(preview.locator("progress")).toHaveAttribute("value", "100");
  await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);

  await page.getByTestId("vira-studio-panel-components").click();
  for (const componentLabel of PRIMITIVE_LABELS) {
    await expect(page.getByText(componentLabel, { exact: true }).first()).toBeVisible();
  }

  await page.getByTestId("vira-studio-publish").click();
  await expect(page.getByTestId("publication-status")).toHaveText("Published live");
  await expect(page.getByTestId("open-live")).toHaveAttribute("href", `/live/${id}`);
  await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("delete-experience").click();
  await expect(page.getByText("Your experiences", { exact: true })).toBeVisible();
  await expect(page.getByTestId(`experience-${id}`)).toHaveCount(0);

  expect(pageErrors).toEqual([]);
  expect(consoleRegressions).toEqual([]);
});
