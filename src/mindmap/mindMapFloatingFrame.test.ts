import { describe, expect, it } from "vitest";
import { mindMapFloatingFrameSize } from "./mindMapFloatingFrame";

function frameWithTopic(padding: string, topic: { width: number; height: number }) {
  const frame = document.createElement("div");
  frame.style.padding = padding;
  const element = document.createElement("div");
  frame.append(element);
  document.body.append(frame);
  element.getBoundingClientRect = () =>
    ({ width: topic.width, height: topic.height }) as DOMRect;
  return { frame, topic: element };
}

describe("mindMapFloatingFrameSize", () => {
  it("adds the corridor the frame keeps around its topic", () => {
    // `me-parent` 的左右内边距就是连线的走廊，子节点那一列排在它外面。
    const { frame, topic } = frameWithTopic("2px 30px", { width: 543, height: 137 });
    expect(mindMapFloatingFrameSize(frame, topic, 1)).toEqual({ width: 603, height: 141 });
  });

  it("leaves a first-level node, which has no padding, at its own size", () => {
    const { frame, topic } = frameWithTopic("0px", { width: 99, height: 43 });
    expect(mindMapFloatingFrameSize(frame, topic, 1)).toEqual({ width: 99, height: 43 });
  });

  it("counts the frame's border too", () => {
    const { frame, topic } = frameWithTopic("0px", { width: 100, height: 40 });
    frame.style.border = "2px solid red";
    expect(mindMapFloatingFrameSize(frame, topic, 1)).toEqual({ width: 104, height: 44 });
  });

  it("reads the topic back out of the canvas transform before adding the corridor", () => {
    // 手柄量到的是缩放后的像素，内边距是没缩放的 CSS 像素。
    const { frame, topic } = frameWithTopic("2px 30px", { width: 434.4, height: 109.6 });
    const size = mindMapFloatingFrameSize(frame, topic, 0.8);
    expect(size.width).toBeCloseTo(603);
    expect(size.height).toBeCloseTo(141);
  });
});
