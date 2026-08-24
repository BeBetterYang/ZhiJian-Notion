import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { rehydrateImageAssets } from "./shared/imageAssetStore";

// Object URLs for persisted images do not survive a reload, so the asset cache is
// repopulated from IndexedDB *before* the editors first render. Rendering first and
// rehydrating afterwards was worse than a picture arriving late: the editors
// projected every stored image with an empty URL, and the next edit anywhere in the
// document parsed those empty URLs back into the tree and dropped the asset ids —
// the blobs stayed in IndexedDB with nothing left pointing at them.
const root = createRoot(document.getElementById("root")!);
void rehydrateImageAssets().finally(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
