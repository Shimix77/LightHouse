import { useState } from "react";
import type { CSSProperties } from "react";

import { useShowStore } from "../store/showStore";
import type { SceneSummary } from "../types/show";

type SceneTab = "scenes" | "cue" | "effects";

export function ScenePanel() {
  const [tab, setTab] = useState<SceneTab>("scenes");
  const [dialogScene, setDialogScene] = useState<SceneSummary | "new" | null>(null);
  const scenes = useShowStore((state) => state.scenes);
  const cueLists = useShowStore((state) => state.cueLists);
  const effects = useShowStore((state) => state.effects);
  const selectedFixtureIds = useShowStore((state) => state.selectedFixtureIds);
  const mode = useShowStore((state) => state.mode);
  const activateScene = useShowStore((state) => state.activateScene);
  const captureScene = useShowStore((state) => state.captureScene);
  const updateScene = useShowStore((state) => state.updateScene);
  const deleteScene = useShowStore((state) => state.deleteScene);
  const addCue = useShowStore((state) => state.addCue);
  const deleteCue = useShowStore((state) => state.deleteCue);
  const blind = useShowStore((state) => state.blind);
  const freeze = useShowStore((state) => state.freeze);
  const toggleBlind = useShowStore((state) => state.toggleBlind);
  const commitBlind = useShowStore((state) => state.commitBlind);
  const clearProgrammer = useShowStore((state) => state.clearProgrammer);
  const toggleFreeze = useShowStore((state) => state.toggleFreeze);
  const goNextCue = useShowStore((state) => state.goNextCue);
  const backCue = useShowStore((state) => state.backCue);
  const toggleCuePause = useShowStore((state) => state.toggleCuePause);
  const cuePaused = useShowStore((state) => state.cuePaused);
  const cueCursor = useShowStore((state) => state.cueCursor);
  const cueList = cueLists[0];

  return (
    <section className="scene-panel" aria-label="Scenes and cue list">
      <div className="scene-panel-header">
        <div className="scene-tabs">
          <button className={tab === "scenes" ? "is-active" : ""} onClick={() => setTab("scenes")}>SCENES</button>
          <button className={tab === "cue" ? "is-active" : ""} onClick={() => setTab("cue")}>CUE LIST</button>
          <button className={tab === "effects" ? "is-active" : ""} onClick={() => setTab("effects")}>EFFECTS</button>
        </div>
        <div className="scene-tools">
          <button className={blind ? "is-active" : ""} onClick={toggleBlind}>BLIND</button>
          {blind && <button title="Apply blind edits to the live programmer" onClick={commitBlind}>COMMIT</button>}
          {blind && <button title="Discard blind edits" onClick={clearProgrammer}>CLEAR</button>}
          <button className={freeze ? "is-active" : ""} onClick={toggleFreeze}>FREEZE</button>
          <button disabled={mode === "live"} onClick={() => setDialogScene("new")}>＋ SCENE</button>
        </div>
      </div>
      <div className="playback-row">
        <div className="transport-controls">
          <button title="Previous cue" onClick={backCue}>◀ BACK</button>
          <button title={cuePaused ? "Resume cue list" : "Pause cue list"} className={cuePaused ? "is-active" : ""} onClick={toggleCuePause}>{cuePaused ? "▶" : "Ⅱ"}</button>
          <button className="go-button" onClick={goNextCue}>GO <span>{cueCursor === null ? "›" : cueCursor + 2}</span></button>
        </div>

        {tab === "scenes" && (
          <div className="scene-grid">
            {scenes.map((scene) => (
              <div className="scene-card" key={scene.id}>
                <button className={`scene-tile ${scene.active ? "is-active" : ""}`} onClick={() => activateScene(scene.id)} style={{ "--scene-color": scene.color } as CSSProperties}>
                  <span className="scene-number">{scene.number}</span><strong>{scene.name}</strong><small>{(scene.fadeMs / 1000).toFixed(1)} s fade</small><i />
                </button>
                <div className="scene-card-actions">
                  <button disabled={mode === "live"} title="Edit scene" onClick={() => setDialogScene(scene)}>✎</button>
                  <button disabled={mode === "live"} title="Add to cue list" onClick={() => addCue(scene.id)}>＋ CUE</button>
                </div>
              </div>
            ))}
            <button disabled={mode === "live"} className="scene-tile add-scene" onClick={() => setDialogScene("new")}><span>＋</span><strong>Capture Scene</strong><small>{selectedFixtureIds.length > 0 ? `${selectedFixtureIds.length} selected fixtures` : "All fixtures"}</small></button>
          </div>
        )}

        {tab === "cue" && (
          <div className="cue-editor-list">
            <header><span>{cueList?.name ?? "Main Show"}</span><small>{cueList?.entries.length ?? 0} cues</small></header>
            {cueList?.entries.map((entry, index) => (
              <div className={`cue-editor-row ${cueCursor === index ? "is-current" : ""}`} key={`${entry.sceneId}-${index}`}>
                <strong>{entry.number}</strong><span><b>{entry.name}</b><small>{entry.fadeMs === null ? "Scene fade" : `${entry.fadeMs / 1000} s`}</small></span>
                <button disabled={mode === "live"} aria-label={`Delete cue ${entry.number}`} onClick={() => deleteCue(cueList.id, index)}>×</button>
              </div>
            ))}
            {!cueList?.entries.length && <div className="empty-strip">Add a scene to build the cue list.</div>}
          </div>
        )}

        {tab === "effects" && (
          <div className="effect-library-strip">
            {effects.map((effect) => <div key={effect.id}><span>∿</span><strong>{effect.name}</strong><small>{effect.template.replaceAll("-", " ")} · {effect.beatSync ? "Beat sync" : effect.targetParameter}</small></div>)}
            {effects.length === 0 && <div className="empty-strip">No effects configured.</div>}
          </div>
        )}
      </div>

      {dialogScene && (
        <SceneDialog
          scene={dialogScene === "new" ? undefined : dialogScene}
          selectedCount={selectedFixtureIds.length}
          onClose={() => setDialogScene(null)}
          onSave={(name, fadeMs) => {
            if (dialogScene === "new") captureScene(name, fadeMs);
            else updateScene(dialogScene.id, name, fadeMs);
            setDialogScene(null);
          }}
          onDelete={dialogScene === "new" ? undefined : () => { deleteScene(dialogScene.id); setDialogScene(null); }}
        />
      )}
    </section>
  );
}

function SceneDialog({ scene, selectedCount, onClose, onSave, onDelete }: { scene: SceneSummary | undefined; selectedCount: number; onClose: () => void; onSave: (name: string, fadeMs: number) => void; onDelete: (() => void) | undefined }) {
  const [name, setName] = useState(scene?.name ?? "");
  const [fadeSeconds, setFadeSeconds] = useState((scene?.fadeMs ?? 1_000) / 1_000);
  return (
    <div className="fixture-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="fixture-dialog scene-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSave(name || "Scene", Math.round(Math.max(0, Math.min(600, fadeSeconds)) * 1_000)); }}>
        <header><div><small>{scene ? "SCENE PROPERTIES" : "CAPTURE LOGICAL PARAMETERS"}</small><h2>{scene ? "Edit Scene" : "Capture Scene"}</h2></div><button type="button" onClick={onClose}>×</button></header>
        <label><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="New Scene" /></label>
        <label><span>Default fade (seconds)</span><input type="number" min={0} max={600} step={0.1} value={fadeSeconds} onChange={(event) => setFadeSeconds(Number(event.target.value))} /></label>
        <p>{scene ? "Changes apply to future scene activations." : selectedCount > 0 ? `Captures logical parameters from ${selectedCount} selected fixtures.` : "No fixture is selected, so all fixture parameters will be captured."}</p>
        <footer>{onDelete ? <button className="danger" type="button" onClick={onDelete}>Delete Scene</button> : <button type="button" onClick={onClose}>Cancel</button>}<button className="primary" type="submit">{scene ? "Save Changes" : "Capture Scene"}</button></footer>
      </form>
    </div>
  );
}
