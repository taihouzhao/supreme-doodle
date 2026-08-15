import assert from "node:assert/strict";
import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const execFileAsync = promisify(execFile);
const DIST = join(process.cwd(), "dist");
const mime = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml" };

function staticServer() {
  return createServer(async (request, response) => {
    try {
      const urlPath = new URL(request.url ?? "/", "http://localhost").pathname;
      const relative = normalize(decodeURIComponent(urlPath)).replace(/^((\.\.(\/|\\|$))+)/, "");
      let file = join(DIST, relative === "/" ? "index.html" : relative);
      if (!extname(file)) file = join(file, "index.html");
      response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      response.end(await readFile(file));
    } catch {
      if (response.headersSent) return;
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

async function chromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.env.GITHUB_ACTIONS === "true") {
    try {
      return await chromium.executablePath();
    } catch {
      // fall through to a system browser
    }
  }
  for (const candidate of ["google-chrome", "chromium", "chromium-browser"]) {
    try {
      const { stdout } = await execFileAsync("which", [candidate]);
      if (stdout.trim()) return stdout.trim();
    } catch {
      // continue
    }
  }
  for (const candidate of ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  throw new Error("No Chrome/Chromium executable found; set PUPPETEER_EXECUTABLE_PATH for browser verification");
}

const server = staticServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const executablePath = await chromePath();
const args = /chrome/i.test(executablePath) ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] : chromium.args;
const browser = await puppeteer.launch({ executablePath, headless: true, args });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  assert.match(await page.title(), /决战朝鲜/);
  await page.select('[data-action="quality"]', "low");
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await page.$eval('[data-action="quality"]', (element) => element.value), "low");
  await page.locator('[data-action="start-normal"]').click();
  await page.waitForSelector('[data-region="battlefield"]');
  if (await page.$eval('[data-region="tutorial"]', (element) => !element.hidden)) {
    assert.match(await page.$eval('[data-testid="tutorial-title"]', (element) => element.textContent ?? ""), /选择部署点/);
    await page.locator('[data-action="next-tutorial"]').click();
    assert.match(await page.$eval('[data-testid="tutorial-title"]', (element) => element.textContent ?? ""), /部署第一支部队/);
    await page.locator('[data-action="next-tutorial"]').click();
    assert.match(await page.$eval('[data-testid="tutorial-title"]', (element) => element.textContent ?? ""), /升级已部署部队/);
    await page.locator('[data-action="next-tutorial"]').click();
    assert.match(await page.$eval('[data-testid="tutorial-title"]', (element) => element.textContent ?? ""), /开始第一波/);
    await page.locator('[data-action="next-tutorial"]').click();
    assert.equal(await page.$eval('[data-region="tutorial"]', (element) => element.hidden), true);
  }
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-region="defense-canvas"]');
    if (!canvas) throw new Error("WebGL canvas missing");
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  });
  assert.equal(await page.$eval('[data-context-notice]', (element) => !element.hidden), true);
  await page.evaluate(() => document.querySelector('[data-region="defense-canvas"]')?.dispatchEvent(new Event("webglcontextrestored")));
  await page.waitForFunction(() => document.querySelector('[data-context-notice]')?.hidden === true);
  await page.locator('[data-action="select-tower"][data-type="infantry"]').click();
  await page.locator('[data-action="select-node"][data-node-id="ridge-west"]').click();
  await page.click('[data-action="deploy-selected"]');
  assert.match(await page.$eval('[data-testid="selection"]', (element) => element.textContent ?? ""), /步兵班/);
  await page.click('[data-action="upgrade-selected"]');
  assert.match(await page.$eval('[data-testid="selection"]', (element) => element.textContent ?? ""), /2 级/);
  await page.locator('[data-action="start-wave"]').click();
  await page.waitForFunction(() => (document.querySelector('[data-testid="wave-status"]')?.textContent ?? "").includes("第 1 波"));
  await page.locator('[data-action="pause"]').click();
  assert.equal(await page.$eval('[data-action="pause"]', (element) => element.textContent ?? ""), "继续");
  await page.locator('[data-action="speed"][data-speed="2"]').click();
  assert.equal(await page.$eval('[data-action="speed"][data-speed="2"]', (element) => element.classList.contains("is-active")), true);
  const resourceSamples = [];
  for (let round = 0; round < 10; round += 1) {
    await page.locator('[data-action="back-home"]').click();
    await page.waitForSelector('[data-action="start-normal"]');
    assert.equal((await page.$$('[data-region="defense-canvas"]')).length, 0);
    await page.locator('[data-action="start-normal"]').click();
    await page.waitForSelector('[data-region="battlefield"]');
    const tutorial = await page.$('[data-action="skip-tutorial"]');
    if (tutorial) await tutorial.evaluate((element) => element.click());
    assert.equal((await page.$$('[data-region="defense-canvas"]')).length, 1);
    resourceSamples.push(await page.$eval('[data-region="battlefield"]', (element) => ({
      geometries: element.dataset.resourceGeometries,
      textures: element.dataset.resourceTextures,
    })));
  }
  assert.equal(new Set(resourceSamples.map((sample) => JSON.stringify(sample))).size, 1, `renderer resources changed across resets: ${JSON.stringify(resourceSamples)}`);
  assert.deepEqual(errors, []);
  await page.close();

  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    const mobile = await browser.newPage();
    await mobile.setViewport({ ...viewport, isMobile: true, hasTouch: true });
    await mobile.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await mobile.locator('[data-action="start-normal"]').click();
    await mobile.waitForSelector('[data-region="battlefield"]');
    const skip = await mobile.$('[data-action="skip-tutorial"]');
    if (skip) await skip.evaluate((element) => element.click());
    const frameCount = await mobile.evaluate(() => new Promise((resolve) => {
      let frames = 0;
      const started = performance.now();
      const sample = (now) => {
        frames += 1;
        if (now - started >= 1000) resolve(frames);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    process.stdout.write(`fps ${viewport.width}x${viewport.height} ${frameCount}\n`);
    assert.ok(frameCount >= 30, `render loop below 30 FPS at ${viewport.width}×${viewport.height}: ${frameCount}`);
    const layout = await mobile.evaluate(() => {
      const rect = (selector) => { const value = document.querySelector(selector)?.getBoundingClientRect(); return value ? { width: value.width, height: value.height, right: value.right, bottom: value.bottom } : null; };
      const battlefield = rect('[data-region="battlefield"]');
      const panel = rect('.control-panel');
      const target = rect('[data-action="start-wave"]');
      return { scrollX: document.documentElement.scrollWidth - window.innerWidth, battlefield, panel, target };
    });
    process.stdout.write(`layout ${viewport.width}x${viewport.height} ${JSON.stringify(layout)}\n`);
    assert.ok((layout.battlefield?.width ?? 0) > 200 && (layout.battlefield?.height ?? 0) > 180);
    assert.ok((layout.target?.width ?? 0) >= 44 && (layout.target?.height ?? 0) >= 44);
    assert.ok(layout.scrollX <= 8, `horizontal overflow at ${viewport.width}×${viewport.height}`);
    if (viewport.height < viewport.width) assert.ok((layout.battlefield?.bottom ?? 0) <= viewport.height + 2, `landscape battlefield exceeds viewport at ${viewport.width}×${viewport.height}`);
    await mobile.close();
    process.stdout.write(`✓ defense browser ${viewport.width}×${viewport.height}: responsive battlefield and touch controls\n`);
  }
  process.stdout.write("✓ defense browser smoke: tutorial, deploy, wave, pause, 2×, context recovery, ten scene resets\n");
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
