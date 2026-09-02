import type {
  RichTextContent,
  TreeListener,
  ZhiJianMindMapDecorations,
  ZhiJianNode,
  ZhiJianNodeBlock,
  ZhiJianNodeType,
  ZhiJianTableData,
  ZhiJianTree,
} from "../tree";
import type { NodeVisualStyle } from "../tree/style";
import { normalizeRichText, plainTextContent } from "../tree";
import { cloneTree, nowMeta, touchNode } from "../tree/utils";

export interface CreateNodeInput {
  parentId: string;
  index?: number;
  content?: string | RichTextContent;
  description?: string | RichTextContent;
  type?: ZhiJianNodeType;
  blocks?: ZhiJianNodeBlock[];
  props?: ZhiJianNode["props"];
  id?: string;
}

export interface UpdateNodeInput {
  id: string;
  content?: string | RichTextContent;
  props?: NonNullable<ZhiJianNode["props"]>;
  blocks?: ZhiJianNodeBlock[];
}

export interface UpdateNodeTypeInput {
  id: string;
  type: ZhiJianNodeType;
  extraProps?: NonNullable<ZhiJianNode["props"]>;
}

export class TreeStore {
  private tree: ZhiJianTree;
  private listeners = new Set<TreeListener>();
  private undoStack: ZhiJianTree[] = [];
  private redoStack: ZhiJianTree[] = [];
  /**
   * Whether the commits arriving now fold into a single undo step.
   *
   * An IME turns one Chinese character into a run of document changes — "n",
   * "ni", "nih", then 你 — and each one reached `commit` as a snapshot of its own,
   * so undo walked back through pinyin the user never wrote. Every change while a
   * composition is open belongs to the same character, and the only state worth
   * returning to is the one it started from.
   *
   * "closing" is the window after `compositionend`: the editor flushes the
   * finished character as one more change a moment later, and that change has to
   * join the group rather than record the pinyin behind it as the state to return
   * to. It closes on the next commit whatever that commit turns out to be — an
   * unrelated edit arriving first is folded in as well, which costs one step of
   * granularity and never loses text.
   */
  private coalescing: "off" | "open" | "closing" = "off";
  /** Whether the open group has already put its starting state on the stack. */
  private groupOnUndoStack = false;

  constructor(initialTree: ZhiJianTree) {
    this.tree = cloneTree(initialTree);
  }

  getSnapshot = () => this.tree;

  subscribe = (listener: TreeListener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getNode(id: string) {
    return this.tree.nodes[id] ?? null;
  }

  getChildren(parentId: string) {
    return this.requireNode(parentId).children.map((id) => this.requireNode(id));
  }

  getOrderedNodes() {
    const result: ZhiJianNode[] = [];
    const visit = (id: string) => {
      const current = this.requireNode(id);
      result.push(current);
      current.children.forEach(visit);
    };
    visit(this.tree.rootId);
    return result;
  }

  updateContent(id: string, content: string | RichTextContent) {
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, id);
      node.content = normalizeRichText(content);
      draft.nodes[id] = touchNode(node);
    });
  }

  updateDescription(id: string, description?: string | RichTextContent) {
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, id);
      const richText = description ? normalizeRichText(description) : undefined;
      if (richText?.text.trim()) {
        node.description = richText;
      } else {
        delete node.description;
      }
      draft.nodes[id] = touchNode(node);
    });
  }

  /**
   * `extraProps` is applied last, so a caller that changes a node's type and one of
   * that type's own props — the heading shortcuts, which set 标题 and its level
   * together — commits both as one change and undoes them as one step.
   */
  updateType(id: string, type: ZhiJianNodeType, extraProps?: NonNullable<ZhiJianNode["props"]>) {
    if (id === this.tree.rootId) {
      return;
    }
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, id);
      applyNodeType(node, type, extraProps);
      draft.nodes[id] = touchNode(node);
    });
  }

  updateTypes(updates: UpdateNodeTypeInput[]) {
    this.commit((draft) => {
      updates.forEach(({ id, type, extraProps }) => {
        if (id === draft.rootId) return;
        const node = this.requireDraftNode(draft, id);
        applyNodeType(node, type, extraProps);
        draft.nodes[id] = touchNode(node);
      });
    });
  }

  updateProps(id: string, props: NonNullable<ZhiJianNode["props"]>) {
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, id);
      if (id === this.tree.rootId) {
        const rootProps = { ...props };
        delete rootProps.style;
        delete rootProps.checked;
        delete rootProps.table;
        node.props = { ...node.props, ...rootProps, headingLevel: 1 };
      } else {
        node.props = { ...node.props, ...props };
      }
      draft.nodes[id] = touchNode(node);
    });
  }

  updateNodes(updates: UpdateNodeInput[]) {
    this.commit((draft) => {
      updates.forEach((update) => {
        const node = this.requireDraftNode(draft, update.id);
        if (update.content !== undefined) {
          node.content = normalizeRichText(update.content);
        }
        if (update.props) {
          node.props = { ...node.props, ...update.props };
        }
        if (update.blocks !== undefined) {
          node.blocks = node.type === "table" ? undefined : cloneBlocks(update.blocks);
        }
        draft.nodes[node.id] = touchNode(node);
      });
    });
  }

  updateNodeDocument(
    id: string,
    content: string | RichTextContent,
    blocks: ZhiJianNodeBlock[],
    description?: string | RichTextContent,
    table?: ZhiJianTableData,
  ) {
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, id);
      node.content = normalizeRichText(content);
      const nextDescription = description ? normalizeRichText(description) : undefined;
      if (nextDescription?.text.trim()) node.description = nextDescription;
      else delete node.description;
      node.blocks = node.type === "table" ? undefined : cloneBlocks(blocks);
      // A table node keeps its cells in props, so an editor round trip has to be
      // able to write them back through the same commit as the rest of the node.
      if (node.type === "table" && table) node.props = { ...node.props, table };
      draft.nodes[id] = touchNode(node);
    });
  }

  addNodeBlock(nodeId: string, block: ZhiJianNodeBlock, index?: number) {
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, nodeId);
      if (node.type === "table") {
        return;
      }
      const blocks = node.blocks ? cloneBlocks(node.blocks) : [];
      blocks.splice(clampIndex(index ?? blocks.length, blocks), 0, cloneBlock(block));
      node.blocks = blocks;
      draft.nodes[nodeId] = touchNode(node);
    });
  }

  updateNodeBlock(nodeId: string, blockId: string, patch: Partial<ZhiJianNodeBlock>) {
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, nodeId);
      const blocks = node.blocks ? cloneBlocks(node.blocks) : [];
      const index = blocks.findIndex((block) => block.id === blockId);
      if (index < 0) {
        return;
      }
      blocks[index] = { ...blocks[index], ...patch } as ZhiJianNodeBlock;
      node.blocks = blocks;
      draft.nodes[nodeId] = touchNode(node);
    });
  }

  deleteNodeBlock(nodeId: string, blockId: string) {
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, nodeId);
      node.blocks = (node.blocks ?? []).filter((block) => block.id !== blockId);
      draft.nodes[nodeId] = touchNode(node);
    });
  }

  moveNodeBlock(nodeId: string, blockId: string, index: number) {
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, nodeId);
      const blocks = node.blocks ? cloneBlocks(node.blocks) : [];
      const currentIndex = blocks.findIndex((block) => block.id === blockId);
      if (currentIndex < 0) {
        return;
      }
      const [moved] = blocks.splice(currentIndex, 1);
      blocks.splice(clampIndex(index, blocks), 0, moved);
      node.blocks = blocks;
      draft.nodes[nodeId] = touchNode(node);
    });
  }

  updateStyle(id: string, style: NodeVisualStyle) {
    if (id === this.tree.rootId) {
      return;
    }
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, id);
      node.props = {
        ...node.props,
        style: {
          ...(node.props?.style ?? {}),
          ...style,
        },
      };
      draft.nodes[id] = touchNode(node);
    });
  }

  /**
   * Replace the map's 摘要 and 连接 wholesale.
   *
   * Wholesale because mind-elixir owns the live set while the map is mounted — it
   * creates, edits, reshapes and drops them itself — so the map reports the set it
   * has rather than a patch, and this is where that set is kept for the next time
   * the map is built. Nothing else reads it: the outline projects nodes only.
   *
   * Entries pointing at nodes that no longer exist are dropped here rather than
   * left for the map to fail to draw, since the outline can delete the very node a
   * summary was drawn around while the map is not even mounted.
   */
  setMindMapDecorations(decorations: ZhiJianMindMapDecorations) {
    this.commit((draft) => {
      const summaries = (decorations.summaries ?? []).filter((summary) => draft.nodes[summary.parent]);
      const arrows = (decorations.arrows ?? []).filter((arrow) => draft.nodes[arrow.from] && draft.nodes[arrow.to]);
      const theme = draft.mindMap?.theme;
      const connector = draft.mindMap?.connector;
      const frame = draft.mindMap?.frame;
      const canvas = draft.mindMap?.canvas;
      const layout = draft.mindMap?.layout;
      draft.mindMap = summaries.length || arrows.length || theme || connector || frame || canvas || layout
        ? { summaries, arrows, theme, connector, frame, canvas, layout }
        : undefined;
    });
  }

  setMindMapTheme(theme: NonNullable<ZhiJianMindMapDecorations["theme"]>) {
    this.commit((draft) => {
      draft.mindMap = {
        ...draft.mindMap,
        theme: { ...theme },
        canvas: undefined,
      };
    });
  }

  setMindMapConnectorRounded(rounded: boolean) {
    this.commit((draft) => {
      draft.mindMap = {
        ...draft.mindMap,
        connector: { rounded },
      };
    });
  }

  setMindMapFrameRounded(rounded: boolean) {
    this.commit((draft) => {
      draft.mindMap = {
        ...draft.mindMap,
        frame: { rounded },
      };
    });
  }

  setMindMapCanvasBackground(background?: string) {
    this.commit((draft) => {
      draft.mindMap = {
        ...draft.mindMap,
        canvas: background ? { background } : undefined,
      };
    });
  }

  setMindMapLayout(layout: NonNullable<ZhiJianMindMapDecorations["layout"]>) {
    this.commit((draft) => {
      draft.mindMap = {
        ...draft.mindMap,
        layout: { ...layout },
      };
    });
  }

  replaceTreeFromView(nextTree: ZhiJianTree) {
    this.commit((draft) => {
      draft.rootId = nextTree.rootId;
      draft.nodes = cloneTree(nextTree).nodes;
      const root = draft.nodes[draft.rootId];
      if (root) {
        root.type = "heading";
        root.props = { headingLevel: 1 };
      }
    });
  }

  createNode(input: CreateNodeInput) {
    return this.createNodes([input])[0];
  }

  createNodes(inputs: CreateNodeInput[]) {
    const entries = inputs.map((input) => ({ input, id: input.id ?? createId() }));
    this.commit((draft) => {
      entries.forEach(({ input, id }) => {
        const parent = this.requireDraftNode(draft, input.parentId);
        const type = input.type ?? "text";
        const index = clampIndex(input.index ?? parent.children.length, parent.children);
        const newNode: ZhiJianNode = {
          id,
          parentId: parent.id,
          children: [],
          content: type === "table" ? plainTextContent("") : normalizeRichText(input.content ?? ""),
          description: input.description ? normalizeRichText(input.description) : undefined,
          type,
          blocks: type === "table" ? undefined : input.blocks ? cloneBlocks(input.blocks) : undefined,
          props: {
            ...(type === "table" ? { table: createDefaultTable() } : undefined),
            ...(type === "heading" ? { headingLevel: 1 as const } : undefined),
            ...input.props,
          },
          meta: nowMeta(),
        };
        draft.nodes[id] = newNode;
        parent.children.splice(index, 0, id);
        draft.nodes[parent.id] = touchNode(parent);
      });
    });
    return entries.map(({ id }) => id);
  }

  deleteNode(id: string) {
    if (id === this.tree.rootId) {
      return;
    }
    this.commit((draft) => {
      const target = this.requireDraftNode(draft, id);
      if (!target.parentId) {
        return;
      }
      const parent = this.requireDraftNode(draft, target.parentId);
      parent.children = parent.children.filter((childId) => childId !== id);
      draft.nodes[parent.id] = touchNode(parent);
      this.collectSubtreeIds(draft, id).forEach((nodeId) => {
        delete draft.nodes[nodeId];
      });
    });
  }

  moveNode(id: string, newParentId: string, index?: number) {
    if (id === this.tree.rootId || id === newParentId) {
      return;
    }
    if (this.isDescendant(newParentId, id)) {
      return;
    }
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, id);
      const oldParent = node.parentId
        ? this.requireDraftNode(draft, node.parentId)
        : null;
      const newParent = this.requireDraftNode(draft, newParentId);
      if (!oldParent) {
        return;
      }

      oldParent.children = oldParent.children.filter((childId) => childId !== id);
      const targetIndex = clampIndex(index ?? newParent.children.length, newParent.children);
      newParent.children.splice(targetIndex, 0, id);
      node.parentId = newParentId;

      draft.nodes[oldParent.id] = touchNode(oldParent);
      draft.nodes[newParent.id] = touchNode(newParent);
      draft.nodes[id] = touchNode(node);
    });
  }

  indent(id: string) {
    const node = this.requireNode(id);
    if (!node.parentId) {
      return;
    }
    const parent = this.requireNode(node.parentId);
    const index = parent.children.indexOf(id);
    const previousSiblingId = parent.children[index - 1];
    if (!previousSiblingId) {
      return;
    }
    this.moveNode(id, previousSiblingId);
  }

  outdent(id: string) {
    const node = this.requireNode(id);
    if (!node.parentId) {
      return;
    }
    const parent = this.requireNode(node.parentId);
    if (!parent.parentId) {
      return;
    }
    const grandParent = this.requireNode(parent.parentId);
    const parentIndex = grandParent.children.indexOf(parent.id);
    this.moveNode(id, grandParent.id, parentIndex + 1);
  }

  duplicate(id: string) {
    const source = this.requireNode(id);
    if (!source.parentId) {
      return null;
    }
    const newRootId = createId();
    this.commit((draft) => {
      const parent = this.requireDraftNode(draft, source.parentId!);
      const sourceIndex = parent.children.indexOf(id);
      const idMap = new Map<string, string>([[id, newRootId]]);
      const cloneSubtree = (sourceId: string, parentId: string | null) => {
        const original = this.requireNode(sourceId);
        const copyId = idMap.get(sourceId) ?? createId();
        idMap.set(sourceId, copyId);
        const childIds = original.children.map((childId) => {
          const childCopyId = createId();
          idMap.set(childId, childCopyId);
          return childCopyId;
        });
        draft.nodes[copyId] = {
          ...original,
          id: copyId,
          parentId,
          children: childIds,
          meta: nowMeta(),
        };
        original.children.forEach((childId) => {
          cloneSubtree(childId, copyId);
        });
      };
      cloneSubtree(id, source.parentId);
      parent.children.splice(sourceIndex + 1, 0, newRootId);
      draft.nodes[parent.id] = touchNode(parent);
    });
    return newRootId;
  }

  /** Starts a run of commits that undo steps over as one. Idempotent. */
  beginHistoryCoalescing() {
    this.coalescing = "open";
  }

  /** Ends that run, with room for one last commit — see `coalescing`. */
  endHistoryCoalescing() {
    if (this.coalescing === "open") {
      this.coalescing = "closing";
    }
  }

  /**
   * 有没有可撤销/可重做的一步。
   *
   * 给菜单用的：撤销从前只有 Ctrl Z 一个入口，按下去没东西可撤就是没反应，用户也不会觉得哪里不对；
   * 菜单项摆在眼前，能点却什么都不发生就像坏了，所以要能置灰。每次 undo/redo/提交都会 emit，
   * 订阅了 store 的界面会重新渲染，渲染时读到的就是当下的值。
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    const previous = this.undoStack.pop();
    if (!previous) {
      return;
    }
    // Stepping through history is a boundary: whatever run of commits was being
    // folded together ends here rather than absorbing what comes after it.
    this.closeHistoryCoalescing();
    this.redoStack.push(cloneTree(this.tree));
    this.tree = cloneTree(previous);
    this.emit();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) {
      return;
    }
    this.closeHistoryCoalescing();
    this.undoStack.push(cloneTree(this.tree));
    this.tree = cloneTree(next);
    this.emit();
  }

  private closeHistoryCoalescing() {
    this.coalescing = "off";
    this.groupOnUndoStack = false;
  }

  private commit(mutator: (draft: ZhiJianTree) => void) {
    const previous = cloneTree(this.tree);
    const draft = cloneTree(this.tree);
    mutator(draft);
    this.tree = draft;
    if (!this.groupOnUndoStack) {
      this.undoStack.push(previous);
      this.groupOnUndoStack = this.coalescing !== "off";
    }
    if (this.coalescing === "closing") {
      this.closeHistoryCoalescing();
    }
    this.redoStack = [];
    this.emit();
  }

  private emit() {
    this.listeners.forEach((listener) => listener(this.tree));
  }

  private requireNode(id: string) {
    const node = this.tree.nodes[id];
    if (!node) {
      throw new Error(`Node not found: ${id}`);
    }
    return node;
  }

  private requireDraftNode(tree: ZhiJianTree, id: string) {
    const node = tree.nodes[id];
    if (!node) {
      throw new Error(`Node not found: ${id}`);
    }
    return node;
  }

  private collectSubtreeIds(tree: ZhiJianTree, id: string) {
    const ids = [id];
    const node = this.requireDraftNode(tree, id);
    node.children.forEach((childId) => {
      ids.push(...this.collectSubtreeIds(tree, childId));
    });
    return ids;
  }

  private isDescendant(id: string, ancestorId: string) {
    let current = this.getNode(id);
    while (current?.parentId) {
      if (current.parentId === ancestorId) {
        return true;
      }
      current = this.getNode(current.parentId);
    }
    return false;
  }
}

function applyNodeType(
  node: ZhiJianNode,
  type: ZhiJianNodeType,
  extraProps?: NonNullable<ZhiJianNode["props"]>,
) {
  const { checked, headingLevel, table, ...sharedProps } = node.props ?? {};
  node.type = type;
  if (type === "table") {
    node.blocks = undefined;
  }
  node.props = {
    ...sharedProps,
    ...(type === "todo" ? { checked: checked ?? false } : undefined),
    ...(type === "heading" ? { headingLevel: headingLevel ?? 1 } : undefined),
    ...(type === "table" ? { table: table ?? createDefaultTable() } : undefined),
    ...extraProps,
  };
  if (type === "table") {
    node.content = plainTextContent("");
  }
}

function createDefaultTable() {
  return {
    rows: Array.from({ length: 2 }, () =>
      Array.from({ length: 3 }, () => ({ content: plainTextContent("") })),
    ),
  };
}

function cloneBlocks(blocks: ZhiJianNodeBlock[]) {
  return blocks.map(cloneBlock);
}

function cloneBlock(block: ZhiJianNodeBlock): ZhiJianNodeBlock {
  return block.type === "quote"
    ? { ...block, content: normalizeRichText(block.content) }
    : { ...block, image: { ...block.image } };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `node_${Math.random().toString(36).slice(2)}`;
}

function clampIndex<T>(index: number, items: T[]) {
  return Math.max(0, Math.min(index, items.length));
}
