import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../index.html"), "utf8");

describe("游戏目录", () => {
  it("列出决战朝鲜、金庸群侠传、温井塔防与虚构卫星地图", () => {
    assert.match(html, /决战朝鲜/);
    assert.match(html, /金庸群侠传/);
    assert.match(html, /jinyong-heroes\/index.html/);
    assert.match(html, /korea-defense\//);
    assert.match(html, /虚构卫星地图/);
    assert.match(html, /\.\.\/map\//);
  });
});
