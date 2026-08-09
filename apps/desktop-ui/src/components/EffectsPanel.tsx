import { useState } from "react";

import { useShowStore } from "../store/showStore";
import type { EffectSummary, EffectTemplate } from "../types/show";

const templates: EffectTemplate[] = [
  "pulse", "sineWave", "chase", "fill", "randomFlicker", "sparkle",
  "twoColorChase", "rainbow", "colorWave", "randomColor", "panSweep",
  "tiltBounce", "circle", "figureEight", "fireCandleFlicker",
];

export function EffectsPanel() {
  const [editing, setEditing] = useState<EffectSummary | "new" | null>(null);
  const [fanning, setFanning] = useState(false);
  const effects = useShowStore((state) => state.effects);
  const mode = useShowStore((state) => state.mode);
  const selectedCount = useShowStore((state) => state.selectedFixtureIds.length);
  const toggleEffect = useShowStore((state) => state.toggleEffect);
  const deleteEffect = useShowStore((state) => state.deleteEffect);
  const addLiveControl = useShowStore((state) => state.addLiveControl);

  return (
    <div className="effects-editor-strip">
      <div className="effects-strip-tools">
        <strong>{selectedCount > 0 ? `${selectedCount} selected` : "All fixtures"}</strong>
        <button onClick={() => setFanning(true)}>FAN</button>
        <button disabled={mode === "live"} onClick={() => setEditing("new")}>＋ EFFECT</button>
      </div>
      <div className="effect-library-strip">
        {effects.map((effect) => (
          <div className={effect.active ? "is-active" : ""} key={effect.id}>
            <button className="effect-trigger" onClick={() => toggleEffect(effect.id)}><span>∿</span><strong>{effect.name}</strong><small>{templateLabel(effect.template)} · {effect.beatSync ? "Beat sync" : `${effect.speedHz.toFixed(2)} Hz`}</small></button>
            <div className="effect-actions">
              <button disabled={mode === "live"} title="Edit effect" onClick={() => setEditing(effect)}>✎</button>
              <button disabled={mode === "live"} title="Add to Live panel" onClick={() => addLiveControl(effect.name, null, effect.id)}>＋ LIVE</button>
            </div>
          </div>
        ))}
        {effects.length === 0 && <div className="empty-strip">Create an effect, then select fixtures and press its tile to start it.</div>}
      </div>
      {editing && (
        <EffectDialog
          effect={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onDelete={editing === "new" ? undefined : () => { deleteEffect(editing.id); setEditing(null); }}
        />
      )}
      {fanning && <FanDialog onClose={() => setFanning(false)} />}
    </div>
  );
}

function EffectDialog({ effect, onClose, onDelete }: { effect: EffectSummary | undefined; onClose: () => void; onDelete: (() => void) | undefined }) {
  const saveEffect = useShowStore((state) => state.saveEffect);
  const [name, setName] = useState(effect?.name ?? "New Effect");
  const [template, setTemplate] = useState<EffectTemplate>(effect?.template ?? "sineWave");
  const [targetParameter, setTargetParameter] = useState(effect?.targetParameter ?? "intensity");
  const [amplitude, setAmplitude] = useState(effect?.amplitude ?? 0.75);
  const [offset, setOffset] = useState(effect?.offset ?? 0.15);
  const [speedHz, setSpeedHz] = useState(effect?.speedHz ?? 1);
  const [beatMultiplier, setBeatMultiplier] = useState(effect?.beatMultiplier ?? 1);
  const [beatSync, setBeatSync] = useState(effect?.beatSync ?? true);
  const [spatialPhase, setSpatialPhase] = useState(effect?.spatialPhase ?? 1);
  const [direction, setDirection] = useState(effect?.direction ?? "forward");
  const [blend, setBlend] = useState(effect?.blend ?? "replace");
  const [order, setOrder] = useState(effect?.order ?? "layoutX");
  return (
    <div className="fixture-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="fixture-dialog effect-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => {
        event.preventDefault();
        saveEffect({ id: effect?.id ?? null, name, template, targetParameter, amplitude, offset, speedHz, beatMultiplier, beatSync, spatialPhase, direction, blend, order });
        onClose();
      }}>
        <header><div><small>PARAMETER-BASED EFFECT</small><h2>{effect ? "Edit Effect" : "Create Effect"}</h2></div><button type="button" onClick={onClose}>×</button></header>
        <div className="dialog-grid">
          <label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label><span>Template</span><select value={template} onChange={(event) => setTemplate(event.target.value as EffectTemplate)}>{templates.map((value) => <option key={value} value={value}>{templateLabel(value)}</option>)}</select></label>
          <label><span>Target</span><select value={targetParameter} onChange={(event) => setTargetParameter(event.target.value)}><option value="intensity">Intensity</option><option value="position.pan">Pan</option><option value="position.tilt">Tilt</option><option value="beam.zoom">Zoom</option><option value="color.red">Color Red</option><option value="color.green">Color Green</option><option value="color.blue">Color Blue</option></select></label>
          <label><span>Order</span><select value={order} onChange={(event) => setOrder(event.target.value as typeof order)}><option value="fixtureOrder">Fixture order</option><option value="layoutX">Stage left → right</option><option value="layoutY">Stage top → bottom</option></select></label>
          <NumberField label="Amplitude" min={0} max={1} step={0.01} value={amplitude} onChange={setAmplitude} />
          <NumberField label="Offset" min={0} max={1} step={0.01} value={offset} onChange={setOffset} />
          <NumberField label="Speed (Hz)" min={0} max={20} step={0.05} value={speedHz} onChange={setSpeedHz} />
          <NumberField label="Spatial phase" min={0} max={8} step={0.1} value={spatialPhase} onChange={setSpatialPhase} />
          <label><span>Direction</span><select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="forward">Forward</option><option value="reverse">Reverse</option></select></label>
          <label><span>Blend</span><select value={blend} onChange={(event) => setBlend(event.target.value as typeof blend)}><option value="replace">Replace</option><option value="add">Add</option></select></label>
        </div>
        <label className="check-field"><input type="checkbox" checked={beatSync} onChange={(event) => setBeatSync(event.target.checked)} /><span>Synchronize to Beat Clock</span></label>
        {beatSync && <NumberField label="Beat multiplier" min={0.125} max={16} step={0.125} value={beatMultiplier} onChange={setBeatMultiplier} />}
        <p>Effects modify logical fixture parameters. Layout order uses X/Y positions from the 2D Stage.</p>
        <footer>{onDelete ? <button className="danger" type="button" onClick={onDelete}>Delete Effect</button> : <button type="button" onClick={onClose}>Cancel</button>}<button className="primary" type="submit">Save Effect</button></footer>
      </form>
    </div>
  );
}

function FanDialog({ onClose }: { onClose: () => void }) {
  const applyFan = useShowStore((state) => state.applyFan);
  const applyColorFan = useShowStore((state) => state.applyColorFan);
  const count = useShowStore((state) => state.selectedFixtureIds.length);
  const [parameter, setParameter] = useState("position.pan");
  const [base, setBase] = useState(0.5);
  const [spread, setSpread] = useState(0.7);
  const [startColor, setStartColor] = useState("#ff3b4f");
  const [endColor, setEndColor] = useState("#3b7cff");
  const color = parameter === "color";
  return (
    <div className="fixture-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="fixture-dialog fan-dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); color ? applyColorFan(startColor, endColor) : applyFan(parameter, base, spread); onClose(); }}>
        <header><div><small>STATIC PARAMETER SPREAD</small><h2>Fan {count} Fixtures</h2></div><button type="button" onClick={onClose}>×</button></header>
        <label><span>Parameter</span><select value={parameter} onChange={(event) => setParameter(event.target.value)}><option value="intensity">Intensity</option><option value="position.pan">Pan</option><option value="position.tilt">Tilt</option><option value="beam.zoom">Zoom</option><option value="color">Color gradient</option></select></label>
        {color ? <div className="dialog-grid"><label><span>First color</span><input type="color" value={startColor} onChange={(event) => setStartColor(event.target.value)} /></label><label><span>Last color</span><input type="color" value={endColor} onChange={(event) => setEndColor(event.target.value)} /></label></div> : <div className="dialog-grid"><NumberField label="Center value" min={0} max={1} step={0.01} value={base} onChange={setBase} /><NumberField label="Spread" min={-2} max={2} step={0.05} value={spread} onChange={setSpread} /></div>}
        <p>Values are distributed in fixture selection order. Select fixtures left-to-right for a predictable physical fan.</p>
        <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={count === 0} type="submit">Apply Fan</button></footer>
      </form>
    </div>
  );
}

function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label><span>{label}</span><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function templateLabel(value: EffectTemplate): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}
