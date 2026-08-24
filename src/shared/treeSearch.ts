import {
  cloneTree,
  replaceRichTextPlainText,
  richTextToPlainText,
  type RichTextContent,
  type ZhiJianNode,
  type ZhiJianNodeBlock,
  type ZhiJianTree,
} from "../core/tree";

export function searchVisibleNodeIds(tree: ZhiJianTree, query: string) {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;
  const visible = new Set<string>([tree.rootId]);
  for (const node of Object.values(tree.nodes)) {
    if (!nodeMatches(node, normalized)) continue;
    let current: ZhiJianNode | undefined = node;
    while (current) {
      visible.add(current.id);
      current = current.parentId ? tree.nodes[current.parentId] : undefined;
    }
  }
  return visible;
}

export function matchingNodeIds(tree: ZhiJianTree, query: string) {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  return orderedNodeIds(tree).filter((id) => {
    const node = tree.nodes[id];
    return node ? nodeMatches(node, normalized) : false;
  });
}

export function replaceSearchMatch(tree: ZhiJianTree, query: string, replacement: string, mode: "first" | "all") {
  const normalized = normalizeQuery(query);
  if (!normalized) return tree;
  const draft = cloneTree(tree);
  let replaced = 0;
  for (const id of orderedNodeIds(draft)) {
    const node = draft.nodes[id];
    if (!node) continue;
    const next = replaceInNode(node, normalized, replacement, mode === "first" ? 1 - replaced : Number.POSITIVE_INFINITY);
    if (next.count === 0) continue;
    draft.nodes[id] = next.node;
    replaced += next.count;
    if (mode === "first" && replaced > 0) break;
  }
  return draft;
}

function replaceInNode(node: ZhiJianNode, query: string, replacement: string, limit: number) {
  let count = 0;
  const replaceContent = (content: RichTextContent) => {
    if (count >= limit) return content;
    const next = replacePlainText(richTextToPlainText(content), query, replacement, limit - count);
    count += next.count;
    return next.count ? replaceRichTextPlainText(content, next.text) : content;
  };

  const content = replaceContent(node.content);
  const description = node.description ? replaceContent(node.description) : undefined;
  const blocks = node.blocks?.map((block) => replaceInBlock(block, replaceContent));
  let props = node.props;
  if (node.type === "table" && node.props?.table) {
    props = {
      ...node.props,
      table: {
        ...node.props.table,
        rows: node.props.table.rows.map((row) =>
          row.map((cell) => ({ ...cell, content: replaceContent(cell.content) })),
        ),
      },
    };
  }

  return {
    count,
    node: {
      ...node,
      content,
      description,
      blocks,
      props,
    },
  };
}

function replaceInBlock(
  block: ZhiJianNodeBlock,
  replaceContent: (content: RichTextContent) => RichTextContent,
): ZhiJianNodeBlock {
  return block.type === "quote" ? { ...block, content: replaceContent(block.content) } : block;
}

function replacePlainText(text: string, query: string, replacement: string, limit: number) {
  const lower = text.toLocaleLowerCase("zh-CN");
  let cursor = 0;
  let count = 0;
  let output = "";
  while (count < limit) {
    const index = lower.indexOf(query, cursor);
    if (index < 0) break;
    output += text.slice(cursor, index) + replacement;
    cursor = index + query.length;
    count += 1;
  }
  return { text: output + text.slice(cursor), count };
}

function nodeMatches(node: ZhiJianNode, query: string) {
  return nodeSearchText(node).toLocaleLowerCase("zh-CN").includes(query);
}

function nodeSearchText(node: ZhiJianNode) {
  const parts = [richTextToPlainText(node.content), node.description ? richTextToPlainText(node.description) : ""];
  for (const block of node.blocks ?? []) {
    if (block.type === "quote") parts.push(richTextToPlainText(block.content));
  }
  if (node.type === "table") {
    for (const row of node.props?.table?.rows ?? []) {
      for (const cell of row) parts.push(richTextToPlainText(cell.content));
    }
  }
  return parts.join("\n");
}

function orderedNodeIds(tree: ZhiJianTree) {
  const ids: string[] = [];
  const visit = (id: string) => {
    ids.push(id);
    tree.nodes[id]?.children.forEach(visit);
  };
  visit(tree.rootId);
  return ids;
}

function normalizeQuery(query: string) {
  return query.trim().toLocaleLowerCase("zh-CN");
}
