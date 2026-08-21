import type {
  RichTextContent,
  TreeListener,
  ZhiJianNode,
  ZhiJianNodeBlock,
  ZhiJianNodeType,
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

export class TreeStore {
  private tree: ZhiJianTree;
  private listeners = new Set<TreeListener>();
  private undoStack: ZhiJianTree[] = [];
  private redoStack: ZhiJianTree[] = [];

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

  updateType(id: string, type: ZhiJianNodeType) {
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, id);
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
      };
      if (type === "table") {
        node.content = plainTextContent("");
      }
      draft.nodes[id] = touchNode(node);
    });
  }

  updateProps(id: string, props: NonNullable<ZhiJianNode["props"]>) {
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, id);
      node.props = { ...node.props, ...props };
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
  ) {
    this.commit((draft) => {
      const node = this.requireDraftNode(draft, id);
      node.content = normalizeRichText(content);
      node.blocks = node.type === "table" ? undefined : cloneBlocks(blocks);
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

  replaceTreeFromView(nextTree: ZhiJianTree) {
    this.commit((draft) => {
      draft.rootId = nextTree.rootId;
      draft.nodes = cloneTree(nextTree).nodes;
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

  undo() {
    const previous = this.undoStack.pop();
    if (!previous) {
      return;
    }
    this.redoStack.push(cloneTree(this.tree));
    this.tree = cloneTree(previous);
    this.emit();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) {
      return;
    }
    this.undoStack.push(cloneTree(this.tree));
    this.tree = cloneTree(next);
    this.emit();
  }

  private commit(mutator: (draft: ZhiJianTree) => void) {
    const previous = cloneTree(this.tree);
    const draft = cloneTree(this.tree);
    mutator(draft);
    this.tree = draft;
    this.undoStack.push(previous);
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
