import { zh } from "@blocknote/core/locales";

export const zhijianDictionary = {
  ...zh,
  placeholders: {
    ...zh.placeholders,
    default: "无标题",
    heading: "无标题",
    checkListItem: "无标题",
  },
  formatting_toolbar: {
    ...zh.formatting_toolbar,
    file_preview_toggle: { tooltip: "切换预览" },
  },
};
