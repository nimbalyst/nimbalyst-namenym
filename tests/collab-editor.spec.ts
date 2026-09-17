import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
test.use({ channel: "chrome" });
const content = readFileSync("samples/demo.namenym", "utf8");
async function mount(
  page: Page,
  user: string,
  browser = true,
  state?: number[],
  source = content,
  count = 3
) {
  await page.goto("about:blank");
  await page.addScriptTag({
    path: "node_modules/.cache/namenym-tests/harness.js",
  });
  await page.addStyleTag({
    path: "node_modules/.cache/namenym-tests/harness.css",
  });
  await page.evaluate(
    ({ content, user, browser, state }) =>
      (window as any).fixture.mountShared(content, user, browser, state),
    { content: source, user, browser, state }
  );
  if (count) await expect(page.locator(".nn-name-tile")).toHaveCount(count);
}
async function sync(a: Page, b: Page) {
  const [ua, ub] = await Promise.all([
    a.evaluate(() => (window as any).fixture.sharedState()),
    b.evaluate(() => (window as any).fixture.sharedState()),
  ]);
  await a.evaluate((update) => (window as any).fixture.mergeShared(update), ub);
  await b.evaluate((update) => (window as any).fixture.mergeShared(update), ua);
}
test("browser peers merge personal favorites, notes and brief edits, survive reopen, and never call disk or automatic services", async ({
  browser,
}) => {
  const a = await browser.newPage(),
    b = await browser.newPage();
  const errors: string[] = [];
  a.on("pageerror", (error) => errors.push(error.message));
  b.on("pageerror", (error) => errors.push(error.message));
  await mount(a, "alice");
  await mount(
    b,
    "bob",
    true,
    await a.evaluate(() => (window as any).fixture.sharedState())
  );
  for (const page of [a, b]) {
    await expect(
      page.getByRole("button", { name: "Generate names", exact: true })
    ).toBeDisabled();
    expect(
      await page.evaluate(() => (window as any).fixture.calls())
    ).toHaveLength(0);
    expect(
      await page.evaluate(() => (window as any).fixture.domainCalls())
    ).toHaveLength(0);
    expect(
      await page.evaluate(
        () => (window as any).fixture.sharedChecks().forbiddenCalls
      )
    ).toBe(0);
    await page.locator(".nn-star").first().click();
  }
  await a.locator(".nn-name-details").first().click();
  await a.getByLabel("Notes", { exact: true }).fill("Keep this candidate");
  await sync(a, b);
  await expect(b.locator(".nn-favorite-count").first()).toHaveText(
    "2 favorites"
  );
  await b.locator(".nn-name-details").first().click();
  await expect(b.getByLabel("Notes", { exact: true })).toHaveValue(
    "Keep this candidate"
  );
  await a.locator(".nn-star").first().click();
  await sync(a, b);
  await expect(b.locator(".nn-star").first()).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(a.locator(".nn-star").first()).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  for (const page of [a, b])
    await page.getByRole("button", { name: "Brief", exact: true }).click();
  const briefA = a.getByLabel("Project brief", { exact: true });
  const briefB = b.getByLabel("Project brief", { exact: true });
  await briefA.focus();
  await a.keyboard.press("ControlOrMeta+End");
  await a.keyboard.type(" Alice");
  await briefB.focus();
  await b.keyboard.press("ControlOrMeta+Home");
  await b.keyboard.type("Bob ");
  await sync(a, b);
  await expect(briefA).toHaveValue(await briefB.inputValue());
  expect(await briefA.inputValue()).toContain("Alice");
  expect(await briefA.inputValue()).toContain("Bob");
  const persisted = await a.evaluate(() =>
    (window as any).fixture.sharedState()
  );
  await a.close();
  await b.close();
  const fresh = await browser.newPage();
  await mount(fresh, "bob", true, persisted);
  await expect(fresh.locator(".nn-star").first()).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await fresh.locator(".nn-name-details").first().click();
  await expect(fresh.getByLabel("Notes", { exact: true })).toHaveValue(
    "Keep this candidate"
  );
  await fresh.evaluate(() => (window as any).fixture.setReadOnly(true));
  await expect(fresh.locator(".nn-star").first()).toBeDisabled();
  await expect(fresh.getByLabel("Notes", { exact: true })).toHaveAttribute(
    "readonly",
    ""
  );
  expect(
    await fresh.evaluate(() => {
      try {
        (window as any).fixture.apply({ type: "SET_NAME", name: "Forbidden" });
        return false;
      } catch {
        return true;
      }
    })
  ).toBe(true);
  expect(errors).toEqual([]);
  await fresh.close();
});

test("desktop generation cannot apply a result after write permission is revoked", async ({
  page,
}) => {
  await mount(page, "alice", false);
  await page
    .getByRole("button", { name: "Generate names", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fixture.calls().length))
    .toBe(1);
  await page.evaluate(() => {
    (window as any).fixture.setReadOnly(true);
    (window as any).fixture.complete(0, {
      names: [
        { name: "Forbidden", style: "inventive", rationale: "", sourceIds: [] },
      ],
    });
  });
  await expect(page.locator(".nn-skeleton")).toHaveCount(0);
  await expect(page.locator(".nn-name-tile")).toHaveCount(3);
  expect(
    await page.evaluate(() => (window as any).fixture.domainCalls())
  ).toHaveLength(0);
});

test("text composition merges an intervening peer edit and same-tick typing reads the new shared baseline", async ({
  browser,
}) => {
  const a = await browser.newPage(),
    b = await browser.newPage();
  const source = JSON.stringify({ ...JSON.parse(content), brief: "Hello" });
  await mount(a, "alice", true, undefined, source);
  await mount(
    b,
    "bob",
    true,
    await a.evaluate(() => (window as any).fixture.sharedState())
  );
  for (const page of [a, b])
    await page.getByRole("button", { name: "Brief", exact: true }).click();
  const briefA = a.getByLabel("Project brief", { exact: true });
  await briefA.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(1, 4);
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true })
    );
    element.value = "H漢字o";
    element.setSelectionRange(3, 3);
  });
  await b.getByLabel("Project brief", { exact: true }).fill("He PEER llo");
  await a.evaluate(
    (update) => (window as any).fixture.mergeShared(update),
    await b.evaluate(() => (window as any).fixture.sharedState())
  );
  await briefA.evaluate((element) =>
    element.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true })
    )
  );
  await sync(a, b);
  expect(await briefA.inputValue()).toContain(" PEER ");
  expect(await briefA.inputValue()).toContain("漢字");
  await b
    .getByLabel("Project brief", { exact: true })
    .fill((await briefA.inputValue()) + " remote");
  await a.evaluate((update) => {
    (window as any).fixture.mergeShared(update);
    const element = document.querySelector<HTMLTextAreaElement>(
      '[aria-label="Project brief"]'
    )!;
    element.value += " local";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, await b.evaluate(() => (window as any).fixture.sharedState()));
  expect(await briefA.inputValue()).toContain("remote local");
  await a.setViewportSize({ width: 620, height: 850 });
  await a.screenshot({
    path: "test-results/namenym-shared-editor.png",
    fullPage: true,
  });
  await a.close();
  await b.close();
});

test("an empty unseeded room waits without writing defaults; future layouts show an error without filesystem fallback", async ({
  browser,
}) => {
  const a = await browser.newPage(),
    b = await browser.newPage(),
    future = await browser.newPage();
  await mount(a, "alice");
  await mount(b, "bob", true, undefined, "", 0);
  await expect(b.locator(".nn-loading")).toBeVisible();
  expect(
    await b.evaluate(() => (window as any).fixture.sharedChecks().flushes)
  ).toBe(0);
  await b.evaluate(
    (update) => (window as any).fixture.mergeShared(update),
    await a.evaluate(() => (window as any).fixture.sharedState())
  );
  await expect(b.locator(".nn-name-tile")).toHaveCount(3);
  await mount(
    future,
    "future",
    true,
    await a.evaluate(() => (window as any).fixture.sharedState(999)),
    "",
    0
  );
  await expect(future.getByRole("alert")).toContainText(
    "Unsupported Namenym collaboration layout"
  );
  expect(
    await future.evaluate(
      () => (window as any).fixture.sharedChecks().forbiddenCalls
    )
  ).toBe(0);
  await a.close();
  await b.close();
  await future.close();
});
