import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { rehydrateImageAssets } from "./shared/imageAssetStore";

// Object URLs for persisted images do not survive a reload, so repopulate the
// asset cache from IndexedDB before the editors first read image URLs.
void rehydrateImageAssets().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
