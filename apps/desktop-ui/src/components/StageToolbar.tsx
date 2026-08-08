import { useMemo, useRef, useState } from "react";

import { useShowStore } from "../store/showStore";

export function StageToolbar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const undo = useShowStore((state) => state.undo);
  const redo = useShowStore((state) => state.redo);
  const duplicate = useShowStore((state) => state.duplicateSelection);
  const copy = useShowStore((state) => state.copySelection);
  const paste = useShowStore((state) => state.pasteSelection);
  const importBackground = useShowStore((state) => state.importBackground);
  const removeBackground = useShowStore((state) => state.removeBackground);
  const background = useShowStore((state) => state.background);
  const snapEnabled = useShowStore((state) => state.snapEnabled);
  const toggleSnap = useShowStore((state) => state.toggleSnap);
  const stageTool = useShowStore((state) => state.stageTool);
  const setStageTool = useShowStore((state) => state.setStageTool);
  const gridEnabled = useShowStore((state) => state.gridEnabled);
  const toggleGrid = useShowStore((state) => state.toggleGrid);
  const selectFixtures = useShowStore((state) => state.selectFixtures);
  const selectStageObjects = useShowStore((state) => state.selectStageObjects);
  const [layersOpen, setLayersOpen] = useState(false);
  const fixtures = useShowStore((state) => state.fixtures);
  const stageObjects = useShowStore((state) => state.stageObjects);
  const layerCount = new Set([
    ...fixtures.map((fixtureItem) => fixtureItem.layer),
    ...stageObjects.map((stageObject) => stageObject.layer),
  ]).size;
  const layers = useMemo(() => {
    const entries = new Map<string, { fixtures: string[]; objects: string[] }>();
    for (const fixtureItem of fixtures) {
      const layer = entries.get(fixtureItem.layer) ?? { fixtures: [], objects: [] };
      layer.fixtures.push(fixtureItem.id);
      entries.set(fixtureItem.layer, layer);
    }
    for (const stageObject of stageObjects) {
      const layer = entries.get(stageObject.layer) ?? { fixtures: [], objects: [] };
      layer.objects.push(stageObject.id);
      entries.set(stageObject.layer, layer);
    }
    return [...entries.entries()];
  }, [fixtures, stageObjects]);

  return (
    <div className="stage-toolbar" role="toolbar" aria-label="Stage tools">
      <div className="tool-group">
        <button className={stageTool === "select" ? "is-active" : ""} title="Select" onClick={() => setStageTool("select")}>↖</button>
        <button className={stageTool === "pan" ? "is-active" : ""} title="Pan" onClick={() => setStageTool("pan")}>✋</button>
        <button className={stageTool === "rectangle" ? "is-active" : ""} title="Rectangle selection" onClick={() => setStageTool("rectangle")}>▱</button>
      </div>
      <div className="tool-separator" />
      <div className="tool-group">
        <button onClick={undo} title="Undo">↶</button>
        <button onClick={redo} title="Redo">↷</button>
        <button onClick={copy} title="Copy selection (⌘C)">⧉</button>
        <button onClick={paste} title="Paste (⌘V)">▣</button>
        <button onClick={duplicate} title="Duplicate selection (⌘D)">⧈</button>
      </div>
      <div className="tool-separator" />
      <button className={`wide-tool ${gridEnabled ? "is-active" : ""}`} onClick={toggleGrid}># GRID <span>{gridEnabled ? "1 m" : "OFF"}</span></button>
      <button className={`wide-tool ${snapEnabled ? "is-active" : ""}`} onClick={toggleSnap}>⌁ SNAP <span>{snapEnabled ? "ON" : "OFF"}</span></button>
      <div className="stage-layers-control">
        <button className={`wide-tool ${layersOpen ? "is-active" : ""}`} onClick={() => setLayersOpen((open) => !open)}>▱ LAYERS <span>{layerCount}</span></button>
        {layersOpen && <div className="stage-layer-popover"><header>STAGE LAYERS</header>{layers.map(([name, members]) => <button key={name} onClick={() => { if (members.fixtures.length > 0) selectFixtures(members.fixtures); else selectStageObjects(members.objects); setLayersOpen(false); }}><span>▱</span><strong>{name}</strong><small>{members.fixtures.length + members.objects.length}</small></button>)}{layers.length === 0 && <p>No layers yet.</p>}</div>}
      </div>
      <div className="toolbar-spacer" />
      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/png,image/jpeg"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void importBackground(file);
          event.currentTarget.value = "";
        }}
      />
      {background ? (
        <button
          className="background-chip"
          title={background.name}
          onClick={() => {
            removeBackground();
          }}
        >
          ◫ {background.name} <span>×</span>
        </button>
      ) : (
        <button className="background-chip" onClick={() => inputRef.current?.click()}>◫ ADD FLOOR PLAN</button>
      )}
    </div>
  );
}
