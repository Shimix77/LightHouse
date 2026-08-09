import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import { useShowStore } from "../store/showStore";
import type { LayoutFixture } from "../types/show";

interface CopiedProperties {
  intensity?: number;
  color?: string;
  white?: number;
  pan?: number;
  tilt?: number;
  zoom?: number;
}

export function FixtureControlDock({ onOpenSettings }: { onOpenSettings: () => void }) {
  const fixtures = useShowStore((state) => state.fixtures);
  const selectedIds = useShowStore((state) => state.selectedFixtureIds);
  const definitions = useShowStore((state) => state.fixtureDefinitions);
  const capture = useShowStore((state) => state.captureFixtureHistory);
  const update = useShowStore((state) => state.updateSelectedFixtures);
  const setParameter = useShowStore((state) => state.setSelectedParameter);
  const [propertyMenuOpen, setPropertyMenuOpen] = useState(false);
  const [copied, setCopied] = useState<CopiedProperties>();
  const selected = fixtures.filter((fixture) => selectedIds.includes(fixture.id));
  const primary = selected[0];
  const modes = useMemo(() => selected.map((fixture) => definitions
    .find((definition) => definition.id === fixture.definitionId)
    ?.modes.find((entry) => entry.id === fixture.modeId)), [definitions, selected]);
  const mode = modes[0];
  const supportsColor = modes.length > 0 && modes.every((entry) => entry?.parameters.some((parameter) => parameter.id.startsWith("color.")));
  const supportsPosition = modes.length > 0 && modes.every((entry) => entry?.parameters.some((parameter) => parameter.id === "position.pan") && entry.parameters.some((parameter) => parameter.id === "position.tilt"));
  const supportsBeam = modes.length > 0 && modes.every((entry) => entry?.parameters.some((parameter) => parameter.id === "beam.zoom"));
  const whiteParameter = supportsColor && modes.every((entry) => entry?.parameters.some((parameter) => parameter.id === "color.white"))
    ? mode?.parameters.find((parameter) => parameter.id === "color.white")
    : undefined;

  if (!primary) return <section className="fixture-control-dock is-empty"><span>◉</span><div><strong>Select a fixture on the Stage</strong><small>Its supported controls will appear here.</small></div></section>;

  const white = whiteParameter ? primary.parameters[whiteParameter.id] ?? whiteParameter.defaultValue : 0;
  const pasteProperties = () => {
    if (!copied) return;
    capture();
    update({
      ...(copied.intensity === undefined ? {} : { intensity: copied.intensity }),
      ...(copied.color === undefined ? {} : { color: copied.color }),
      ...(copied.pan === undefined ? {} : { pan: copied.pan }),
      ...(copied.tilt === undefined ? {} : { tilt: copied.tilt }),
      ...(copied.zoom === undefined ? {} : { zoom: copied.zoom }),
    });
    if (whiteParameter && copied.white !== undefined) setParameter(whiteParameter.id, copied.white);
    setPropertyMenuOpen(false);
  };

  return (
    <section className="fixture-control-dock lightkey-control-dock">
      <header>
        <div className="fixture-dock-title"><i style={{ background: previewColor(primary, white) }} /><span><strong>{selected.length > 1 ? `${selected.length} Fixtures` : primary.name}</strong><small>{mode?.name ?? primary.kind} · U{primary.universe}/{primary.address}</small></span></div>
        <div className="fixture-property-menu"><button onClick={() => setPropertyMenuOpen((open) => !open)}>Properties ⌄</button>{propertyMenuOpen && <div><button onClick={() => { setCopied({ intensity: primary.intensity }); setPropertyMenuOpen(false); }}>Copy Dimmer</button>{supportsColor && <button onClick={() => { setCopied({ color: primary.color, white }); setPropertyMenuOpen(false); }}>Copy Color</button>}{supportsPosition && <button onClick={() => { setCopied({ pan: primary.pan, tilt: primary.tilt }); setPropertyMenuOpen(false); }}>Copy Position</button>}<button onClick={() => { setCopied({ intensity: primary.intensity, color: primary.color, white, pan: primary.pan, tilt: primary.tilt, zoom: primary.zoom }); setPropertyMenuOpen(false); }}>Copy All Properties</button><hr /><button disabled={!copied} onClick={pasteProperties}>Paste Properties</button></div>}</div>
        <button className="fixture-settings-button" onClick={onOpenSettings}>Settings…</button>
      </header>
      <div className="lightkey-control-body">
        <VerticalDimmer fixture={primary} onStart={capture} onChange={(intensity) => update({ intensity })} />
        {supportsColor && <RgbwColorWheel fixture={primary} whiteParameterId={whiteParameter?.id} white={white} onStart={capture} onColor={(color, whiteValue) => { update({ color }); if (whiteParameter) setParameter(whiteParameter.id, whiteValue); }} />}
        {supportsPosition && <div className="context-property-card position-property-card"><header>Position</header><div className="xy-pad"><span style={{ left: `${primary.pan * 100}%`, top: `${(1 - primary.tilt) * 100}%` }} /></div><DockRange label="PAN" value={primary.pan} onStart={capture} onChange={(pan) => update({ pan })} /><DockRange label="TILT" value={primary.tilt} onStart={capture} onChange={(tilt) => update({ tilt })} /></div>}
        {supportsBeam && <div className="context-property-card beam-property-card"><header>Beam</header><DockRange label="ZOOM" value={primary.zoom} onStart={capture} onChange={(zoom) => update({ zoom })} /><div className="beam-preview-cone" style={{ "--beam-color": previewColor(primary, white), "--beam-width": `${22 + primary.zoom * 62}%` } as CSSProperties}><i /></div></div>}
        {!supportsColor && !supportsPosition && !supportsBeam && <div className="context-control-empty"><strong>Dimmer fixture</strong><small>This profile exposes intensity only.</small></div>}
      </div>
      <footer>{selected.length > 1 ? "Only properties shared by every selected fixture are shown." : "Controls are generated from the logical fixture profile."}</footer>
    </section>
  );
}

function VerticalDimmer({ fixture, onStart, onChange }: { fixture: LayoutFixture; onStart: () => void; onChange: (value: number) => void }) {
  return <div className="lightkey-dimmer"><header>Dimmer</header><label><input aria-label="Dimmer" type="range" min={0} max={1} step={0.001} value={fixture.intensity} onPointerDown={onStart} onChange={(event) => onChange(Number(event.target.value))} /><i style={{ height: `${fixture.intensity * 100}%` }} /><output>{fixture.intensity >= .995 ? "Full" : `${Math.round(fixture.intensity * 100)}%`}</output></label></div>;
}

function RgbwColorWheel({ fixture, whiteParameterId, white, onStart, onColor }: { fixture: LayoutFixture; whiteParameterId: string | undefined; white: number; onStart: () => void; onColor: (color: string, white: number) => void }) {
  const initialHue = rgbToHsv(hexChannels(fixture.color)).h;
  const [hue, setHue] = useState(initialHue);
  useEffect(() => {
    const next = rgbToHsv(hexChannels(fixture.color));
    if (next.s > 0.08) setHue(next.h);
  }, [fixture.id, fixture.color]);

  const setFromPointer = (element: HTMLDivElement, clientX: number, clientY: number) => {
    const bounds = element.getBoundingClientRect();
    const x = clientX - (bounds.left + bounds.width / 2);
    const y = clientY - (bounds.top + bounds.height / 2);
    const radius = Math.sqrt(x * x + y * y) / (bounds.width / 2);
    const angle = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
    if (radius >= 0.57) {
      setHue(angle);
      onColor(rgbHex(hsvToRgb(angle, 1, 1)), 0);
      return;
    }
    const unitX = clamp(x / (bounds.width * 0.285));
    const unitY = clamp(y / (bounds.height * 0.285));
    const whiteness = whiteParameterId ? clamp01(Math.max(0, -unitX) * 0.86 + Math.max(0, -unitY) * 0.12) : 0;
    const darkness = clamp01(Math.max(0, unitX) * 0.78 + Math.max(0, unitY) * 0.58);
    const pure = hsvToRgb(hue, 1, 1);
    const rgbScale = (1 - whiteness) * (1 - darkness);
    onColor(rgbHex(pure.map((channel) => channel * rgbScale) as [number, number, number]), whiteness * (1 - darkness));
  };

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    onStart();
    setFromPointer(event.currentTarget, event.clientX, event.clientY);
    const element = event.currentTarget;
    const move = (next: PointerEvent) => setFromPointer(element, next.clientX, next.clientY);
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };

  return <div className="lightkey-color-control"><header>Color</header><div className="rgbw-wheel" style={{ "--hue-color": rgbHex(hsvToRgb(hue, 1, 1)), "--preview-color": previewColor(fixture, white), "--hue-angle": `${hue}deg` } as CSSProperties} onPointerDown={begin}><div className="rgbw-inner"><i /><b /></div><span className="hue-marker" /></div><div className="rgbw-readout"><i style={{ background: previewColor(fixture, white) }} /><span><strong>{previewColor(fixture, white).toUpperCase()}</strong><small>{whiteParameterId ? `RGBW · White ${Math.round(white * 100)}%` : "RGB"}</small></span></div></div>;
}

function DockRange({ label, value, onStart, onChange }: { label: string; value: number; onStart: () => void; onChange: (value: number) => void }) {
  return <label className="dock-range"><span>{label}</span><input type="range" min={0} max={1} step={0.001} value={value} onPointerDown={onStart} onChange={(event) => onChange(Number(event.target.value))} /><output>{Math.round(value * 100)}</output></label>;
}

function previewColor(fixture: LayoutFixture, white: number): string {
  const channels = hexChannels(fixture.color);
  return rgbHex(channels.map((channel) => clamp01(channel + white)) as [number, number, number]);
}

function hexChannels(color: string): [number, number, number] {
  const normalized = color.replace("#", "").padEnd(6, "0");
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function rgbHex([red, green, blue]: [number, number, number]): string {
  const channel = (value: number) => Math.round(clamp01(value) * 255).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function rgbToHsv([red, green, blue]: [number, number, number]): { h: number; s: number; v: number } {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  return { h: (hue + 360) % 360, s: maximum === 0 ? 0 : delta / maximum, v: maximum };
}

function hsvToRgb(hue: number, saturation: number, value: number): [number, number, number] {
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - chroma;
  const channels = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return channels.map((channel) => channel + m) as [number, number, number];
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
