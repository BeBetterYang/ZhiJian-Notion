import { describe, expect, it, vi } from "vitest";
import { MIND_MAP_NODE_IMAGE_MAX_WIDTH, bindMindMapImageResize } from "./mindMapImageResize";

function editorDom() {
  const container = document.createElement("div");
  container.className = "mindmap-node-editor";
  container.innerHTML = `
    <div class="bn-editor">
      <div class="bn-block-group">
        <div class="bn-visual-media-wrapper">
          <img />
          <div class="bn-resize-handle"></div>
        </div>
      </div>
    </div>`;
  document.body.append(container);
  return {
    container,
    group: container.querySelector<HTMLElement>(".bn-block-group")!,
    handle: container.querySelector<HTMLElement>(".bn-resize-handle")!,
  };
}

const mouse = (target: EventTarget, type: string) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true }));

describe("bindMindMapImageResize", () => {
  it("lends BlockNote a stable clamp width for as long as the drag lasts", () => {
    const { container, group, handle } = editorDom();
    const unbind = bindMindMapImageResize(container, () => undefined);
    expect(group.clientWidth).toBe(0);
    mouse(handle, "mousedown");
    expect(group.clientWidth).toBe(MIND_MAP_NODE_IMAGE_MAX_WIDTH);
    mouse(window, "mouseup");
    expect(Object.getOwnPropertyDescriptor(group, "clientWidth")).toBeUndefined();
    unbind();
  });

  it("re-measures the node on every pointer event of the drag, and once more on release", () => {
    const { container, handle } = editorDom();
    const onResize = vi.fn();
    const unbind = bindMindMapImageResize(container, onResize);
    mouse(handle, "mousedown");
    expect(onResize).not.toHaveBeenCalled();
    mouse(window, "mousemove");
    mouse(window, "mousemove");
    mouse(window, "mouseup");
    expect(onResize).toHaveBeenCalledTimes(3);
    // Past the drag the map is pinned again: typing must not reflow it.
    mouse(window, "mousemove");
    expect(onResize).toHaveBeenCalledTimes(3);
    unbind();
  });

  it("leaves anything that is not a resize handle alone", () => {
    const { container, group } = editorDom();
    const onResize = vi.fn();
    const unbind = bindMindMapImageResize(container, onResize);
    mouse(container.querySelector("img")!, "mousedown");
    expect(group.clientWidth).toBe(0);
    mouse(window, "mousemove");
    expect(onResize).not.toHaveBeenCalled();
    unbind();
  });

  it("hands the width back when the editor closes mid-drag", () => {
    const { container, group, handle } = editorDom();
    const onResize = vi.fn();
    const unbind = bindMindMapImageResize(container, onResize);
    mouse(handle, "mousedown");
    unbind();
    expect(Object.getOwnPropertyDescriptor(group, "clientWidth")).toBeUndefined();
    mouse(window, "mousemove");
    expect(onResize).not.toHaveBeenCalled();
  });
});
