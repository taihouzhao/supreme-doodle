import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const DIST = join(process.cwd(), "dist");
const RESULTS = join(process.cwd(), "test-results");
const CHROMIUM_CACHE = join(RESULTS, "chromium-cache");
const viewports = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function staticServer() {
  return createServer(async (request, response) => {
    try {
      const urlPath = new URL(request.url ?? "/", "http://localhost").pathname;
      const relative = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.(\/|\\|$))+/, "");
      let file = join(DIST, relative === "/" ? "index.html" : relative);
      if (!extname(file)) file = join(file, "index.html");
      const data = await readFile(file);
      response.writeHead(200, {
        "content-type": mime[extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

async function chromiumExecutable() {
  const executable = join(CHROMIUM_CACHE, "chromium");
  try {
    await access(executable);
    return executable;
  } catch {
    await mkdir(CHROMIUM_CACHE, { recursive: true });
    const compressed = join(
      process.cwd(),
      "node_modules",
      "@sparticuz",
      "chromium",
      "bin",
      "chromium.br",
    );
    await pipeline(
      createReadStream(compressed),
      createBrotliDecompress(),
      createWriteStream(executable),
    );
    await chmod(executable, 0o700);
    return executable;
  }
}

async function enterFirstMission(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  await page.locator('[data-action="new-campaign"]').click();
  await page.locator('[data-action="begin-mission"]').click();
  await page.waitForSelector(".hud-top__name");
  await page.waitForFunction(() => document.querySelector(".hud-top__name")?.textContent?.trim().length);
}

async function measure(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
        centerY: rect.y + rect.height / 2,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      };
    };

    const objectives = [...document.querySelectorAll(".hud-top__obj")].map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, y: rect.y };
    });
    const oneCharacterWidth = parseFloat(getComputedStyle(document.querySelector(".hud-top__name")).fontSize);

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hud: box(".hud-top"),
      name: box(".hud-top__name"),
      goals: box(".hud-top__goals"),
      meta: box(".hud-top__meta"),
      actions: box(".hud-top__actions"),
      map: box(".stage__map"),
      next: box(".hud-top__next"),
      end: box(".hud-top__end"),
      objectives,
      oneCharacterWidth,
    };
  });
}

function assertMobileLayout(layout) {
  const { width, height } = layout.viewport;
  assert.ok(layout.hud.width <= width, `HUD overflows viewport: ${layout.hud.width} > ${width}`);
  assert.ok(layout.hud.height <= 82, `HUD is not compact: ${layout.hud.height}px`);
  assert.ok(layout.name.width >= layout.oneCharacterWidth * 3, `Mission title collapsed to ${layout.name.width}px`);
  assert.ok(layout.name.height <= 24, `Mission title wrapped vertically: ${layout.name.height}px`);
  assert.ok(layout.goals.width >= 24 && layout.goals.height <= 34, "Objective icon strip is missing or too tall");
  assert.ok(layout.objectives.length >= 1, "No objectives rendered");
  for (const objective of layout.objectives) {
    assert.ok(objective.width >= 18 && objective.height <= 34, `Objective icon collapsed: ${objective.width}×${objective.height}px`);
  }
  const rowY = [layout.name.centerY, layout.goals.centerY, layout.meta.centerY, layout.actions.centerY];
  assert.ok(Math.max(...rowY) - Math.min(...rowY) <= 3, `HUD controls wrapped into multiple rows: ${rowY.join(",")}`);
  assert.ok(layout.next.width >= 36 && layout.next.height >= 40, "Next-unit touch target is undersized");
  assert.ok(layout.end.width >= 40 && layout.end.height >= 40, "End-turn touch target is undersized");
  assert.ok(layout.actions.right <= width + 0.5, "Actions overflow the right edge");
  assert.ok(layout.map.height >= height * 0.78, `Map only has ${layout.map.height}px of vertical space`);
  assert.ok(layout.map.bottom <= height + 0.5, "Map overflows the viewport");
}

await mkdir(RESULTS, { recursive: true });
const server = staticServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}/`;

const executablePath = process.env.GITHUB_ACTIONS === "true"
  ? await chromium.executablePath()
  : await chromiumExecutable();

const browser = await puppeteer.launch({
  args: chromium.args,
  executablePath,
  headless: "shell",
});

try {
  for (const viewport of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ ...viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await enterFirstMission(page, baseUrl);
    const layout = await measure(page);
    try {
      assertMobileLayout(layout);
    } catch (error) {
      await page.screenshot({ path: join(RESULTS, `mobile-${viewport.width}-failure.png`), fullPage: true });
      throw error;
    } finally {
      await page.close();
    }
    process.stdout.write(`✓ ${viewport.width}×${viewport.height}: HUD ${Math.round(layout.hud.height)}px, map ${Math.round(layout.map.height)}px\n`);
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
