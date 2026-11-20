import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const themes = ["light", "dark"] as const;
type Theme = (typeof themes)[number];
type Part = "hero" | "stack" | "panels";

const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };
const shortWide = { width: 844, height: 390 };
const scrollSaveDelay = 500;
const allowedHrefs = ["#routes", "#stack", "/", "/login"];

async function openLanding(page: Page) {
  await page.goto("/");
  await expect(page.locator('[data-ready="true"]')).toBeAttached();
}

async function openLandingIn(page: Page, theme: Theme, baseURL: string | undefined) {
  await page.context().addCookies([{ name: "penta-theme", value: theme, url: baseURL }]);
  await openLanding(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

function readVariable(page: Page, part: Part, name: string) {
  return page.evaluate(
    ([partName, variable]) => {
      const element = document.querySelector(`[data-landing="${partName}"]`);
      if (!element) throw new Error(`No ${partName} element`);
      return Number.parseFloat(getComputedStyle(element).getPropertyValue(variable));
    },
    [part, name],
  );
}

async function expectVariable(page: Page, part: Part, name: string, expected: number, tolerance = 0.02) {
  await expect
    .poll(async () => Math.abs((await readVariable(page, part, name)) - expected), {
      message: `${name} should be ${expected} within ${tolerance}`,
    })
    .toBeLessThanOrEqual(tolerance);
}

function scrollY(page: Page) {
  return page.evaluate(() => window.scrollY);
}

async function scrollToTop(page: Page, top: number) {
  await page.evaluate((target) => window.scrollTo(0, target), top);
  await expect.poll(async () => Math.abs((await scrollY(page)) - top)).toBeLessThanOrEqual(1);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

function stackTopAt(page: Page, progress: number) {
  return page.evaluate((p) => {
    const stack = document.querySelector<HTMLElement>('[data-landing="stack"]');
    const stage = document.querySelector<HTMLElement>('[data-landing="stage"]');
    if (!stack || !stage) throw new Error("No stack or stage element");
    const stackTop = stack.getBoundingClientRect().top + window.scrollY;
    return stackTop + p * (stack.offsetHeight - stage.offsetHeight);
  }, progress);
}

async function scrollToStackProgress(page: Page, progress: number) {
  await scrollToTop(page, await stackTopAt(page, progress));
}

function currentStackProgress(page: Page) {
  return page.evaluate(() => {
    const stack = document.querySelector<HTMLElement>('[data-landing="stack"]');
    const stage = document.querySelector<HTMLElement>('[data-landing="stage"]');
    if (!stack || !stage) throw new Error("No stack or stage element");
    return -stack.getBoundingClientRect().top / (stack.offsetHeight - stage.offsetHeight);
  });
}

function panelsTopAt(page: Page, stageHeights: number) {
  return page.evaluate((heights) => {
    const panels = document.querySelector<HTMLElement>('[data-landing="panels"]');
    const stage = document.querySelector<HTMLElement>('[data-landing="stage"]');
    if (!panels || !stage) throw new Error("No panels or stage element");
    return panels.getBoundingClientRect().top + window.scrollY + heights * stage.offsetHeight;
  }, stageHeights);
}

function stagePosition(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-landing="stage"]');
    if (!stage) throw new Error("No stage element");
    return { top: stage.getBoundingClientRect().top, height: stage.offsetHeight };
  });
}

function pills(page: Page) {
  return page.locator('[data-landing="stack"] button');
}

async function expectCurrentPill(page: Page, index: number) {
  await expect(pills(page)).toHaveCount(3);
  await expect(pills(page).nth(index)).toHaveAttribute("aria-current", "true");
  await expect(page.locator('[data-landing="stack"] button[aria-current="true"]')).toHaveCount(1);
}

async function expectWheelScrolls(page: Page) {
  const start = await scrollY(page);
  await page.mouse.move(desktop.width / 2, desktop.height / 2);
  await page.mouse.wheel(0, 400);
  await expect.poll(async () => Math.abs((await scrollY(page)) - start - 400)).toBeLessThanOrEqual(2);
}

function panelPositions(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-landing-panel]"), (panel) => getComputedStyle(panel).position),
  );
}

async function expectPanelsNotPinned(page: Page) {
  const positions = await panelPositions(page);
  expect(positions).toHaveLength(3);
  for (const position of positions) expect(position).not.toBe("sticky");
}

function pageWidths(page: Page) {
  return page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
}

function tabbableElements(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, [tabindex]"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const disabled = element instanceof HTMLButtonElement || element instanceof HTMLInputElement ? element.disabled : false;
        return element.getClientRects().length > 0 && style.visibility !== "hidden" && element.tabIndex >= 0 && !disabled;
      })
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        href: element.getAttribute("href"),
        text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
        inPanel: element.closest("[data-landing-panel]") !== null,
      })),
  );
}

async function blockingViolations(page: Page) {
  await page.evaluate(() => {
    const transitions = document.getAnimations().filter((animation) => animation instanceof CSSTransition);
    return Promise.allSettled(transitions.map((transition) => transition.finished)).then(() => undefined);
  });
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    }));
}

test.describe("desktop", () => {
  test.use({ viewport: desktop });

  const drops = [
    { progress: 0.1, values: { "--d1": 0.578 } },
    { progress: 0.2, values: { "--d1": 0.963 } },
    { progress: 0.48, values: { "--d1": 1, "--d2": 0.875 } },
    { progress: 0.8, values: { "--d3": 0.875 } },
    { progress: 1, values: { "--d1": 1, "--d2": 1, "--d3": 1 } },
  ];

  for (const drop of drops) {
    test(`the plates drop as written at stack progress ${drop.progress}`, async ({ page }) => {
      await openLanding(page);
      await scrollToStackProgress(page, drop.progress);
      for (const [name, expected] of Object.entries(drop.values)) {
        await expectVariable(page, "stack", name, expected);
      }
    });
  }

  const currentPills = [
    { progress: 0.1, index: 0 },
    { progress: 0.32, index: 0 },
    { progress: 0.34, index: 1 },
    { progress: 0.65, index: 1 },
    { progress: 0.67, index: 2 },
    { progress: 1, index: 2 },
  ];

  test("the current pill follows the stack progress", async ({ page }) => {
    await openLanding(page);
    for (const { progress, index } of currentPills) {
      await scrollToStackProgress(page, progress);
      await expectCurrentPill(page, index);
    }
  });

  test("clicking the first pill scrolls to 0.22 of the stack", async ({ page }) => {
    await openLanding(page);
    await scrollToStackProgress(page, 0.9);
    await expectCurrentPill(page, 2);
    await pills(page).first().click();
    await expect
      .poll(async () => Math.abs((await currentStackProgress(page)) - 0.22))
      .toBeLessThanOrEqual(0.01);
    await expectCurrentPill(page, 0);
  });

  test("the Routes panel is 0.55 covered when Decks is 55% up the screen", async ({ page }) => {
    await openLanding(page);
    await scrollToTop(page, await panelsTopAt(page, 0.55));
    const stage = await stagePosition(page);
    const decksTop = await page
      .locator("[data-landing-panel]")
      .nth(1)
      .evaluate((panel) => panel.getBoundingClientRect().top);
    expect(Math.abs(decksTop - 0.45 * stage.height)).toBeLessThanOrEqual(1);
    await expectVariable(page, "panels", "--c1", 0.55);
  });

  test("the wheel scrolls the page from the top, the stack and the panels", async ({ page }) => {
    await openLanding(page);
    await expectWheelScrolls(page);
    await scrollToStackProgress(page, 0.5);
    await expectWheelScrolls(page);
    await scrollToTop(page, await panelsTopAt(page, 0.5));
    await expectWheelScrolls(page);
  });

  test("the stage is pinned mid-stack", async ({ page }) => {
    await openLanding(page);
    await scrollToStackProgress(page, 0.5);
    const stage = await stagePosition(page);
    expect(Math.abs(stage.top)).toBeLessThanOrEqual(1);
  });

  test("a reload mid-stack keeps the dropped plates and the current pill", async ({ page }) => {
    await openLanding(page);
    await scrollToStackProgress(page, 0.8);
    await expectVariable(page, "stack", "--d3", 0.875);
    await page.waitForTimeout(scrollSaveDelay);
    await page.reload();
    await expect(page.locator('[data-ready="true"]')).toBeAttached();
    await expectVariable(page, "stack", "--d1", 1);
    await expectVariable(page, "stack", "--d2", 1);
    await expectVariable(page, "stack", "--d3", 0.875);
    await expectCurrentPill(page, 2);
  });

  test("reduced motion stops the drop, the shrink and the parallax", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openLanding(page);

    await scrollToTop(page, 300);
    await expect.poll(() => readVariable(page, "hero", "--h")).toBe(0);

    await scrollToStackProgress(page, 0.1);
    await expect.poll(() => readVariable(page, "stack", "--d1")).toBe(1);
    await expect.poll(() => readVariable(page, "stack", "--d2")).toBe(0);

    await scrollToTop(page, await panelsTopAt(page, 0.55));
    await expect.poll(() => readVariable(page, "panels", "--c1")).toBe(0);
  });

  test("focus moving back from Ops is not hidden under a panel", async ({ page, browserName }) => {
    await openLanding(page);
    await scrollToTop(page, await panelsTopAt(page, 2));
    const opsLink = page.getByRole("link", { name: /open ops/i });
    await opsLink.focus();
    await expect(opsLink).toBeFocused();

    await page.keyboard.press(browserName === "webkit" ? "Alt+Shift+Tab" : "Shift+Tab");
    await expect(opsLink).not.toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const focused = document.activeElement;
          if (!focused || focused === document.body) return false;
          const box = focused.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return hit !== null && focused.contains(hit);
        }),
      )
      .toBe(true);
  });

  test("only the real controls take focus", async ({ page }) => {
    await openLanding(page);
    const tabbable = await tabbableElements(page);
    expect(tabbable.length).toBeGreaterThan(0);

    const inPanels = tabbable.filter((element) => element.inPanel);
    expect(inPanels, JSON.stringify(inPanels, null, 2)).toHaveLength(2);
    for (const element of inPanels) {
      expect(element.tag).toBe("a");
      expect(element.href).toBe("/login");
    }

    const links = tabbable.filter((element) => element.tag === "a");
    for (const link of links) {
      expect(allowedHrefs, `href of "${link.text}"`).toContain(link.href);
    }
  });

  test("the hero building follows the theme", async ({ page, baseURL }) => {
    const building = page.locator('[data-landing="hero"] .building-image');
    await openLanding(page);
    await expect(building).toHaveCSS("background-image", /main-building-light/);

    await openLandingIn(page, "dark", baseURL);
    await expect(building).toHaveCSS("background-image", /main-building-dark/);
  });

  test("the page has one h1, the three landmarks and no nav", async ({ page }) => {
    await openLanding(page);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await expect(page.locator("nav")).toHaveCount(0);
  });

  for (const theme of themes) {
    test(`axe finds no serious or critical violations in ${theme}`, async ({ page, baseURL }) => {
      await openLandingIn(page, theme, baseURL);
      await page.evaluate(() => document.fonts.ready);
      const blocking = await blockingViolations(page);
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }
});

test.describe("phone", () => {
  test.use({ viewport: phone });

  test("no horizontal scroll at the top, the middle and the bottom", async ({ page }) => {
    await openLanding(page);
    await page.evaluate(() => document.fonts.ready);
    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate((part) => {
        window.scrollTo(0, part * (document.documentElement.scrollHeight - window.innerHeight));
      }, fraction);
      const widths = await pageWidths(page);
      expect(widths.scroll, `scroll width at ${fraction} of the page`).toBeLessThanOrEqual(widths.client);
    }
    const overflows = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overflowX,
      body: getComputedStyle(document.body).overflowX,
    }));
    expect(overflows.html).not.toBe("hidden");
    expect(overflows.body).not.toBe("hidden");
  });

  test("the panels are not pinned", async ({ page }) => {
    await openLanding(page);
    await expectPanelsNotPinned(page);
  });
});

test.describe("short wide screen", () => {
  test.use({ viewport: shortWide });

  test("the panels are not pinned and the last ops card can be reached", async ({ page }) => {
    await openLanding(page);
    await expectPanelsNotPinned(page);

    const reached = await page.evaluate(() => {
      const ops = Array.from(document.querySelectorAll("[data-landing-panel]")).at(-1);
      if (!ops) throw new Error("No ops panel");
      const texts = Array.from(ops.querySelectorAll<HTMLElement>("*")).filter((element) => {
        const box = element.getBoundingClientRect();
        const ownText = Array.from(element.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        return ownText && box.width > 1 && box.height > 1 && element.closest('[aria-hidden="true"]') === null;
      });
      const last = texts.at(-1);
      if (!last) throw new Error("No visible ops card text");
      last.scrollIntoView({ block: "center" });
      const box = last.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        text: last.textContent,
        inView: box.top >= 0 && box.bottom <= window.innerHeight,
        onTop: hit !== null && (last.contains(hit) || hit.contains(last)),
      };
    });
    expect(reached.text).not.toBe("");
    expect(reached.inView, `"${reached.text}" is inside the viewport`).toBe(true);
    expect(reached.onTop, `"${reached.text}" is not covered or clipped`).toBe(true);
  });
});
