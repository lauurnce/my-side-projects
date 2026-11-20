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

test("the saved theme is applied before the app scripts run", async ({ context, page, baseURL }) => {
  await context.addCookies([{ name: "penta-theme", value: "dark", url: baseURL }]);
  await page.route("**/_next/static/**/*.js", (route) => route.abort());

  await page.goto("/styleguide", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", maroon);
});

test("the served page is static and light, with the theme script in the head", async ({ request }) => {
  const response = await request.get("/styleguide", { headers: { Cookie: "penta-theme=dark" } });
  const html = await response.text();
  expect(html).toMatch(htmlTheme("light"));
  expect(html.indexOf("penta-theme=dark")).toBeGreaterThan(-1);
  expect(html.indexOf("penta-theme=dark")).toBeLessThan(html.indexOf("<body"));
});

test("the page falls back to light without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, colorScheme: "dark" });
  await context.addCookies([{ name: "penta-theme", value: "dark", url: baseURL }]);
  const page = await context.newPage();

  await page.goto("/styleguide");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", paper);
  await context.close();
});
