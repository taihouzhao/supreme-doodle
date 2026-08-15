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
const FAILED_ASSET = "/assets/units/enemy-atlas.webp";
const mime = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };

function staticServer() {
  return createServer(async (request, response) => {
    try {
      const urlPath = new URL(request.url ?? "/", "http://localhost").pathname;
      if (urlPath === FAILED_ASSET) {
        response.writeHead(404);
        response.end("intentional asset failure");
        return;
      }
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
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewport({ width: 844, height: 390 });
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.locator('[data-action="start-normal"]').click();
  await page.waitForSelector('[data-region="battlefield"]');
  const skipTutorial = await page.$('[data-action="skip-tutorial"]');
  if (skipTutorial) await skipTutorial.evaluate((element) => element.click());
  await page.waitForSelector('[data-testid="canvas-status"]', { timeout: 10_000 });
  assert.match(await page.$eval('[data-testid="canvas-status"]', (element) => element.textContent ?? ""), /素材加载不完整/);
  assert.ok(await page.$('[data-action="retry-assets"]'));
  await page.locator('[data-action="start-wave"]').click();
  await page.waitForFunction(() => (document.querySelector('[data-testid="wave-status"]')?.textContent ?? "").includes("第 1 波"));
  await page.waitForFunction(() => Number(document.querySelector('[data-region="battlefield"]')?.dataset.activeEnemies ?? 0) > 0, { timeout: 10_000 });
  assert.deepEqual(errors, []);
  process.stdout.write("✓ defense asset failure: readable retry state, no infinite loading, simulation remains playable\n");
  await page.close();
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
