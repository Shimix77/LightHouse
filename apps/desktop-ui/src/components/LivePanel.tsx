import { useMemo, useState } from "react";
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from "react";

import { useShowStore } from "../store/showStore";
import type { LiveControlSummary } from "../types/show";

type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
type Layout = Pick<LiveControlSummary, "gridX" | "gridY" | "width" | "height" | "color" | "behavior" | "controlType" | "fadeInMs" | "fadeOutMs" | "dimmer" | "beatMultiplier">;

export function LivePanel() {
  const controls = useShowStore((state) => state.liveControls);
  const livePage = useShowStore((state) => state.livePage);
  const scenes = useShowStore((state) => state.scenes);
  const effects = useShowStore((state) => state.effects);
  const trigger = useShowStore((state) => state.triggerLiveControl);
  const release = useShowStore((state) => state.releaseLiveControl);
  const setLevel = useShowStore((state) => state.setLiveControlLevel);
  const remove = useShowStore((state) => state.deleteLiveControl);
  const setPage = useShowStore((state) => state.setLivePage);
  const persistLayout = useShowStore((state) => state.updateLiveControlLayout);
  const addLiveControl = useShowStore((state) => state.addLiveControl);
  const [editing, setEditing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, Layout>>({});
  const [levels, setLevels] = useState<Record<string, number>>({});
  const pageControls = controls.filter((control) => control.page === livePage);
  const maxPage = useMemo(() => Math.max(1, ...controls.map((control) => control.page)), [controls]);
  const activeScenes = new Set(scenes.filter((scene) => scene.active).map((scene) => scene.id));
  const activeEffects = new Set(effects.filter((effect) => effect.active).map((effect) => effect.id));
  const selectedControl = pageControls.find((entry) => entry.id === selectedId);

  const layoutOf = (control: LiveControlSummary): Layout => drafts[control.id] ?? control;
  const commit = async (control: LiveControlSummary, next: Layout) => {
    setDrafts((current) => ({ ...current, [control.id]: next }));
    const saved = await persistLayout(control.id, next);
    if (saved) setDrafts((current) => { const copy = { ...current }; delete copy[control.id]; return copy; });
  };

  const beginGesture = (event: ReactPointerEvent<HTMLElement>, control: LiveControlSummary, direction: ResizeDirection | "move") => {
    if (!editing) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(control.id);
    const grid = event.currentTarget.closest(".live-layout-grid") as HTMLElement | null;
    if (!grid) return;
    const bounds = grid.getBoundingClientRect();
    const cellWidth = bounds.width / 12;
    const rowHeight = 56;
    const initial = { ...layoutOf(control) };
    const startX = event.clientX;
    const startY = event.clientY;
    let latest = initial;

    const onMove = (move: PointerEvent) => {
      const dx = Math.round((move.clientX - startX) / cellWidth);
      const dy = Math.round((move.clientY - startY) / rowHeight);
      const next = { ...initial };
      if (direction === "move") {
        next.gridX = clamp(initial.gridX + dx, 0, 12 - initial.width);
        next.gridY = Math.max(0, initial.gridY + dy);
      } else {
        if (direction.includes("e")) next.width = clamp(initial.width + dx, 1, 12 - initial.gridX);
        if (direction.includes("s")) next.height = clamp(initial.height + dy, 1, 8);
        if (direction.includes("w")) {
          const x = clamp(initial.gridX + dx, 0, initial.gridX + initial.width - 1);
          next.width = initial.width + initial.gridX - x;
          next.gridX = x;
        }
        if (direction.includes("n")) {
          const y = clamp(initial.gridY + dy, 0, initial.gridY + initial.height - 1);
          next.height = initial.height + initial.gridY - y;
          next.gridY = y;
        }
      }
      if (overlapsOther(control.id, next, pageControls, drafts)) return;
      latest = next;
      setDrafts((current) => ({ ...current, [control.id]: next }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void commit(control, latest);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const updateSelected = (update: Partial<Layout>) => {
    if (!selectedControl) return;
    void commit(selectedControl, { ...layoutOf(selectedControl), ...update });
  };

  const acceptLiveDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const encoded = event.dataTransfer.getData("application/x-lighthouse-live-control");
    if (!encoded) return;
    try {
      const payload = JSON.parse(encoded) as { label?: string; sceneId?: string | null; effectId?: string | null };
      const sceneExists = payload.sceneId ? scenes.some((scene) => scene.id === payload.sceneId) : false;
      const effectExists = payload.effectId ? effects.some((effect) => effect.id === payload.effectId) : false;
      if (!payload.label || (!sceneExists && !effectExists)) return;
      addLiveControl(payload.label, sceneExists ? payload.sceneId! : null, effectExists ? payload.effectId! : null);
    } catch {
      // Ignore data dragged from outside LightHouse.
    }
  };

  const changeLevel = (control: LiveControlSummary, value: number) => {
    setLevels((current) => ({ ...current, [control.id]: value }));
    setLevel(control.id, value);
  };

  return (
    <section className={`live-control-panel ${editing ? "is-editing" : ""}`}>
      <header className="live-layout-header"><div><strong>LIVE PAGE {livePage}</strong><button disabled={livePage <= 1} onClick={() => setPage(livePage - 1)}>‹</button><button disabled={livePage >= maxPage} onClick={() => setPage(livePage + 1)}>›</button></div><div className="live-panel-mode"><span>Design</span><strong>Live</strong></div><div className="live-edit-controls"><button className={editing ? "is-active" : ""} onClick={() => setEditing(true)}>✎ Edit</button><button className={!editing ? "is-active" : ""} onClick={() => { setEditing(false); setSelectedId(undefined); }}>Done</button><span title={editing ? "Layout unlocked" : "Layout locked"}>{editing ? "⌗" : "🔒"}</span></div></header>
      <div className="live-panel-body">
        <div
          className={`live-layout-grid ${editing ? "is-editing" : ""} ${dragOver ? "is-drag-over" : ""}`}
          onDragEnter={(event) => { if (event.dataTransfer.types.includes("application/x-lighthouse-live-control")) setDragOver(true); }}
          onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-lighthouse-live-control")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false); }}
          onDrop={acceptLiveDrop}
        >
          {pageControls.map((control) => {
            const active = (control.sceneId ? activeScenes.has(control.sceneId) : false) || (control.effectId ? activeEffects.has(control.effectId) : false);
            const layout = layoutOf(control);
            const selected = selectedId === control.id;
            const level = levels[control.id] ?? (active ? layout.dimmer : 0);
            const style = { gridColumn: `${layout.gridX + 1} / span ${layout.width}`, gridRow: `${layout.gridY + 1} / span ${layout.height}`, "--live-color": layout.color } as CSSProperties;
            return <article className={`live-control type-${layout.controlType} ${active ? "is-active" : ""} ${selected ? "is-selected" : ""}`} style={style} key={control.id} onPointerDown={(event) => beginGesture(event, control, "move")}>
              {layout.controlType === "button" ? <LiveButton control={control} layout={layout} active={active} editing={editing} onSelect={() => setSelectedId(control.id)} onTrigger={() => trigger(control.id)} onRelease={() => release(control.id)} /> : <label className="live-fader" onPointerDown={(event) => { event.stopPropagation(); if (editing) { event.preventDefault(); setSelectedId(control.id); } }}><span>{control.label}</span><input aria-label={`${control.label} level`} className={layout.controlType === "faderVertical" ? "is-vertical" : ""} type="range" min={0} max={1} step={0.001} value={level} onChange={(event) => { if (!editing) changeLevel(control, Number(event.target.value)); }} /><output>{Math.round(level * 100)}%</output></label>}
              {editing && <><button className="live-remove" aria-label={`Remove ${control.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => remove(control.id)}>×</button>{(["n", "ne", "e", "se", "s", "sw", "w", "nw"] as ResizeDirection[]).map((direction) => <i className={`resize-handle handle-${direction}`} key={direction} onPointerDown={(event) => beginGesture(event, control, direction)} />)}{selected && <output className="live-size-readout">{layout.width} × {layout.height}</output>}</>}
            </article>;
          })}
          {pageControls.length === 0 && <div className="empty-live-grid"><span>＋</span><strong>Drop presets or effects here</strong><small>Drag a saved item from the Preset Palette.</small></div>}
        </div>
        {editing && selectedControl && <LiveInspector control={selectedControl} layout={layoutOf(selectedControl)} onChange={updateSelected} onClose={() => setSelectedId(undefined)} />}
      </div>
    </section>
  );
}

function LiveButton({ control, layout, active, editing, onSelect, onTrigger, onRelease }: { control: LiveControlSummary; layout: Layout; active: boolean; editing: boolean; onSelect: () => void; onTrigger: () => void; onRelease: () => void }) {
  return <button className="live-trigger" onPointerDown={(event) => { if (editing) event.preventDefault(); else if (layout.behavior === "flash") { event.currentTarget.setPointerCapture(event.pointerId); onTrigger(); } }} onPointerUp={onRelease} onPointerCancel={onRelease} onKeyDown={(event) => { if (!editing && layout.behavior === "flash" && !event.repeat && (event.key === " " || event.key === "Enter")) onTrigger(); }} onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") onRelease(); }} onClick={(event) => { if (editing) { event.preventDefault(); onSelect(); } else if (layout.behavior !== "flash") onTrigger(); }}><span>{control.sceneId ? "PRESET" : "EFFECT"}</span><strong>{control.label}</strong><i>{active ? "ACTIVE" : layout.behavior === "flash" ? "FLASH" : layout.behavior.toUpperCase()}</i>{active && <u />}</button>;
}

function LiveInspector({ control, layout, onChange, onClose }: { control: LiveControlSummary; layout: Layout; onChange: (update: Partial<Layout>) => void; onClose: () => void }) {
  return <aside className="live-control-inspector"><header><button onClick={onClose}>×</button><div><small>{control.sceneId ? "PRESET" : "EFFECT"}</small><strong>{control.label}</strong></div><i style={{ background: layout.color }} /></header><section><h3>Timing</h3><label><span>Fade In</span><input type="number" min={0} max={600} step={0.1} value={layout.fadeInMs / 1000} onChange={(event) => onChange({ fadeInMs: Math.round(Number(event.target.value) * 1000) })} /><small>s</small></label><label><span>Fade Out</span><input type="number" min={0} max={600} step={0.1} value={layout.fadeOutMs / 1000} onChange={(event) => onChange({ fadeOutMs: Math.round(Number(event.target.value) * 1000) })} /><small>s</small></label></section><section><h3>Button</h3><label><span>Type</span><select value={layout.controlType} onChange={(event) => onChange({ controlType: event.target.value as Layout["controlType"] })}><option value="button">Push Button</option><option value="faderHorizontal">Fader Horizontal</option><option value="faderVertical">Fader Vertical</option></select></label>{layout.controlType === "button" && <label><span>Behavior</span><select value={layout.behavior} onChange={(event) => onChange({ behavior: event.target.value as Layout["behavior"] })}><option value="toggle">Toggle</option><option value="flash">Flash / Momentary</option><option value="radio">Radio</option><option value="push">Push</option></select></label>}<label><span>Color</span><input type="color" value={layout.color} onChange={(event) => onChange({ color: event.target.value })} /></label></section><section><h3>Modifiers</h3><label><span>Dimmer</span><input type="range" min={0} max={1} step={0.01} value={layout.dimmer} onChange={(event) => onChange({ dimmer: Number(event.target.value) })} /><small>{Math.round(layout.dimmer * 100)}%</small></label><label><span>Beat Multiplier</span><select value={layout.beatMultiplier} onChange={(event) => onChange({ beatMultiplier: Number(event.target.value) })}><option value={0.5}>½ ×</option><option value={1}>1 ×</option><option value={2}>2 ×</option><option value={4}>4 ×</option></select></label></section><footer>Drag the control or any blue handle to resize it.</footer></aside>;
}

function overlapsOther(id: string, next: Layout, controls: LiveControlSummary[], drafts: Record<string, Layout>): boolean {
  return controls.some((control) => {
    if (control.id === id) return false;
    const other = drafts[control.id] ?? control;
    return next.gridX < other.gridX + other.width && next.gridX + next.width > other.gridX && next.gridY < other.gridY + other.height && next.gridY + next.height > other.gridY;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
