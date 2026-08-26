import type MindElixir from "mind-elixir";
import type { Operation } from "mind-elixir";
import type { ZhiJianMindMapDecorations, ZhiJianTree } from "../core/tree";

/**
 * The operations that change the map's own two annotations — 摘要 and 连接 —
 * rather than a node. mind-elixir reports them on the same `operation` bus as node
 * edits, and their `obj.id` is the annotation's id, not a node's, so a listener
 * that treats every `obj.id` as a node has to be told these apart.
 */
const DECORATION_OPERATIONS = new Set<Operation["name"]>([
  "createSummary",
  "removeSummary",
  "finishEditSummary",
  "createArrow",
  "removeArrow",
  "finishEditArrowLabel",
  "reshapeArrow",
]);

export function isMindMapDecorationOperation(operation: Operation) {
  return DECORATION_OPERATIONS.has(operation.name);
}

/**
 * The live set of annotations, as plain data for the store.
 *
 * Read off the instance rather than folded up from the operation, because
 * mind-elixir has already applied the change to its own arrays by the time it
 * reports it — the set it holds is the answer, and copying it is both shorter and
 * impossible to get out of step with.
 */
export function readMindMapDecorations(mind: MindElixir): ZhiJianMindMapDecorations {
  return {
    summaries: (mind.summaries ?? []).map((summary) => ({
      id: summary.id,
      label: summary.label,
      parent: summary.parent,
      start: summary.start,
      end: summary.end,
      style: summary.style ? { ...summary.style } : undefined,
    })),
    arrows: (mind.arrows ?? []).map((arrow) => ({
      id: arrow.id,
      label: arrow.label,
      from: arrow.from,
      to: arrow.to,
      delta1: arrow.delta1 ? { ...arrow.delta1 } : undefined,
      delta2: arrow.delta2 ? { ...arrow.delta2 } : undefined,
      bidirectional: arrow.bidirectional,
      style: arrow.style ? { ...arrow.style } : undefined,
    })),
  };
}

/** Whether two annotation sets say the same thing — cheap enough at these sizes. */
export function sameMindMapDecorations(a: ZhiJianMindMapDecorations | undefined, b: ZhiJianMindMapDecorations) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(decorations: ZhiJianMindMapDecorations | undefined) {
  return {
    summaries: decorations?.summaries ?? [],
    arrows: decorations?.arrows ?? [],
  };
}

/**
 * How far a summary drawn around a non-root node's children sits too low, in map
 * layout pixels.
 *
 * mind-elixir adds this to the bracket's top, bottom and label midpoint whenever
 * the summarised children's parent is not the root — and adds nothing when it is,
 * so summaries at the two depths do not even line up with each other. Taking it
 * back off leaves the bracket centred on the run of nodes it spans.
 */
const SUMMARY_DROP = 10;

/**
 * Lift the summaries mind-elixir drew too low.
 *
 * Applied to the rendered SVG rather than fixed at the source: the offset is baked
 * into the library's own path string, and correcting it there would mean patching
 * mind-elixir. Runs after every `linkDiv`, which is what re-renders them.
 */
export function correctMindMapSummaryOffsets(mind: MindElixir, tree: ZhiJianTree) {
  (mind.summaries ?? []).forEach((summary) => {
    if (!tree.nodes[summary.parent]?.parentId) return;
    // Both the bracket group and its label hang off `mind.nodes`, so one lookup
    // root covers them; ids come from `crypto.randomUUID`, hence the escape.
    const selector = CSS.escape(`s-${summary.id}`);
    const group = mind.summarySvg.querySelector<SVGGElement>(`#${selector}`);
    if (group) group.setAttribute("transform", `translate(0, ${-SUMMARY_DROP})`);
    const label = mind.labelContainer.querySelector<HTMLElement>(`#${CSS.escape(`label-s-${summary.id}`)}`);
    // Absolutely positioned, so a negative margin moves it without disturbing the
    // `top` the library recomputes from the label's own height on every render.
    if (label) label.style.marginTop = `${-SUMMARY_DROP}px`;
  });
}
