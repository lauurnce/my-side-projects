import { expect, test } from "@playwright/test";

const paper = "rgb(245, 240, 230)";
const maroon = "rgb(128, 0, 0)";
const htmlTheme = (theme: string) => new RegExp(`<html[^>]*data-theme="${theme}"`);

test.use({ colorScheme: "dark" });

test("a new visitor gets light even when the browser prefers dark", async ({ page }) => {
  await page.goto("/styleguide");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", paper);
});

test("the theme toggle switches to dark and a reload keeps it", async ({ page }) => {
  await page.goto("/styleguide");
  await page.getByTestId("top-bar").getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", maroon);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", maroon);
  await expect(page.getByTestId("top-bar").getByRole("button", { name: "Switch to light theme" })).toBeVisible();
});

test("the first paint follows the cookie", async ({ request }) => {
  const withCookie = await request.get("/styleguide", { headers: { Cookie: "penta-theme=dark" } });
  expect(await withCookie.text()).toMatch(htmlTheme("dark"));

  const withoutCookie = await request.get("/styleguide");
  expect(await withoutCookie.text()).toMatch(htmlTheme("light"));
});

test("the page is dark without JavaScript when the cookie is set", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, colorScheme: "light" });
  await context.addCookies([{ name: "penta-theme", value: "dark", url: baseURL }]);
  const page = await context.newPage();

  await page.goto("/styleguide");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", maroon);
  await context.close();
});
