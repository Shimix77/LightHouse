import { getCurrentWindow } from "@tauri-apps/api/window";

import { hasNativeEngine } from "../services/engineClient";

type WindowAction = "close" | "minimize" | "fullscreen";

export function MacWindowControls() {
  const run = async (action: WindowAction) => {
    if (!hasNativeEngine()) return;
    const currentWindow = getCurrentWindow();
    try {
      if (action === "close") await currentWindow.close();
      else if (action === "minimize") await currentWindow.minimize();
      else await currentWindow.setFullscreen(!(await currentWindow.isFullscreen()));
    } catch (error) {
      console.error(`Could not ${action} the LightHouse window`, error);
    }
  };

  return (
    <div className="mac-traffic" role="group" aria-label="Window controls">
      <button className="mac-close" aria-label="Close window" title="Close" onClick={() => { void run("close"); }}><i /></button>
      <button className="mac-minimize" aria-label="Minimize window" title="Minimize" onClick={() => { void run("minimize"); }}><i /></button>
      <button className="mac-zoom" aria-label="Toggle full screen" title="Full Screen" onClick={() => { void run("fullscreen"); }}><i /></button>
    </div>
  );
}
