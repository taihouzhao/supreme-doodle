import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = join(appRoot, "src");

/**
 * Ban-list for silent modernization. These words are allowed in PRD, Cursor rules,
 * and this test file as the prohibition list itself.
 */
const BANNED = [
  /抽卡/,
  /天赋树/,
  /每日任务/,
  /任务箭头/,
  /动态等级/,
  /装备词条/,
  /赛季/,
  /联网养成/,
  /\bgacha\b/i,
  /talent tree/i,
  /daily quest/i,
  /quest arrow/i,
  /level scaling/i,
  /loot affix/i,
  /season pass/i,
];

describe("反现代化扫描", () => {
  it("src 不含现代化玩法词", () => {
    const hits: string[] = [];
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, "utf8");
      for (const pattern of BANNED) {
        if (pattern.test(text)) {
          hits.push(`${relative(appRoot, file)} matches ${pattern}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("规则层不使用 Math.random", () => {
    const hits: string[] = [];
    for (const dir of ["core", "event", "battle", "content", "game"]) {
      for (const file of walk(join(srcRoot, dir))) {
        const text = readFileSync(file, "utf8");
        if (text.includes("Math.random")) {
          hits.push(relative(appRoot, file));
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("不引用决战朝鲜规则核心", () => {
    const hits: string[] = [];
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, "utf8");
      if (text.includes("korea-tactics") && !file.endsWith("identity.ts")) {
        hits.push(relative(appRoot, file));
      }
    }
    expect(hits).toEqual([]);
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (name.endsWith(".ts") || name.endsWith(".json")) {
      out.push(full);
    }
  }
  return out;
}
