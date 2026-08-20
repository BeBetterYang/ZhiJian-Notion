import type { KeyboardEvent } from "react";
import { richTextToPlainText, type ZhiJianNode } from "../core/tree";
import type { TreeStore } from "../core/treeStore";

interface NodeEditorProps {
  node: ZhiJianNode | null;
  store: TreeStore;
  onCreateSibling?: (nodeId: string) => void;
}

export function NodeEditor({ node, store, onCreateSibling }: NodeEditorProps) {
  if (!node) {
    return <div className="node-editor-empty">未选择节点</div>;
  }

  const onTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onCreateSibling?.(node.id);
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      document.getElementById(`description-${node.id}`)?.focus();
    }
  };

  const onDescriptionKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Backspace" && !node.description) {
      event.preventDefault();
      document.getElementById(`content-${node.id}`)?.focus();
    }
  };

  return (
    <div className="node-editor">
      <select
        value={node.type}
        onChange={(event) => store.updateType(node.id, event.target.value as ZhiJianNode["type"])}
      >
        <option value="text">正文</option>
        <option value="heading">标题</option>
        <option value="todo">待办</option>
        <option value="table">表格</option>
        <option value="image">图片</option>
      </select>

      {node.type === "todo" ? (
        <label className="check-row">
          <input
            type="checkbox"
            checked={node.props?.checked ?? false}
            onChange={(event) =>
              store.updateProps(node.id, { checked: event.target.checked })
            }
          />
          已完成
        </label>
      ) : null}

      <input
        id={`content-${node.id}`}
        value={node.type === "table" ? "" : richTextToPlainText(node.content)}
        disabled={node.type === "table"}
        placeholder={node.type === "table" ? "Table 节点不保存正文" : "正文"}
        onChange={(event) => store.updateContent(node.id, event.target.value)}
        onKeyDown={onTitleKeyDown}
      />

      <textarea
        id={`description-${node.id}`}
        value={node.description ? richTextToPlainText(node.description) : ""}
        placeholder="描述"
        onChange={(event) => store.updateDescription(node.id, event.target.value)}
        onKeyDown={onDescriptionKeyDown}
      />
    </div>
  );
}
