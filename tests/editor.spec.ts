import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
test.use({ channel: "chrome" });
const root = process.cwd();
async function mount(page: any, content?: string) {
  const browser = await page.context().newPage();
  await browser.goto("about:blank");
  await browser.addScriptTag({
    path: root + "/node_modules/.cache/namenym-tests/harness.js",
  });
  await browser.addStyleTag({
    path: root + "/node_modules/.cache/namenym-tests/harness.css",
  });
  await browser.evaluate((content) => window.fixture.mount(content), content);
  await expect(browser.locator(".nn-editor")).toBeVisible();
  return browser;
}
const round = {
  summary: "Practical knowledge for software teams",
  themes: ["Knowledge", "Trust", "Discovery", "Portability"].map(
    (label, i) => ({ id: `theme${i}`, label }),
  ),
  names: [
    {
      name: "Fieldbook",
      style: "dictionary",
      rationale: "Practical lessons in one place",
      sourceIds: ["theme0"],
    },
    {
      name: "Relay",
      style: "evocative",
      rationale: "Knowledge that travels",
      sourceIds: ["theme3"],
    },
  ],
};
test("first round is immediate, prepares four themes in two requests, and Stop discards late words", async ({
  page,
}) => {
  const b = await mount(page);
  try {
    await b
      .getByLabel("Project brief", { exact: true })
      .fill("Shared software knowledge");
    await b
      .getByRole("button", { name: "Generate names", exact: true })
      .click();
    await expect(b.locator(".nn-skeleton")).toHaveCount(4);
    expect(await b.evaluate(() => window.fixture.calls().length)).toBe(1);
    await b.evaluate((r) => window.fixture.complete(0, r), round);
    await expect(b.locator(".nn-name-tile")).toHaveCount(2);
    await expect(b.locator(".nn-first-run")).toHaveCount(0);
    await expect
      .poll(() => b.evaluate(() => window.fixture.calls().length))
      .toBe(3);
    await b.locator(".nn-name-tile").first().focus();
    await b.keyboard.press("s");
    await b.getByRole("button", { name: "Stop", exact: true }).click();
    await b.evaluate(() => {
      const calls = window.fixture.calls();
      for (let i = 1; i < calls.length; i++) {
        const input = JSON.parse(calls[i].messages[0].content);
        window.fixture.complete(i, {
          groups: input.themes.map((t) => ({
            themeId: t.id,
            words: ["wisdom", "insight"],
          })),
        });
      }
    });
    await expect(b.locator(".nn-word-list button")).toHaveCount(0);
    expect(
      (await b.evaluate(() => window.fixture.project())).shortlisted,
    ).toHaveLength(1);
    expect(await b.evaluate(() => window.fixture.calls().length)).toBe(3);
  } finally {
    await b.close();
  }
});
test("brief changes reject late names; failed requests retry only on explicit action; normal review is request-free", async ({
  page,
}) => {
  const b = await mount(page);
  try {
    await b.getByLabel("Project brief", { exact: true }).fill("Original brief");
    await b
      .getByRole("button", { name: "Generate names", exact: true })
      .click();
    await b.getByLabel("Project brief", { exact: true }).fill("Changed brief");
    await b.evaluate((r) => window.fixture.complete(0, r), round);
    await expect(
      b.getByRole("button", { name: "Generate names", exact: true }),
    ).toBeVisible();
    await expect(b.locator(".nn-name-tile")).toHaveCount(0);
    await b
      .getByRole("button", { name: "Generate names", exact: true })
      .click();
    await b.evaluate(() => window.fixture.fail(1));
    await expect(
      b.getByRole("button", { name: "Retry", exact: true }),
    ).toBeVisible();
    expect(await b.evaluate(() => window.fixture.calls().length)).toBe(2);
    await b.getByRole("button", { name: "Retry", exact: true }).click();
    await expect
      .poll(() => b.evaluate(() => window.fixture.calls().length))
      .toBe(3);
    await b.getByRole("button", { name: "Stop", exact: true }).click();
    await b.evaluate((r) => window.fixture.complete(2, r), round);
    await b
      .getByLabel("Add a name", { exact: true })
      .fill("Open Book\nPlain Speaking");
    await b.getByLabel("Add a name", { exact: true }).press("Enter");
    await b.locator(".nn-name-tile").first().focus();
    await b.keyboard.press("s");
    await b.keyboard.press("d");
    await b.keyboard.press("Escape");
    await b.getByRole("tab", { name: /Shortlist/ }).click();
    await b.locator(".nn-names").evaluate((el) => (el.scrollTop = 1000));
    expect(await b.evaluate(() => window.fixture.calls().length)).toBe(3);
  } finally {
    await b.close();
  }
});
test("manual batch entry, duplicate focus, inline edit, save/reload contract and overlapping saves preserve new edits", async ({
  page,
}) => {
  const b = await mount(page);
  try {
    await b
      .getByLabel("Add a name", { exact: true })
      .fill("Open Book\nOpen   Book\nCommon Ground");
    await b.getByLabel("Add a name", { exact: true }).press("Enter");
    await expect(b.locator(".nn-name-tile")).toHaveCount(2);
    await b.locator(".nn-name-tile").first().focus();
    await b.keyboard.press("e");
    await b.getByLabel("Edit name", { exact: true }).fill("Field Manual");
    await b.getByLabel("Edit name", { exact: true }).press("Enter");
    await expect(b.locator(".nn-name-tile").first()).toBeFocused();
    await b.keyboard.press("d");
    await b.locator(".nn-detail textarea").fill("Keep this note");
    await b.evaluate(() => {
      window.fixture.delaySave();
      window.firstSave = window.fixture.save();
    });
    await b.getByLabel("Project title").fill("Newer title");
    await b.evaluate(() => {
      window.secondSave = window.fixture.save();
      window.fixture.finishSave();
    });
    await b.evaluate(() => Promise.all([window.firstSave, window.secondSave]));
    const saved = await b.evaluate(() => JSON.parse(window.fixture.saved()));
    expect(saved.name).toBe("Newer title");
    expect(saved.mashups[0].label).toBe("Field Manual");
    expect(saved.mashups[0].notes).toBe("Keep this note");
    expect(await b.evaluate(() => window.fixture.dirty())).toBe(false);
    expect(await b.evaluate(() => window.fixture.writes())).toBe(2);
    expect(await b.evaluate(() => window.fixture.calls().length)).toBe(0);
  } finally {
    await b.close();
  }
});
test("clicking a name shortlists it, the hover x hides it with undo, and words upvote on click and exclude from their x", async ({
  page,
}) => {
  const b = await mount(page);
  try {
    await b.getByLabel("Add a name", { exact: true }).fill("Open Book\nRelay");
    await b.getByLabel("Add a name", { exact: true }).press("Enter");
    const first = b.locator(".nn-name-tile").first();
    await first.locator(".nn-name-label").click();
    await expect(first).toHaveClass(/nn-shortlisted/);
    await expect(first.locator(".nn-star")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(b.locator(".nn-detail")).toHaveCount(0);
    await first.locator(".nn-name-label").click();
    await expect(first).not.toHaveClass(/nn-shortlisted/);
    await first.locator(".nn-name-details").click();
    await expect(b.locator(".nn-detail")).toHaveCount(1);
    await b.getByRole("button", { name: "Close name details" }).click();
    await first.hover();
    await first.getByRole("button", { name: "Hide Open Book" }).click();
    await expect(b.locator(".nn-name-tile")).toHaveCount(1);
    await expect(b.locator(".nn-toast")).toContainText("Hidden Open Book");
    await b.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(b.locator(".nn-name-tile")).toHaveCount(2);
    await b.getByLabel("Add a theme", { exact: true }).fill("Knowledge");
    await b.getByLabel("Add a theme", { exact: true }).press("Enter");
    await b.getByLabel("Add word to Knowledge", { exact: true }).fill("wisdom");
    await b.getByLabel("Add word to Knowledge", { exact: true }).press("Enter");
    const word = b.locator(".nn-word").first();
    await word.locator(".nn-word-label").click();
    await expect(word).toHaveClass(/nn-voted/);
    expect(
      (await b.evaluate(() => window.fixture.project())).synonyms[0].votes,
    ).toBe(1);
    await word.locator(".nn-word-label").click();
    await expect(word).not.toHaveClass(/nn-voted/);
    await word.hover();
    await word.getByRole("button", { name: "Exclude wisdom" }).click();
    await expect(b.locator(".nn-word")).toHaveCount(0);
    expect(
      (await b.evaluate(() => window.fixture.project())).synonyms[0].dismissed,
    ).toBe(true);
    await b.getByRole("button", { name: /1 excluded/ }).click();
    await expect(b.locator(".nn-word.nn-struck")).toHaveCount(1);
    await b.getByRole("button", { name: "Include wisdom" }).click();
    await expect(b.locator(".nn-word.nn-struck")).toHaveCount(0);
    await expect(b.locator(".nn-word")).toHaveCount(1);
    await b.locator(".nn-theme-heading").hover();
    await b.getByRole("button", { name: "Remove theme Knowledge" }).click();
    await expect(b.locator(".nn-theme")).toHaveCount(0);
    await b.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(b.locator(".nn-theme")).toHaveCount(1);
    await expect(b.locator(".nn-word")).toHaveCount(1);
    // Only the new theme's word preparation ran; review actions never start AI work.
    expect(await b.evaluate(() => window.fixture.calls().length)).toBe(1);
  } finally {
    await b.close();
  }
});
test("invalid input never saves an empty replacement; external edits do not overwrite unsaved work", async ({
  page,
}) => {
  const invalid = await mount(page, '{"broken":');
  try {
    await expect(
      invalid.getByRole("heading", { name: "Could not load this project" }),
    ).toBeVisible();
    await invalid.evaluate(() => window.fixture.save().catch(() => {}));
    expect(await invalid.evaluate(() => window.fixture.writes())).toBe(0);
  } finally {
    await invalid.close();
  }
  const b = await mount(page);
  try {
    await b.getByLabel("Project title").fill("My unsaved title");
    await b.evaluate(() => {
      const external = window.fixture.project();
      window.fixture.external(
        JSON.stringify({ ...external, name: "External title" }),
      );
    });
    await expect(b.locator(".nn-error")).toContainText(
      "unsaved work is preserved",
    );
    await b.evaluate(() => window.fixture.save().catch(() => {}));
    expect(await b.evaluate(() => window.fixture.writes())).toBe(0);
    await expect(b.getByLabel("Project title")).toHaveValue("My unsaved title");
    await b.getByRole("button", { name: "Keep my edits" }).click();
    await b.evaluate(() => window.fixture.save());
    expect(
      JSON.parse(await b.evaluate(() => window.fixture.saved())).name,
    ).toBe("My unsaved title");
  } finally {
    await b.close();
  }
});

test("domains check automatically with two slots, filter exact .com matches, and persist reusable results", async ({
  page,
}) => {
  const b = await mount(page);
  try {
    await b
      .getByLabel("Add a name", { exact: true })
      .fill("Google\nName Qxzv\nAnother Name");
    await b.getByLabel("Add a name", { exact: true }).press("Enter");
    await expect
      .poll(() => b.evaluate(() => window.fixture.domainCalls().length))
      .toBe(2);
    await b.evaluate(() => {
      window.fixture.completeDomains(0, []);
      window.fixture.completeDomains(1, [
        {
          domain: "nameqxzv.com",
          available: true,
          registerURL: "javascript:alert(1)",
        },
        { domain: "nameqxzv.ai", available: true },
      ]);
    });
    await expect
      .poll(() => b.evaluate(() => window.fixture.domainCalls().length))
      .toBe(3);
    await b.evaluate(() =>
      window.fixture.completeDomains(2, [
        { domain: "anothername.ai", available: true },
      ]),
    );
    await expect(b.locator(".nn-domain-toolbar")).toContainText(
      "1 .com available",
    );
    await b.getByLabel("Available .com only").check();
    await expect(b.locator(".nn-name-tile")).toHaveCount(1);
    await expect(b.locator(".nn-name-tile")).toContainText("Name Qxzv");
    await b.locator(".nn-domain-badge").click();
    await expect(b.getByRole("link", { name: "nameqxzv.com" })).toHaveAttribute(
      "href",
      "https://domainr.com/nameqxzv.com",
    );
    await expect(b.locator(".nn-domain-details")).toContainText("Last result:");
    await b.evaluate(async () => {
      await window.fixture.save();
      const p = JSON.parse(window.fixture.saved());
      window.fixture.external(JSON.stringify({ ...p, name: "Reloaded" }));
    });
    await expect(b.getByLabel("Project title")).toHaveValue("Reloaded");
    await expect(b.locator(".nn-domain-toolbar")).toContainText(
      "1 .com available",
    );
    expect(await b.evaluate(() => window.fixture.domainCalls().length)).toBe(3);
  } finally {
    await b.close();
  }
});

test("domain failures retry explicitly, reject late results after rename, and stop queued checks", async ({
  page,
}) => {
  const b = await mount(page);
  try {
    await b.getByLabel("Add a name", { exact: true }).fill("Original");
    await b.getByLabel("Add a name", { exact: true }).press("Enter");
    await expect
      .poll(() => b.evaluate(() => window.fixture.domainCalls().length))
      .toBe(1);
    await b.evaluate(() => window.fixture.completeDomains(0, [], 500));
    await expect(b.locator(".nn-domain-badge")).toContainText("failed");
    await b.locator(".nn-domain-badge").click();
    await expect(b.locator(".nn-domain-details")).toContainText("HTTP 500");
    expect(await b.evaluate(() => window.fixture.domainCalls().length)).toBe(1);
    await b
      .getByRole("button", { name: "Retry domain check", exact: true })
      .click();
    await b.locator(".nn-name-tile").focus();
    await b.keyboard.press("e");
    await b.getByLabel("Edit name", { exact: true }).fill("Renamed");
    await b.getByLabel("Edit name", { exact: true }).press("Enter");
    await expect
      .poll(() => b.evaluate(() => window.fixture.domainCalls().length))
      .toBe(3);
    await b.evaluate(() => {
      window.fixture.completeDomains(1, [
        { domain: "original.com", available: true },
      ]);
      window.fixture.completeDomains(2, []);
    });
    await expect(b.locator(".nn-domain-badge")).toHaveText(".com not listed");
    expect(
      await b.evaluate(
        () => window.fixture.project().mashups[0].domainCheck.query,
      ),
    ).toBe("renamed");
    await b
      .getByLabel("Add a name", { exact: true })
      .fill("First\nSecond\nThird");
    await b.getByLabel("Add a name", { exact: true }).press("Enter");
    await expect
      .poll(() => b.evaluate(() => window.fixture.domainCalls().length))
      .toBe(5);
    await b
      .getByRole("button", { name: "Stop domain checks", exact: true })
      .click();
    await expect(b.locator(".nn-domain-toolbar")).toContainText("paused");
    expect(await b.evaluate(() => window.fixture.domainCalls().length)).toBe(5);
    await b
      .getByRole("button", { name: "Resume domain checks", exact: true })
      .click();
    await expect
      .poll(() => b.evaluate(() => window.fixture.domainCalls().length))
      .toBe(7);
  } finally {
    await b.close();
  }
});

test("domain timeout stays retryable and a file reload discards late results", async ({
  page,
}) => {
  const b = await mount(page);
  try {
    await b.clock.install();
    await b.getByLabel("Add a name", { exact: true }).fill("Timeout Name");
    await b.getByLabel("Add a name", { exact: true }).press("Enter");
    await expect
      .poll(() => b.evaluate(() => window.fixture.domainCalls().length))
      .toBe(1);
    await b.clock.fastForward(35_001);
    await expect(b.locator(".nn-domain-badge")).toContainText("failed");
    await b.locator(".nn-domain-badge").click();
    await expect(b.locator(".nn-domain-details")).toContainText("timed out");
    await b
      .getByRole("button", { name: "Retry domain check", exact: true })
      .click();
    await b.evaluate(async () => {
      await window.fixture.save();
      window.fixture.external(
        JSON.stringify({ ...window.fixture.project(), mashups: [] }),
      );
      window.fixture.completeDomains(1, [
        { domain: "timeoutname.com", available: true },
      ]);
    });
    await expect(b.locator(".nn-name-tile")).toHaveCount(0);
    expect(
      await b.evaluate(() => window.fixture.project().mashups.length),
    ).toBe(0);
  } finally {
    await b.close();
  }
});
