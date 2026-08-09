import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent as ReactMouseEvent } from "react";

import { useShowStore } from "../store/showStore";
import type { FixtureDefinitionSummary, LayoutFixture } from "../types/show";
import { CustomFixtureDialog } from "./CustomFixtureEditor";
import { MacWindowControls } from "./MacWindowControls";

interface FixtureManagerProps {
  onDone: () => void;
  embedded?: boolean;
  onBack?: () => void;
  onShowInStage?: () => void;
}

type ProfileTab = "profile" | "patching" | "channels";
type SourceFilter = "all" | "generic" | "ofl" | "custom";

export function FixtureManager({ onDone, embedded = false, onBack, onShowInStage }: FixtureManagerProps) {
  const definitions = useShowStore((state) => state.fixtureDefinitions);
  const fixtures = useShowStore((state) => state.fixtures);
  const universes = useShowStore((state) => state.universes);
  const addUniverse = useShowStore((state) => state.addUniverse);
  const addFixturesAtPatch = useShowStore((state) => state.addFixturesAtPatch);
  const selectFixtures = useShowStore((state) => state.selectFixtures);
  const duplicateSelection = useShowStore((state) => state.duplicateSelection);
  const deleteSelection = useShowStore((state) => state.deleteSelection);
  const captureFixtureHistory = useShowStore((state) => state.captureFixtureHistory);
  const updateSelectedFixtures = useShowStore((state) => state.updateSelectedFixtures);
  const openProject = useShowStore((state) => state.openProject);
  const saveProjectAs = useShowStore((state) => state.saveProjectAs);
  const [query, setQuery] = useState("");
  const [manufacturer, setManufacturer] = useState("Generic");
  const [definitionId, setDefinitionId] = useState("");
  const [modeId, setModeId] = useState("");
  const [universe, setUniverse] = useState(1);
  const [address, setAddress] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [shortName, setShortName] = useState("P");
  const [customOpen, setCustomOpen] = useState(false);
  const [customDefinitionId, setCustomDefinitionId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>();
  const [patchOpen, setPatchOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fixture: LayoutFixture }>();
  const [profileTab, setProfileTab] = useState<ProfileTab>("profile");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(window.localStorage.getItem("lighthouse.fixtureFavorites") ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });

  const normalized = query.trim().toLowerCase();
  const visibleDefinitions = useMemo(() => definitions.filter((definition) => {
    const matchesSource = sourceFilter === "all" || definition.source === sourceFilter;
    const matchesQuery = !normalized
      || `${definition.manufacturer} ${definition.model} ${definition.modes.map((mode) => `${mode.name} ${mode.footprint}`).join(" ")}`
        .toLowerCase().includes(normalized);
    return matchesSource && matchesQuery;
  }), [definitions, normalized, sourceFilter]);
  const manufacturers = useMemo(() => {
    const values = [...new Set(visibleDefinitions.map((definition) => displayManufacturer(definition)))];
    return values.sort((left, right) => left.localeCompare(right));
  }, [visibleDefinitions]);

  useEffect(() => {
    const firstManufacturer = manufacturers[0];
    if (firstManufacturer && !manufacturers.includes(manufacturer)) {
      setManufacturer(firstManufacturer);
    }
  }, [manufacturer, manufacturers]);

  const profiles = visibleDefinitions.filter((definition) => displayManufacturer(definition) === manufacturer);
  const selectedDefinition = visibleDefinitions.find((definition) => definition.id === definitionId)
    ?? profiles[0]
    ?? visibleDefinitions[0];
  const selectedMode = selectedDefinition?.modes.find((mode) => mode.id === modeId)
    ?? selectedDefinition?.modes[0];

  useEffect(() => {
    if (!selectedDefinition) return;
    if (definitionId !== selectedDefinition.id) setDefinitionId(selectedDefinition.id);
    if (!selectedDefinition.modes.some((mode) => mode.id === modeId)) {
      setModeId(selectedDefinition.modes[0]?.id ?? "");
    }
  }, [definitionId, modeId, selectedDefinition]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(undefined);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);

  const occupied = useMemo(() => buildOccupancy(fixtures, universe), [fixtures, universe]);
  const footprint = selectedMode?.footprint ?? 1;
  const previewEnd = address + footprint * quantity - 1;
  const conflictChannels = new Set<number>();
  for (let channel = address; channel <= Math.min(512, previewEnd); channel += 1) {
    if (occupied.has(channel)) conflictChannels.add(channel);
  }
  const invalidRange = address < 1 || previewEnd > 512;
  const hasConflict = conflictChannels.size > 0 || invalidRange;

  const selectProfile = (definition: FixtureDefinitionSummary) => {
    setDefinitionId(definition.id);
    setModeId(definition.modes[0]?.id ?? "");
    setShortName(suggestShortName(definition));
  };

  const dropAt = (event: DragEvent<HTMLButtonElement>, channel: number) => {
    event.preventDefault();
    const dropped = definitions.find((definition) => definition.id === event.dataTransfer.getData("application/x-lighthouse-fixture"));
    if (dropped) selectProfile(dropped);
    setAddress(channel);
    setProfileTab("profile");
    setError(undefined);
    setPatchOpen(true);
  };

  const patch = async () => {
    if (!selectedDefinition || !selectedMode || hasConflict) return;
    setAdding(true);
    setError(undefined);
    const saved = await addFixturesAtPatch(
      selectedDefinition.id,
      selectedMode.id,
      shortName.trim() || selectedDefinition.model,
      quantity,
      universe,
      address,
    );
    setAdding(false);
    if (!saved) {
      setError(useShowStore.getState().engineError ?? "The fixture could not be patched.");
      return;
    }
    setAddress(Math.min(512, previewEnd + 1));
    setPatchOpen(false);
  };

  const patchFirstFree = async (definition: FixtureDefinitionSummary) => {
    const mode = definition.modes[0];
    if (!mode || adding) return;
    const start = findFirstFree(occupied, mode.footprint);
    setAdding(true);
    setError(undefined);
    const saved = await addFixturesAtPatch(
      definition.id,
      mode.id,
      suggestShortName(definition),
      1,
      universe,
      start,
    );
    setAdding(false);
    if (!saved) {
      setError(useShowStore.getState().engineError ?? "The fixture could not be patched.");
      setPatchOpen(true);
      return;
    }
    setAddress(Math.min(512, start + mode.footprint));
    setPatchOpen(false);
  };

  const inspectPatchedFixture = (fixture: LayoutFixture, tab: ProfileTab = "profile") => {
    const definition = definitions.find((entry) => entry.id === fixture.definitionId);
    if (definition) {
      setDefinitionId(definition.id);
      setModeId(fixture.modeId);
      setShortName(fixture.name.replace(/\d+$/, "") || suggestShortName(definition));
    }
    setUniverse(fixture.universe);
    setAddress(fixture.address);
    setQuantity(1);
    setProfileTab(tab);
    setPatchOpen(true);
    selectFixtures([fixture.id]);
  };

  const openFixtureContext = (event: ReactMouseEvent<HTMLButtonElement>, fixture: LayoutFixture) => {
    event.preventDefault();
    event.stopPropagation();
    selectFixtures([fixture.id]);
    setContextMenu({ x: event.clientX, y: event.clientY, fixture });
  };

  const toggleFavorite = () => {
    if (!selectedDefinition) return;
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(selectedDefinition.id)) next.delete(selectedDefinition.id);
      else next.add(selectedDefinition.id);
      window.localStorage.setItem("lighthouse.fixtureFavorites", JSON.stringify([...next]));
      return next;
    });
  };

  const cycleSourceFilter = () => {
    const values: SourceFilter[] = ["all", "generic", "ofl", "custom"];
    setSourceFilter(values[(values.indexOf(sourceFilter) + 1) % values.length] ?? "all");
  };

  const openCustomFixture = (definition?: FixtureDefinitionSummary) => {
    setCustomDefinitionId(definition?.source === "custom" ? definition.id : null);
    setCustomOpen(true);
  };

  return (
    <section className={`fixture-manager-screen ${embedded ? "is-embedded" : ""}`}>
      {!embedded && <header className="fixture-manager-titlebar"><MacWindowControls /><button className="native-done" onClick={onDone}>Done</button><strong>{useShowStore.getState().projectName}</strong><div className="titlebar-actions"><button title="Open another project" onClick={() => { void openProject(); }}>↗</button><button title="Save project copy" onClick={() => { void saveProjectAs(); }}>⇩</button><button title="Create custom fixture" onClick={() => openCustomFixture()}>＋</button></div></header>}
      <div className="fixture-manager-body">
        <aside className="fixture-library-pane">
          <div className="fixture-library-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Fixture Library" /><button className={selectedDefinition && favoriteIds.has(selectedDefinition.id) ? "is-active" : ""} title="Favorite selected profile" onClick={toggleFavorite}>{selectedDefinition && favoriteIds.has(selectedDefinition.id) ? "★" : "☆"}</button><button className={sourceFilter !== "all" ? "is-active" : ""} title={`Source filter: ${sourceFilter}`} onClick={cycleSourceFilter}>▽</button><button title={selectedDefinition?.source === "custom" ? "Edit selected custom fixture" : "Create custom fixture"} onClick={() => openCustomFixture(selectedDefinition)}>•••</button></div>
          <div className="fixture-library-columns">
            <div className="manufacturer-column"><header>Manufacturers</header>{manufacturers.map((name) => <button className={name === manufacturer ? "is-selected" : ""} key={name} onClick={() => setManufacturer(name)}>{name}</button>)}</div>
            <div className="profile-column"><header>Profiles ({manufacturer})</header>{profiles.map((definition) => <button draggable className={definition.id === selectedDefinition?.id ? "is-selected" : ""} key={definition.id} onDragStart={(event) => { event.dataTransfer.setData("application/x-lighthouse-fixture", definition.id); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => selectProfile(definition)} onDoubleClick={() => { void patchFirstFree(definition); }}><span>{fixtureGlyph(definition)}</span><span><strong>{definition.model}</strong><small>{definition.modes.map((mode) => `${mode.footprint}ch`).join(" · ")} · Double-click: auto patch</small></span></button>)}</div>
          </div>
          <button className="custom-profile-button" onClick={() => openCustomFixture()}>♙ <span><strong>Custom Profiles</strong><small>Create and categorize channels</small></span><b>›</b></button>
          <footer><span>{visibleDefinitions.length.toLocaleString()} of {definitions.length.toLocaleString()} profiles · {sourceFilter}</span><button title="Reset library filters" onClick={() => { setQuery(""); setSourceFilter("all"); }}>↻</button></footer>
        </aside>

        <section className="patch-pane">
          <header className="universe-tabs">
            {universes.map((item) => <button className={universe === item.id ? "is-active" : ""} key={item.id} onClick={() => setUniverse(item.id)}><strong>{item.name}</strong><small>{item.enabled ? "Output configured" : "No output"}</small></button>)}
            <button className="add-universe-tab" onClick={addUniverse}>＋ Universe</button>
          </header>
          <div className="dmx-grid" role="grid" aria-label={`DMX Universe ${universe}`}>
            {Array.from({ length: 512 }, (_, index) => index + 1).map((channel) => {
              const used = occupied.get(channel);
              const preview = channel >= address && channel <= previewEnd;
              const conflict = preview && (invalidRange || conflictChannels.has(channel));
              const style = used ? { "--patch-color": used.fixture.color } as CSSProperties : undefined;
              return <button
                className={`dmx-cell ${used ? "is-occupied" : ""} ${used?.isStart ? "is-start" : ""} ${preview ? "is-preview" : ""} ${conflict ? "is-conflict" : ""}`}
                style={style}
                key={channel}
                onClick={() => {
                  if (used) inspectPatchedFixture(used.fixture);
                  else {
                    setAddress(channel);
                    setProfileTab("profile");
                    setPatchOpen(true);
                  }
                }}
                onDoubleClick={() => { if (used) inspectPatchedFixture(used.fixture, "channels"); }}
                onContextMenu={(event) => { if (used) openFixtureContext(event, used.fixture); }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropAt(event, channel)}
                title={used ? `${used.fixture.name} · U${universe}/${used.fixture.address}` : `Channel ${channel}`}
              ><span>{String(channel).padStart(3, "0")}</span>{used?.isStart && <strong>{used.fixture.name}</strong>}</button>;
            })}
          </div>

          {patchOpen && <div className={`patch-popover ${hasConflict ? "has-conflict" : ""}`}>
            <button className="patch-popover-close" aria-label="Close patch editor" onClick={() => setPatchOpen(false)}>×</button>
            <div className="patch-popover-tabs"><button className={profileTab === "profile" ? "is-active" : ""} onClick={() => setProfileTab("profile")}>Profile</button><button className={profileTab === "patching" ? "is-active" : ""} onClick={() => setProfileTab("patching")}>Patching</button><button className={profileTab === "channels" ? "is-active" : ""} onClick={() => setProfileTab("channels")}>Channels</button></div>
            {profileTab === "profile" && <><div className="patch-profile-summary"><span>{fixtureGlyph(selectedDefinition)}</span><div><small>{selectedDefinition?.manufacturer ?? "Select a profile"}</small><strong>{selectedDefinition?.model ?? "No fixture selected"}</strong></div></div><label><span>Mode</span><select value={selectedMode?.id ?? ""} onChange={(event) => setModeId(event.target.value)}>{selectedDefinition?.modes.map((mode) => <option value={mode.id} key={mode.id}>{mode.name} ({mode.footprint} channels)</option>)}</select></label></>}
            {profileTab === "patching" && <><label><span>Quantity</span><input type="number" min={1} max={128} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(128, Number(event.target.value))))} /></label><label><span>Short name</span><input value={shortName} onChange={(event) => setShortName(event.target.value)} /></label><label><span>Start address</span><input type="number" min={1} max={512} value={address} onChange={(event) => setAddress(Number(event.target.value))} /></label></>}
            {profileTab === "channels" && <div className="patch-channel-list">{selectedMode?.parameters.map((parameter) => <span key={parameter.id}><b>CH {parameter.coarseChannel}</b><strong>{parameter.name}</strong><small>{parameter.resolution}-bit</small></span>)}{!selectedMode?.parameters.length && <p>No channel metadata for this mode.</p>}</div>}
            <div className="patch-preview-copy"><span>U{universe} · {address}–{Math.min(512, previewEnd)}</span><small>{footprint * quantity} channels</small></div>
            {hasConflict && <p>Address conflict — choose a free range.</p>}
            {error && <p>{error}</p>}
            <div className="patch-popover-actions"><button onClick={() => setAddress(findFirstFree(occupied, footprint * quantity))}>Find Free</button><button className="primary" disabled={!selectedMode || hasConflict || adding} onClick={() => { void patch(); }}>{adding ? "Patching…" : "Patch"}</button></div>
          </div>}
          {contextMenu && <div className="patch-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
            <button onClick={() => { inspectPatchedFixture(contextMenu.fixture); setContextMenu(undefined); }}>Get Info</button>
            <button onClick={() => { selectFixtures([contextMenu.fixture.id]); setContextMenu(undefined); onShowInStage?.(); }}>Show in Preview</button>
            <button onClick={() => { inspectPatchedFixture(contextMenu.fixture, "channels"); setContextMenu(undefined); }}>Open Profile</button>
            <button onClick={() => { const definition = definitions.find((entry) => entry.id === contextMenu.fixture.definitionId); if (definition) selectProfile(definition); setContextMenu(undefined); }}>Show Profile in Library</button>
            <hr />
            <button onClick={() => { captureFixtureHistory(); updateSelectedFixtures({ intensity: 0 }); setContextMenu(undefined); }}>Disable Output</button>
            <button onClick={() => { duplicateSelection(); setContextMenu(undefined); }}>Duplicate…</button>
            <button className="is-danger" onClick={() => { deleteSelection(); setContextMenu(undefined); }}>Delete…</button>
          </div>}
          <footer className="patch-footer"><button disabled={!onBack} onClick={onBack}>‹ Back</button><span><small>FIXTURE PATCHING</small><strong>Drag fixtures from the library to their address on the channel grid.</strong><b>{occupied.size} occupied · {512 - occupied.size} free channels in Universe {universe}</b></span>{embedded ? <button className="native-done" onClick={onDone}>Next ›</button> : <button className="native-done" onClick={onDone}>Done</button>}</footer>
        </section>
      </div>
      {customOpen && <CustomFixtureDialog definition={definitions.find((definition) => definition.id === customDefinitionId)} onClose={() => setCustomOpen(false)} onCreated={(id) => { const created = useShowStore.getState().fixtureDefinitions.find((definition) => definition.id === id); if (created) selectProfile(created); setCustomOpen(false); }} />}
    </section>
  );
}

function displayManufacturer(definition: FixtureDefinitionSummary): string {
  return definition.source === "generic" ? "Generic" : definition.manufacturer || "Generic";
}

function buildOccupancy(fixtures: LayoutFixture[], universe: number) {
  const map = new Map<number, { fixture: LayoutFixture; isStart: boolean }>();
  for (const fixture of fixtures) {
    if (fixture.universe !== universe || fixture.address < 1) continue;
    for (let channel = fixture.address; channel < fixture.address + fixture.footprint && channel <= 512; channel += 1) {
      map.set(channel, { fixture, isStart: channel === fixture.address });
    }
  }
  return map;
}

function findFirstFree(occupied: Map<number, unknown>, footprint: number): number {
  for (let start = 1; start <= 513 - footprint; start += 1) {
    let free = true;
    for (let channel = start; channel < start + footprint; channel += 1) {
      if (occupied.has(channel)) { free = false; break; }
    }
    if (free) return start;
  }
  return 1;
}

function suggestShortName(definition: FixtureDefinitionSummary): string {
  const model = definition.model.toUpperCase();
  if (model.includes("MOVING") || model.includes("HEAD")) return "MH";
  if (model.includes("BLIND")) return "BL";
  if (model.includes("STROBE")) return "ST";
  if (model.includes("FOG")) return "FG";
  return "P";
}

function fixtureGlyph(definition: FixtureDefinitionSummary | undefined): string {
  if (!definition) return "◉";
  if (definition.icon) return ({ "moving-head": "♙", par: "◉", spot: "◍", wash: "◌", blinder: "▦", strobe: "✳", "led-bar": "▥", bulb: "●", fog: "☁", fixture: "◇" } as Record<string, string>)[definition.icon] ?? "◇";
  if (definition.fixtureType) return ({ movingHead: "♙", par: "◉", spotlight: "◍", blinder: "▦", strobe: "✳", ledBar: "▥", bulb: "●", fog: "☁", other: "◇" } as Record<string, string>)[definition.fixtureType] ?? "◇";
  const value = definition.model.toLowerCase();
  if (value.includes("moving") || value.includes("head")) return "♙";
  if (value.includes("strobe")) return "✳";
  if (value.includes("fog")) return "☁";
  if (value.includes("bulb") || value.includes("dimmer")) return "◌";
  return "◉";
}
