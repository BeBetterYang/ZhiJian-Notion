import type { ZhiJianTree } from "../core/tree";

/**
 * Collapsing a row in the outline hides its children with CSS and leaves the
 * document itself whole. Projecting a collapsed node without its children would
 * be read back by `blockNoteToTree` as those rows having been deleted, so every
 * collapse would destroy the subtree it was meant to hide.
 *
 * The rules are keyed by node id, which is also the `data-id` BlockNote writes on
 * every block, so the stylesheet is built straight from the tree — no ProseMirror
 * DOM to patch, and nothing to re-apply after the editor re-renders.
 *
 * The state is `props.collapsed`, the same flag the map's collapse handle writes:
 * one node is collapsed or it is not, whichever view you are looking at it in.
 */
export function collapsedOutlineCss(tree: ZhiJianTree): string {
  const collapsed = Object.values(tree.nodes).filter(
    (node) =>
      // The root is deliberately exempt. It is the fixed document title and has no
      // side menu of its own, so a collapse there — which the map's root handle can
      // still write — would empty the outline with no way to bring it back.
      node.id !== tree.rootId && node.props?.collapsed === true && node.children.length > 0,
  );
  if (collapsed.length === 0) {
    return "";
  }

  return [
    `.outline-panel :is(${blockSelectors(collapsed.flatMap((node) => node.children))}) { display: none; }`,
    // Hidden children leave no trace on the row otherwise: the chevron only shows
    // while the pointer is on the row, so the marker carries the state the rest of
    // the time, ringed the way a collapsed node is in the map.
    `.outline-panel :is(${blockSelectors(collapsed.map((node) => node.id))}) > .bn-block > .bn-block-content::before { box-shadow: 0 0 0 3px var(--zhijian-collapsed-ring); }`,
    // With the children hidden there is nothing left for the indent guide to reach,
    // so the piece of it the row paints for itself has to go too — otherwise a
    // collapsed row trails a short line into empty space. The content class is
    // repeated to out-specify the `:has(> .bn-block > .bn-block-group)` rule in
    // styles.css, which the collapsed row still matches: the group is hidden, not
    // removed.
    `.outline-panel :is(${blockSelectors(collapsed.map((node) => node.id))}) > .bn-block > .bn-block-content.bn-block-content.bn-block-content { background-image: none; }`,
  ].join("\n");
}

/** Whether a row has children of its own to collapse — attachments do not count. */
export function hasCollapsibleChildren(tree: ZhiJianTree, nodeId: string) {
  return (tree.nodes[nodeId]?.children.length ?? 0) > 0;
}

function blockSelectors(ids: string[]) {
  return ids.map((id) => `.bn-block-outer[data-id="${escapeCssString(id)}"]`).join(", ");
}

function escapeCssString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
