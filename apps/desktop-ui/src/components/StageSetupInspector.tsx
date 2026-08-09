import { useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useShowStore } from "../store/showStore";

export function StageSetupInspector() {
  const fixtures = useShowStore((state) => state.fixtures);
  const selectedIds = useShowStore((state) => state.selectedFixtureIds);
  const updateSelected = useShowStore((state) => state.updateSelectedFixtures);
  const capture = useShowStore((state) => state.captureFixtureHistory);
  const selectedObjects = useShowStore((state) => state.selectedStageObjectIds);
  const [directionOpen, setDirectionOpen] = useState(false);
  const primary = fixtures.find((fixture) => selectedIds.includes(fixture.id));

  if (!primary) {
    return <section className="stage-setup-inspector is-empty"><span>{selectedObjects.length > 0 ? "◇" : "◉"}</span><strong>{selectedObjects.length > 0 ? "Stage object selected" : "Select a fixture"}</strong><small>{selectedObjects.length > 0 ? "Move, resize or rotate it directly on the Stage." : "Fixture and beam settings appear here."}</small></section>;
  }

  const changeDirection = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    capture();
    const updateFromPointer = (clientX: number, clientY: number) => {
      const bounds = element.getBoundingClientRect();
      const angle = Math.atan2(clientY - (bounds.top + bounds.height / 2), clientX - (bounds.left + bounds.width / 2)) * 180 / Math.PI + 90;
      updateSelected({ rotation: (angle + 360) % 360 });
    };
    updateFromPointer(event.clientX, event.clientY);
    const move = (next: PointerEvent) => updateFromPointer(next.clientX, next.clientY);
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  return (
    <section className="stage-setup-inspector">
      <header><i style={{ background: primary.color }} /><span><strong>{primary.name}</strong><small>U{primary.universe} · {primary.address}</small></span></header>
      <button className="beam-direction-button" onClick={() => setDirectionOpen((open) => !open)}>Beam Direction <span>›</span></button>
      {directionOpen && <div className="beam-direction-editor"><div className="beam-direction-dial" onPointerDown={changeDirection}><i style={{ transform: `rotate(${primary.rotation}deg)`, background: primary.color }} /><b style={{ background: primary.color }} /></div><div><strong>{Math.round(primary.rotation)}°</strong><small>Drag around the circle</small></div><label><span>Beam width</span><input type="range" min={0} max={1} step={0.01} value={primary.zoom} onPointerDown={capture} onChange={(event) => updateSelected({ zoom: Number(event.target.value) })} /></label><button onClick={() => setDirectionOpen(false)}>Done</button></div>}
      <label className="stage-inspector-range"><span>Preview intensity</span><input type="range" min={0} max={1} step={0.01} value={primary.intensity} onPointerDown={capture} onChange={(event) => updateSelected({ intensity: Number(event.target.value) })} /><output>{Math.round(primary.intensity * 100)}%</output></label>
      <div className="stage-inspector-actions"><button onClick={() => { capture(); updateSelected({ hidden: !primary.hidden }); }}>{primary.hidden ? "Show fixture" : "Hide fixture"}</button><button onClick={() => { capture(); updateSelected({ locked: !primary.locked }); }}>{primary.locked ? "Unlock" : "Lock"}</button></div>
    </section>
  );
}
