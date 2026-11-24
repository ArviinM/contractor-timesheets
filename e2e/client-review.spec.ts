import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("a client approves a waiting week and it appears on the invoice", async ({ page }) => {
  await signInAs(page, "Northwind Labs");

  await page.getByRole("link", { name: /Ayu Pratama.*Week of Mon 16 Nov/ }).click();
  const detail = page.getByRole("heading", { level: 2, name: "Ayu Pratama" });
  await expect(detail).toBeVisible();
  await expect(page.getByText("Locks when you approve")).toBeVisible();

  await page.getByRole("button", { name: "Approve week" }).click();
  const dialog = page.getByRole("dialog", { name: "Approve Ayu Pratama's week?" });
  await expect(dialog).toContainText("$1,222.10");
  await dialog.getByRole("button", { name: "Approve week" }).click();
  await expect(page.getByText("Week approved")).toBeVisible();

  await page.getByRole("link", { name: "Invoice" }).click();
  const invoice = page.getByRole("region", { name: "Invoice" });
  const line = invoice.getByRole("row").filter({ hasText: "Ayu Pratama" }).filter({ hasText: "Week of Mon 16 Nov" });
  await expect(line).toContainText("36:40");
  await expect(line).toContainText("$33.33");
  await expect(line).toContainText("$1,222.10");
  // Seeded November total was $4,924.20; plus this line.
  await expect(page.getByTestId("invoice-total")).toHaveText("$6,146.30");
});

test("rejecting needs a comment, and the comment reaches the contractor", async ({ page }) => {
  await signInAs(page, "Bluefin Studio");
  await expect(page.getByRole("heading", { level: 2, name: "Citra Wijaya" })).toBeVisible();

  await page.getByRole("button", { name: "Reject with comment" }).click();
  const dialog = page.getByRole("dialog", { name: "Reject Citra Wijaya's week?" });
  await dialog.getByRole("button", { name: "Reject week" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Add a comment");

  await dialog.getByLabel("Comment for Citra Wijaya").fill("Please split Wednesday into design and build.");
  await dialog.getByRole("button", { name: "Reject week" }).click();
  await expect(page.getByText("Week rejected")).toBeVisible();

  await page.getByRole("button", { name: "Switch user" }).click();
  await signInAs(page, "Citra Wijaya");
  await page.goto("/timesheet?week=2026-11-16");
  await expect(page.getByRole("alert").filter({ hasText: "Bluefin Studio rejected this week" })).toContainText(
    "Please split Wednesday into design and build.",
  );
});
