/**
 * 在导图节点里拖动图片的缩放手柄。
 *
 * BlockNote 自己的手柄（`ResizableFileBlockWrapper`）把拖出来的新宽度夹在
 * `editor.domElement.firstElementChild.clientWidth` 以内。在文档里那是固定的页宽，
 * 是个合理的上界；导图节点的编辑器却是按内容收缩的，那个元素的宽度就等于图片自己，
 * 于是：
 *
 * - 往外拖时上界永远只比图片宽几像素，一次指针事件只能长一点点，图片跟不上光标；
 * - 往回拖时上界跟着缩，一路掉到 BlockNote 的 64px 下限，节点整块塌掉。
 *
 * 而且宽度只在松手时才写回文档，拖动过程中不经过 `onChange`：编辑期间节点框是按
 * 进入编辑那一刻的尺寸钉住的（见 `MindMapEditor` 的 `setEditingFloat`），没人重新
 * 钉，图片就直接涨到框外面压住旁边的分支——这就是"未退出编辑时布局异常"。
 *
 * 这里只在一次拖动期间接手这两件事：给那个元素报一个稳定的上界，并在每个指针事件
 * 后让节点框重新量一次。拖动之外一切照旧，尤其是打字不会重新钉框。
 */

/**
 * 缩放的上界，和 `styles.css` 里 `.mindmap-node-images` 的 `max-width: 28em`
 * 一致：显示层本来就把节点图片收在这个宽度内，编辑时能拖到的最大值也该是它。
 */
export const MIND_MAP_NODE_IMAGE_MAX_WIDTH = 448;

/**
 * 让 `container` 里的图片缩放手柄可用。返回解绑函数。
 * `onResize` 会在拖动中的每个指针事件后被调用一次，用来重新量节点框。
 */
export function bindMindMapImageResize(container: HTMLElement, onResize: () => void) {
  let restoreClamp: (() => void) | null = null;

  const endDrag = () => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    restoreClamp?.();
    restoreClamp = null;
  };

  const onMouseMove = () => onResize();

  const onMouseUp = () => {
    endDrag();
    // 松手时 BlockNote 才把 `previewWidth` 写回块里，那次 `onChange` 会再量一遍；
    // 这一下是为了宽度没变、`onChange` 不会来的那种情形。
    onResize();
  };

  const onMouseDown = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".bn-resize-handle")) return;
    endDrag();
    restoreClamp = overrideClampWidth(container.querySelector(".bn-editor")?.firstElementChild ?? null);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  container.addEventListener("mousedown", onMouseDown);
  return () => {
    container.removeEventListener("mousedown", onMouseDown);
    endDrag();
  };
}

/**
 * 拖动期间让这一个元素报出节点允许的最大图片宽度。只盖住 `clientWidth` 的读取，
 * 不动布局——把元素真的撑宽会连带撑宽整个编辑框，而它是节点可见的那个框。
 */
function overrideClampWidth(element: Element | null) {
  if (!element) return null;
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    get: () => MIND_MAP_NODE_IMAGE_MAX_WIDTH,
  });
  // 自有属性删掉之后，原型上的 getter 重新生效。
  return () => delete (element as unknown as Record<string, unknown>).clientWidth;
}
