import { useMemo, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import { useShowStore } from "../store/showStore";
import type { LiveControlSummary } from "../types/show";

type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
type Layout = Pick<LiveControlSummary, "gridX" | "gridY" | "width" | "height" | "color" | "behavior">;

export function LivePanel() {
  const controls = useShowStore((state) => state.liveControls);
  const livePage = useShowStore((state) => state.livePage);
  const scenes = useShowStore((state) => state.scenes);
  const effects = useShowStore((state) => state.effects);
  const trigger = useShowStore((state) => state.triggerLiveControl);
  const remove = useShowStore((state) => state.deleteLiveControl);
  const setPage = useShowStore((state) => state.setLivePage);
  const persistLayout = useShowStore((state) => state.updateLiveControlLayout);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, Layout>>({});
  const pageControls = controls.filter((control) => control.page === livePage);
  const maxPage = useMemo(() => Math.max(1, ...controls.map((control) => control.page)), [controls]);
  const activeScenes = new Set(scenes.filter((scene) => scene.active).map((scene) => scene.id));
  const activeEffects = new Set(effects.filter((effect) => effect.active).map((effect) => effect.id));
  const release = useShowStore((state) => state.releaseLiveControl);

  const layoutOf = (control: LiveControlSummary): Layout => drafts[control.id] ?? control;
  const commit = async (control: LiveControlSummary, next: Layout) => {
    setDrafts((current) => ({ ...current, [control.id]: next }));
    const saved = await persistLayout(control.id, next);
    if (saved) setDrafts((current) => { const copy = { ...current }; delete copy[control.id]; return copy; });
  };

  const beginGesture = (
    event: ReactPointerEvent<HTMLElement>,
    control: LiveControlSummary,
    direction: ResizeDirection | "move",
  ) => {
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
      let next = { ...initial };
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
    const control = pageControls.find((entry) => entry.id === selectedId);
    if (!control) return;
    const next = { ...layoutOf(control), ...update };
    void commit(control, next);
  };

  return (
    <section className="live-control-panel">
      <header className="live-layout-header"><div><strong>LIVE PAGE {livePage}</strong><button disabled={livePage <= 1} onClick={() => setPage(livePage - 1)}>‹</button><button disabled={livePage >= maxPage} onClick={() => setPage(livePage + 1)}>›</button></div><div className="live-edit-controls"><button className={editing ? "is-active" : ""} onClick={() => setEditing(true)}>✎ Edit</button><button className={!editing ? "is-active" : ""} onClick={() => { setEditing(false); setSelectedId(undefined); }}>Done</button><span title={editing ? "Layout unlocked" : "Layout locked"}>{editing ? "⌗" : "🔒"}</span></div></header>
      {editing && selectedId && <div className="live-selection-toolbar"><label><span>Button color</span><input type="color" value={layoutOf(pageControls.find((entry) => entry.id === selectedId)!).color} onChange={(event) => updateSelected({ color: event.target.value })} /></label><label><span>Behavior</span><select value={layoutOf(pageControls.find((entry) => entry.id === selectedId)!).behavior} onChange={(event) => updateSelected({ behavior: event.target.value as Layout["behavior"] })}><option value="toggle">Toggle</option><option value="flash">Flash</option><option value="push">Push</option><option value="radio">Radio</option></select></label><span>Drag the button or any resize handle.</span></div>}
      <div className={`live-layout-grid ${editing ? "is-editing" : ""}`}>
        {pageControls.map((control) => {
          const active = (control.sceneId ? activeScenes.has(control.sceneId) : false) || (control.effectId ? activeEffects.has(control.effectId) : false);
          const layout = layoutOf(control);
          const selected = selectedId === control.id;
          const style = {
            gridColumn: `${layout.gridX + 1} / span ${layout.width}`,
            gridRow: `${layout.gridY + 1} / span ${layout.height}`,
            "--live-color": layout.color,
          } as CSSProperties;
          return <article className={`live-control ${active ? "is-active" : ""} ${selected ? "is-selected" : ""}`} style={style} key={control.id} onPointerDown={(event) => beginGesture(event, control, "move")}>
            <button
              className="live-trigger"
              onPointerDown={(event) => {
                if (editing) {
                  event.preventDefault();
                } else if (layout.behavior === "flash") {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  trigger(control.id);
                }
              }}
              onPointerUp={() => release(control.id)}
              onPointerCancel={() => release(control.id)}
              onKeyDown={(event) => {
                if (!editing && layout.behavior === "flash" && !event.repeat && (event.key === " " || event.key === "Enter")) {
                  trigger(control.id);
                }
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") release(control.id);
              }}
              onClick={(event) => {
                if (editing) {
                  event.preventDefault();
                  setSelectedId(control.id);
                } else if (layout.behavior !== "flash") {
                  trigger(control.id);
                }
              }}
            ><span>{control.sceneId ? "SCENE" : "EFFECT"}</span><strong>{control.label}</strong><i>{active ? "ACTIVE" : layout.behavior.toUpperCase()}</i>{active && <u />}</button>
            {editing && <><button className="live-remove" aria-label={`Remove ${control.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => remove(control.id)}>×</button>{(["n", "ne", "e", "se", "s", "sw", "w", "nw"] as ResizeDirection[]).map((direction) => <i className={`resize-handle handle-${direction}`} key={direction} onPointerDown={(event) => beginGesture(event, control, direction)} />)}{selected && <output className="live-size-readout">{layout.width} × {layout.height}</output>}</>}
          </article>;
        })}
        {pageControls.length === 0 && <div className="empty-live-grid"><span>＋</span><strong>Add scenes or effects</strong><small>Use “+ LIVE” in Design mode.</small></div>}
      </div>
    </section>
  );
}

function overlapsOther(id: string, next: Layout, controls: LiveControlSummary[], drafts: Record<string, Layout>): boolean {
  return controls.some((control) => {
    if (control.id === id) return false;
    const other = drafts[control.id] ?? control;
    return next.gridX < other.gridX + other.width
      && next.gridX + next.width > other.gridX
      && next.gridY < other.gridY + other.height
      && next.gridY + next.height > other.gridY;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
