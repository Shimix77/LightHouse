import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { useShowStore } from "../store/showStore";
import type {
  CustomFixtureChannel,
  FixtureBeamKind,
  FixtureDefinitionSummary,
  FixtureProfileType,
  FixtureRangeSummary,
} from "../types/show";

interface CustomFixtureDialogProps {
  onClose: () => void;
  onCreated: (definitionId: string) => void;
  definition?: FixtureDefinitionSummary | undefined;
}

interface PropertyOption {
  id: string;
  label: string;
  category: string;
  icon: string;
  unit: string;
}

const fixtureTypes: { id: FixtureProfileType; label: string; icon: string; hint: string }[] = [
  { id: "movingHead", label: "Moving Head", icon: "♙", hint: "Motorized Pan and Tilt" },
  { id: "par", label: "PAR", icon: "◉", hint: "LED or conventional PAR" },
  { id: "spotlight", label: "Spotlight", icon: "◍", hint: "Profile or fixed spotlight" },
  { id: "blinder", label: "Blinder", icon: "▦", hint: "One or more audience cells" },
  { id: "strobe", label: "Strobe", icon: "✦", hint: "Strobe and shutter fixture" },
  { id: "ledBar", label: "LED Bar", icon: "▥", hint: "Segmented or pixel bar" },
  { id: "bulb", label: "Bulb", icon: "●", hint: "Single dimmable source" },
  { id: "fog", label: "Fog Machine", icon: "☁", hint: "Fog output and fan" },
  { id: "other", label: "Other", icon: "◇", hint: "Generic DMX device" },
];

const fixtureIcons = ["fixture", "moving-head", "par", "spot", "wash", "blinder", "strobe", "led-bar", "bulb", "fog"];

const properties: PropertyOption[] = [
  { id: "unused", label: "Unused / No Function", category: "General", icon: "—", unit: "raw" },
  { id: "intensity", label: "Dimmer / Intensity", category: "Intensity", icon: "☀", unit: "%" },
  { id: "intensity.fine", label: "Dimmer Fine", category: "Intensity", icon: "◌", unit: "%" },
  { id: "color.red", label: "Red", category: "Color Component", icon: "R", unit: "%" },
  { id: "color.red.fine", label: "Red Fine", category: "Color Component", icon: "r", unit: "%" },
  { id: "color.green", label: "Green", category: "Color Component", icon: "G", unit: "%" },
  { id: "color.green.fine", label: "Green Fine", category: "Color Component", icon: "g", unit: "%" },
  { id: "color.blue", label: "Blue", category: "Color Component", icon: "B", unit: "%" },
  { id: "color.blue.fine", label: "Blue Fine", category: "Color Component", icon: "b", unit: "%" },
  { id: "color.white", label: "White", category: "Color Component", icon: "W", unit: "%" },
  { id: "color.warmWhite", label: "Warm White", category: "Color Component", icon: "WW", unit: "%" },
  { id: "color.amber", label: "Amber", category: "Color Component", icon: "A", unit: "%" },
  { id: "color.uv", label: "UV", category: "Color Component", icon: "UV", unit: "%" },
  { id: "color.cyan", label: "Cyan", category: "Color Component", icon: "C", unit: "%" },
  { id: "color.magenta", label: "Magenta", category: "Color Component", icon: "M", unit: "%" },
  { id: "color.yellow", label: "Yellow", category: "Color Component", icon: "Y", unit: "%" },
  { id: "color.wheel", label: "Color Wheel", category: "Color", icon: "◉", unit: "slot" },
  { id: "color.temperature", label: "Color Temperature", category: "Color", icon: "K", unit: "K" },
  { id: "position.pan", label: "Pan", category: "Position", icon: "↔", unit: "°" },
  { id: "position.pan.fine", label: "Pan Fine", category: "Position", icon: "⇥", unit: "°" },
  { id: "position.tilt", label: "Tilt", category: "Position", icon: "↕", unit: "°" },
  { id: "position.tilt.fine", label: "Tilt Fine", category: "Position", icon: "⇳", unit: "°" },
  { id: "position.speed", label: "Movement Speed", category: "Position", icon: "⌁", unit: "%" },
  { id: "shutter", label: "Shutter", category: "Shutter / Strobe", icon: "◐", unit: "mode" },
  { id: "strobe", label: "Strobe", category: "Shutter / Strobe", icon: "✦", unit: "Hz" },
  { id: "beam.focus", label: "Focus", category: "Beam", icon: "◎", unit: "%" },
  { id: "beam.focus.fine", label: "Focus Fine", category: "Beam", icon: "◌", unit: "%" },
  { id: "beam.zoom", label: "Zoom", category: "Beam", icon: "⌕", unit: "°" },
  { id: "beam.zoom.fine", label: "Zoom Fine", category: "Beam", icon: "◌", unit: "°" },
  { id: "beam.iris", label: "Iris", category: "Beam", icon: "◉", unit: "%" },
  { id: "beam.iris.fine", label: "Iris Fine", category: "Beam", icon: "◌", unit: "%" },
  { id: "beam.frost", label: "Frost", category: "Beam", icon: "❄", unit: "%" },
  { id: "gobo.wheel", label: "Gobo Wheel", category: "Gobo", icon: "✺", unit: "slot" },
  { id: "gobo.index", label: "Gobo Index", category: "Gobo", icon: "⊙", unit: "°" },
  { id: "gobo.rotation", label: "Gobo Rotation", category: "Gobo", icon: "↻", unit: "rpm" },
  { id: "gobo.shake", label: "Gobo Shake", category: "Gobo", icon: "≈", unit: "Hz" },
  { id: "prism", label: "Prism", category: "Prism", icon: "△", unit: "slot" },
  { id: "prism.rotation", label: "Prism Rotation", category: "Prism", icon: "↻", unit: "rpm" },
  { id: "fog.output", label: "Fog Output", category: "Atmosphere", icon: "☁", unit: "%" },
  { id: "fog.fan", label: "Fan Speed", category: "Atmosphere", icon: "✣", unit: "%" },
  { id: "effect.macro", label: "Effect / Macro", category: "Control", icon: "✧", unit: "mode" },
  { id: "control", label: "Fixture Control / Reset", category: "Control", icon: "⚠", unit: "mode" },
  { id: "custom", label: "Custom Function", category: "Custom", icon: "◇", unit: "raw" },
];

export function CustomFixtureDialog({ onClose, onCreated, definition }: CustomFixtureDialogProps) {
  const putCustomFixture = useShowStore((state) => state.putCustomFixture);
  const fixtures = useShowStore((state) => state.fixtures);
  const testFixtureParameter = useShowStore((state) => state.testFixtureParameter);
  const initialMode = definition?.modes[0];
  const [step, setStep] = useState(definition ? 3 : 0);
  const [fixtureType, setFixtureType] = useState<FixtureProfileType>(definition?.fixtureType ?? "par");
  const [icon, setIcon] = useState(definition?.icon ?? "par");
  const [manufacturer, setManufacturer] = useState(definition?.manufacturer ?? "Custom");
  const [model, setModel] = useState(definition?.model ?? "");
  const [beamKind, setBeamKind] = useState<FixtureBeamKind>(definition?.beamKind ?? "wash");
  const [beamAngleMin, setBeamAngleMin] = useState(definition?.beamAngleMinDegrees ?? 15);
  const [beamAngleMax, setBeamAngleMax] = useState(definition?.beamAngleMaxDegrees ?? 40);
  const [modeName, setModeName] = useState(initialMode?.name ?? "Standard");
  const [footprint, setFootprint] = useState(initialMode?.footprint ?? 4);
  const [channels, setChannels] = useState<CustomFixtureChannel[]>(() => channelsFromDefinition(definition));
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [propertyQuery, setPropertyQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [testerFixtureId, setTesterFixtureId] = useState("");
  const [testerArmed, setTesterArmed] = useState(false);
  const [testerConfirming, setTesterConfirming] = useState(false);
  const [testParameterId, setTestParameterId] = useState(initialMode?.parameters[0]?.id ?? "");
  const [testRaw, setTestRaw] = useState(0);

  const patchedFixtures = fixtures.filter((fixture) => fixture.definitionId === definition?.id);
  const resolvedTesterFixture = testerFixtureId || patchedFixtures[0]?.id || "";
  const selected = channels[selectedChannel];
  const filteredProperties = properties.filter((property) =>
    `${property.label} ${property.category} ${property.id}`.toLowerCase().includes(propertyQuery.trim().toLowerCase()),
  );
  const propertyGroups = [...new Set(filteredProperties.map((property) => property.category))];
  const validation = useMemo(() => validateProfile({
    model,
    modeName,
    beamKind,
    beamAngleMin,
    beamAngleMax,
    footprint,
    channels,
  }), [beamAngleMax, beamAngleMin, beamKind, channels, footprint, modeName, model]);

  const goToEditor = () => {
    const count = Math.max(1, Math.min(512, Math.round(footprint)));
    setFootprint(count);
    setChannels((current) => resizeChannels(current, count));
    setSelectedChannel(0);
    setStep(3);
  };

  const updateChannel = (index: number, update: Partial<CustomFixtureChannel>) => {
    setChannels((current) => current.map((channel, channelIndex) =>
      channelIndex === index ? { ...channel, ...update } : channel));
  };

  const assignProperty = (property: PropertyOption) => {
    if (!selected) return;
    const nextRanges = selected.ranges.length === 1
      && selected.ranges[0]?.start === 0
      && selected.ranges[0]?.end === 255
      ? [{ ...selected.ranges[0], label: property.label, unit: property.unit }]
      : selected.ranges;
    updateChannel(selectedChannel, {
      property: property.id,
      name: property.label,
      hazardous: property.id === "control" || selected.hazardous,
      ranges: nextRanges,
    });
  };

  const addRange = (channelIndex: number) => {
    setChannels((current) => current.map((channel, index) => {
      if (index !== channelIndex) return channel;
      const ranges = channel.ranges.map((range) => ({ ...range }));
      let splitIndex = 0;
      for (let rangeIndex = 1; rangeIndex < ranges.length; rangeIndex += 1) {
        const currentWidth = (ranges[rangeIndex]?.end ?? 0) - (ranges[rangeIndex]?.start ?? 0);
        const widestWidth = (ranges[splitIndex]?.end ?? 0) - (ranges[splitIndex]?.start ?? 0);
        if (currentWidth > widestWidth) splitIndex = rangeIndex;
      }
      const target = ranges[splitIndex];
      if (!target || target.start === target.end) {
        ranges.push(blankRange(0, 0, `Range ${ranges.length + 1}`));
      } else {
        const oldEnd = target.end;
        const start = Math.floor((target.start + target.end) / 2) + 1;
        target.end = start - 1;
        ranges.splice(splitIndex + 1, 0, blankRange(start, oldEnd, `Range ${ranges.length + 1}`));
      }
      return { ...channel, ranges };
    }));
  };

  const updateRange = (channelIndex: number, rangeIndex: number, update: Partial<FixtureRangeSummary>) => {
    setChannels((current) => current.map((channel, index) => index === channelIndex
      ? { ...channel, ranges: channel.ranges.map((range, currentRange) => currentRange === rangeIndex ? { ...range, ...update } : range) }
      : channel));
  };

  const deleteRange = (channelIndex: number, rangeIndex: number) => {
    setChannels((current) => current.map((channel, index) => index === channelIndex
      ? { ...channel, ranges: channel.ranges.filter((_, currentRange) => currentRange !== rangeIndex) }
      : channel));
  };

  const save = async () => {
    if (validation.length > 0) return;
    setSaving(true);
    setError(undefined);
    const savedId = await putCustomFixture({
      manufacturer,
      model,
      fixtureType,
      icon,
      beamKind,
      beamAngleMinDegrees: beamKind === "none" ? null : beamAngleMin,
      beamAngleMaxDegrees: beamKind === "none" ? null : beamAngleMax,
      modeId: slug(modeName) || "custom-mode",
      modeName,
      footprint,
      channels,
    }, definition?.id);
    setSaving(false);
    if (savedId) onCreated(savedId);
    else setError(useShowStore.getState().engineError ?? "The fixture profile could not be saved.");
  };

  const armTester = () => {
    if (!resolvedTesterFixture) return;
    for (const intensity of initialMode?.parameters.filter((parameter) =>
      parameter.id === "intensity" || parameter.id.startsWith("intensity.pixel-")
    ) ?? []) {
      testFixtureParameter(resolvedTesterFixture, intensity.id, 0);
    }
    setTesterArmed(true);
    setTesterConfirming(false);
  };

  const sendTest = (raw: number) => {
    if (!testerArmed || !resolvedTesterFixture || !testParameterId) return;
    const value = Math.max(0, Math.min(255, raw));
    setTestRaw(value);
    testFixtureParameter(resolvedTesterFixture, testParameterId, value / 255);
  };

  return (
    <section className="profile-editor-overlay" role="dialog" aria-modal="true" aria-label={definition ? "Edit Custom Fixture" : "Create Custom Fixture"}>
      <header className="profile-editor-titlebar">
        <button className="profile-editor-close" onClick={onClose}>Cancel</button>
        <div><small>USER FIXTURE PROFILE</small><strong>{model || "Untitled Fixture"}</strong></div>
        <span>{definition ? "Editing installed profile" : `Step ${Math.min(step + 1, 4)} of 4`}</span>
      </header>

      {step < 3 && <WizardProgress step={step} />}

      {step === 0 && (
        <div className="profile-wizard-page">
          <header><small>FIXTURE TYPE</small><h1>Select a Fixture Type</h1><p>This determines its icon, controls, and initial 2D preview.</p></header>
          <div className="fixture-type-grid">{fixtureTypes.map((type) => <button className={fixtureType === type.id ? "is-selected" : ""} key={type.id} onClick={() => { setFixtureType(type.id); setIcon(type.id === "movingHead" ? "moving-head" : type.id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)); }}><span>{type.icon}</span><strong>{type.label}</strong><small>{type.hint}</small></button>)}</div>
          <WizardFooter onCancel={onClose} onContinue={() => setStep(1)} />
        </div>
      )}

      {step === 1 && (
        <div className="profile-wizard-page fixture-information-page">
          <header><small>FIXTURE INFORMATION</small><h1>Name and describe the fixture</h1><p>Use the manufacturer manual as the source of truth.</p></header>
          <div className="fixture-information-card">
            <div className="fixture-icon-picker"><strong>Profile Icon</strong><div>{fixtureIcons.map((value) => <button className={icon === value ? "is-selected" : ""} key={value} onClick={() => setIcon(value)}>{iconGlyph(value)}</button>)}</div></div>
            <label><span>Manufacturer</span><input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} placeholder="Manufacturer" /></label>
            <label><span>Fixture name</span><input autoFocus value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model or custom name" /></label>
            <fieldset><legend>Beam category</legend>{(["beam", "spot", "wash", "none"] as FixtureBeamKind[]).map((value) => <button type="button" className={beamKind === value ? "is-selected" : ""} key={value} onClick={() => setBeamKind(value)}>{value === "none" ? "No light beam" : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</fieldset>
            {beamKind !== "none" && <div className="beam-angle-fields"><label><span>Narrow angle</span><input type="number" min={0.1} max={180} step={0.1} value={beamAngleMin} onChange={(event) => setBeamAngleMin(Number(event.target.value))} /><b>°</b></label><label><span>Wide angle</span><input type="number" min={0.1} max={180} step={0.1} value={beamAngleMax} onChange={(event) => setBeamAngleMax(Number(event.target.value))} /><b>°</b></label><div className={`beam-preview beam-${beamKind}`} style={{ "--beam-width": `${Math.min(95, beamAngleMax)}%` } as CSSProperties}><i /></div></div>}
          </div>
          <WizardFooter onBack={() => setStep(0)} onCancel={onClose} onContinue={() => setStep(2)} disabled={!model.trim() || (beamKind !== "none" && (beamAngleMin <= 0 || beamAngleMax < beamAngleMin || beamAngleMax > 180))} />
        </div>
      )}

      {step === 2 && (
        <div className="profile-wizard-page channel-count-page">
          <header><small>DMX MODE</small><h1>Set the number of DMX channels</h1><p>Choose the exact mode selected on the physical fixture.</p></header>
          <div className="channel-count-card"><span>{iconGlyph(icon)}</span><label><small>MODE NAME</small><input value={modeName} onChange={(event) => setModeName(event.target.value)} /></label><label><small>CHANNELS</small><input autoFocus type="number" min={1} max={512} value={footprint} onChange={(event) => setFootprint(Number(event.target.value))} /><b>DMX channels</b></label><p>Only one mode is stored in this custom profile. Create another profile for a different mode.</p></div>
          <WizardFooter onBack={() => setStep(1)} onCancel={onClose} onContinue={goToEditor} disabled={!modeName.trim() || footprint < 1 || footprint > 512} continueLabel="Create Profile" />
        </div>
      )}

      {step === 3 && (
        <div className="profile-editor-workspace">
          <aside className="profile-property-library">
            <div className="profile-summary-card"><span>{iconGlyph(icon)}</span><div><small>{manufacturer || "Custom"}</small><strong>{model}</strong><p>{footprint} Channels · {beamKind === "none" ? "No Beam" : `${beamKind} · ${beamAngleMin}°–${beamAngleMax}°`}</p></div></div>
            <label className="property-search"><span>⌕</span><input value={propertyQuery} onChange={(event) => setPropertyQuery(event.target.value)} placeholder="Search properties" /></label>
            <div className="property-tree">{propertyGroups.map((category) => <section key={category}><strong>{category}</strong>{filteredProperties.filter((property) => property.category === category).map((property) => <button className={selected?.property === property.id ? "is-selected" : ""} key={property.id} onClick={() => assignProperty(property)}><i>{property.icon}</i><span>{property.label}</span>{property.id.endsWith(".fine") && <b>FINE</b>}</button>)}</section>)}</div>
          </aside>

          <main className="profile-channel-editor">
            <header><div><small>CHANNEL CONFIGURATION</small><h1>{model}</h1></div><div><span>{footprint} Channels</span><span>{pairedCount(channels)} × 16-bit</span><span>{pixelCount(channels)} cells</span></div></header>
            <div className="profile-channel-list">{channels.map((channel, channelIndex) => <ChannelCard key={channel.channel} channel={channel} index={channelIndex} selected={selectedChannel === channelIndex} onSelect={() => setSelectedChannel(channelIndex)} onUpdate={(update) => updateChannel(channelIndex, update)} onAddRange={() => addRange(channelIndex)} onUpdateRange={(rangeIndex, update) => updateRange(channelIndex, rangeIndex, update)} onDeleteRange={(rangeIndex) => deleteRange(channelIndex, rangeIndex)} error={validateChannel(channel, channels)} />)}</div>
          </main>

          <aside className="profile-validation-panel">
            <section><small>PROFILE STATUS</small><strong className={validation.length === 0 ? "is-valid" : "is-invalid"}>{validation.length === 0 ? "✓ Ready to save" : `⚠ ${validation.length} issue${validation.length === 1 ? "" : "s"}`}</strong>{validation.slice(0, 8).map((message) => <p key={message}>{message}</p>)}</section>
            <FixtureTester definition={definition} mode={initialMode} patchedFixtures={patchedFixtures} fixtureId={resolvedTesterFixture} onFixtureChange={setTesterFixtureId} armed={testerArmed} confirming={testerConfirming} onAskArm={() => setTesterConfirming(true)} onCancelArm={() => setTesterConfirming(false)} onArm={armTester} parameterId={testParameterId} onParameterChange={setTestParameterId} raw={testRaw} onRawChange={sendTest} />
          </aside>

          <footer className="profile-editor-footer"><button onClick={definition ? onClose : () => setStep(2)}>Back</button><span>{error && <b>{error}</b>} All ranges must cover 0–255 without gaps or overlaps.</span><button className="primary" disabled={saving || validation.length > 0} onClick={() => { void save(); }}>{saving ? "Saving…" : definition ? "Save Changes" : "Save & Return to Patch"}</button></footer>
        </div>
      )}
    </section>
  );
}

function ChannelCard({ channel, index, selected, error, onSelect, onUpdate, onAddRange, onUpdateRange, onDeleteRange }: {
  channel: CustomFixtureChannel;
  index: number;
  selected: boolean;
  error?: string | undefined;
  onSelect: () => void;
  onUpdate: (update: Partial<CustomFixtureChannel>) => void;
  onAddRange: () => void;
  onUpdateRange: (index: number, update: Partial<FixtureRangeSummary>) => void;
  onDeleteRange: (index: number) => void;
}) {
  const property = properties.find((entry) => entry.id === channel.property);
  const isFine = channel.property.endsWith(".fine");
  return <article className={`profile-channel-card ${selected ? "is-selected" : ""} ${error ? "has-error" : ""}`} onClick={onSelect}>
    <header><span className="dmx-channel-badge">{String(channel.channel).padStart(3, "0")}</span><i>{property?.icon ?? "＋"}</i><div><small>{isFine ? "16-BIT FINE CHANNEL" : property?.category ?? "NO PROPERTY"}</small><input aria-label={`Channel ${index + 1} name`} value={channel.name} onClick={(event) => event.stopPropagation()} onChange={(event) => onUpdate({ name: event.target.value })} /></div><button onClick={(event) => { event.stopPropagation(); onSelect(); }}>{channel.property === "unused" ? "Add Property" : "Change Property"}</button></header>
    <div className="channel-options"><label><span>Property</span><code>{channel.property}</code></label><label><span>Cell / Pixel</span><input aria-label={`Channel ${index + 1} pixel`} type="number" min={1} max={512} value={channel.pixel ?? ""} placeholder="Whole fixture" onClick={(event) => event.stopPropagation()} onChange={(event) => onUpdate({ pixel: event.target.value ? Number(event.target.value) : null })} /></label><label className="hazard-toggle"><input type="checkbox" checked={channel.hazardous} onClick={(event) => event.stopPropagation()} onChange={(event) => onUpdate({ hazardous: event.target.checked })} /><span>Safety-critical channel</span></label></div>
    <div className="range-table"><div className="range-table-heading"><span>DMX RANGE</span><span>NAME</span><span>SEMANTIC VALUE</span><span>UNIT</span><span>SAFETY</span><span /></div>{channel.ranges.map((range, rangeIndex) => <div className="range-row" key={rangeIndex}><label><input aria-label={`Range ${rangeIndex + 1} start`} type="number" min={0} max={255} value={range.start} onChange={(event) => onUpdateRange(rangeIndex, { start: clampByte(Number(event.target.value)) })} /><b>–</b><input aria-label={`Range ${rangeIndex + 1} end`} type="number" min={0} max={255} value={range.end} onChange={(event) => onUpdateRange(rangeIndex, { end: clampByte(Number(event.target.value)) })} /></label><input aria-label={`Range ${rangeIndex + 1} name`} value={range.label} onChange={(event) => onUpdateRange(rangeIndex, { label: event.target.value })} /><label><input aria-label={`Range ${rangeIndex + 1} semantic minimum`} type="number" value={range.semanticMin} onChange={(event) => onUpdateRange(rangeIndex, { semanticMin: Number(event.target.value) })} /><b>→</b><input aria-label={`Range ${rangeIndex + 1} semantic maximum`} type="number" value={range.semanticMax} onChange={(event) => onUpdateRange(rangeIndex, { semanticMax: Number(event.target.value) })} /></label><input aria-label={`Range ${rangeIndex + 1} unit`} value={range.unit} onChange={(event) => onUpdateRange(rangeIndex, { unit: event.target.value })} /><label className="range-hazard"><input aria-label={`Range ${rangeIndex + 1} hazardous`} type="checkbox" checked={range.hazardous} onChange={(event) => onUpdateRange(rangeIndex, { hazardous: event.target.checked })} /><span>{range.hazardous ? "⚠" : "—"}</span></label><button aria-label={`Delete range ${rangeIndex + 1}`} disabled={channel.ranges.length === 1} onClick={() => onDeleteRange(rangeIndex)}>×</button></div>)}</div>
    <footer><button onClick={onAddRange}>＋ Add Range</button><span>{error ? `⚠ ${error}` : `✓ Complete 0–255 mapping · ${isFine ? "paired 16-bit precision" : "8-bit, 256 steps"}`}</span></footer>
  </article>;
}

function FixtureTester({ definition, mode, patchedFixtures, fixtureId, onFixtureChange, armed, confirming, onAskArm, onCancelArm, onArm, parameterId, onParameterChange, raw, onRawChange }: {
  definition?: FixtureDefinitionSummary | undefined;
  mode?: FixtureDefinitionSummary["modes"][number] | undefined;
  patchedFixtures: ReturnType<typeof useShowStore.getState>["fixtures"];
  fixtureId: string;
  onFixtureChange: (id: string) => void;
  armed: boolean;
  confirming: boolean;
  onAskArm: () => void;
  onCancelArm: () => void;
  onArm: () => void;
  parameterId: string;
  onParameterChange: (id: string) => void;
  raw: number;
  onRawChange: (raw: number) => void;
}) {
  return <section className="fixture-profile-tester"><small>PHYSICAL DMX TESTER</small>{!definition ? <p>Save and patch one fixture first. Then reopen the custom profile to test it.</p> : patchedFixtures.length === 0 ? <p>Patch a {definition.model} fixture before testing this profile.</p> : <><label><span>Patched fixture</span><select value={fixtureId} onChange={(event) => onFixtureChange(event.target.value)}>{patchedFixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.name} · U{fixture.universe}/{fixture.address}</option>)}</select></label>{!armed && !confirming && <button className="arm-test-button" onClick={onAskArm}>⚠ Arm Fixture Tester…</button>}{confirming && <div className="tester-confirmation"><strong>Physical movement or flashing may start</strong><p>Clear the stage, verify the fixture address, and keep BLACKOUT available. Intensity is forced to zero before the tester is armed.</p><div><button onClick={onCancelArm}>Cancel</button><button onClick={onArm}>I Understand — Arm</button></div></div>}{armed && <><strong className="tester-armed">● TESTER ARMED</strong><label><span>Logical parameter</span><select value={parameterId} onChange={(event) => { onParameterChange(event.target.value); onRawChange(0); }}>{mode?.parameters.map((parameter) => <option value={parameter.id} key={parameter.id}>{parameter.name} · CH {parameter.coarseChannel}{parameter.fineChannel ? ` + ${parameter.fineChannel}` : ""}</option>)}</select></label><label><span>DMX value</span><input type="range" min={0} max={255} step={1} value={raw} onChange={(event) => onRawChange(Number(event.target.value))} /><output>{raw}</output></label><div className="tester-quick-values">{[0, 64, 128, 192, 255].map((value) => <button key={value} onClick={() => onRawChange(value)}>{value}</button>)}</div><p>Test values still pass through the logical fixture resolver; the UI never writes directly into a DMX frame.</p></>}</>}</section>;
}

function WizardProgress({ step }: { step: number }) {
  return <nav className="profile-wizard-progress" aria-label="Custom fixture progress">{["Type", "Information", "Channels", "Profile Editor"].map((label, index) => <span className={index === step ? "is-current" : index < step ? "is-complete" : ""} key={label}><b>{index < step ? "✓" : index + 1}</b><strong>{label}</strong></span>)}</nav>;
}

function WizardFooter({ onBack, onCancel, onContinue, disabled, continueLabel = "Continue" }: { onBack?: () => void; onCancel: () => void; onContinue: () => void; disabled?: boolean; continueLabel?: string }) {
  return <footer className="profile-wizard-footer"><button onClick={onBack ?? onCancel}>{onBack ? "Back" : "Cancel"}</button><span>Fixture profiles are saved inside the versioned project.</span><button className="primary" disabled={disabled} onClick={onContinue}>{continueLabel}</button></footer>;
}

function channelsFromDefinition(definition?: FixtureDefinitionSummary): CustomFixtureChannel[] {
  const mode = definition?.modes[0];
  if (!mode) return resizeChannels([], 4);
  if (mode.channels?.length) return mode.channels.map((channel) => ({
    channel: channel.channel,
    name: channel.name,
    property: channel.property,
    ranges: channel.ranges.map((range) => ({ ...range })),
    pixel: channel.pixel,
    hazardous: channel.hazardous,
  }));
  const result = resizeChannels([], mode.footprint);
  for (const parameter of mode.parameters) {
    const pixel = parsePixel(parameter.id);
    const property = propertyFromParameter(parameter.id);
    result[parameter.coarseChannel - 1] = {
      channel: parameter.coarseChannel,
      name: parameter.name,
      property,
      ranges: [blankRange(0, 255, parameter.name, propertyUnit(property))],
      pixel,
      hazardous: parameter.id === "control",
    };
    if (parameter.fineChannel) result[parameter.fineChannel - 1] = {
      channel: parameter.fineChannel,
      name: `${parameter.name} Fine`,
      property: `${property}.fine`,
      ranges: [blankRange(0, 255, `${parameter.name} Fine`, propertyUnit(property))],
      pixel,
      hazardous: false,
    };
  }
  return result;
}

function resizeChannels(current: CustomFixtureChannel[], count: number): CustomFixtureChannel[] {
  return Array.from({ length: count }, (_, index) => current[index] ?? {
    channel: index + 1,
    name: `Channel ${index + 1}`,
    property: "unused",
    ranges: [blankRange(0, 255, "No Function")],
    pixel: null,
    hazardous: false,
  }).map((channel, index) => ({ ...channel, channel: index + 1 }));
}

function blankRange(start: number, end: number, label: string, unit = "raw"): FixtureRangeSummary {
  return { start, end, label, semanticMin: 0, semanticMax: unit === "%" ? 100 : 255, unit, hazardous: false };
}

function validateProfile(input: { model: string; modeName: string; beamKind: FixtureBeamKind; beamAngleMin: number; beamAngleMax: number; footprint: number; channels: CustomFixtureChannel[] }): string[] {
  const errors: string[] = [];
  if (!input.model.trim()) errors.push("Fixture name is required.");
  if (!input.modeName.trim()) errors.push("Mode name is required.");
  if (input.footprint < 1 || input.footprint > 512 || input.channels.length !== input.footprint) errors.push("Channel count must be between 1 and 512.");
  if (input.beamKind !== "none" && (input.beamAngleMin <= 0 || input.beamAngleMax < input.beamAngleMin || input.beamAngleMax > 180)) errors.push("Beam angles are invalid.");
  for (const channel of input.channels) {
    const error = validateChannel(channel, input.channels);
    if (error) errors.push(`CH ${channel.channel}: ${error}`);
  }
  return [...new Set(errors)];
}

function validateChannel(channel: CustomFixtureChannel, channels: CustomFixtureChannel[]): string | undefined {
  if (!channel.name.trim()) return "Channel name is required.";
  if (channel.ranges.length === 0) return "Add at least one DMX range.";
  let next = 0;
  for (const range of channel.ranges) {
    if (range.start !== next || range.start > range.end) return "Ranges must cover 0–255 in order, without gaps or overlaps.";
    if (!range.label.trim() || !Number.isFinite(range.semanticMin) || !Number.isFinite(range.semanticMax)) return "Every range needs a name and numeric semantic values.";
    next = range.end + 1;
  }
  if (next !== 256) return "Ranges must end at 255.";
  const key = parameterKey(channel);
  if (channel.property.endsWith(".fine")) {
    const coarse = channels.some((candidate) => !candidate.property.endsWith(".fine") && parameterKey(candidate) === key);
    if (!coarse) return "Fine property needs a matching coarse channel with the same cell number.";
  } else if (key && channels.some((candidate) => candidate.channel !== channel.channel && !candidate.property.endsWith(".fine") && parameterKey(candidate) === key)) {
    return "This logical property is already assigned. Use a different cell/pixel number.";
  }
  return undefined;
}

function parameterKey(channel: CustomFixtureChannel): string | null {
  if (channel.property === "unused") return null;
  const base = channel.property.replace(/\.fine$/, "");
  if (base === "custom") return `${base}.channel-${channel.channel}`;
  return `${base}::${channel.pixel ?? 0}`;
}

function propertyFromParameter(parameterId: string): string {
  return parameterId.replace(/\.pixel-\d+$/, "");
}

function parsePixel(parameterId: string): number | null {
  const match = parameterId.match(/\.pixel-(\d+)$/);
  return match ? Number(match[1]) : null;
}

function propertyUnit(property: string): string {
  return properties.find((entry) => entry.id === property)?.unit ?? "raw";
}

function pairedCount(channels: CustomFixtureChannel[]): number {
  return channels.filter((channel) => channel.property.endsWith(".fine") && !validateChannel(channel, channels)).length;
}

function pixelCount(channels: CustomFixtureChannel[]): number {
  return new Set(channels.flatMap((channel) => channel.pixel ? [channel.pixel] : [])).size;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function iconGlyph(icon: string): string {
  return ({ "moving-head": "♙", par: "◉", spot: "◍", wash: "◌", blinder: "▦", strobe: "✦", "led-bar": "▥", bulb: "●", fog: "☁", fixture: "◇" } as Record<string, string>)[icon] ?? "◇";
}
