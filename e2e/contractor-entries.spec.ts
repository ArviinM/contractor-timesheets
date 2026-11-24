import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// Demo clock: Fri 27 Nov 2026, 20:00 in Jakarta. Ayu has 13:00 to 17:00 on Friday so far.

test("a contractor adds an entry from a day's Add button", async ({ page }) => {
  await signInAs(page, "Ayu Pratama");
  await page.getByRole("button", { name: "Add entry on Fri 27 Nov" }).click();

  const dialog = page.getByRole("dialog", { name: "New entry" });
  await expect(dialog.getByLabel("Start")).toHaveValue("2026-11-27T17:00");
  await expect(dialog.getByLabel("End")).toHaveValue("2026-11-27T18:00");
  await dialog.getByLabel("Note").fill("Write browser tests");
  await dialog.getByRole("button", { name: "Add entry" }).click();

  await expect(page.getByText("Entry added")).toBeVisible();
  await expect(dialog).toBeHidden();
  const friday = page.getByRole("region", { name: "Fri 27 Nov" });
  await expect(friday.getByText("17:00 to 18:00")).toBeVisible();
  await expect(friday.getByText("Write browser tests")).toBeVisible();
});

test("the form shows the server's message for an overlapping entry", async ({ page }) => {
  await signInAs(page, "Ayu Pratama");
  await page.getByRole("button", { name: "New entry" }).first().click();

  const dialog = page.getByRole("dialog", { name: "New entry" });
  await dialog.getByLabel("Start").fill("2026-11-27T14:00");
  await dialog.getByLabel("End").fill("2026-11-27T15:00");
  await dialog.getByRole("button", { name: "Add entry" }).click();

  await expect(dialog.getByRole("alert")).toContainText("Overlaps another entry");
  await expect(dialog).toBeVisible();
});

test("the form shows the server's message when the end is before the start", async ({ page }) => {
  await signInAs(page, "Ayu Pratama");
  await page.getByRole("button", { name: "New entry" }).first().click();

  const dialog = page.getByRole("dialog", { name: "New entry" });
  await dialog.getByLabel("Start").fill("2026-11-26T10:00");
  await dialog.getByLabel("End").fill("2026-11-26T09:00");
  await dialog.getByRole("button", { name: "Add entry" }).click();

  await expect(dialog.getByRole("alert")).toContainText("End must be after start.");
});

test("an entry that would end in the future is refused", async ({ page }) => {
  await signInAs(page, "Ayu Pratama");
  await page.getByRole("button", { name: "New entry" }).first().click();

  const dialog = page.getByRole("dialog", { name: "New entry" });
  await dialog.getByLabel("Start").fill("2026-11-27T19:30");
  await dialog.getByLabel("End").fill("2026-11-27T21:00");
  await dialog.getByRole("button", { name: "Add entry" }).click();

  await expect(dialog.getByRole("alert")).toContainText("can't end in the future");
});
