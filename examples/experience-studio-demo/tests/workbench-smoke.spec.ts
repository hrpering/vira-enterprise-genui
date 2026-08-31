import { expect, test } from "@playwright/test";

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

test("creates, publishes, serves, unpublishes and deletes a real Studio experience", async ({ page, context }) => {
  const pageErrors: string[] = [];
  const consoleRegressions: string[] = [];
  watchPage(page, pageErrors, consoleRegressions);

  const id = `demo.e2e-${Date.now()}`;
  const name = "Lifecycle flight demo";

  await page.goto("/");
  await expect(page.getByText("Your experiences", { exact: true })).toBeVisible();
  await expect(page.getByText("Start from a real GenUI surface", { exact: true })).toBeVisible();
  await expect(page.getByTestId("starter-gallery")).toBeVisible();

  await page.getByTestId("create-template-flight-search").click();
  await page.getByTestId("new-experience-name").fill(name);
  await page.getByTestId("new-experience-id").fill(id);
  await page.getByTestId("create-experience").click();

  await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  const studioPreview = page.getByTestId("vira-studio-preview");
  await expect(studioPreview.locator("h2.demo-heading").filter({ hasText: "Search flights" })).toBeVisible();
  await expect(studioPreview.locator('.vira-search-card button[type="submit"]')).toBeVisible();
  await expect(studioPreview.locator('input[type="date"]')).toHaveValue("2026-09-15");
  await expect(page.getByTestId("publication-status")).toHaveText("Draft only");
  await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);

  for (const panel of ["components", "layers", "views"] as const) {
    await page.getByTestId(`vira-studio-panel-${panel}`).click();
    await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();
    await expect(page.getByTestId("vira-studio-error")).toHaveCount(0);
  }

  await page.getByTestId("vira-studio-panel-layers").click();
  await page.getByTestId("vira-studio-layer-root").click();
  for (const tab of ["content", "design", "data", "actions"] as const) {
    await page.getByTestId(`vira-studio-inspector-${tab}`).click();
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
  const liveExperience = livePage.getByTestId("live-experience");
  await expect(liveExperience).toBeVisible();
  await expect(livePage.getByText(name, { exact: true })).toBeVisible();
  await expect(livePage.getByRole("heading", { name: "Search flights", exact: true })).toBeVisible();
  await expect(livePage.locator(".vira-search-card")).toBeVisible();
  await expect(livePage.locator('input[type="date"]')).toHaveValue("2026-09-15");
  await expect(liveExperience).toHaveAttribute("data-demo-host-completions", "0");
  await livePage.getByRole("button", { name: "Search flights", exact: true }).click();
  await expect(liveExperience).toHaveAttribute("data-demo-host-completions", "1");
  await expect(liveExperience).toHaveAttribute("data-demo-last-action", "travel.flight.search.submit");
  await livePage.getByRole("button", { name: "Search flights", exact: true }).click();
  await expect(liveExperience).toHaveAttribute("data-demo-host-completions", "2");
  await expect(liveExperience).toHaveAttribute("data-demo-last-action", "travel.flight.search.submit");

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

test("uses one shared brand renderer from gallery through Studio and published runtime", async ({ page, context }) => {
  const pageErrors: string[] = [];
  const consoleRegressions: string[] = [];
  watchPage(page, pageErrors, consoleRegressions);

  const id = `demo.seat-${Date.now()}`;
  const name = "Shared seat map";

  await page.goto("/");
  const gallery = page.getByTestId("starter-gallery");
  await expect(gallery.locator('[data-template="flight-results"] .template-card-copy > strong')).toHaveText("Flight results");
  await expect(gallery.locator('[data-template="fare-comparison"] .template-card-copy > strong')).toHaveText("Fare comparison");
  await expect(gallery.locator('[data-template="traveller-details"] .template-card-copy > strong')).toHaveText("Traveller details");
  await expect(gallery.locator('[data-template="seat-selection"] .template-card-copy > strong')).toHaveText("Seat selection");
  await expect(gallery.locator('[data-template="baggage"] .template-card-copy > strong')).toHaveText("Baggage");
  await expect(gallery.locator('[data-template="extras"] .template-card-copy > strong')).toHaveText("Insurance & extras");
  await expect(gallery.locator('[data-template="booking-review"] .template-card-copy > strong')).toHaveText("Booking review");
  await expect(page.locator('[data-template="seat-selection"] .vira-plane')).toBeVisible();
  await expect(page.locator('[data-template="seat-selection"] .vira-seat:not(:disabled)').first()).toBeEnabled();

  const seatThumbnail = page.locator('[data-template="seat-selection"] .template-preview');
  await expect(seatThumbnail).toHaveAttribute("inert", "");
  await expect(seatThumbnail).toHaveAttribute("aria-hidden", "true");
  const thumbnailSeat = page.locator('[data-template="seat-selection"] .template-preview .vira-seat:not(:disabled)').first();
  const thumbnailAcceptedProgrammaticFocus = await thumbnailSeat.evaluate((node) => {
    (node as HTMLElement).focus();
    return document.activeElement === node;
  });
  expect(thumbnailAcceptedProgrammaticFocus).toBe(false);
  await page.getByTestId("new-experience").focus();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const focusEnteredPreview = await page.evaluate(() => document.activeElement instanceof Element
      && document.activeElement.closest(".template-preview, .dialog-selected-preview") !== null);
    expect(focusEnteredPreview).toBe(false);
  }

  await page.getByTestId("create-template-seat-selection").click();
  await page.getByTestId("new-experience-name").fill(name);
  await page.getByTestId("new-experience-id").fill(id);
  await page.getByTestId("create-experience").click();

  await expect(page.getByTestId("vira-studio-workbench")).toBeVisible();
  const studioPreview = page.getByTestId("vira-studio-preview");
  await expect(studioPreview.locator(".vira-plane")).toBeVisible();
  await expect(studioPreview.locator(".vira-active-traveller div > span")).toHaveText("1/2 assigned");
  const authoringSeat = studioPreview.getByRole("button", { name: /^4C/ });
  await expect(authoringSeat).toBeEnabled();
  await authoringSeat.click();
  await expect(studioPreview.locator(".vira-active-traveller div > span")).toHaveText("2/2 assigned");
  await expect(authoringSeat).toHaveClass(/selected/);

  await page.getByTestId("vira-studio-panel-layers").click();
  await page.getByTestId("vira-studio-layer-root").click();
  await page.getByTestId("vira-studio-inspector-design").click();
  await expect(page.getByText("Radius", { exact: true })).toBeVisible();
  await expect(page.getByText("Shadow", { exact: true })).toBeVisible();

  await page.getByTestId("vira-studio-panel-components").click();
  await expect(page.getByText("Fare comparison", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Seat map", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Baggage selector", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Booking review", { exact: true }).first()).toBeVisible();

  await page.getByTestId("vira-studio-publish").click();
  await expect(page.getByTestId("publication-status")).toHaveText("Published live");

  const livePage = await context.newPage();
  watchPage(livePage, pageErrors, consoleRegressions);
  await livePage.goto(`/live/${id}`);
  const liveExperience = livePage.getByTestId("live-experience");
  await expect(liveExperience).toBeVisible();
  await expect(livePage.locator(".vira-plane")).toBeVisible();
  await expect(livePage.getByText("Pick seats together", { exact: true })).toBeVisible();
  await expect(livePage.locator(".vira-active-traveller div > span")).toHaveText("1/2 assigned");
  const liveSeat = livePage.getByRole("button", { name: /^4C/ });
  await expect(liveSeat).toBeEnabled();
  await liveSeat.click();
  await expect(liveExperience).toHaveAttribute("data-demo-host-completions", "1");
  await expect(liveExperience).toHaveAttribute("data-demo-last-action", "travel.flight.seat.select");
  await expect(livePage.locator(".vira-active-traveller div > span")).toHaveText("2/2 assigned");
  await expect(liveSeat).toHaveClass(/selected/);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("delete-experience").click();
  await expect(page.getByTestId(`experience-${id}`)).toHaveCount(0);

  expect(pageErrors).toEqual([]);
  expect(consoleRegressions).toEqual([]);
});
