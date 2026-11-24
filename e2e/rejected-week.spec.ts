import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("a contractor fixes a rejected week and resubmits it", async ({ page }) => {
  await signInAs(page, "Budi Santoso");
  await page.goto("/timesheet?week=2026-11-16");

  await expect(page.getByRole("alert").filter({ hasText: "Northwind Labs rejected this week" })).toContainText(
    "team offsite",
  );

  // Thursday's "Team offsite" entry is the problem. Delete it (with a confirm step).
  await page.getByRole("button", { name: "Delete entry Thu 19 Nov, 09:00 to 17:00" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this entry?" });
  await expect(confirm).toContainText("Team offsite");
  await confirm.getByRole("button", { name: "Delete entry" }).click();
  await expect(page.getByText("Entry deleted")).toBeVisible();
  await expect(page.getByText("Team offsite", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Resubmit week" }).click();
  const submit = page.getByRole("dialog", { name: /Resubmit this week to Northwind Labs/ });
  await expect(submit).toContainText("28:00"); // 36:00 minus the 8-hour offsite day
  await submit.getByRole("button", { name: "Resubmit week" }).click();

  await expect(page.getByText("Week submitted to Northwind Labs")).toBeVisible();
  await expect(page.getByTestId("client-card-Northwind Labs")).toContainText("Waiting for review");
  // Locked again: no edit buttons for this week's entries.
  await expect(page.getByRole("button", { name: /^Edit entry/ })).toHaveCount(0);
});
