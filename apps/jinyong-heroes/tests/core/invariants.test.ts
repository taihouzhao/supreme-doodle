import { describe, expect, it } from "vitest";
import { i16, i16Add, i16Div } from "../../src/core/i16";
import { ClassicRng } from "../../src/core/rng";
import { dispatch } from "../../src/core/dispatch";
import { cloneWorld, createInitialWorld } from "../../src/core/state";
import { fingerprint } from "../../src/core/hash";
import { lianchengContent } from "../../src/content/liancheng";
import { renderTextGrid } from "../../src/client/text-grid";
import { evaluateCondition } from "../../src/event/evaluate";

describe("ClassicRng", () => {
  it("相同种子产生相同序列", () => {
    const a = new ClassicRng(1);
    const b = new ClassicRng(1);
    const seqA = [a.next(), a.next(), a.bounded(10)];
    const seqB = [b.next(), b.next(), b.bounded(10)];
    expect(seqA).toEqual(seqB);
  });

  it("bounded 在非法区间返回 0", () => {
    const rng = new ClassicRng(1);
    expect(rng.bounded(1)).toBe(0);
    expect(rng.bounded(30001)).toBe(0);
  });
});

describe("i16", () => {
  it("有符号 16 位回绕", () => {
    expect(i16(32767)).toBe(32767);
    expect(i16Add(32767, 1)).toBe(-32768);
  });

  it("除法向零取整", () => {
    expect(i16Div(-7, 2)).toBe(-3);
    expect(i16Div(7, 2)).toBe(3);
    expect(i16Div(1, 0)).toBe(0);
  });
});

describe("dispatch 不变量", () => {
  it("不修改传入的 WorldState", () => {
    const state = createInitialWorld(lianchengContent, 1);
    const before = fingerprint(state);
    dispatch(state, { type: "GO_TO", locationId: "nanxian_house" }, lianchengContent);
    expect(fingerprint(state)).toBe(before);
  });

  it("文本方格渲染只读", () => {
    const state = createInitialWorld(lianchengContent, 1);
    const copy = cloneWorld(state);
    const view = renderTextGrid(state);
    expect(view).toContain("loc=home");
    expect(fingerprint(state)).toBe(fingerprint(copy));
  });

  it("条件树 all/any/not", () => {
    const state = createInitialWorld(lianchengContent, 1);
    expect(evaluateCondition(state, { all: [] })).toBe(true);
    expect(evaluateCondition(state, { locationKnown: "home" })).toBe(true);
    expect(evaluateCondition(state, { not: { hasItem: "tang_poetry" } })).toBe(true);
    expect(evaluateCondition(state, { any: [{ hasItem: "compass" }, { locationKnown: "home" }] })).toBe(
      true,
    );
  });
});
