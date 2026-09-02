import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MINDMAP_DRAGGING_CLASS } from "./mindMapInteraction";

/**
 * 「新增下级」按钮被 portal 挂在选中节点的 `me-tpc` 里面，而 MindElixir 的拖拽预览
 * (`.mind-elixir-ghost`) 内容直接拷的是那个 `me-tpc` 的 innerHTML，按钮也被拷了进去。这里验的
 * 是隐藏规则本身：jsdom 不套用 `import` 进来的样式表，`getComputedStyle` 也不解 `var()`，所以
 * 用真实选择器去 `matches()` 一棵合成的节点树——规则被删掉或改名，这个测试就红。渲染结果在浏览
 * 器里验收。
 */
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
/** 注释里也可能有花括号，长选择器又会折行。 */
const flattened = styles.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\s+/g, " ");

/** 表里所有把 `.mindmap-add-child-button` 藏起来的选择器。 */
const hideSelectors = [...flattened.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, , body]) => /display:\s*none/.test(body))
  .flatMap(([, selectorText]) => selectorText.split(",").map((entry) => entry.trim()))
  .filter((selector) => selector.endsWith(".mindmap-add-child-button"));

function hidden(button: Element) {
  return hideSelectors.some((selector) => button.matches(selector));
}

/** `.mindmap-canvas > .map-container`（MindElixir 自己建的那层）里的一棵最小节点树。 */
function renderCanvas() {
  document.body.innerHTML = `
    <div class="mindmap-canvas">
      <div class="map-container">
        <div class="map-canvas">
          <me-nodes>
            <me-parent>
              <me-tpc class="selected">
                <span class="mindmap-node-shell" data-node-id="node-1"></span>
                <button type="button" class="mindmap-add-child-button" data-node-id="node-1"></button>
              </me-tpc>
              <me-epd></me-epd>
            </me-parent>
          </me-nodes>
        </div>
        <div class="mind-elixir-ghost">
          <span class="mindmap-node-shell" data-node-id="node-1"></span>
          <button type="button" class="mindmap-add-child-button" data-node-id="node-1"></button>
        </div>
      </div>
    </div>
  `;
  return {
    canvas: document.querySelector<HTMLElement>(".mindmap-canvas")!,
    button: document.querySelector<HTMLElement>("me-tpc > .mindmap-add-child-button")!,
    ghostButton: document.querySelector<HTMLElement>(".mind-elixir-ghost > .mindmap-add-child-button")!,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("新增下级按钮与节点拖拽", () => {
  it("没在拖动时按钮照常显示", () => {
    const { button } = renderCanvas();

    expect(hideSelectors.length).toBeGreaterThan(0);
    expect(hidden(button)).toBe(false);
    // 位置和外观那条规则没被动过，按钮还是原来的样子。
    expect(button.matches(".map-container me-tpc > .mindmap-add-child-button")).toBe(true);
  });

  it("拖动开始后隐藏，松手移除 class 又回来", () => {
    const { canvas, button } = renderCanvas();

    canvas.classList.add(MINDMAP_DRAGGING_CLASS);
    expect(hidden(button)).toBe(true);

    canvas.classList.remove(MINDMAP_DRAGGING_CLASS);
    expect(hidden(button)).toBe(false);
  });

  /**
   * 预览里那颗是 innerHTML 拷出来的，父元素不再是 `me-tpc`，所以既拿不到定位规则、也不能靠
   * `.is-node-dragging` 来藏——那个 class 要等指针走过 8px 才加，预览在 5px 就出来了。
   */
  it("拖拽预览里的那颗一直是隐藏的", () => {
    const { canvas, ghostButton } = renderCanvas();

    expect(hidden(ghostButton)).toBe(true);
    canvas.classList.add(MINDMAP_DRAGGING_CLASS);
    expect(hidden(ghostButton)).toBe(true);
  });
});
