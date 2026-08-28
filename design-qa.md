# Design QA

- Source visual truth: `/var/folders/m4/l1mtk46d6lj762hfkldztjgh0000gn/T/codex-clipboard-78661877-4fbf-4b18-ba47-ef79e09e77c3.png` and `/var/folders/m4/l1mtk46d6lj762hfkldztjgh0000gn/T/codex-clipboard-a8409784-82ee-464a-92a4-3dde339a4124.png`
- Implementation screenshot: `/Users/yangyang/Desktop/zhijian/design-qa-focus-implementation.png`
- Viewport: 1198 x 458 CSS px, device scale factor 1
- Source pixels: 1198 x 458 (normal) and 1252 x 312 (focused reference)
- Implementation pixels: 1198 x 458
- State: outline focus mode with the focused node promoted to the document-title role

## Full-view comparison

The focused subtree now uses the same document composition as the normal outline: a 34px bold title without a bullet, followed by its direct children at the first outline level. Hidden ancestor rows and their guide lines no longer occupy or decorate the focused document.

The reference and local fixture contain different text, but the compared title, first-level row, nested row, guide-line, spacing, and typography roles are equivalent. The local preview includes its standalone validation header; the production workspace keeps the existing integrated document header and breadcrumb.

## Focused-region comparison

- Fonts and typography: focused title is 34px, 700 weight, 1.2 line height; body remains 16px and quotes remain 14px.
- Spacing and layout rhythm: focused title and direct children begin at the same document content edge; nested children retain one-level indentation.
- Colors and visual tokens: existing outline ink, guide, marker, and canvas tokens are unchanged.
- Image quality and assets: no image assets are involved in this state.
- Copy and content: the focused node text becomes the document title; its descendants retain their original content.

## Interaction verification

- Entered focus mode from an outline node.
- Switched from the focused outline to MindMap; the focused subtree rendered with 4 visible nodes instead of a blank canvas.
- Opened the MindMap context menu in focus mode; only `取消专注` was shown for focus control.
- Selected `取消专注`; the full 11-node map was restored.

## Comparison history

1. Initial pass: focused title retained a body-row bullet and normal font weight.
2. Fix: promoted the focused row to the root title typography and forced its marker off.
3. Second pass: hidden ancestors still exposed two guide lines because BlockNote's native selector had higher specificity.
4. Fix: suppressed only the hidden focus-path guide lines while preserving the visible subtree guides.

final result: passed
