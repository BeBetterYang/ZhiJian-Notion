// Scratch entry for local verification only: mounts the document editor on its own
// local-storage tree, without the workspace shell's server session.
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
