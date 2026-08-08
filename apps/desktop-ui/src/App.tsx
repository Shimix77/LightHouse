import { useEffect } from "react";

import { Inspector } from "./components/Inspector";
import { LiveDisplay } from "./components/LiveDisplay";
import { ObjectPanel } from "./components/ObjectPanel";
import { ScenePanel } from "./components/ScenePanel";
import { StageEditor } from "./components/StageEditor";
import { StageToolbar } from "./components/StageToolbar";
import { TopBar } from "./components/TopBar";
import {
  errorMessage,
  getEngineBootstrap,
  hasNativeEngine,
  refreshEngine,
} from "./services/engineClient";
import { useShowStore } from "./store/showStore";

export function App() {
  const liveDisplay = new URLSearchParams(window.location.search).get("display") === "live";
  const undo = useShowStore((state) => state.undo);
  const redo = useShowStore((state) => state.redo);
  const duplicate = useShowStore((state) => state.duplicateSelection);
  const copy = useShowStore((state) => state.copySelection);
  const paste = useShowStore((state) => state.pasteSelection);
  const remove = useShowStore((state) => state.deleteSelection);
  const toggleBlackout = useShowStore((state) => state.toggleBlackout);
  const hydrateEngine = useShowStore((state) => state.hydrateEngine);
  const applyEngineView = useShowStore((state) => state.applyEngineView);
  const setEngineError = useShowStore((state) => state.setEngineError);
  const engineConnected = useShowStore((state) => state.engineConnected);
  const engineError = useShowStore((state) => state.engineError);
  const telemetry = useShowStore((state) => state.engineTelemetry);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isFormField(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicate();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copy();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        paste();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        remove();
      } else if (event.key.toLowerCase() === "b" && event.shiftKey) {
        toggleBlackout();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copy, duplicate, paste, redo, remove, toggleBlackout, undo]);

  useEffect(() => {
    if (!hasNativeEngine()) return;
    let cancelled = false;
    let polling = false;
    void getEngineBootstrap()
      .then((bootstrap) => {
        if (!cancelled) hydrateEngine(bootstrap);
      })
      .catch((error: unknown) => {
        if (!cancelled) setEngineError(errorMessage(error));
      });
    const timer = window.setInterval(() => {
      if (cancelled || polling) return;
      polling = true;
      void refreshEngine()
        .then((view) => {
          if (!cancelled) applyEngineView(view);
        })
        .catch((error: unknown) => {
          if (!cancelled) setEngineError(errorMessage(error));
        })
        .finally(() => { polling = false; });
    }, 250);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applyEngineView, hydrateEngine, setEngineError]);

  if (liveDisplay) return <LiveDisplay />;

  return (
    <main className="app-shell">
      <TopBar />
      <StageToolbar />
      <div className="workspace-grid">
        <ObjectPanel />
        <StageEditor />
        <Inspector />
      </div>
      <ScenePanel />
      <footer className="status-bar">
        <span title={engineError}><i className={`status-dot ${engineConnected ? "is-good" : "is-error"}`} /> {engineConnected ? "Engine connected" : "Engine reconnecting"}</span>
        <span>{telemetry.framesSent.toLocaleString()} frames sent</span>
        <span>{telemetry.missedDeadlines} missed deadlines</span>
        <span>{telemetry.sendErrors} output errors</span>
        <span className="status-spacer" />
        <span>⌘Z Undo</span><span>⌘C / ⌘V Copy · Paste</span><span>⇧B Blackout</span>
      </footer>
    </main>
  );
}

function isFormField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
