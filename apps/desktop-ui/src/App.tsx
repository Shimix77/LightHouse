import { useEffect } from "react";

import { Inspector } from "./components/Inspector";
import { ObjectPanel } from "./components/ObjectPanel";
import { ScenePanel } from "./components/ScenePanel";
import { StageEditor } from "./components/StageEditor";
import { StageToolbar } from "./components/StageToolbar";
import { TopBar } from "./components/TopBar";
import { useShowStore } from "./store/showStore";

export function App() {
  const undo = useShowStore((state) => state.undo);
  const redo = useShowStore((state) => state.redo);
  const duplicate = useShowStore((state) => state.duplicateSelection);
  const remove = useShowStore((state) => state.deleteSelection);
  const toggleBlackout = useShowStore((state) => state.toggleBlackout);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isFormField(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicate();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        remove();
      } else if (event.key.toLowerCase() === "b" && event.shiftKey) {
        toggleBlackout();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [duplicate, redo, remove, toggleBlackout, undo]);

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
        <span><i className="status-dot is-good" /> Engine connected</span>
        <span>Frame 1.4 ms</span>
        <span>0 missed deadlines</span>
        <span className="status-spacer" />
        <span>⌘Z Undo</span><span>⇧B Blackout</span>
      </footer>
    </main>
  );
}

function isFormField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
