import { useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { useShowStore } from "../store/showStore";
import type { SceneSummary } from "../types/show";

type CaptureKind = "selection" | "snapshot";

export function PresetPalette() {
  const scenes = useShowStore((state) => state.scenes);
  const effects = useShowStore((state) => state.effects);
  const groups = useShowStore((state) => state.groups);
  const selectedFixtureIds = useShowStore((state) => state.selectedFixtureIds);
  const selectFixtures = useShowStore((state) => state.selectFixtures);
  const activateScene = useShowStore((state) => state.activateScene);
  const toggleEffect = useShowStore((state) => state.toggleEffect);
  const captureScene = useShowStore((state) => state.captureScene);
  const captureSceneSnapshot = useShowStore((state) => state.captureSceneSnapshot);
  const recaptureScene = useShowStore((state) => state.recaptureScene);
  const updateScene = useShowStore((state) => state.updateScene);
  const deleteScene = useShowStore((state) => state.deleteScene);
  const putGroup = useShowStore((state) => state.putGroup);
  const addCue = useShowStore((state) => state.addCue);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [captureKind, setCaptureKind] = useState<CaptureKind>();
  const [captureName, setCaptureName] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [context, setContext] = useState<{ x: number; y: number; scene: SceneSummary }>();
  const menuRef = useRef<HTMLDivElement>(null);
  const toggle = (key: string) => setCollapsed((current) => ({ ...current, [key]: !current[key] }));

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setAddMenuOpen(false);
      setContext(undefined);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const beginLiveDrag = (
    event: DragEvent<HTMLButtonElement>,
    payload: { label: string; sceneId: string | null; effectId: string | null },
  ) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-lighthouse-live-control", JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", payload.label);
  };

  const beginCapture = (kind: CaptureKind) => {
    setCaptureKind(kind);
    setCaptureName(`Preset ${scenes.length + 1}`);
    setAddMenuOpen(false);
  };

  const commitCapture = () => {
    const name = captureName.trim() || `Preset ${scenes.length + 1}`;
    if (captureKind === "snapshot") captureSceneSnapshot(name, 500);
    else captureScene(name, 500);
    setCaptureKind(undefined);
    setCaptureName("");
  };

  const openContext = (event: ReactMouseEvent, scene: SceneSummary) => {
    event.preventDefault();
    event.stopPropagation();
    setContext({ x: event.clientX, y: event.clientY, scene });
  };

  return (
    <aside className="preset-palette lightkey-preset-palette">
      <header><strong>PRESET PALETTE</strong><div ref={menuRef}><button title="Add preset, group or sequence" onClick={() => setAddMenuOpen((open) => !open)}>＋</button>{addMenuOpen && <div className="preset-add-menu"><button disabled={selectedFixtureIds.length === 0} onClick={() => beginCapture("selection")}>New Preset</button><button onClick={() => beginCapture("snapshot")}>New Preset With Snapshot</button><hr /><button disabled={selectedFixtureIds.length === 0} onClick={() => { putGroup(null, `Group ${groups.length + 1}`, selectedFixtureIds); setAddMenuOpen(false); }}>New Group From Selection</button><button disabled={scenes.length === 0} onClick={() => { const scene = scenes.at(-1); if (scene) addCue(scene.id); setAddMenuOpen(false); }}>New Sequence From Last Preset</button></div>}</div></header>
      {captureKind && <div className="preset-capture-row"><i style={{ background: captureKind === "snapshot" ? "#ff8091" : "#6bb7ff" }} /><input autoFocus value={captureName} onChange={(event) => setCaptureName(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") commitCapture(); if (event.key === "Escape") setCaptureKind(undefined); }} onBlur={commitCapture} /><small>{captureKind === "snapshot" ? "SNAPSHOT" : `${selectedFixtureIds.length} SELECTED`}</small></div>}
      {scenes.length === 0 && effects.length === 0 && !captureKind ? <div className="preset-empty-state"><span>◫</span><strong>Preset Palette</strong><p>Set fixture properties, then use ＋ to save the current look.</p><button disabled={selectedFixtureIds.length === 0} onClick={() => beginCapture("selection")}>New Preset</button></div> : <>
        <PaletteGroup label="Presets" collapsed={Boolean(collapsed.scenes)} onToggle={() => toggle("scenes")}>
          {scenes.map((scene) => editingId === scene.id ? <div className="preset-rename-row" key={scene.id}><i style={{ background: scene.color }} /><input autoFocus defaultValue={scene.name} onKeyDown={(event) => { if (event.key === "Enter") { updateScene(scene.id, event.currentTarget.value, scene.fadeMs); setEditingId(undefined); } if (event.key === "Escape") setEditingId(undefined); }} onBlur={(event) => { updateScene(scene.id, event.currentTarget.value, scene.fadeMs); setEditingId(undefined); }} /></div> : <button className={`palette-row ${scene.active ? "is-active" : ""}`} draggable key={scene.id} onDragStart={(event) => beginLiveDrag(event, { label: scene.name, sceneId: scene.id, effectId: null })} onContextMenu={(event) => openContext(event, scene)} onClick={() => activateScene(scene.id)}><i style={{ background: scene.color }} /><span>{scene.name}</span><b>{scene.active ? "●" : "○"}</b></button>)}
        </PaletteGroup>
        {effects.length > 0 && <PaletteGroup label="Effects" collapsed={Boolean(collapsed.effects)} onToggle={() => toggle("effects")}>
          {effects.map((effect) => <button className={`palette-row ${effect.active ? "is-active" : ""}`} draggable key={effect.id} onDragStart={(event) => beginLiveDrag(event, { label: effect.name, sceneId: null, effectId: effect.id })} onClick={() => toggleEffect(effect.id)}><i>∿</i><span>{effect.name}</span><b>{effect.active ? "●" : "○"}</b></button>)}
        </PaletteGroup>}
        {groups.length > 0 && <PaletteGroup label="Fixture Groups" collapsed={Boolean(collapsed.groups)} onToggle={() => toggle("groups")}>
          {groups.map((group) => <button className={`palette-row ${group.fixtureIds.every((id) => selectedFixtureIds.includes(id)) ? "is-active" : ""}`} key={group.id} onClick={() => selectFixtures(group.fixtureIds)}><i>◎</i><span>{group.name}</span><b>{group.fixtureIds.length}</b></button>)}
        </PaletteGroup>}
      </>}
      {context && <div className="preset-context-menu" style={{ left: context.x, top: context.y }} onPointerDown={(event) => event.stopPropagation()}><button onClick={() => { activateScene(context.scene.id); setContext(undefined); }}>Apply</button><button onClick={() => { recaptureScene(context.scene.id); setContext(undefined); }}>Update From Current State</button><button onClick={() => { setEditingId(context.scene.id); setContext(undefined); }}>Rename</button><button onClick={() => { addCue(context.scene.id); setContext(undefined); }}>Add to Cue List</button><hr /><button className="is-danger" onClick={() => { if (window.confirm(`Delete preset “${context.scene.name}”?`)) deleteScene(context.scene.id); setContext(undefined); }}>Delete…</button></div>}
      <footer>Drag presets and effects into Live View.</footer>
    </aside>
  );
}

function PaletteGroup({ label, collapsed, onToggle, children }: { label: string; collapsed: boolean; onToggle: () => void; children: ReactNode }) {
  return <section className="palette-group"><button className="palette-group-heading" onClick={onToggle}><span>{collapsed ? "›" : "⌄"}</span><strong>{label}</strong></button>{!collapsed && <div>{children}</div>}</section>;
}
