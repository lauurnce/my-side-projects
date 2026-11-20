import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const themes = ["light", "dark"] as const;
type Theme = (typeof themes)[number];

const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];
const paper = "rgb(245, 240, 230)";
const maroon = "rgb(128, 0, 0)";
const ink = "rgb(43, 6, 9)";

async function openStyleguide(page: Page, theme: Theme, baseURL: string | undefined) {
  await page.context().addCookies([{ name: "penta-theme", value: theme, url: baseURL }]);
  await page.goto("/styleguide");
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function hitBoxCoversFortyFourPixels(button: Locator) {
  return button.evaluate((element) => {
    element.scrollIntoView({ block: "center" });
    const box = element.getBoundingClientRect();
    const centreX = box.left + box.width / 2;
    const centreY = box.top + box.height / 2;
    return [-21, 21].every((offset) => {
      const hit = document.elementFromPoint(centreX, centreY + offset);
      return hit !== null && element.contains(hit);
    });
  });
}

async function tabTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 120; presses += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error("The link was never reached with the Tab key");
}

test("the page has the five section headings", async ({ page }) => {
  await page.goto("/styleguide");
  await expect(page.getByRole("heading", { level: 1, name: /Penta/ })).toBeVisible();
  for (const name of ["Palette", "Themes", "Type", "Components"]) {
    await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { level: 2, name: /^Imagery/ })).toBeVisible();
});

test("the upload hint shows the size cap from the config", async ({ page }) => {
  await page.goto("/styleguide");
  await expect(page.getByText("DOCX or PDF only · max 25 MB").first()).toBeVisible();
});

for (const theme of themes) {
  test.describe(`in ${theme}`, () => {
    for (const viewport of viewports) {
      test(`no horizontal overflow at ${viewport.width} x ${viewport.height}`, async ({ page, baseURL }) => {
        await page.setViewportSize(viewport);
        await openStyleguide(page, theme, baseURL);
        await page.evaluate(() => document.fonts.ready);
        const widths = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          htmlOverflow: getComputedStyle(document.documentElement).overflowX,
          bodyOverflow: getComputedStyle(document.body).overflowX,
        }));
        expect(widths.scroll).toBeLessThanOrEqual(widths.client);
        expect(widths.htmlOverflow).toBe("visible");
        expect(widths.bodyOverflow).toBe("visible");
      });
    }

    test("the token table scrolls inside its own box at 390", async ({ page, baseURL }) => {
      await page.setViewportSize(viewports[0]);
      await openStyleguide(page, theme, baseURL);
      const region = page.getByRole("region", { name: "Theme tokens" });
      await expect(region).toHaveAttribute("tabindex", "0");
      await expect(region.getByRole("row")).toHaveCount(13);
      expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    });

    test("the light and dark preview boxes keep their own colours", async ({ page, baseURL }) => {
      await openStyleguide(page, theme, baseURL);
      const light = page.getByTestId("preview-light");
      const dark = page.getByTestId("preview-dark");
      await expect(light).toHaveCSS("background-color", paper);
      await expect(dark).toHaveCSS("background-color", maroon);
      const colourOf = (box: Locator) => box.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(await colourOf(light)).not.toBe(await colourOf(dark));
    });

    test("axe finds no serious or critical violations", async ({ page, baseURL }) => {
      await openStyleguide(page, theme, baseURL);
      await page.evaluate(() => document.fonts.ready);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
        }));
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });

    test("small controls have a hit box at least 44px tall", async ({ page, baseURL }) => {
      await openStyleguide(page, theme, baseURL);
      const controls = [
        page.getByTestId("demo-filter-pill").getByRole("button", { name: "Filters" }),
        page.getByTestId("demo-view-switch").getByRole("button", { name: "Public" }),
        page.getByTestId("demo-view-switch").getByRole("button", { name: "Student hub" }),
        page.getByTestId("demo-theme-toggle").getByRole("button"),
        page.getByTestId("top-bar").getByRole("button"),
      ];
      for (const control of controls) {
        await expect(control).toBeVisible();
        expect(await hitBoxCoversFortyFourPixels(control), `hit box of ${control}`).toBe(true);
      }
    });

    test("a display heading uses the loaded display face", async ({ page, baseURL }) => {
      await openStyleguide(page, theme, baseURL);
      const family = await page
        .getByRole("heading", { level: 1 })
        .evaluate((element) => getComputedStyle(element).fontFamily);
      expect(family).not.toMatch(/^["']?Arial Narrow/i);
      expect(family).toMatch(/^["']?(__)?Big[ _]Shoulders/i);
    });

    test("tabbing to a RouteCard link shows an ink outline and the link is not clipped", async ({
      page,
      baseURL,
    }) => {
      await openStyleguide(page, theme, baseURL);
      const link = page.getByTestId("demo-route-card").getByRole("link");
      await tabTo(page, link);
      await expect(link).toHaveCSS("outline-style", "solid");
      await expect(link).toHaveCSS("outline-width", "2px");
      await expect(link).toHaveCSS("outline-color", ink);
      await expect(link).toHaveCSS("clip-path", "none");
    });
  });
}
