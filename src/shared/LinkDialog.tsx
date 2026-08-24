import { useState } from "react";

/**
 * 嵌入链接 (Ctrl K). The selected text becomes the link's label, so the usual case —
 * select the words, press the keys, paste the address — needs nothing typed but the
 * address itself. With nothing selected the address stands in as its own label.
 */
export function LinkDialog({
  initialText,
  onCancel,
  onConfirm,
}: {
  initialText: string;
  onCancel: () => void;
  onConfirm: (url: string, text: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState(initialText);

  const confirm = () => {
    if (!url.trim()) return;
    onConfirm(url, text);
  };

  return (
    <div
      className="zhijian-dialog-layer"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <section
        className="zhijian-confirm-dialog zhijian-link-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-dialog-title"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            confirm();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <h2 id="link-dialog-title">嵌入链接</h2>
        <label>
          <span>链接地址</span>
          <input
            value={url}
            autoFocus
            placeholder="https://"
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <label>
          <span>显示文字</span>
          <input
            value={text}
            placeholder="留空则显示链接地址"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <footer>
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="primary" disabled={!url.trim()} onClick={confirm}>
            确定
          </button>
        </footer>
      </section>
    </div>
  );
}
