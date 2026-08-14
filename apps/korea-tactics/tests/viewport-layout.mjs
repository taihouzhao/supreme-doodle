import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, readFile, mkdir } from "node:fs/promises";
import { extname, dirname, join, normalize } from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const chromiumBr = () =>
  join(dirname(require.resolve("@sparticuz/chromium/package.json")), "bin", "chromium.br");

/**
 * PRD 要求的三档同视口视觉回归：
 * - 390×844 竖屏手机
 * - 844×390 横屏手机
 * - 1366×768 桌面
 *
 * 不与像素金标比对（易碎），而是断言主流程可达且关键区域无溢出/裁切。
 */

const DIST = join(process.cwd(), "dist");
const RESULTS = join(process.cwd(), "test-results");
const CHROMIUM_CACHE = join(RESULTS, "chromium-cache");

const viewports = [
  { name: "phone-portrait", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "phone-landscape", width: 844, height: 390, isMobile: true, hasTouch: true },
  { name: "desktop", width: 1366, height: 768, isMobile: false, hasTouch: false },
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

async function resolveChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.env.GITHUB_ACTIONS === "true") {
    try {
      return await chromium.executablePath();
    } catch {
      // fall through to system chrome / local unpack
    }
  }
  for (const candidate of ["google-chrome", "chromium", "chromium-browser"]) {
    try {
      const { stdout } = await execFileAsync("which", [candidate]);
      const found = stdout.trim();
      if (found) return found;
    } catch {
      // continue
    }
  }
  for (const macPath of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ]) {
    try {
      await access(macPath);
      return macPath;
    } catch {
      // continue
    }
  }
  if (process.platform === "darwin") {
    throw new Error(
      "No Chrome/Chromium found on macOS. Install Google Chrome or set PUPPETEER_EXECUTABLE_PATH.",
    );
  }
  const executable = join(CHROMIUM_CACHE, "chromium");
  try {
    await access(executable);
    return executable;
  } catch {
    await mkdir(CHROMIUM_CACHE, { recursive: true });
    const compressed = chromiumBr();
    await pipeline(
      createReadStream(compressed),
      createBrotliDecompress(),
      createWriteStream(executable),
    );
    await chmod(executable, 0o700);
    return executable;
  }
}

async function openFirstBrief(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  await page.locator('[data-action="new-campaign"]').click();
  await page.waitForSelector(".sheet--hq");
}

async function inspectBrief(page) {
  const tabs = [
    ["staff", "任务目标"],
    ["ordnance", "战役库存"],
    ["org", "兵员补充"],
  ];
  for (const [tab, expected] of tabs) {
    await page.locator(`[data-action="brief-tab"][data-value="${tab}"]`).click();
    await page.waitForFunction(
      (value, text) => {
        const button = document.querySelector(`[data-action="brief-tab"][data-value="${value}"]`);
        const panel = document.querySelector("#hq-panel");
        return button?.getAttribute("aria-pressed") === "true" && panel?.textContent?.includes(text);
      },
      {},
      tab,
      expected,
    );
  }
  await page.waitForFunction(() =>
    [...(document.querySelector(".sheet--hq")?.getAnimations() ?? [])].every(
      (animation) => animation.playState === "finished",
    ),
  );

  return page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      const rect = element.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    };
    const buttons = [...document.querySelectorAll('[data-action="brief-tab"]')];
    const labels = [...document.querySelectorAll('.org-unit-row__deploy input')].map((input) =>
      input.getAttribute("aria-label"),
    );
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      overlay: box(".overlay"),
      sheet: box(".sheet--hq"),
      footer: box(".hq-footer"),
      tabCount: buttons.length,
      selectedTabs: buttons.filter((button) => button.getAttribute("aria-pressed") === "true").length,
      controlsPanel: buttons.every((button) => button.getAttribute("aria-controls") === "hq-panel"),
      labelledPanel: document.querySelector("#hq-panel")?.getAttribute("aria-labelledby") === "brief-tab-org",
      deployLabels: labels,
      bodyScrollX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

function assertBrief(layout) {
  const { width, height } = layout.viewport;
  assert.equal(layout.tabCount, 3, "HQ tabs missing");
  assert.equal(layout.selectedTabs, 1, "HQ must expose exactly one selected department");
  assert.ok(layout.controlsPanel && layout.labelledPanel, "HQ tab/panel accessibility links missing");
  assert.ok(layout.deployLabels.length > 0, "organization deploy controls missing");
  assert.equal(new Set(layout.deployLabels).size, layout.deployLabels.length, "deploy controls need unique labels");
  assert.ok(layout.deployLabels.every(Boolean), "deploy controls need accessible names");
  assert.ok(layout.sheet.top >= -1 && layout.sheet.left >= -1, "HQ sheet clipped at top/left");
  assert.ok(
    layout.sheet.right <= width + 1 && layout.sheet.bottom <= height + 1,
    `HQ sheet clipped at bottom/right: ${JSON.stringify({ viewport: layout.viewport, overlay: layout.overlay, sheet: layout.sheet })}`,
  );
  assert.ok(layout.footer.bottom <= height + 1, "HQ primary action is not reachable");
  assert.ok(layout.bodyScrollX <= 8, `HQ horizontal page scroll ${layout.bodyScrollX}px`);
}

async function enterFirstMission(page) {
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
        top: rect.top,
        left: rect.left,
      };
    };
    const name = document.querySelector(".hud-top__name")?.textContent?.trim() ?? "";
    const end = document.querySelector('[data-action="end-turn"]');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      title: name,
      hud: box(".hud-top"),
      map: box(".stage__map"),
      canvas: box("canvas[data-region='canvas']"),
      endVisible: end instanceof HTMLElement && getComputedStyle(end).visibility !== "hidden",
      bodyScroll: {
        x: document.documentElement.scrollWidth - window.innerWidth,
        y: document.documentElement.scrollHeight - window.innerHeight,
      },
    };
  });
}

function assertViewport(layout, viewport) {
  const { width, height } = layout.viewport;
  assert.equal(width, viewport.width);
  assert.equal(height, viewport.height);
  assert.ok(layout.title.length >= 2, "mission title missing");
  assert.ok(layout.endVisible, "end-turn control missing");
  assert.ok(layout.hud.width <= width + 1, `HUD overflows X: ${layout.hud.width} > ${width}`);
  assert.ok(layout.hud.right <= width + 1, "HUD right edge clipped");
  assert.ok(layout.hud.left >= -1, "HUD left edge clipped");
  assert.ok(layout.map.width > 0 && layout.map.height > 0, "map missing");
  assert.ok(layout.canvas.width > 80 && layout.canvas.height > 80, "canvas too small");
  assert.ok(layout.map.bottom <= height + 1, `map overflows bottom: ${layout.map.bottom} > ${height}`);
  assert.ok(layout.map.right <= width + 1, `map overflows right: ${layout.map.right} > ${width}`);
  // 允许少量滚动余量（字体/安全区），但不能整屏滚走棋盘
  assert.ok(layout.bodyScroll.x <= 8, `horizontal page scroll ${layout.bodyScroll.x}px`);
  if (viewport.height >= 700) {
    assert.ok(layout.map.height >= height * 0.55, `map too short on tall viewport: ${layout.map.height}`);
  } else {
    assert.ok(layout.map.height >= height * 0.4, `map too short on short viewport: ${layout.map.height}`);
  }
}

await mkdir(RESULTS, { recursive: true });
const server = staticServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}/`;

const executablePath = await resolveChrome();
const launchArgs = /chrome/i.test(executablePath)
  ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  : chromium.args;

const browser = await puppeteer.launch({
  args: launchArgs,
  executablePath,
  headless: true,
});

try {
  for (const viewport of viewports) {
    const page = await browser.newPage();
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.isMobile ? 2 : 1,
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
    });
    await openFirstBrief(page, baseUrl);
    const brief = await inspectBrief(page);
    assertBrief(brief);
    await enterFirstMission(page);
    const layout = await measure(page);
    try {
      assertViewport(layout, viewport);
    } catch (error) {
      await page.screenshot({
        path: join(RESULTS, `viewport-${viewport.name}-failure.png`),
        fullPage: true,
      });
      throw error;
    } finally {
      await page.close();
    }
    process.stdout.write(
      `✓ ${viewport.name} ${viewport.width}×${viewport.height}: map ${Math.round(layout.map.width)}×${Math.round(layout.map.height)}\n`,
    );
  }
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
