import { useEffect } from "react";
import {
  NATIVE_SHORTCUTS,
  SHORTCUTS,
  SHORTCUT_SECTIONS,
  formatShortcutHint,
} from "./shortcutRegistry";

/**
 * 打开快捷键帮助 (Ctrl /). Built from the same table the resolver matches against, so
 * a shortcut cannot be listed here and bound to something else — and the keys the
 * browser or the editor answer on their own are listed alongside, because a help
 * dialog that only covers our own table would read as if the rest did not exist.
 */
export function ShortcutHelpDialog({ onClose }: { onClose: () => void }) {
  // The dialog holds nothing focusable that a key press would reach on its own.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="zhijian-dialog-layer"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="zhijian-shortcut-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
      >
        <header>
          <h2 id="shortcut-help-title">快捷键</h2>
          <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="zhijian-shortcut-sections">
          {SHORTCUT_SECTIONS.map((section) => {
            const rows = [
              ...SHORTCUTS.filter((shortcut) => shortcut.section === section).map((shortcut) => ({
                key: shortcut.id,
                label: shortcut.label,
                hint: formatShortcutHint(shortcut),
              })),
              ...NATIVE_SHORTCUTS.filter((shortcut) => shortcut.section === section).map(
                (shortcut) => ({ key: shortcut.label, label: shortcut.label, hint: shortcut.hint }),
              ),
            ];
            if (!rows.length) return null;
            return (
              <section key={section} className="zhijian-shortcut-section">
                <h3>{section}</h3>
                <dl>
                  {rows.map((row) => (
                    <div key={row.key}>
                      <dt>{row.label}</dt>
                      <dd>
                        {row.hint.split(" / ").map((combo, index) => (
                          <span key={combo}>
                            {index > 0 ? <em>或</em> : null}
                            {combo.split(" ").map((part) => (
                              <kbd key={part}>{part}</kbd>
                            ))}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
        <footer>
          <span>Mac 上的 Ctrl 为 ⌘</span>
        </footer>
      </section>
    </div>
  );
}
