import type { CSSProperties } from "react";

import { useShowStore } from "../store/showStore";

export function ScenePanel() {
  const scenes = useShowStore((state) => state.scenes);
  const activateScene = useShowStore((state) => state.activateScene);
  const blind = useShowStore((state) => state.blind);
  const freeze = useShowStore((state) => state.freeze);
  const toggleBlind = useShowStore((state) => state.toggleBlind);
  const toggleFreeze = useShowStore((state) => state.toggleFreeze);
  const goNextCue = useShowStore((state) => state.goNextCue);
  const backCue = useShowStore((state) => state.backCue);
  const toggleCuePause = useShowStore((state) => state.toggleCuePause);
  const cuePaused = useShowStore((state) => state.cuePaused);
  const cueCursor = useShowStore((state) => state.cueCursor);

  return (
    <section className="scene-panel" aria-label="Scenes and cue list">
      <div className="scene-panel-header">
        <div className="scene-tabs"><button className="is-active">SCENES</button><button>CUE LIST</button><button>EFFECTS</button></div>
        <div className="scene-tools">
          <button className={blind ? "is-active" : ""} onClick={toggleBlind}>BLIND</button>
          <button className={freeze ? "is-active" : ""} onClick={toggleFreeze}>FREEZE</button>
          <button>＋ SCENE</button>
        </div>
      </div>
      <div className="playback-row">
        <div className="transport-controls">
          <button title="Previous cue" onClick={backCue}>◀ BACK</button>
          <button title={cuePaused ? "Resume cue list" : "Pause cue list"} className={cuePaused ? "is-active" : ""} onClick={toggleCuePause}>{cuePaused ? "▶" : "Ⅱ"}</button>
          <button className="go-button" onClick={goNextCue}>GO <span>{cueCursor === null ? "›" : cueCursor + 2}</span></button>
        </div>
        <div className="scene-grid">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              className={`scene-tile ${scene.active ? "is-active" : ""}`}
              onClick={() => activateScene(scene.id)}
              style={{ "--scene-color": scene.color } as CSSProperties}
            >
              <span className="scene-number">{scene.number}</span>
              <strong>{scene.name}</strong>
              <small>{(scene.fadeMs / 1000).toFixed(1)} s fade</small>
              <i />
            </button>
          ))}
          <button className="scene-tile add-scene"><span>＋</span><strong>Capture Scene</strong><small>Partial by default</small></button>
        </div>
      </div>
    </section>
  );
}
