import "../shared/sourceSansPro.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceApp } from "./WorkspaceApp";
import { AppErrorBoundary } from "../shared/AppErrorBoundary";
import { ToastProvider } from "../shared/toast/ToastProvider";
import "./workspace.css";

const root = createRoot(document.getElementById("workspace-root")!);
root.render(<StrictMode><ToastProvider><AppErrorBoundary scope="工作区"><WorkspaceApp /></AppErrorBoundary></ToastProvider></StrictMode>);
