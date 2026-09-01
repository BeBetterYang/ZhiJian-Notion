import { useEffect, useRef, useState, type ReactNode } from "react";
import "./LoadingScreen.css";

type LoadingPhase = "pending" | "visible" | "exiting" | "done";

const SHOW_DELAY_MS = 240;
const MIN_VISIBLE_MS = 500;
const EXIT_DURATION_MS = 200;

export function LoadingScreen({ ready, children }: { ready: boolean; children: ReactNode }) {
  const [phase, setPhase] = useState<LoadingPhase>(() => ready ? "done" : "pending");
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (phase === "pending") {
      if (ready) {
        setPhase("done");
        return;
      }
      const timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setPhase("visible");
      }, SHOW_DELAY_MS);
      return () => window.clearTimeout(timer);
    }

    if (phase === "visible" && ready) {
      const elapsed = shownAt.current === null ? MIN_VISIBLE_MS : Date.now() - shownAt.current;
      const timer = window.setTimeout(() => setPhase("exiting"), Math.max(0, MIN_VISIBLE_MS - elapsed));
      return () => window.clearTimeout(timer);
    }

    if (phase === "exiting") {
      const timer = window.setTimeout(() => setPhase("done"), EXIT_DURATION_MS);
      return () => window.clearTimeout(timer);
    }
  }, [phase, ready]);

  const contentVisible = phase === "exiting" || phase === "done";
  const overlayVisible = phase === "visible" || phase === "exiting";

  return (
    <div className="workspace-loading-gate">
      <div
        className={`workspace-loading-content ${contentVisible ? "is-visible" : ""}`}
        aria-hidden={contentVisible ? undefined : true}
      >
        {children}
      </div>
      {overlayVisible ? (
        <div
          className={`zhijian-loading-screen ${phase === "exiting" ? "is-exiting" : ""}`}
          role="status"
          aria-label="枝间"
        >
          <div className="zhijian-loading-logo" aria-hidden="true">
            <img className="zhijian-loading-logo-base" src="/zhijian-logo.png" alt="" />
            <img className="zhijian-loading-logo-fill" src="/zhijian-logo.png" alt="" />
          </div>
          <span className="zhijian-loading-brand">枝间</span>
        </div>
      ) : null}
    </div>
  );
}
