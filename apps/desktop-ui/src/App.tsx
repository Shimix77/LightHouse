import { useEffect, useState } from "react";

import { FixtureManager } from "./components/FixtureManager";
import { LiveDisplay } from "./components/LiveDisplay";
import { ProjectBrowser } from "./components/ProjectBrowser";
import { ProjectSetup } from "./components/ProjectSetup";
import { Workspace } from "./components/Workspace";
import {
  errorMessage,
  getEngineBootstrap,
  hasNativeEngine,
  refreshEngine,
} from "./services/engineClient";
import { useShowStore } from "./store/showStore";

export function App() {
  const liveDisplay = new URLSearchParams(window.location.search).get("display") === "live";
  const requestedScreen = new URLSearchParams(window.location.search).get("screen");
  const [screen, setScreen] = useState<AppScreen>(requestedScreen === "workspace" ? "workspace" : "projects");
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

  if (screen === "projects") return <ProjectBrowser onOpenWorkspace={() => setScreen("workspace")} onStartSetup={() => setScreen("setup")} onOpenFixtureLibrary={() => setScreen("fixtures")} />;
  if (screen === "setup") return <ProjectSetup onDone={() => setScreen("workspace")} onCancel={() => setScreen("projects")} />;
  if (screen === "fixtures") return <FixtureManager onDone={() => setScreen("workspace")} />;

  return <Workspace onShowProjects={() => setScreen("projects")} onShowSetup={() => setScreen("setup")} onManageFixtures={() => setScreen("fixtures")} />;
}

type AppScreen = "projects" | "setup" | "fixtures" | "workspace";

function isFormField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
