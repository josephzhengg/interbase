import { expect, test } from "@playwright/test";

test("browse → filter → keyboard → save → apply link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("New today")).toBeVisible();
  await expect(page.getByRole("button", { name: /Software Engineering Intern, Summer 2027/ })).toBeVisible();

  // search narrows the list
  const search = page.getByPlaceholder("Search roles or companies…");
  await search.fill("machine");
  await expect(page.getByRole("button", { name: /Machine Learning Intern/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Backend Engineering Intern/ })).toHaveCount(0);
  await search.fill("");
  await expect(page.getByRole("button", { name: /Backend Engineering Intern/ })).toBeVisible();

  // keyboard: j moves selection (click a non-input first so keys reach the page)
  await page.getByText("New today").click();
  const heading = page.getByRole("heading", { level: 1 });
  const before = await heading.textContent();
  await page.keyboard.press("j");
  await expect(heading).not.toHaveText(before ?? "__none__");

  // select a listing → detail panel exposes a compliant apply link
  await page.getByRole("button", { name: /Backend Engineering Intern/ }).click();
  const apply = page.getByRole("link", { name: /Apply on Ramp/ });
  await expect(apply).toBeVisible();
  await expect(apply).toHaveAttribute("target", "_blank");
  await expect(apply).toHaveAttribute("rel", "noopener nofollow");

  // save → appears on /saved
  await page.getByRole("button", { name: "☆ Save" }).click();
  await page.goto("/saved");
  await expect(page.getByText(/Backend Engineering Intern/)).toBeVisible();
});
