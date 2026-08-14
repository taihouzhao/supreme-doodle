import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GAME_ID, GAME_TITLE } from "../src/game";

describe("金庸群侠传脚手架", () => {
  it("暴露游戏标识", () => {
    expect(GAME_ID).toBe("jinyong-heroes");
    expect(GAME_TITLE).toBe("金庸群侠传");
  });

  it("落地页标题是金庸群侠传", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).toContain("<title>金庸群侠传</title>");
    expect(html).toContain("尚未导入原版资源");
  });
});
