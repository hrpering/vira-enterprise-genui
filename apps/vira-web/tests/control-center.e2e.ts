import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("operator can navigate with keyboard and sees exact evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop evidence rail assertion");
  await page.goto("/#runs");
  await expect(page.getByRole("heading", { name: "Good afternoon, Maya." })).toBeVisible();
  await expect(page.getByRole("complementary", { name: /run trace/i })).toContainText("txnplan_07ad");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder("Search exact IDs or natural language")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Applications", level: 1 })).toBeVisible();
});

test("role-aware navigation exposes builder and admin surfaces", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop role preview assertion");
  await page.goto("/#runs");
  await expect(page.getByRole("button", { name: "Studio" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Preview role" }).selectOption("builder");
  await expect(page.getByRole("button", { name: "Studio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recovery" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Preview role" }).selectOption("admin");
  await expect(page.getByRole("button", { name: "Recovery" })).toBeVisible();
});

test("offline and uncertain states never claim success", async ({ page, context }) => {
  await page.goto("/#runs");
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByRole("alert")).toContainText("Mutations remain disabled");
  await context.setOffline(false);
  await page.getByText("Preview resilient states").click();
  await page.getByRole("button", { name: "uncertain", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("will not report success");
});

test("mobile navigation is an accessible off-canvas dialog", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only navigation assertion");
  await page.goto("/#runs");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Vira navigation" })).toBeVisible();
  await page.getByRole("dialog", { name: "Vira navigation" }).getByRole("button", { name: /^Tasks/ }).click();
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Vira navigation" })).toHaveCount(0);
});

test("reduced motion removes meaningful animation duration", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#runs");
  const duration = await page.locator(".evidence-step").first().evaluate((element) =>
    getComputedStyle(element, "::after").animationDuration,
  );
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(duration.endsWith("ms") ? 0.01 : 0.00001);
});

test("light and dark themes retain readable operational surfaces", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/#runs");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(11, 13, 15)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(243, 245, 243)");
});

test("primary operational view has no serious accessibility violations", async ({ page }) => {
  await page.goto("/#runs");
  const results = await new AxeBuilder({ page }).exclude(".state-preview").analyze();
  const violations = results.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
    .map((violation) => ({ id: violation.id, targets: violation.nodes.flatMap((node) => node.target) }));
  expect(violations).toEqual([]);
});
