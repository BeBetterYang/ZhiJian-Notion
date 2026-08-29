export interface MindMapViewportState {
  x: number;
  y: number;
  scale: number;
}

export interface DocumentViewState {
  activeView?: "outline" | "mindmap";
  outlineScrollTop?: number;
  mindMapViewport?: MindMapViewportState;
  mindMapDirection?: 0 | 1 | 2;
  mindMapTheme?: "zhijian";
}
