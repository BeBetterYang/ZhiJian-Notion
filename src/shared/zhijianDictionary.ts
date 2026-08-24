import { zh } from "@blocknote/core/locales";

export const zhijianDictionary = {
  ...zh,
  placeholders: {
    ...zh.placeholders,
    // BlockNote ships no hint for a quote, and an empty one draws nothing at all —
    // no text, and no left bar in the outline — so the row it occupies was invisible
    // and there was no telling where the caret had gone. The map shows the same hint
    // through `.mindmap-node-quote` being visible on its own.
    quote: "引用",
  },
  formatting_toolbar: {
    ...zh.formatting_toolbar,
    file_preview_toggle: { tooltip: "切换预览" },
  },
};
