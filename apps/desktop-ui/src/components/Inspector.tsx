import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { useShowStore } from "../store/showStore";

export function Inspector() {
  const fixtures = useShowStore((state) => state.fixtures);
  const selectedIds = useShowStore((state) => state.selectedFixtureIds);
  const captureHistory = useShowStore((state) => state.captureFixtureHistory);
  const updateSelected = useShowStore((state) => state.updateSelectedFixtures);
  const patchFixture = useShowStore((state) => state.patchFixture);
  const addUniverse = useShowStore((state) => state.addUniverse);
  const universeCount = useShowStore((state) => state.universeCount);
  const operationMode = useShowStore((state) => state.mode);
  const selected = fixtures.filter((fixtureItem) => selectedIds.includes(fixtureItem.id));
  const primary = selected[0];
  const [patchUniverse, setPatchUniverse] = useState(1);
  const [patchAddress, setPatchAddress] = useState(1);

  useEffect(() => {
    if (!primary) return;
    setPatchUniverse(primary.universe || 1);
    setPatchAddress(primary.address || 1);
  }, [primary?.id, primary?.universe, primary?.address]);

  if (!primary) {
    return (
      <aside className="panel inspector-panel empty-inspector">
        <span>◇</span><strong>Nothing selected</strong><p>Select a fixture on the Stage.</p>
      </aside>
    );
  }

  return (
    <aside className="panel inspector-panel" aria-label="Fixture inspector">
      <div className="inspector-heading">
        <div className="large-fixture-icon" style={{ "--fixture-color": primary.color } as CSSProperties}>●</div>
        <div><small>{selected.length > 1 ? `${selected.length} FIXTURES` : "MOVING HEAD"}</small><h2>{selected.length > 1 ? "Multiple Selection" : primary.name}</h2></div>
        <button aria-label="Inspector options">•••</button>
      </div>

      <InspectorSection title="Intensity" open>
        <Fader
          label="Dimmer"
          value={primary.intensity}
          color="var(--amber)"
          onStart={captureHistory}
          onChange={(intensity) => updateSelected({ intensity })}
        />
      </InspectorSection>

      <InspectorSection title="Color" open>
        <div className="color-control">
          <label className="color-swatch" style={{ background: primary.color }}>
            <input
              aria-label="Fixture color"
              type="color"
              value={primary.color}
              onPointerDown={captureHistory}
              onChange={(event) => updateSelected({ color: event.target.value })}
            />
          </label>
          <div>
            <strong>{primary.color.toUpperCase()}</strong>
            <small>Direct emitter preview</small>
          </div>
        </div>
        <div className="quick-colors">
          {["#ff4d4d", "#ffb347", "#fff2a6", "#48d597", "#55b8ff", "#7477ff", "#b86dff", "#ffffff"].map((color) => (
            <button
              key={color}
              style={{ background: color }}
              aria-label={`Set color ${color}`}
              onClick={() => { captureHistory(); updateSelected({ color }); }}
            />
          ))}
        </div>
      </InspectorSection>

      <InspectorSection title="Position" open>
        <Fader label="Pan" value={primary.pan} onStart={captureHistory} onChange={(pan) => updateSelected({ pan })} />
        <Fader label="Tilt" value={primary.tilt} onStart={captureHistory} onChange={(tilt) => updateSelected({ tilt })} />
      </InspectorSection>

      <InspectorSection title="Beam" open>
        <Fader label="Zoom" value={primary.zoom} onStart={captureHistory} onChange={(zoom) => updateSelected({ zoom })} />
      </InspectorSection>

      <InspectorSection title="Stage Layout" open>
        <div className="layout-field-grid">
          <LayoutNumber label="X (m)" value={primary.x} onStart={captureHistory} onCommit={(x) => updateSelected({ x })} />
          <LayoutNumber label="Y (m)" value={primary.y} onStart={captureHistory} onCommit={(y) => updateSelected({ y })} />
          <LayoutNumber label="Width" value={primary.width} min={0.1} onStart={captureHistory} onCommit={(width) => updateSelected({ width })} />
          <LayoutNumber label="Height" value={primary.height} min={0.1} onStart={captureHistory} onCommit={(height) => updateSelected({ height })} />
          <LayoutNumber label="Rotation" value={primary.rotation} onStart={captureHistory} onCommit={(rotation) => updateSelected({ rotation })} />
          <label className="layout-text-field"><span>Layer</span><input key={`${primary.id}-${primary.layer}`} defaultValue={primary.layer} onFocus={captureHistory} onBlur={(event) => updateSelected({ layer: event.target.value })} /></label>
        </div>
        <div className="layout-toggle-row">
          <button className={primary.locked ? "is-active" : ""} onClick={() => { captureHistory(); updateSelected({ locked: !primary.locked }); }}>{primary.locked ? "🔒 Locked" : "🔓 Unlocked"}</button>
          <button className={primary.hidden ? "is-active" : ""} onClick={() => { captureHistory(); updateSelected({ hidden: !primary.hidden }); }}>{primary.hidden ? "Hidden" : "Visible"}</button>
        </div>
      </InspectorSection>

      <div className="patch-summary">
        <span>PATCH · {primary.footprint} CHANNELS</span>
        <label><small>Universe</small><input type="number" min={1} max={universeCount} value={patchUniverse} onChange={(event) => setPatchUniverse(Number(event.target.value))} /></label>
        <label><small>Address</small><input type="number" min={1} max={513 - primary.footprint} value={patchAddress} onChange={(event) => setPatchAddress(Number(event.target.value))} /></label>
        <button disabled={operationMode === "live"} onClick={() => patchFixture(primary.id, patchUniverse, patchAddress)}>APPLY</button>
        <button className="add-universe-button" disabled={operationMode === "live"} onClick={addUniverse}>＋ UNIVERSE</button>
      </div>
    </aside>
  );
}

function LayoutNumber({
  label,
  value,
  min,
  onStart,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  onStart: () => void;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="layout-number-field">
      <span>{label}</span>
      <input
        key={`${label}-${value}`}
        type="number"
        step={0.1}
        min={min}
        defaultValue={Number(value.toFixed(2))}
        onFocus={onStart}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onCommit(next);
        }}
      />
    </label>
  );
}

function InspectorSection({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <section className="inspector-section">
      <header><span>{open ? "⌄" : "›"}</span><strong>{title}</strong><button aria-label={`${title} options`}>•••</button></header>
      <div className="inspector-section-body">{children}</div>
    </section>
  );
}

function Fader({
  label,
  value,
  color,
  onStart,
  onChange,
}: {
  label: string;
  value: number;
  color?: string;
  onStart: () => void;
  onChange: (value: number) => void;
}) {
  return (
    <label className="fader-row" style={color ? { "--fader-color": color } as CSSProperties : undefined}>
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={value}
        onPointerDown={onStart}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{Math.round(value * 100)}</output>
    </label>
  );
}
