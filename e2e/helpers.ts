import { expect, type Page } from "@playwright/test";

/** Uses the dev login on the sign-in page, like a person would. */
export async function signInAs(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await expect(page).not.toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

export async function switchUser(page: Page) {
  await page.getByRole("button", { name: "Switch user" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Timesheets" })).toBeVisible();
}
