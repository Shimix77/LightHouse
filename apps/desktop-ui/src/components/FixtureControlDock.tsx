import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { useShowStore } from "../store/showStore";

type ControlTab = "dimmer" | "color" | "position" | "beam" | "raw";

export function FixtureControlDock({ onOpenSettings }: { onOpenSettings: () => void }) {
  const fixtures = useShowStore((state) => state.fixtures);
  const selectedIds = useShowStore((state) => state.selectedFixtureIds);
  const definitions = useShowStore((state) => state.fixtureDefinitions);
  const capture = useShowStore((state) => state.captureFixtureHistory);
  const update = useShowStore((state) => state.updateSelectedFixtures);
  const setParameter = useShowStore((state) => state.setSelectedParameter);
  const [tab, setTab] = useState<ControlTab>("color");
  const selected = fixtures.filter((fixture) => selectedIds.includes(fixture.id));
  const primary = selected[0];
  const mode = useMemo(() => definitions.find((definition) => definition.id === primary?.definitionId)?.modes.find((entry) => entry.id === primary?.modeId), [definitions, primary]);
  const supportsShutter = mode?.parameters.some((parameter) => parameter.id === "shutter") ?? false;
  const whiteParameter = mode?.parameters.find((parameter) => parameter.id === "color.white");

  if (!primary) return <section className="fixture-control-dock is-empty"><span>◉</span><div><strong>Select a fixture on the Stage</strong><small>Its supported controls will appear here.</small></div></section>;

  return (
    <section className="fixture-control-dock">
      <header><div className="fixture-dock-title"><i style={{ background: primary.color }} /><span><strong>{selected.length > 1 ? `${selected.length} Fixtures` : primary.name}</strong><small>{mode?.name ?? primary.kind} · U{primary.universe}/{primary.address}</small></span></div><nav>{(["dimmer", "color", "position", "beam", "raw"] as ControlTab[]).map((value) => <button className={tab === value ? "is-active" : ""} key={value} onClick={() => setTab(value)}>{value === "raw" ? "Raw DMX" : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</nav><button className="fixture-settings-button" onClick={onOpenSettings}>Settings…</button></header>
      <div className="fixture-dock-body">
        {tab === "dimmer" && <div className="large-fader-block"><label><span>INTENSITY</span><input type="range" min={0} max={1} step={0.001} value={primary.intensity} onPointerDown={capture} onChange={(event) => update({ intensity: Number(event.target.value) })} /><output>{Math.round(primary.intensity * 100)}%</output></label><div className="dimmer-quick"><button onClick={() => update({ intensity: 0 })}>Off</button><button onClick={() => update({ intensity: 0.5 })}>50%</button><button onClick={() => update({ intensity: 1 })}>Full</button></div></div>}
        {tab === "color" && <div className="color-dock"><label className="color-wheel" style={{ "--selected-color": primary.color } as CSSProperties}><input type="color" value={primary.color} onPointerDown={capture} onChange={(event) => update({ color: event.target.value })} /><span /></label><div className="color-dock-sliders"><strong>{primary.color.toUpperCase()}</strong><label><span>Hue / Color</span><input type="color" value={primary.color} onChange={(event) => update({ color: event.target.value })} /></label><div className="dock-color-presets">{["#ff3b30", "#ff9f0a", "#ffd60a", "#30d158", "#32ade6", "#0a84ff", "#bf5af2", "#ffffff"].map((color) => <button key={color} style={{ background: color }} onClick={() => { capture(); update({ color }); }} />)}</div>{whiteParameter && <DockRange label="WHITE" value={primary.parameters[whiteParameter.id] ?? whiteParameter.defaultValue} onStart={capture} onChange={(value) => setParameter(whiteParameter.id, value)} />}</div><div className="emitter-summary"><small>COLOR SYSTEM</small><strong>{whiteParameter ? "RGBW / Virtual Color" : "RGB / Virtual Color"}</strong><span>Compatible emitters are resolved by the fixture profile.</span></div></div>}
        {tab === "position" && <div className="position-dock"><div className="xy-pad"><span style={{ left: `${primary.pan * 100}%`, top: `${(1 - primary.tilt) * 100}%` }} /></div><div><DockRange label="PAN" value={primary.pan} onStart={capture} onChange={(pan) => update({ pan })} /><DockRange label="TILT" value={primary.tilt} onStart={capture} onChange={(tilt) => update({ tilt })} /><button onClick={() => { capture(); update({ pan: 0.5, tilt: 0.5 }); }}>Center Position</button></div></div>}
        {tab === "beam" && <div className="beam-dock"><DockRange label="ZOOM" value={primary.zoom} onStart={capture} onChange={(zoom) => update({ zoom })} /><div className="beam-buttons"><button disabled={!supportsShutter} onClick={() => { capture(); setParameter("shutter", 1); }}>Open</button><button disabled={!supportsShutter} onClick={() => { capture(); setParameter("shutter", 0.45); }}>Strobe</button><button disabled={!supportsShutter} onClick={() => { capture(); setParameter("shutter", 0.7); }}>Pulse</button><button disabled={!supportsShutter} onClick={() => { capture(); setParameter("shutter", 0.9); }}>Random</button></div><p>{supportsShutter ? "Shutter presets use the normalized range defined by the fixture profile." : "This fixture mode has no shutter/strobe channel."}</p></div>}
        {tab === "raw" && <div className="raw-dmx-dock"><div className="raw-dmx-warning"><strong>Expert View</strong><span>Values are still sent through logical parameter overrides—not directly to the output buffer.</span></div>{mode?.parameters.map((parameter) => <label key={parameter.id}><span><b>CH {parameter.coarseChannel}</b>{parameter.name}</span><input type="range" min={0} max={1} step={parameter.resolution === 16 ? 1 / 65535 : 1 / 255} value={primary.parameters[parameter.id] ?? parameter.defaultValue} onPointerDown={capture} onChange={(event) => setParameter(parameter.id, Number(event.target.value))} /><output>{Math.round((primary.parameters[parameter.id] ?? parameter.defaultValue) * (parameter.resolution === 16 ? 65535 : 255))}</output></label>)}{!mode?.parameters.length && <p>No raw channels are available for this profile.</p>}</div>}
      </div>
      <footer>Double-click a fixture on the Stage for detailed settings.</footer>
    </section>
  );
}

function DockRange({ label, value, onStart, onChange }: { label: string; value: number; onStart: () => void; onChange: (value: number) => void }) {
  return <label className="dock-range"><span>{label}</span><input type="range" min={0} max={1} step={0.001} value={value} onPointerDown={onStart} onChange={(event) => onChange(Number(event.target.value))} /><output>{Math.round(value * 100)}</output></label>;
}
