import "@fontsource/source-sans-pro/400.css";
import "@fontsource/source-sans-pro/400-italic.css";
import "@fontsource/source-sans-pro/600.css";
import "@fontsource/source-sans-pro/700.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceApp } from "./WorkspaceApp";
import { AppErrorBoundary } from "../shared/AppErrorBoundary";
import "./workspace.css";

const root = createRoot(document.getElementById("workspace-root")!);
root.render(<StrictMode><AppErrorBoundary scope="工作区"><WorkspaceApp /></AppErrorBoundary></StrictMode>);
