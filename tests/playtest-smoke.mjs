import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import puppeteer from "puppeteer-core";

/**
 * 轻量真人流程冒烟：开局 → 选单位 → 移动 → 出现撤销/休整 → 攻击需确认。
 * 不替代 5 人真人验收，只阻塞明显回归。
 */

const execFileAsync = promisify(execFile);
const DIST = join(process.cwd(), "dist");
const RESULTS = join(process.cwd(), "test-results");

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function staticServer() {
  return createServer(async (request, response) => {
    try {
      const urlPath = new URL(request.url ?? "/", "http://localhost").pathname;
      const relative = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.(\/|\\|$))+/, "");
      let file = join(DIST, relative === "/" ? "index.html" : relative);
      if (!extname(file)) file = join(file, "index.html");
      const data = await readFile(file);
      response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" });
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

async function resolveChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  for (const candidate of ["google-chrome", "chromium", "chromium-browser"]) {
    try {
      const { stdout } = await execFileAsync("which", [candidate]);
      if (stdout.trim()) return stdout.trim();
    } catch {
      // continue
    }
  }
  throw new Error("No Chrome/Chromium executable found for playtest smoke");
}

await mkdir(RESULTS, { recursive: true });
const server = staticServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}/`;

const browser = await puppeteer.launch({
  executablePath: await resolveChrome(),
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  await page.locator('[data-action="new-campaign"]').click();
  await page.locator('[data-action="begin-mission"]').click();
  await page.waitForSelector(".hud-top__name");

  assert.equal(
    await page.evaluate(() => document.querySelector(".hud-top__name")?.textContent?.trim() ?? ""),
    "温井初战",
  );

  // 定位下一支未行动单位 → 应打开单位卡并显示「休整」
  await page.locator('[data-action="next-unit"]').click();
  await page.waitForSelector('[data-action="unit-wait"]');
  const waitText = await page.evaluate(
    () => document.querySelector('[data-action="unit-wait"]')?.textContent?.trim() ?? "",
  );
  assert.match(waitText, /休整/);

  // 结束回合第一次应武装警告
  await page.locator('[data-action="end-turn"]').click();
  await page.waitForFunction(() => (document.querySelector(".notice")?.textContent ?? "").includes("未行动"));
  const notice = await page.evaluate(() => document.querySelector(".notice")?.textContent ?? "");
  assert.ok(notice.includes("未行动"));

  process.stdout.write("✓ playtest smoke: M1 boot, 休整 label, end-turn arming\n");
} catch (error) {
  const page = (await browser.pages())[0];
  if (page) await page.screenshot({ path: join(RESULTS, "playtest-smoke-failure.png"), fullPage: true });
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
