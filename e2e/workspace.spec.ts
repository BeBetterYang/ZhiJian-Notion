import { expect, test } from "@playwright/test";

test("workspace login entry renders", async ({ page }) => {
  await page.goto("/workspace.html");
  await expect(page.getByRole("heading", { name: "登录枝间" })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续" })).toBeVisible();
});
