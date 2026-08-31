/** Fetch a view's editor chunk before React reaches its lazy boundary. */
export function preloadEditorView(view: "outline" | "mindmap") {
  return view === "outline" ? import("../outline/OutlineEditor") : import("../mindmap/MindMapEditor");
}
