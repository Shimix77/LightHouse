import { useEffect, useRef, useState } from "react";

import { openLiveDisplay } from "../services/engineClient";
import { useShowStore } from "../store/showStore";
import { OutputSettingsDialog } from "./OutputSettingsDialog";
import { UserGuideDialog } from "./UserGuideDialog";

interface WorkspaceTopBarProps {
  onShowProjects: () => void;
  onShowSetup: () => void;
  onManageFixtures: () => void;
}

export function WorkspaceTopBar({ onShowProjects, onShowSetup, onManageFixtures }: WorkspaceTopBarProps) {
  const projectName = useShowStore((state) => state.projectName);
  const projectPath = useShowStore((state) => state.projectPath);
  const mode = useShowStore((state) => state.mode);
  const setMode = useShowStore((state) => state.setMode);
  const stageView = useShowStore((state) => state.stageView);
  const setStageView = useShowStore((state) => state.setStageView);
  const blackout = useShowStore((state) => state.blackout);
  const toggleBlackout = useShowStore((state) => state.toggleBlackout);
  const blind = useShowStore((state) => state.blind);
  const toggleBlind = useShowStore((state) => state.toggleBlind);
  const freeze = useShowStore((state) => state.freeze);
  const toggleFreeze = useShowStore((state) => state.toggleFreeze);
  const connected = useShowStore((state) => state.engineConnected);
  const engineError = useShowStore((state) => state.engineError);
  const openProject = useShowStore((state) => state.openProject);
  const saveProjectAs = useShowStore((state) => state.saveProjectAs);
  const [menuOpen, setMenuOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  return (
    <header className="workspace-topbar">
      <div className="mac-traffic" aria-hidden="true"><i /><i /><i /></div>
      <div className="workspace-project-menu" ref={menuRef}>
        <button className="workspace-project-button" onClick={() => setMenuOpen((value) => !value)}><span className="mini-lighthouse">⌂</span><div><strong>{projectName}</strong><small><i className={`status-dot ${connected ? "is-good" : "is-error"}`} /> {connected ? outputLabel(projectPath) : "Engine reconnecting"}</small></div><b>⌄</b></button>
        {menuOpen && <div className="workspace-project-popover"><small title={projectPath}>{projectPath || "Preview project"}</small><button onClick={() => { setMenuOpen(false); onShowProjects(); }}>▦ Project Browser</button><button onClick={() => { setMenuOpen(false); onShowSetup(); }}>✓ Project Setup…</button><button onClick={() => { setMenuOpen(false); onManageFixtures(); }}>◉ Manage Fixtures…</button><hr /><button onClick={() => { setMenuOpen(false); void openProject(); }}>↗ Open Project…</button><button onClick={() => { setMenuOpen(false); void saveProjectAs(); }}>⇩ Save As…</button></div>}
      </div>

      <div className="override-pill"><span>No overrides</span><button className={blind ? "is-active" : ""} onClick={toggleBlind} title="Blind mode">◉</button><button className={freeze ? "is-active" : ""} onClick={toggleFreeze} title="Freeze output">✋</button></div>

      <div className="stage-view-switch" role="group" aria-label="Stage orientation"><button className={stageView === "front" ? "is-active" : ""} onClick={() => setStageView("front")}>Front</button><button className={stageView === "top" ? "is-active" : ""} onClick={() => setStageView("top")}>Top</button></div>

      <div className="workspace-mode-switch" role="group" aria-label="Workspace mode"><button className={mode === "edit" ? "is-active" : ""} onClick={() => setMode("edit")}>Design</button><button className={mode === "live" ? "is-live" : ""} onClick={() => setMode("live")}>Live</button></div>

      <div className="workspace-top-actions"><button title="Manage Fixtures" onClick={onManageFixtures}>＋</button><button title="Output Settings" onClick={() => setOutputOpen(true)}>⌁</button><button title="Open Live Window" onClick={() => { void openLiveDisplay(); }}>▣</button><button title="User Guide" onClick={() => setGuideOpen(true)}>?</button></div>
      <button className={`workspace-blackout ${blackout ? "is-active" : ""}`} onClick={toggleBlackout}>BLACKOUT</button>
      {engineError && <span className="workspace-engine-error" title={engineError}>!</span>}
      {outputOpen && <OutputSettingsDialog onClose={() => setOutputOpen(false)} />}
      {guideOpen && <UserGuideDialog onClose={() => setGuideOpen(false)} />}
    </header>
  );
}

function outputLabel(projectPath: string): string {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`lighthouse.output.${projectPath || "preview"}`) ?? "null") as { kind?: string } | null;
    if (saved?.kind === "usb") return "USB-DMX · DOREMiDi";
    if (saved?.kind === "none") return "No DMX Output";
  } catch {
    // Invalid optional UI preference falls back to the engine route label.
  }
  return "Art-Net · Engine connected";
}
