import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useShowStore } from "../store/showStore";
import type { CustomFixtureChannel, StageObjectKind } from "../types/show";

const tabs = ["Fixtures", "Groups", "Objects", "Layers"] as const;
const objectKinds: { kind: StageObjectKind; label: string; icon: string }[] = [
  { kind: "truss", label: "Truss", icon: "═" },
  { kind: "speaker", label: "Speaker", icon: "▣" },
  { kind: "stage", label: "Stage", icon: "▰" },
  { kind: "person", label: "Person", icon: "♙" },
  { kind: "shape", label: "Shape", icon: "◇" },
];

export function ObjectPanel() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Fixtures");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"fixture" | "custom-fixture" | "group" | "object" | null>(null);
  const [definitionId, setDefinitionId] = useState("");
  const [modeId, setModeId] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [itemName, setItemName] = useState("");
  const [objectKind, setObjectKind] = useState<StageObjectKind>("truss");
  const fixtures = useShowStore((state) => state.fixtures);
  const stageObjects = useShowStore((state) => state.stageObjects);
  const groups = useShowStore((state) => state.groups);
  const selectedFixtureIds = useShowStore((state) => state.selectedFixtureIds);
  const selectedStageObjectIds = useShowStore((state) => state.selectedStageObjectIds);
  const selectFixtures = useShowStore((state) => state.selectFixtures);
  const selectStageObjects = useShowStore((state) => state.selectStageObjects);
  const fixtureDefinitions = useShowStore((state) => state.fixtureDefinitions);
  const addFixture = useShowStore((state) => state.addFixture);
  const addStageObject = useShowStore((state) => state.addStageObject);
  const putGroup = useShowStore((state) => state.putGroup);
  const deleteGroup = useShowStore((state) => state.deleteGroup);
  const operationMode = useShowStore((state) => state.mode);
  const normalizedLibraryQuery = libraryQuery.trim().toLowerCase();
  const visibleDefinitions = fixtureDefinitions.filter((definition) =>
    `${definition.manufacturer} ${definition.model}`.toLowerCase().includes(normalizedLibraryQuery),
  );
  const selectedDefinition = visibleDefinitions.find(
    (definition) => definition.id === definitionId,
  ) ?? visibleDefinitions[0];
  const selectedMode = selectedDefinition?.modes.find(
    (mode) => mode.id === (modeId || selectedDefinition.modes[0]?.id),
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFixtures = fixtures.filter((fixtureItem) =>
    fixtureItem.name.toLowerCase().includes(normalizedQuery),
  );
  const visibleObjects = stageObjects.filter((stageObject) =>
    stageObject.name.toLowerCase().includes(normalizedQuery),
  );
  const visibleGroups = groups.filter((group) => group.name.toLowerCase().includes(normalizedQuery));
  const layers = useMemo(() => {
    const names = new Map<string, { fixtures: string[]; objects: string[] }>();
    for (const fixtureItem of fixtures) {
      const layer = names.get(fixtureItem.layer) ?? { fixtures: [], objects: [] };
      layer.fixtures.push(fixtureItem.id);
      names.set(fixtureItem.layer, layer);
    }
    for (const stageObject of stageObjects) {
      const layer = names.get(stageObject.layer) ?? { fixtures: [], objects: [] };
      layer.objects.push(stageObject.id);
      names.set(stageObject.layer, layer);
    }
    return [...names.entries()];
  }, [fixtures, stageObjects]);
  const count = activeTab === "Fixtures"
    ? visibleFixtures.length
    : activeTab === "Groups"
      ? visibleGroups.length
      : activeTab === "Objects"
        ? visibleObjects.length
        : layers.length;

  const openAddDialog = () => {
    if (activeTab === "Fixtures") setDialog("fixture");
    if (activeTab === "Groups" && selectedFixtureIds.length > 0) setDialog("group");
    if (activeTab === "Objects") setDialog("object");
  };

  return (
    <aside className="panel object-panel" aria-label="Project objects">
      <div className="panel-tabs">
        {tabs.map((tab) => (
          <button key={tab} className={activeTab === tab ? "is-active" : ""} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>
      <div className="panel-search">
        <span aria-hidden="true">⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeTab.toLowerCase()}`} aria-label={`Search ${activeTab}`} />
        <button
          title={operationMode === "live"
            ? "Switch to EDIT to add items"
            : activeTab === "Groups" && selectedFixtureIds.length === 0
              ? "Select fixtures first"
              : `Add ${activeTab.toLowerCase()}`}
          aria-label="Add item"
          disabled={operationMode === "live" || activeTab === "Layers" || (activeTab === "Groups" && selectedFixtureIds.length === 0)}
          onClick={openAddDialog}
        >＋</button>
      </div>

      <div className="collection-heading"><span>{activeTab.toUpperCase()}</span><small>{count}</small></div>

      {activeTab === "Fixtures" && (
        <div className="fixture-list">
          {visibleFixtures.map((fixtureItem) => (
            <button key={fixtureItem.id} className={`fixture-row ${selectedFixtureIds.includes(fixtureItem.id) ? "is-selected" : ""}`} onClick={(event) => selectFixtures([fixtureItem.id], event.shiftKey)}>
              <span className={`fixture-icon kind-${fixtureItem.kind}`}><i style={{ background: fixtureItem.color }} /></span>
              <span className="fixture-copy"><strong>{fixtureItem.name}</strong><small>U{fixtureItem.universe} · {fixtureItem.address || "Unpatched"}</small></span>
              <span className="fixture-level">{Math.round(fixtureItem.intensity * 100)}</span>
            </button>
          ))}
        </div>
      )}

      {activeTab === "Groups" && (
        <div className="fixture-list">
          {visibleGroups.map((group) => (
            <div className="collection-row" key={group.id}>
              <button onClick={() => selectFixtures(group.fixtureIds)}><span className="collection-icon">◎</span><span><strong>{group.name}</strong><small>{group.fixtureIds.length} fixtures</small></span></button>
              <button className="row-delete" aria-label={`Delete ${group.name}`} disabled={operationMode === "live"} onClick={() => deleteGroup(group.id)}>×</button>
            </div>
          ))}
          {visibleGroups.length === 0 && <EmptyCollection icon="◎" label="groups" hint="Select fixtures, then press + to create a group." />}
        </div>
      )}

      {activeTab === "Objects" && (
        <div className="fixture-list">
          {visibleObjects.map((stageObject) => (
            <button key={stageObject.id} className={`fixture-row object-row ${selectedStageObjectIds.includes(stageObject.id) ? "is-selected" : ""}`} onClick={(event) => selectStageObjects([stageObject.id], event.shiftKey)}>
              <span className="object-icon">{objectKinds.find((entry) => entry.kind === stageObject.kind)?.icon ?? "◇"}</span>
              <span className="fixture-copy"><strong>{stageObject.name}</strong><small>{stageObject.layer}</small></span>
              <span className="fixture-level">{stageObject.locked ? "🔒" : ""}</span>
            </button>
          ))}
          {visibleObjects.length === 0 && <EmptyCollection icon="◇" label="stage objects" hint="Press + to add a truss, speaker, stage or person." />}
        </div>
      )}

      {activeTab === "Layers" && (
        <div className="fixture-list">
          {layers.map(([name, members]) => (
            <div className="collection-row layer-row" key={name}>
              <button onClick={() => members.fixtures.length > 0 ? selectFixtures(members.fixtures) : selectStageObjects(members.objects)}>
                <span className="collection-icon">▱</span><span><strong>{name}</strong><small>{members.fixtures.length + members.objects.length} objects</small></span>
              </button>
            </div>
          ))}
          {layers.length === 0 && <EmptyCollection icon="▱" label="layers" hint="Layers appear when objects are added to the Stage." />}
        </div>
      )}

      <div className="panel-footer"><button><span className="status-dot is-good" /> {fixtures.length} fixtures · {stageObjects.length} objects</button><button title="Panel options">•••</button></div>

      {dialog === "fixture" && (
        <Dialog title="Add Fixture" eyebrow="FIXTURE LIBRARY" onClose={() => setDialog(null)} onSubmit={() => {
          if (!selectedDefinition || !selectedMode) return;
          addFixture(selectedDefinition.id, selectedMode.id, itemName || selectedDefinition.model);
          setDialog(null); setItemName("");
        }} submitLabel="Add & Auto-patch">
          <label><span>Search {fixtureDefinitions.length} offline profiles</span><input autoFocus value={libraryQuery} onChange={(event) => { setLibraryQuery(event.target.value); setDefinitionId(""); setModeId(""); }} placeholder="Manufacturer or model…" /></label>
          <label><span>Fixture type</span><select value={selectedDefinition?.id ?? ""} onChange={(event) => { setDefinitionId(event.target.value); setModeId(""); }}>{visibleDefinitions.map((definition) => <option key={definition.id} value={definition.id}>[{definition.source.toUpperCase()}] {definition.manufacturer} · {definition.model}</option>)}</select></label>
          <label><span>DMX mode</span><select value={selectedMode?.id ?? ""} onChange={(event) => setModeId(event.target.value)}>{selectedDefinition?.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name} · {mode.footprint} ch</option>)}</select></label>
          <label><span>Name</span><input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder={selectedDefinition?.model ?? "Fixture name"} /></label>
          {visibleDefinitions.length === 0
            ? <p>No matching profile. Create a custom fixture and define what each DMX channel does.</p>
            : <p>{selectedDefinition?.source === "ofl" ? "Open Fixture Library offline profile." : "LightHouse fixture profile."} Auto-patch finds the next free DMX address.</p>}
          <button className="custom-fixture-link" type="button" onClick={() => setDialog("custom-fixture")}>＋ CREATE CUSTOM FIXTURE</button>
        </Dialog>
      )}

      {dialog === "custom-fixture" && (
        <CustomFixtureDialog
          onClose={() => setDialog("fixture")}
          onCreated={(id) => {
            setLibraryQuery("");
            setDefinitionId(id);
            setModeId("");
            setDialog("fixture");
          }}
        />
      )}

      {dialog === "group" && (
        <Dialog title="Create Group" eyebrow="FIXTURE SELECTION" onClose={() => setDialog(null)} onSubmit={() => { putGroup(null, itemName || "Fixture Group", selectedFixtureIds); setDialog(null); setItemName(""); }} submitLabel="Create Group">
          <label><span>Name</span><input autoFocus value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Front Wash" /></label>
          <p>The group will contain the {selectedFixtureIds.length} currently selected fixture{selectedFixtureIds.length === 1 ? "" : "s"}.</p>
        </Dialog>
      )}

      {dialog === "object" && (
        <Dialog title="Add Stage Object" eyebrow="2D LAYOUT" onClose={() => setDialog(null)} onSubmit={() => { const label = objectKinds.find((entry) => entry.kind === objectKind)?.label ?? "Object"; addStageObject(objectKind, itemName || label); setDialog(null); setItemName(""); }} submitLabel="Add to Stage">
          <label><span>Object type</span><select value={objectKind} onChange={(event) => setObjectKind(event.target.value as StageObjectKind)}>{objectKinds.map((entry) => <option value={entry.kind} key={entry.kind}>{entry.label}</option>)}</select></label>
          <label><span>Name</span><input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder={objectKinds.find((entry) => entry.kind === objectKind)?.label} /></label>
          <p>Stage objects are visual only and never consume DMX channels.</p>
        </Dialog>
      )}
    </aside>
  );
}

function CustomFixtureDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (definitionId: string) => void;
}) {
  const putCustomFixture = useShowStore((state) => state.putCustomFixture);
  const [manufacturer, setManufacturer] = useState("Custom");
  const [model, setModel] = useState("");
  const [modeName, setModeName] = useState("Standard");
  const [footprint, setFootprint] = useState(1);
  const [channels, setChannels] = useState<CustomFixtureChannel[]>([
    customChannel(1, "Intensity", "intensity", "intensity"),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const updateChannel = (index: number, update: Partial<CustomFixtureChannel>) => {
    setChannels((current) => current.map((channel, channelIndex) =>
      channelIndex === index ? { ...channel, ...update } : channel));
  };
  const submit = async () => {
    setSaving(true);
    setError(undefined);
    const definitionId = await putCustomFixture({
      manufacturer,
      model,
      modeId: slug(modeName) || "custom-mode",
      modeName,
      footprint,
      channels,
    });
    setSaving(false);
    if (definitionId) onCreated(definitionId);
    else setError("The fixture definition is invalid. Check channel numbers and duplicate parameters.");
  };

  return (
    <div className="fixture-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="fixture-dialog custom-fixture-dialog" aria-label="Create Custom Fixture" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <header><div><small>CUSTOM FIXTURE</small><h2>Define DMX channels</h2></div><button type="button" onClick={onClose}>×</button></header>
        <div className="custom-fixture-meta">
          <label><span>Manufacturer</span><input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} /></label>
          <label><span>Model</span><input autoFocus required value={model} onChange={(event) => setModel(event.target.value)} placeholder="My RGB PAR" /></label>
          <label><span>Mode</span><input required value={modeName} onChange={(event) => setModeName(event.target.value)} /></label>
          <label><span>Footprint</span><input required type="number" min={1} max={512} value={footprint} onChange={(event) => setFootprint(Number(event.target.value))} /></label>
        </div>
        <div className="custom-channel-heading"><span>DMX</span><span>Function</span><span>Logical parameter</span><span>Type</span><span>Default</span><span>Invert</span><span /></div>
        <div className="custom-channel-list">
          {channels.map((channel, index) => (
            <div className="custom-channel-row" key={index}>
              <div className="channel-addresses">
                <input aria-label={`Coarse channel ${index + 1}`} type="number" min={1} max={512} value={channel.coarseChannel} onChange={(event) => updateChannel(index, { coarseChannel: Number(event.target.value) })} />
                <select aria-label={`Resolution ${index + 1}`} value={channel.fineChannel === null ? "8" : "16"} onChange={(event) => updateChannel(index, { fineChannel: event.target.value === "16" ? channel.coarseChannel + 1 : null })}><option value="8">8-bit</option><option value="16">16-bit</option></select>
                {channel.fineChannel !== null && <input aria-label={`Fine channel ${index + 1}`} title="Fine channel" type="number" min={1} max={512} value={channel.fineChannel} onChange={(event) => updateChannel(index, { fineChannel: Number(event.target.value) })} />}
              </div>
              <input aria-label={`Function name ${index + 1}`} required value={channel.name} onChange={(event) => updateChannel(index, { name: event.target.value })} placeholder="Dimmer" />
              <input aria-label={`Parameter ID ${index + 1}`} required value={channel.parameterId} onChange={(event) => updateChannel(index, { parameterId: event.target.value })} placeholder="intensity" />
              <select aria-label={`Capability ${index + 1}`} value={channel.capability} onChange={(event) => updateChannel(index, { capability: event.target.value as CustomFixtureChannel["capability"] })}>
                <option value="intensity">Intensity</option><option value="color">Color</option><option value="position">Position</option><option value="beam">Beam</option><option value="shutter">Shutter</option><option value="gobo">Gobo</option><option value="custom">Custom</option>
              </select>
              <label className="channel-default"><input aria-label={`Default percent ${index + 1}`} type="number" min={0} max={100} value={Math.round(channel.defaultValue * 100)} onChange={(event) => updateChannel(index, { defaultValue: Number(event.target.value) / 100 })} /><span>%</span></label>
              <input aria-label={`Invert ${index + 1}`} type="checkbox" checked={channel.invert} onChange={(event) => updateChannel(index, { invert: event.target.checked })} />
              <button type="button" aria-label={`Delete channel ${index + 1}`} disabled={channels.length === 1} onClick={() => setChannels((current) => current.filter((_, channelIndex) => channelIndex !== index))}>×</button>
            </div>
          ))}
        </div>
        <button className="add-custom-channel" type="button" onClick={() => {
          const next = Math.min(512, Math.max(0, ...channels.flatMap((channel) => [channel.coarseChannel, channel.fineChannel ?? 0])) + 1);
          setChannels((current) => [...current, customChannel(next, `Channel ${next}`, `custom.channel-${next}`, "custom")]);
          setFootprint((current) => Math.max(current, next));
        }}>＋ ADD CHANNEL</button>
        <p className="custom-fixture-help">Map common controls to <code>intensity</code>, <code>color.red</code>, <code>color.green</code>, <code>color.blue</code>, <code>position.pan</code>, <code>position.tilt</code> or <code>beam.zoom</code>. Channel numbers are one-based.</p>
        {error && <p className="dialog-error">{error}</p>}
        <footer><button type="button" onClick={onClose}>Back</button><button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Fixture"}</button></footer>
      </form>
    </div>
  );
}

function customChannel(
  coarseChannel: number,
  name: string,
  parameterId: string,
  capability: CustomFixtureChannel["capability"],
): CustomFixtureChannel {
  return { name, parameterId, capability, coarseChannel, fineChannel: null, defaultValue: 0, invert: false };
}

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function EmptyCollection({ icon, label, hint }: { icon: string; label: string; hint: string }) {
  return <div className="empty-panel"><span>{icon}</span><strong>No {label} yet</strong><p>{hint}</p></div>;
}

function Dialog({ title, eyebrow, onClose, onSubmit, submitLabel, children }: { title: string; eyebrow: string; onClose: () => void; onSubmit: () => void; submitLabel: string; children: ReactNode }) {
  return (
    <div className="fixture-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="fixture-dialog" aria-label={title} onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <header><div><small>{eyebrow}</small><h2>{title}</h2></div><button type="button" onClick={onClose}>×</button></header>
        {children}
        <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{submitLabel}</button></footer>
      </form>
    </div>
  );
}
