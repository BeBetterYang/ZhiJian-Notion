import "@fontsource/source-sans-pro/400.css";
import "@fontsource/source-sans-pro/400-italic.css";
import "@fontsource/source-sans-pro/600.css";
import "@fontsource/source-sans-pro/700.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { rehydrateImageAssets } from "../shared/imageAssetStore";
import { WorkspaceApp } from "./WorkspaceApp";
import "./workspace.css";

const root = createRoot(document.getElementById("workspace-root")!);
void rehydrateImageAssets().finally(() => {
  root.render(
    <StrictMode>
      <WorkspaceApp />
    </StrictMode>,
  );
});
