import { unscaledMindMapSize, type MindMapMeasuredSize } from "./mindMapInteraction";

/**
 * 编辑期间钉住节点框（`me-parent` / `me-root`）该写的尺寸。
 *
 * 量的是 topic（`me-tpc`）再加上框比它大出来的那一圈：`me-parent` 用左右内边距给
 * 连线留出走廊，首层和根没有这份内边距，所以从计算样式里读，而不是写死。框是
 * border-box，写回 `style.width` 的就是这个含内边距的尺寸。
 *
 * 不能改成量 topic 里面那一层（编辑器或显示层）：那样会把 topic 自己的内边距和框
 * 的这一圈一起漏掉，框比该有的窄一大截，子节点那一列缩回到节点里去、连线从节点
 * 中间穿出来，而解除钉住的那一刻又会跳回正确位置——看上去就是编辑时连线错乱、
 * 编辑完又重排一次。
 */
export function mindMapFloatingFrameSize(
  frame: HTMLElement,
  topic: HTMLElement,
  scale: number,
): MindMapMeasuredSize {
  const rect = topic.getBoundingClientRect();
  const topicSize = unscaledMindMapSize({ width: rect.width, height: rect.height }, scale);
  const chrome = frameChrome(frame);
  return {
    width: topicSize.width + chrome.width,
    height: topicSize.height + chrome.height,
  };
}

function frameChrome(frame: HTMLElement) {
  const style = window.getComputedStyle(frame);
  const sum = (...values: string[]) =>
    values.reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
  return {
    width: sum(style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth),
    height: sum(style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth),
  };
}
