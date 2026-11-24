import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("a contractor steps through the guided tour and closes it", async ({ page }) => {
  await signInAs(page, "Ayu Pratama");
  const trigger = page.getByRole("button", { name: "Take the tour" });
  await trigger.click();

  const tour = page.getByRole("dialog", { name: "Three views of the same week" });
  await expect(tour).toBeVisible();
  await expect(tour).toContainText("Step 1 of 6"); // Ayu has no rejected week, so that step is skipped
  await expect(tour.getByRole("button", { name: "Back" })).toBeDisabled();

  const titles = [
    "One form for adding and editing",
    "Your days, with a 12-hour limit",
    "Submit the week to each client",
    "Recent weeks",
    "Switch user",
  ];
  for (const title of titles) {
    await page.getByRole("dialog").getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  }
  await expect(page.getByRole("dialog")).toContainText("Step 6 of 6");

  await page.getByRole("dialog").getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("dialog", { name: "Recent weeks" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Next" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();

  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Esc closes the tour, and a client gets the client steps", async ({ page }) => {
  await signInAs(page, "Bluefin Studio");
  await page.getByRole("button", { name: "Take the tour" }).click();
  await expect(page.getByRole("dialog", { name: "Weeks waiting for you" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
