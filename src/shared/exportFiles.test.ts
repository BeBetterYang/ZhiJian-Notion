import { describe, expect, it } from "vitest";
import { exportPixelRatio } from "./exportFiles";

describe("导出位图的倍数", () => {
  it("小文档还是 2× 高清", () => {
    expect(exportPixelRatio(1200, 800)).toBe(2);
    expect(exportPixelRatio(2000, 1400)).toBe(2);
  });

  // 只卡最长边的老算法会给它 2×，也就是 2.2 亿像素。
  it("两边都不算超长、但面积很大的导图按总像素降倍", () => {
    const ratio = exportPixelRatio(9000, 7000);

    expect(ratio).toBeLessThan(1);
    expect(9000 * ratio * 7000 * ratio).toBeLessThanOrEqual(32_000_000);
  });

  it("很长的大纲按最长边降倍", () => {
    const ratio = exportPixelRatio(800, 20_000);

    expect(Math.max(800, 20_000) * ratio).toBeLessThanOrEqual(12_000);
  });

  it("两条线一起卡时取更小的那个", () => {
    // 最长边还没到线（12000/12000 = 1×），总像素已经超了。
    expect(exportPixelRatio(12_000, 4_000)).toBeCloseTo(Math.sqrt(32 / 48), 5);
  });

  // 再低就看不清字了，宁可慢也不要交一张没法读的图。
  it("不会低于 0.5×", () => {
    expect(exportPixelRatio(100_000, 100_000)).toBe(0.5);
  });

  it("空画面不会算出 NaN 或 Infinity", () => {
    expect(exportPixelRatio(0, 0)).toBe(2);
  });
});
