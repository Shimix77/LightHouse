import { useState } from "react";

import { useShowStore } from "../store/showStore";

const tabs = ["Fixtures", "Groups", "Objects", "Layers"] as const;

export function ObjectPanel() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Fixtures");
  const [query, setQuery] = useState("");
  const fixtures = useShowStore((state) => state.fixtures);
  const selectedIds = useShowStore((state) => state.selectedFixtureIds);
  const selectFixtures = useShowStore((state) => state.selectFixtures);

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
        <button title="Add item" aria-label="Add item">＋</button>
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
    </aside>
  );
}
