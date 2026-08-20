import type { BlockNoteEditor } from "@blocknote/core";
import type { ZhiJianNode } from "../core/tree";
import { getNodeStyle, richTextToPlainText } from "../core/tree";
import type { TreeStore } from "../core/treeStore";

interface SharedFormatToolbarProps {
  editor: BlockNoteEditor | null;
  selectedNode: ZhiJianNode | null;
  store: TreeStore;
  floating?: boolean;
}

const textColors = ["#1d2430", "#dc2626", "#2563eb", "#15803d", "#9333ea"];
const backgroundColors = ["#ffffff", "#fee2e2", "#dbeafe", "#dcfce7", "#fef3c7"];

export function SharedFormatToolbar({
  editor,
  selectedNode,
  store,
  floating = false,
}: SharedFormatToolbarProps) {
  const nodeId = selectedNode?.id;
  const style = getNodeStyle(selectedNode?.props?.style);

  const applyInlineStyle = (styles: Record<string, unknown>) => {
    editor?.addStyles(styles);
  };

  const patchNodeStyle = (patch: Record<string, string | undefined>) => {
    if (!nodeId) {
      return;
    }
    store.updateStyle(nodeId, patch);
  };

  const changeType = (type: ZhiJianNode["type"]) => {
    if (!nodeId) {
      return;
    }
    store.updateType(nodeId, type);
    try {
      const blockType =
        type === "heading"
          ? "heading"
          : type === "todo"
            ? "checkListItem"
            : type === "table"
              ? "table"
              : type === "image"
                ? "image"
                : "paragraph";
      editor?.updateBlock(nodeId, { type: blockType });
    } catch {
      // The selected node may come from MindElixir while the outline cursor is elsewhere.
    }
  };

  const createLink = () => {
    const current = editor?.getSelectedLinkUrl() ?? style.linkUrl ?? "";
    const url = window.prompt("输入链接地址", current);
    if (url === null) {
      return;
    }
    const normalized = url.trim();
    if (normalized) {
      const selectedText = editor?.getSelectedText();
      editor?.createLink(
        normalized,
        selectedText || (selectedNode ? richTextToPlainText(selectedNode.content) : "") || normalized,
      );
      patchNodeStyle({ linkUrl: normalized });
    } else {
      patchNodeStyle({ linkUrl: undefined });
    }
  };

  const setImage = () => {
    const url = window.prompt(
      "输入图片地址",
      style.imageUrl ?? (selectedNode ? richTextToPlainText(selectedNode.content) : ""),
    );
    if (url === null || !nodeId) {
      return;
    }
    const normalized = url.trim();
    store.updateType(nodeId, "image");
    store.updateContent(nodeId, normalized);
    patchNodeStyle({ imageUrl: normalized });
  };

  return (
    <div
      className={floating ? "shared-toolbar shared-toolbar-floating" : "shared-toolbar"}
      aria-label="共享格式工具栏"
    >
      <div className="toolbar-group">
        <button type="button" onClick={() => changeType("text")}>
          正文
        </button>
        <button type="button" onClick={() => changeType("heading")}>
          标题
        </button>
        <button type="button" onClick={() => changeType("todo")}>
          待办
        </button>
        <button type="button" onClick={() => changeType("table")}>
          表格
        </button>
        <button type="button" onClick={setImage}>
          图片
        </button>
      </div>

      <div className="toolbar-group">
        <button
          type="button"
          onClick={() => {
            editor?.toggleStyles({ bold: true });
            patchNodeStyle({ fontWeight: style.fontWeight === "700" ? undefined : "700" });
          }}
        >
          加粗
        </button>
        <button
          type="button"
          onClick={() => {
            editor?.toggleStyles({ italic: true });
            patchNodeStyle({ fontStyle: style.fontStyle === "italic" ? undefined : "italic" });
          }}
        >
          斜体
        </button>
        <button
          type="button"
          onClick={() => {
            editor?.toggleStyles({ underline: true });
            patchNodeStyle({
              textDecoration: toggleDecoration(style.textDecoration, "underline"),
              textDecorationLine: toggleDecoration(style.textDecorationLine, "underline"),
            });
          }}
        >
          下划线
        </button>
        <button
          type="button"
          onClick={() => {
            editor?.toggleStyles({ strike: true });
            patchNodeStyle({
              textDecoration: toggleDecoration(style.textDecoration, "line-through"),
              textDecorationLine: toggleDecoration(style.textDecorationLine, "line-through"),
            });
          }}
        >
          删除线
        </button>
        <button type="button" onClick={createLink}>
          链接
        </button>
      </div>

      <label className="toolbar-select">
        字号
        <select
          value={style.fontSize ?? "16px"}
          onChange={(event) => patchNodeStyle({ fontSize: event.target.value })}
        >
          <option value="14px">小</option>
          <option value="16px">默认</option>
          <option value="20px">中</option>
          <option value="26px">大</option>
        </select>
      </label>

      <div className="toolbar-swatches" aria-label="文字颜色">
        {textColors.map((color) => (
          <button
            key={color}
            type="button"
            title={`文字颜色 ${color}`}
            style={{ backgroundColor: color }}
            onClick={() => {
              applyInlineStyle({ textColor: color });
              patchNodeStyle({ color });
            }}
          />
        ))}
      </div>

      <div className="toolbar-swatches" aria-label="背景颜色">
        {backgroundColors.map((color) => (
          <button
            key={color}
            type="button"
            title={`背景颜色 ${color}`}
            style={{ backgroundColor: color }}
            onClick={() => {
              applyInlineStyle({ backgroundColor: color });
              patchNodeStyle({ backgroundColor: color });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function toggleDecoration(current: string | undefined, value: "underline" | "line-through") {
  const values = new Set((current ?? "").split(" ").filter(Boolean));
  if (values.has(value)) {
    values.delete(value);
  } else {
    values.add(value);
  }
  return values.size ? Array.from(values).join(" ") : undefined;
}
