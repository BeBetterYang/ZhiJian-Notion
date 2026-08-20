import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { firstMarks, richTextToPlainText, type ZhiJianNode } from "../core/tree";
import type { TreeStore } from "../core/treeStore";

interface NodeContentEditorProps {
  node: ZhiJianNode;
  store: TreeStore;
  mode: "outline" | "mindmap";
  onCommit?: () => void;
  onCancel?: () => void;
}

export function NodeContentEditor({
  node,
  store,
  mode,
  onCommit,
  onCancel,
}: NodeContentEditorProps) {
  const [value, setValue] = useState(richTextToPlainText(node.content));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    store.updateContent(node.id, {
      text: value,
      marks: firstMarks(node.content),
    });
    onCommit?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
    }
    if (event.key === "Tab") {
      event.preventDefault();
      commit();
      if (event.shiftKey) {
        store.outdent(node.id);
      } else {
        store.indent(node.id);
      }
    }
    if (event.key === "Backspace" && value.length === 0 && node.parentId) {
      event.preventDefault();
      store.deleteNode(node.id);
      onCommit?.();
    }
  };

  return (
    <input
      ref={inputRef}
      className={`node-content-editor node-content-editor-${mode}`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      aria-label="节点正文"
    />
  );
}
