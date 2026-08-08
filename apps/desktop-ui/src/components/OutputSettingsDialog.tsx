import { useEffect, useState } from "react";

import { listUsbDmxDevices } from "../services/engineClient";
import type { UsbDmxDevice } from "../services/engineClient";
import { useShowStore } from "../store/showStore";
import type { ProjectSettingsSummary, UniverseSummary } from "../types/show";

interface OutputSettingsDialogProps {
  onClose: () => void;
}

export function OutputSettingsDialog({ onClose }: OutputSettingsDialogProps) {
  const universes = useShowStore((state) => state.universes);
  const telemetry = useShowStore((state) => state.engineTelemetry);
  const projectSettings = useShowStore((state) => state.projectSettings);
  const mode = useShowStore((state) => state.mode);
  const addUniverse = useShowStore((state) => state.addUniverse);
  const putUniverseOutput = useShowStore((state) => state.putUniverseOutput);
  const putProjectSettings = useShowStore((state) => state.putProjectSettings);
  const [drafts, setDrafts] = useState(universes);
  const [settingsDraft, setSettingsDraft] = useState(projectSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [usbDevices, setUsbDevices] = useState<UsbDmxDevice[]>([]);

  useEffect(() => setDrafts(universes), [universes]);
  useEffect(() => setSettingsDraft(projectSettings), [projectSettings]);
  useEffect(() => { void listUsbDmxDevices().then(setUsbDevices); }, []);

  const update = (id: number, values: Partial<UniverseSummary>) => {
    setDrafts((current) => current.map((universe) => (
      universe.id === id ? { ...universe, ...values } : universe
    )));
  };

  const save = async () => {
    const invalid = drafts.find((universe) => !universe.name.trim() || (
      universe.protocol === "artNet" && (
        !universe.destination.trim()
        || !Number.isInteger(universe.portAddress)
        || universe.portAddress < 0
        || universe.portAddress > 32767
      )
    ) || (universe.protocol === "usbDmx" && !universe.devicePath));
    if (invalid) {
      setError(`Check the output protocol and settings for Universe ${invalid.id}.`);
      return;
    }
    if (settingsDraft.disconnectTimeoutMs < 1_000 || settingsDraft.disconnectTimeoutMs > 300_000) {
      setError("The UI disconnect timeout must be between 1 and 300 seconds.");
      return;
    }
    const physicalUsbOutput = drafts.some((universe) => universe.protocol === "usbDmx" && universe.enabled);
    if (physicalUsbOutput && !window.confirm("Enable physical USB-DMX output now? Connected lights may immediately change according to the current show state.")) {
      return;
    }
    setSaving(true);
    setError(undefined);
    if (!await putProjectSettings(settingsDraft)) {
      setSaving(false);
      return;
    }
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
      <section className="fixture-dialog output-dialog" role="dialog" aria-modal="true" aria-label="DMX Output" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><small>OUTPUT &amp; DIAGNOSTICS</small><h2>DMX Universes</h2></div>
          <button type="button" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <div className="output-telemetry" aria-label="Output diagnostics">
          <Metric label="Frames sent" value={telemetry.framesSent.toLocaleString()} good />
          <Metric label="Send errors" value={telemetry.sendErrors.toLocaleString()} good={telemetry.sendErrors === 0} />
          <Metric label="Missed ticks" value={telemetry.missedDeadlines.toLocaleString()} good={telemetry.missedDeadlines === 0} />
          <Metric label="Dropped commands" value={telemetry.droppedCommands.toLocaleString()} good={telemetry.droppedCommands === 0} />
        </div>

        {telemetry.watchdogBlackout && <div className="watchdog-warning">FAIL-SAFE BLACKOUT IS ACTIVE — output resumes after UI communication returns.</div>}

        <SafetySettings settings={settingsDraft} onChange={setSettingsDraft} />

        <div className="output-help">
          <strong>Choose one output route per universe</strong>
          <span>Art-Net sends over the network. USB-DMX directly controls a selected FTDI cable and supports one universe per cable. Enabling USB output will always show a physical-output confirmation.</span>
        </div>

        <div className="universe-route-list">
          {drafts.map((universe) => (
            <article className={`universe-route ${universe.enabled ? "is-enabled" : ""}`} key={universe.id}>
              <div className="universe-route-title">
                <span>U{universe.id}</span>
                <label className="route-protocol"><b>Output</b><select value={universe.protocol} onChange={(event) => update(universe.id, { protocol: event.target.value as UniverseSummary["protocol"], enabled: event.target.value === "none" ? false : universe.enabled })}><option value="artNet">Art-Net</option><option value="usbDmx">USB-DMX (FTDI)</option><option value="none">No output</option></select></label>
                <label className="route-enabled"><input type="checkbox" disabled={universe.protocol === "none"} checked={universe.enabled} onChange={(event) => update(universe.id, { enabled: event.target.checked })} /> Output enabled</label>
              </div>
              <div className="route-grid">
                <TextField label="Name" value={universe.name} onChange={(name) => update(universe.id, { name })} />
                {universe.protocol === "artNet" && <><NumberField label="Port-address" value={universe.portAddress} onChange={(portAddress) => update(universe.id, { portAddress })} /><TextField label="Destination IP : port" value={universe.destination} onChange={(destination) => update(universe.id, { destination })} placeholder="2.255.255.255:6454" /><TextField label="Interface (optional)" value={universe.interface ?? ""} onChange={(value) => update(universe.id, { interface: value || null })} placeholder="192.168.1.20" /></>}
                {universe.protocol === "usbDmx" && <label className="usb-route-device"><span>USB-DMX device</span><select value={universe.devicePath ?? ""} onChange={(event) => update(universe.id, { devicePath: event.target.value || null })}>{universe.devicePath && !usbDevices.some((device) => device.path === universe.devicePath) && <option value={universe.devicePath}>{universe.devicePath} (not currently detected)</option>}{usbDevices.length === 0 && !universe.devicePath && <option value="">No FTDI USB-DMX cable detected</option>}{usbDevices.map((device) => <option value={device.path} key={device.path}>{device.name} — {device.path}</option>)}</select><small>250000 baud · 8N2 · Open-DMX compatible</small></label>}
              </div>
              {universe.protocol === "artNet" && <label className="route-broadcast"><input type="checkbox" checked={universe.broadcast} onChange={(event) => update(universe.id, { broadcast: event.target.checked })} /> Allow broadcast packets</label>}
              {universe.protocol === "usbDmx" && universe.enabled && <p className="physical-output-warning">⚠ PHYSICAL OUTPUT ENABLED — applying these settings can immediately change connected lights.</p>}
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

function SafetySettings({ settings, onChange }: { settings: ProjectSettingsSummary; onChange: (settings: ProjectSettingsSummary) => void }) {
  return (
    <div className="output-safety-settings">
      <div><strong>Engine safety</strong><span>These settings run in the headless engine even if the window freezes.</span></div>
      <label><span>DMX refresh</span><select value={settings.dmxRefreshHz} onChange={(event) => onChange({ ...settings, dmxRefreshHz: Number(event.target.value) })}><option value={30}>30 Hz</option><option value={40}>40 Hz</option><option value={44}>44 Hz</option></select></label>
      <label><span>If UI disconnects</span><select value={settings.disconnectPolicy} onChange={(event) => onChange({ ...settings, disconnectPolicy: event.target.value as ProjectSettingsSummary["disconnectPolicy"] })}><option value="holdLastLook">Keep sending last look</option><option value="blackoutAfterTimeout">Blackout after timeout</option></select></label>
      <label><span>Timeout</span><div className="timeout-field"><input type="number" min={1} max={300} step={1} disabled={settings.disconnectPolicy === "holdLastLook"} value={Math.round(settings.disconnectTimeoutMs / 1_000)} onChange={(event) => onChange({ ...settings, disconnectTimeoutMs: Number(event.target.value) * 1_000 })} /><b>sec</b></div></label>
    </div>
  );
}
