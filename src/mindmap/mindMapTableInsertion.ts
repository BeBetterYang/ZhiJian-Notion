import { richTextToPlainText, type ZhiJianNode } from "../core/tree";
import type { TreeStore } from "../core/treeStore";

/**
 * 空节点：正文是空的，也没有引用、图片这些附加块，也没有备注。
 *
 * 「插入表格」按这个判断落点，所以判空要按用户看到的东西算：一个只有空格的节点在导图上
 * 看着就是空的，而挂着图片的节点不是。
 */
export function isEmptyMindMapNode(node: ZhiJianNode) {
  return (
    richTextToPlainText(node.content).trim() === "" &&
    (node.blocks?.length ?? 0) === 0 &&
    richTextToPlainText(node.description ?? "").trim() === ""
  );
}

/**
 * 在导图里插入一张表格，返回表格所在的节点。
 *
 * 导图里表格是一整个节点，不是节点正文里的一段——所以「插到哪」是选节点，而不是选块：
 * 当前节点还空着就地变成表格，已经写了东西才另开一个节点，免得把刚写的字挤走。
 *
 * 两种情况都改结构，而编辑期间的结构变更会被推迟（见 `mindMapUpdateMode`），所以调用方
 * 必须先收掉正在进行的编辑，否则表格要等编辑结束才画出来。
 */
export function insertMindMapTable(store: TreeStore, nodeId: string) {
  const tree = store.getSnapshot();
  const node = tree.nodes[nodeId];
  if (!node) return null;
  // 已经是表格的节点判空也是空的（表格存在 `props.table` 里，正文是空串），就地转换会什么
  // 都不做，所以它走「另开一个」那条路。
  if (node.type !== "table" && isEmptyMindMapNode(node) && node.parentId !== null) {
    store.updateType(nodeId, "table");
    return nodeId;
  }
  const parent = node.parentId ? tree.nodes[node.parentId] : null;
  // 根节点没有兄弟可言——它是文档标题，`updateType` 也不会改它的类型——表格只能作为它的
  // 第一个孩子，和大纲里"在标题后面插一块"落到同一个位置。
  if (!parent) {
    return store.createNode({ parentId: nodeId, index: 0, type: "table" });
  }
  return store.createNode({
    parentId: parent.id,
    index: parent.children.indexOf(nodeId) + 1,
    type: "table",
  });
}
