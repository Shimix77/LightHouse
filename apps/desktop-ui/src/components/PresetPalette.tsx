import { useState } from "react";
import type { ReactNode } from "react";

import { useShowStore } from "../store/showStore";

const quickColors = [
  ["Deep Blue", "#1768e5"], ["Cyan", "#18cbe8"], ["Magenta", "#df45c9"],
  ["Amber", "#ffad3f"], ["White", "#ffffff"],
] as const;

export function PresetPalette() {
  const scenes = useShowStore((state) => state.scenes);
  const effects = useShowStore((state) => state.effects);
  const groups = useShowStore((state) => state.groups);
  const selectedFixtureIds = useShowStore((state) => state.selectedFixtureIds);
  const selectFixtures = useShowStore((state) => state.selectFixtures);
  const capture = useShowStore((state) => state.captureFixtureHistory);
  const updateSelected = useShowStore((state) => state.updateSelectedFixtures);
  const activateScene = useShowStore((state) => state.activateScene);
  const toggleEffect = useShowStore((state) => state.toggleEffect);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setCollapsed((current) => ({ ...current, [key]: !current[key] }));

  return (
    <aside className="preset-palette">
      <header><strong>PRESET PALETTE</strong><button title="Preset options">•••</button></header>
      <PaletteGroup label="Colors" collapsed={Boolean(collapsed.colors)} onToggle={() => toggle("colors")}>
        {quickColors.map(([name, color]) => <button className="palette-row" key={name} onClick={() => { capture(); updateSelected({ color }); }}><i style={{ background: color }} /><span>{name}</span><b>☆</b></button>)}
      </PaletteGroup>
      <PaletteGroup label="Positions" collapsed={Boolean(collapsed.positions)} onToggle={() => toggle("positions")}>
        <button className="palette-row" onClick={() => { capture(); updateSelected({ pan: 0.2, tilt: 0.5 }); }}><i>◌</i><span>Stage Left</span><b>☆</b></button>
        <button className="palette-row" onClick={() => { capture(); updateSelected({ pan: 0.5, tilt: 0.48 }); }}><i>◎</i><span>Center Stage</span><b>☆</b></button>
        <button className="palette-row" onClick={() => { capture(); updateSelected({ pan: 0.8, tilt: 0.5 }); }}><i>◌</i><span>Stage Right</span><b>☆</b></button>
      </PaletteGroup>
      <PaletteGroup label="Scenes" collapsed={Boolean(collapsed.scenes)} onToggle={() => toggle("scenes")}>
        {scenes.map((scene) => <button className={`palette-row ${scene.active ? "is-active" : ""}`} key={scene.id} onClick={() => activateScene(scene.id)}><i style={{ background: scene.color }}>◼</i><span>{scene.name}</span><b>{scene.active ? "●" : "○"}</b></button>)}
      </PaletteGroup>
      <PaletteGroup label="Effects" collapsed={Boolean(collapsed.effects)} onToggle={() => toggle("effects")}>
        {effects.map((effect) => <button className={`palette-row ${effect.active ? "is-active" : ""}`} key={effect.id} onClick={() => toggleEffect(effect.id)}><i>∿</i><span>{effect.name}</span><b>{effect.active ? "●" : "○"}</b></button>)}
        {effects.length === 0 && <p className="palette-empty">Create effects in Design mode.</p>}
      </PaletteGroup>
      {groups.length > 0 && <PaletteGroup label="Fixture Groups" collapsed={Boolean(collapsed.groups)} onToggle={() => toggle("groups")}>
        {groups.map((group) => <button className={`palette-row ${group.fixtureIds.every((id) => selectedFixtureIds.includes(id)) ? "is-active" : ""}`} key={group.id} onClick={() => selectFixtures(group.fixtureIds)}><i>◎</i><span>{group.name}</span><b>{group.fixtureIds.length}</b></button>)}
      </PaletteGroup>}
    </aside>
  );
}

function PaletteGroup({ label, collapsed, onToggle, children }: { label: string; collapsed: boolean; onToggle: () => void; children: ReactNode }) {
  return <section className="palette-group"><button className="palette-group-heading" onClick={onToggle}><span>{collapsed ? "›" : "⌄"}</span><strong>{label}</strong></button>{!collapsed && <div>{children}</div>}</section>;
}
