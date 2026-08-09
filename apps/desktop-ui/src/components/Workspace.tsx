import { useState } from "react";

import { useShowStore } from "../store/showStore";
import { FixtureControlDock } from "./FixtureControlDock";
import { Inspector } from "./Inspector";
import { LivePanel } from "./LivePanel";
import { MasterBeatPanel, ShortcutsPreview } from "./LiveUtilities";
import { PresetPalette } from "./PresetPalette";
import { ScenePanel } from "./ScenePanel";
import { StageEditor } from "./StageEditor";
import { StageToolbar } from "./StageToolbar";
import { WorkspaceTopBar } from "./WorkspaceTopBar";

interface WorkspaceProps {
  onShowProjects: () => void;
  onShowSetup: () => void;
  onManageFixtures: () => void;
}

export function Workspace(props: WorkspaceProps) {
  const mode = useShowStore((state) => state.mode);
  const connected = useShowStore((state) => state.engineConnected);
  const telemetry = useShowStore((state) => state.engineTelemetry);
  const engineError = useShowStore((state) => state.engineError);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showProgramming, setShowProgramming] = useState(false);

  return (
    <main className={`lighthouse-workspace is-${mode}`}>
      <WorkspaceTopBar {...props} />
      {mode === "edit" ? (
        <section className="design-workspace">
          <div className="design-stage-area"><StageToolbar /><StageEditor onFixtureDoubleClick={() => setSettingsOpen(true)} /></div>
          <PresetPalette />
          <div className="design-bottom-dock">
            <div className="dock-mode-switch"><button className={!showProgramming ? "is-active" : ""} onClick={() => setShowProgramming(false)}>Fixture Controls</button><button className={showProgramming ? "is-active" : ""} onClick={() => setShowProgramming(true)}>Scenes · Cues · Effects</button></div>
            {showProgramming ? <ScenePanel /> : <FixtureControlDock onOpenSettings={() => setSettingsOpen(true)} />}
          </div>
          <ShortcutsPreview />
        </section>
      ) : (
        <section className="live-workspace">
          <div className="live-stage-area"><StageEditor onFixtureDoubleClick={() => setSettingsOpen(true)} /></div>
          <PresetPalette />
          <MasterBeatPanel />
          <LivePanel />
          <ShortcutsPreview />
        </section>
      )}
      <footer className="workspace-statusbar"><span title={engineError}><i className={`status-dot ${connected ? "is-good" : "is-error"}`} /> {connected ? "Show Engine connected" : "Show Engine reconnecting"}</span><span>{telemetry.framesSent.toLocaleString()} frames</span><span>{telemetry.missedDeadlines} missed ticks</span><b /><span>⌘Z Undo</span><span>⇧B Blackout</span></footer>
      {settingsOpen && <div className="fixture-settings-overlay" role="presentation" onMouseDown={() => setSettingsOpen(false)}><div className="fixture-settings-window" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><header><div><small>FIXTURE SETTINGS</small><strong>Detailed Fixture Configuration</strong></div><button onClick={() => setSettingsOpen(false)}>Done</button></header><Inspector /></div></div>}
    </main>
  );
}
