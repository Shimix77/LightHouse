import { useMemo } from "react";

import { useShowStore } from "../store/showStore";

export function LivePanel() {
  const controls = useShowStore((state) => state.liveControls);
  const livePage = useShowStore((state) => state.livePage);
  const scenes = useShowStore((state) => state.scenes);
  const effects = useShowStore((state) => state.effects);
  const mode = useShowStore((state) => state.mode);
  const trigger = useShowStore((state) => state.triggerLiveControl);
  const remove = useShowStore((state) => state.deleteLiveControl);
  const setPage = useShowStore((state) => state.setLivePage);
  const pageControls = controls
    .filter((control) => control.page === livePage)
    .sort((left, right) => left.position - right.position);
  const maxPage = useMemo(
    () => Math.max(1, ...controls.map((control) => control.page)),
    [controls],
  );
  const activeScenes = new Set(scenes.filter((scene) => scene.active).map((scene) => scene.id));
  const activeEffects = new Set(effects.filter((effect) => effect.active).map((effect) => effect.id));

  return (
    <div className="live-control-panel">
      <div className="live-page-rail">
        <strong>PAGE {livePage}</strong>
        <button disabled={livePage <= 1} onClick={() => setPage(livePage - 1)}>‹</button>
        <button disabled={livePage >= maxPage} onClick={() => setPage(livePage + 1)}>›</button>
      </div>
      <div className="live-control-grid">
        {pageControls.map((control) => {
          const active = (control.sceneId ? activeScenes.has(control.sceneId) : false)
            || (control.effectId ? activeEffects.has(control.effectId) : false);
          return (
            <div className={`live-control ${active ? "is-active" : ""}`} key={control.id}>
              <button className="live-trigger" onClick={() => trigger(control.id)}><span>{control.sceneId ? "SCENE" : "EFFECT"}</span><strong>{control.label}</strong><i>{active ? "ACTIVE" : "READY"}</i></button>
              {mode === "edit" && <button className="live-remove" aria-label={`Remove ${control.label} from Live panel`} onClick={() => remove(control.id)}>×</button>}
            </div>
          );
        })}
        {pageControls.length === 0 && <div className="empty-strip">Add scenes or effects with “+ LIVE” while in EDIT mode.</div>}
      </div>
    </div>
  );
}
