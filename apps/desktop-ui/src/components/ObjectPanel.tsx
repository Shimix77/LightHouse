import { useState } from "react";

import { useShowStore } from "../store/showStore";

const tabs = ["Fixtures", "Groups", "Objects", "Layers"] as const;

export function ObjectPanel() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Fixtures");
  const [query, setQuery] = useState("");
  const [addingFixture, setAddingFixture] = useState(false);
  const [definitionId, setDefinitionId] = useState("");
  const [modeId, setModeId] = useState("");
  const [fixtureName, setFixtureName] = useState("");
  const fixtures = useShowStore((state) => state.fixtures);
  const selectedIds = useShowStore((state) => state.selectedFixtureIds);
  const selectFixtures = useShowStore((state) => state.selectFixtures);
  const fixtureDefinitions = useShowStore((state) => state.fixtureDefinitions);
  const addFixture = useShowStore((state) => state.addFixture);
  const operationMode = useShowStore((state) => state.mode);
  const selectedDefinition = fixtureDefinitions.find(
    (definition) => definition.id === (definitionId || fixtureDefinitions[0]?.id),
  );
  const selectedMode = selectedDefinition?.modes.find(
    (mode) => mode.id === (modeId || selectedDefinition.modes[0]?.id),
  );

  const visible = fixtures.filter((fixtureItem) =>
    fixtureItem.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <aside className="panel object-panel" aria-label="Project objects">
      <div className="panel-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? "is-active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="panel-search">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${activeTab.toLowerCase()}`}
          aria-label={`Search ${activeTab}`}
        />
        <button
          title={operationMode === "live" ? "Switch to EDIT to add fixtures" : "Add fixture"}
          aria-label="Add item"
          disabled={operationMode === "live"}
          onClick={() => setAddingFixture(true)}
        >＋</button>
      </div>

      <div className="collection-heading">
        <span>{activeTab.toUpperCase()}</span>
        <small>{activeTab === "Fixtures" ? fixtures.length : 0}</small>
      </div>

      {activeTab === "Fixtures" ? (
        <div className="fixture-list">
          {visible.map((fixtureItem) => (
            <button
              key={fixtureItem.id}
              className={`fixture-row ${selectedIds.includes(fixtureItem.id) ? "is-selected" : ""}`}
              onClick={(event) => selectFixtures([fixtureItem.id], event.shiftKey)}
            >
              <span className={`fixture-icon kind-${fixtureItem.kind}`}>
                <i style={{ background: fixtureItem.color }} />
              </span>
              <span className="fixture-copy">
                <strong>{fixtureItem.name}</strong>
                <small>U{fixtureItem.universe} · {fixtureItem.address || "Unpatched"}</small>
              </span>
              <span className="fixture-level">{Math.round(fixtureItem.intensity * 100)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <span>{activeTab === "Groups" ? "◎" : activeTab === "Layers" ? "▱" : "◇"}</span>
          <strong>No {activeTab.toLowerCase()} yet</strong>
          <p>Create one or drag an object onto the Stage.</p>
        </div>
      )}

      <div className="panel-footer">
        <button><span className="status-dot is-good" /> All fixtures</button>
        <button title="Panel options">•••</button>
      </div>

      {addingFixture && (
        <div className="fixture-dialog-backdrop" role="presentation" onMouseDown={() => setAddingFixture(false)}>
          <form
            className="fixture-dialog"
            aria-label="Add fixture"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedDefinition || !selectedMode) return;
              addFixture(selectedDefinition.id, selectedMode.id, fixtureName || selectedDefinition.model);
              setAddingFixture(false);
              setFixtureName("");
            }}
          >
            <header><div><small>FIXTURE LIBRARY</small><h2>Add Fixture</h2></div><button type="button" onClick={() => setAddingFixture(false)}>×</button></header>
            <label><span>Fixture type</span><select value={selectedDefinition?.id ?? ""} onChange={(event) => { setDefinitionId(event.target.value); setModeId(""); }}>
              {fixtureDefinitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.manufacturer} · {definition.model}</option>)}
            </select></label>
            <label><span>DMX mode</span><select value={selectedMode?.id ?? ""} onChange={(event) => setModeId(event.target.value)}>
              {selectedDefinition?.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name} · {mode.footprint} ch</option>)}
            </select></label>
            <label><span>Name</span><input value={fixtureName} onChange={(event) => setFixtureName(event.target.value)} placeholder={selectedDefinition?.model ?? "Fixture name"} /></label>
            <p>LightHouse automatically finds the next free DMX address and creates another universe when needed.</p>
            <footer><button type="button" onClick={() => setAddingFixture(false)}>Cancel</button><button className="primary" type="submit" disabled={!selectedDefinition || !selectedMode}>Add & Auto-patch</button></footer>
          </form>
        </div>
      )}
    </aside>
  );
}
