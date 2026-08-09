import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { useShowStore } from "../store/showStore";

export function Inspector() {
  const fixtures = useShowStore((state) => state.fixtures);
  const selectedIds = useShowStore((state) => state.selectedFixtureIds);
  const stageObjects = useShowStore((state) => state.stageObjects);
  const selectedStageObjectIds = useShowStore((state) => state.selectedStageObjectIds);
  const captureHistory = useShowStore((state) => state.captureFixtureHistory);
  const updateSelected = useShowStore((state) => state.updateSelectedFixtures);
  const updateSelectedFixtureAxes = useShowStore((state) => state.updateSelectedFixtureAxes);
  const setSelectedParameter = useShowStore((state) => state.setSelectedParameter);
  const fixtureDefinitions = useShowStore((state) => state.fixtureDefinitions);
  const updateSelectedStageObjects = useShowStore((state) => state.updateSelectedStageObjects);
  const patchFixture = useShowStore((state) => state.patchFixture);
  const addUniverse = useShowStore((state) => state.addUniverse);
  const universeCount = useShowStore((state) => state.universeCount);
  const operationMode = useShowStore((state) => state.mode);
  const selected = fixtures.filter((fixtureItem) => selectedIds.includes(fixtureItem.id));
  const primary = selected[0];
  const selectedMode = primary
    ? fixtureDefinitions
        .find((definition) => definition.id === primary.definitionId)
        ?.modes.find((mode) => mode.id === primary.modeId)
    : undefined;
  const whiteParameter = selectedMode?.parameters.find((parameter) => parameter.id === "color.white");
  const additionalParameters = selectedMode?.parameters.filter((parameter) => ![
    "intensity",
    "color.red",
    "color.green",
    "color.blue",
    "color.white",
    "position.pan",
    "position.tilt",
    "beam.zoom",
  ].includes(parameter.id)) ?? [];
  const selectedStageObjects = stageObjects.filter((stageObject) =>
    selectedStageObjectIds.includes(stageObject.id),
  );
  const primaryStageObject = selectedStageObjects[0];
  const [patchUniverse, setPatchUniverse] = useState(1);
  const [patchAddress, setPatchAddress] = useState(1);

  useEffect(() => {
    if (!primary) return;
    setPatchUniverse(primary.universe || 1);
    setPatchAddress(primary.address || 1);
  }, [primary?.id, primary?.universe, primary?.address]);

  if (!primary && primaryStageObject) {
    return (
      <aside className="panel inspector-panel" aria-label="Stage object inspector">
        <div className="inspector-heading">
          <div className="large-fixture-icon stage-object-large-icon">◇</div>
          <div><small>{primaryStageObject.kind.toUpperCase()}</small><h2>{selectedStageObjects.length > 1 ? `${selectedStageObjects.length} Stage Objects` : primaryStageObject.name}</h2></div>
          <span aria-hidden="true" />
        </div>
        <InspectorSection title="Stage Layout" open>
          <label className="layout-text-field full-width"><span>Name</span><input key={`${primaryStageObject.id}-${primaryStageObject.name}`} defaultValue={primaryStageObject.name} onFocus={captureHistory} onBlur={(event) => updateSelectedStageObjects({ name: event.target.value })} /></label>
          <div className="layout-field-grid">
            <LayoutNumber label="X (m)" value={primaryStageObject.x} onStart={captureHistory} onCommit={(x) => updateSelectedStageObjects({ x })} />
            <LayoutNumber label="Y (m)" value={primaryStageObject.y} onStart={captureHistory} onCommit={(y) => updateSelectedStageObjects({ y })} />
            <LayoutNumber label="Width" value={primaryStageObject.width} min={0.1} onStart={captureHistory} onCommit={(width) => updateSelectedStageObjects({ width })} />
            <LayoutNumber label="Height" value={primaryStageObject.height} min={0.1} onStart={captureHistory} onCommit={(height) => updateSelectedStageObjects({ height })} />
            <LayoutNumber label="Rotation" value={primaryStageObject.rotation} onStart={captureHistory} onCommit={(rotation) => updateSelectedStageObjects({ rotation })} />
            <LayoutNumber label="Opacity" value={primaryStageObject.opacity} min={0} max={1} step={0.05} onStart={captureHistory} onCommit={(opacity) => updateSelectedStageObjects({ opacity })} />
            <label className="layout-text-field"><span>Layer</span><input key={`${primaryStageObject.id}-${primaryStageObject.layer}`} defaultValue={primaryStageObject.layer} onFocus={captureHistory} onBlur={(event) => updateSelectedStageObjects({ layer: event.target.value })} /></label>
          </div>
          <div className="layout-toggle-row">
            <button className={primaryStageObject.locked ? "is-active" : ""} onClick={() => { captureHistory(); updateSelectedStageObjects({ locked: !primaryStageObject.locked }); }}>{primaryStageObject.locked ? "🔒 Locked" : "🔓 Unlocked"}</button>
            <button className={primaryStageObject.hidden ? "is-active" : ""} onClick={() => { captureHistory(); updateSelectedStageObjects({ hidden: !primaryStageObject.hidden }); }}>{primaryStageObject.hidden ? "Hidden" : "Visible"}</button>
          </div>
        </InspectorSection>
        <div className="patch-summary stage-object-summary"><span>VISUAL OBJECT · NO DMX CHANNELS</span><small>Stage objects are stored with the layout and never affect patched output.</small></div>
      </aside>
    );
  }

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
        <span aria-hidden="true" />
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
        {whiteParameter && (
          <div className="parameter-fader color-emitter-fader">
            <small>CH {whiteParameter.coarseChannel} · WHITE EMITTER</small>
            <Fader
              label="White"
              value={primary.parameters[whiteParameter.id] ?? whiteParameter.defaultValue}
              onStart={captureHistory}
              onChange={(value) => setSelectedParameter(whiteParameter.id, value)}
            />
          </div>
        )}
      </InspectorSection>

      <InspectorSection title="Position" open>
        <Fader label="Pan" value={primary.pan} onStart={captureHistory} onChange={(pan) => updateSelected({ pan })} />
        <Fader label="Tilt" value={primary.tilt} onStart={captureHistory} onChange={(tilt) => updateSelected({ tilt })} />
        <div className="layout-toggle-row axis-invert-row">
          <button
            className={primary.invertPan ? "is-active" : ""}
            onClick={() => updateSelectedFixtureAxes(!primary.invertPan, primary.invertTilt)}
          >Invert Pan</button>
          <button
            className={primary.invertTilt ? "is-active" : ""}
            onClick={() => updateSelectedFixtureAxes(primary.invertPan, !primary.invertTilt)}
          >Invert Tilt</button>
        </div>
      </InspectorSection>

      <InspectorSection title="Beam" open>
        <Fader label="Zoom" value={primary.zoom} onStart={captureHistory} onChange={(zoom) => updateSelected({ zoom })} />
      </InspectorSection>

      {additionalParameters.length > 0 && (
        <InspectorSection title="Fixture Channels" open>
          {additionalParameters.map((parameter) => (
            <div className="parameter-fader" key={parameter.id}>
              <small>
                CH {parameter.coarseChannel}{parameter.fineChannel ? ` + ${parameter.fineChannel}` : ""}
                {` · ${parameter.resolution}-BIT · ${parameter.capability.toUpperCase()}`}
              </small>
              <Fader
                label={parameter.name}
                value={primary.parameters[parameter.id] ?? parameter.defaultValue}
                onStart={captureHistory}
                onChange={(value) => setSelectedParameter(parameter.id, value)}
              />
            </div>
          ))}
        </InspectorSection>
      )}

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
  max,
  step = 0.1,
  onStart,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onStart: () => void;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="layout-number-field">
      <span>{label}</span>
      <input
        key={`${label}-${value}`}
        type="number"
        step={step}
        min={min}
        max={max}
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
      <header><span>{open ? "⌄" : "›"}</span><strong>{title}</strong><span aria-hidden="true" /></header>
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
