import { useEffect, useState } from "react";

import { useShowStore } from "../store/showStore";
import type { UniverseSummary } from "../types/show";

interface OutputSettingsDialogProps {
  onClose: () => void;
}

export function OutputSettingsDialog({ onClose }: OutputSettingsDialogProps) {
  const universes = useShowStore((state) => state.universes);
  const telemetry = useShowStore((state) => state.engineTelemetry);
  const mode = useShowStore((state) => state.mode);
  const addUniverse = useShowStore((state) => state.addUniverse);
  const putUniverseOutput = useShowStore((state) => state.putUniverseOutput);
  const [drafts, setDrafts] = useState(universes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => setDrafts(universes), [universes]);

  const update = (id: number, values: Partial<UniverseSummary>) => {
    setDrafts((current) => current.map((universe) => (
      universe.id === id ? { ...universe, ...values } : universe
    )));
  };

  const save = async () => {
    const invalid = drafts.find((universe) => (
      !universe.name.trim()
      || !universe.destination.trim()
      || !Number.isInteger(universe.portAddress)
      || universe.portAddress < 0
      || universe.portAddress > 32767
    ));
    if (invalid) {
      setError(`Check the name, destination and Art-Net port-address for Universe ${invalid.id}.`);
      return;
    }
    setSaving(true);
    setError(undefined);
    for (const universe of drafts) {
      if (!await putUniverseOutput(universe)) {
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixture-dialog-backdrop output-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="fixture-dialog output-dialog" role="dialog" aria-modal="true" aria-label="Art-Net Output" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><small>OUTPUT &amp; DIAGNOSTICS</small><h2>Art-Net Universes</h2></div>
          <button type="button" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <div className="output-telemetry" aria-label="Output diagnostics">
          <Metric label="Frames sent" value={telemetry.framesSent.toLocaleString()} good />
          <Metric label="Send errors" value={telemetry.sendErrors.toLocaleString()} good={telemetry.sendErrors === 0} />
          <Metric label="Missed ticks" value={telemetry.missedDeadlines.toLocaleString()} good={telemetry.missedDeadlines === 0} />
          <Metric label="Dropped commands" value={telemetry.droppedCommands.toLocaleString()} good={telemetry.droppedCommands === 0} />
        </div>

        <div className="output-help">
          <strong>One route per DMX universe</strong>
          <span>Port-address 0 means Art-Net universe 1. Destination is the lighting node IP plus <b>:6454</b>; for broadcast you can use e.g. <b>2.255.255.255:6454</b>. Leave Interface empty to let macOS choose the network adapter.</span>
        </div>

        <div className="universe-route-list">
          {drafts.map((universe) => (
            <article className={`universe-route ${universe.enabled ? "is-enabled" : ""}`} key={universe.id}>
              <div className="universe-route-title">
                <span>U{universe.id}</span>
                <label className="route-enabled"><input type="checkbox" checked={universe.enabled} onChange={(event) => update(universe.id, { enabled: event.target.checked })} /> Output enabled</label>
              </div>
              <div className="route-grid">
                <TextField label="Name" value={universe.name} onChange={(name) => update(universe.id, { name })} />
                <NumberField label="Port-address" value={universe.portAddress} onChange={(portAddress) => update(universe.id, { portAddress })} />
                <TextField label="Destination IP : port" value={universe.destination} onChange={(destination) => update(universe.id, { destination })} placeholder="2.255.255.255:6454" />
                <TextField label="Interface (optional)" value={universe.interface ?? ""} onChange={(value) => update(universe.id, { interface: value || null })} placeholder="192.168.1.20" />
              </div>
              <label className="route-broadcast"><input type="checkbox" checked={universe.broadcast} onChange={(event) => update(universe.id, { broadcast: event.target.checked })} /> Allow broadcast packets</label>
            </article>
          ))}
        </div>

        {mode === "live" && <p className="dialog-error">Switch to EDIT before changing output routes.</p>}
        {error && <p className="dialog-error">{error}</p>}
        <footer>
          <button type="button" disabled={mode === "live" || saving} onClick={addUniverse}>＋ Add Universe</button>
          <span />
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" type="button" disabled={mode === "live" || saving} onClick={() => { void save(); }}>{saving ? "Applying…" : "Apply & restart output"}</button>
        </footer>
      </section>
    </div>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div className={good ? "is-good" : "is-warning"}><small>{label}</small><strong>{value}</strong></div>;
}

function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span>{label}</span><input type="number" min={0} max={32767} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
