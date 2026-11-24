import { expect, test } from "@playwright/test";
import { signInAs, switchUser } from "./helpers";

test("without the dev-login cookie, pages send you to sign in", async ({ page }) => {
  await page.goto("/timesheet");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Sign in to Timesheets" })).toBeVisible();
});

test("a client can't open another client's week", async ({ page }) => {
  // Find the URL of a week that belongs to Northwind Labs.
  await signInAs(page, "Northwind Labs");
  const href = await page.getByRole("link", { name: /Ayu Pratama.*Week of Mon 9 Nov/ }).getAttribute("href");
  expect(href).toMatch(/^\/review\/\d+$/);
  await switchUser(page);

  // Bluefin Studio pastes that URL. The server checks ownership and refuses.
  await signInAs(page, "Bluefin Studio");
  await page.goto(href!);
  await expect(page.getByRole("heading", { name: "Not allowed" })).toBeVisible();
  await expect(page.getByText("Ayu Pratama")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve week" })).toHaveCount(0);
});

test("each role only reaches its own pages", async ({ page }) => {
  await signInAs(page, "Ayu Pratama");
  await page.goto("/review");
  await expect(page).toHaveURL(/\/timesheet$/);
  await page.goto("/invoice");
  await expect(page).toHaveURL(/\/timesheet$/);
  await switchUser(page);

  await signInAs(page, "Northwind Labs");
  await page.goto("/timesheet");
  await expect(page).toHaveURL(/\/review$/);
});
