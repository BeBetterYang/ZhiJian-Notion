import type { ReactNode } from "react";
import { ToastViewport } from "./ToastViewport";
import "./toast.css";

export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}<ToastViewport /></>;
}
