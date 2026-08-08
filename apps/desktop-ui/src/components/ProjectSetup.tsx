import { useEffect, useRef, useState } from "react";

import { hasNativeEngine, listUsbDmxDevices } from "../services/engineClient";
import type { UsbDmxDevice } from "../services/engineClient";
import { useShowStore } from "../store/showStore";
import { FixtureManager } from "./FixtureManager";

const steps = ["Output", "Fixtures & Patch", "Stage Layout", "Groups", "Finish"] as const;
type OutputKind = "none" | "artnet" | "usb";

interface ProjectSetupProps {
  onDone: () => void;
  onCancel: () => void;
}

export function ProjectSetup({ onDone, onCancel }: ProjectSetupProps) {
  const [step, setStep] = useState(0);
  const [outputKind, setOutputKind] = useState<OutputKind>("usb");
  const [devices, setDevices] = useState<UsbDmxDevice[]>([]);
  const [devicePath, setDevicePath] = useState("");
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [outputSaving, setOutputSaving] = useState(false);
  const [outputError, setOutputError] = useState<string>();
  const [groupName, setGroupName] = useState("Front Wash");
  const fileInput = useRef<HTMLInputElement>(null);
  const projectName = useShowStore((state) => state.projectName);
  const projectPath = useShowStore((state) => state.projectPath);
  const universes = useShowStore((state) => state.universes);
  const fixtures = useShowStore((state) => state.fixtures);
  const groups = useShowStore((state) => state.groups);
  const selectedFixtureIds = useShowStore((state) => state.selectedFixtureIds);
  const background = useShowStore((state) => state.background);
  const stageView = useShowStore((state) => state.stageView);
  const setStageView = useShowStore((state) => state.setStageView);
  const importBackground = useShowStore((state) => state.importBackground);
  const removeBackground = useShowStore((state) => state.removeBackground);
  const putGroup = useShowStore((state) => state.putGroup);
  const selectFixtures = useShowStore((state) => state.selectFixtures);
  const putUniverseOutput = useShowStore((state) => state.putUniverseOutput);

  useEffect(() => {
    let cancelled = false;
    void listUsbDmxDevices().then((entries) => {
      if (cancelled) return;
      setDevices(entries);
      setDevicePath(entries[0]?.path ?? "");
    }).finally(() => {
      if (!cancelled) setDeviceLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const finishOutputStep = async () => {
    if (outputSaving) return;
    setOutputSaving(true);
    setOutputError(undefined);
    const current = universes[0];
    if (!current) {
      setOutputError("Universe 1 is unavailable. Reopen the project and try again.");
      setOutputSaving(false);
      return;
    }
    try {
      const saved = await putUniverseOutput({
        ...current,
        enabled: outputKind === "artnet",
        protocol: outputKind === "usb" ? "usbDmx" : outputKind === "artnet" ? "artNet" : "none",
        devicePath: outputKind === "usb" ? devicePath : null,
      });
      if (saved || !hasNativeEngine()) {
        window.localStorage.setItem(`lighthouse.output.${projectPath || "preview"}`, JSON.stringify({
          kind: outputKind,
          devicePath: outputKind === "usb" ? devicePath : null,
        }));
        setStep(1);
      } else {
        setOutputError(useShowStore.getState().engineError || "The output setting could not be saved.");
      }
    } finally {
      setOutputSaving(false);
    }
  };

  if (step === 1) {
    return <div className="setup-shell fixture-setup-step"><SetupProgress step={step} /><FixtureManager embedded onDone={() => setStep(2)} /></div>;
  }

  return (
    <main className="setup-shell">
      <header className="setup-titlebar"><div className="mac-traffic" aria-hidden="true"><i /><i /><i /></div><button onClick={onCancel}>Cancel</button><div><small>PROJECT SETUP</small><strong>{projectName}</strong></div><span /></header>
      <SetupProgress step={step} />

      <section className="setup-content">
        {step === 0 && (
          <div className="setup-card output-setup-card">
            <header><small>STEP 1 OF 5</small><h1>Choose DMX Output</h1><p>You can change this later. LightHouse will not send to a newly detected USB interface until output is explicitly enabled.</p></header>
            <div className="output-choice-grid">
              <button className={outputKind === "usb" ? "is-selected" : ""} onClick={() => setOutputKind("usb")}><span>⌁</span><strong>USB-DMX</strong><small>Direct cable connected to this Mac</small><i>{devices.length > 0 ? "DETECTED" : "NOT FOUND"}</i></button>
              <button className={outputKind === "artnet" ? "is-selected" : ""} onClick={() => setOutputKind("artnet")}><span>⌘</span><strong>Art-Net</strong><small>Network node using IP and Universe</small><i>AVAILABLE</i></button>
              <button className={outputKind === "none" ? "is-selected" : ""} onClick={() => setOutputKind("none")}><span>○</span><strong>No DMX Output</strong><small>Design and program without hardware</small><i>SAFE</i></button>
            </div>
            {outputKind === "usb" && <div className="usb-device-picker"><div><span className={`status-dot ${devices.length > 0 ? "is-good" : "is-error"}`} /><div><strong>{deviceLoading ? "Looking for USB-DMX interfaces…" : devices.length > 0 ? "DOREMiDi-compatible FTDI interface detected" : "No USB serial interface detected"}</strong><small>Read-only discovery · no DMX data has been sent</small></div></div><label><span>Device</span><select value={devicePath} onChange={(event) => setDevicePath(event.target.value)}>{devices.length === 0 ? <option value="">Connect the cable and try again</option> : devices.map((device) => <option value={device.path} key={device.path}>{device.name} — {device.path}</option>)}</select></label><p className="usb-setup-safety">The cable will be saved to this project with output disabled. Enable it later in Output Settings; LightHouse will warn you immediately before physical DMX starts.</p><button onClick={() => { setDeviceLoading(true); void listUsbDmxDevices().then((entries) => { setDevices(entries); setDevicePath(entries[0]?.path ?? ""); }).finally(() => setDeviceLoading(false)); }}>↻ Detect Again</button></div>}
            {outputKind === "artnet" && <div className="artnet-summary"><span>Universe 1</span><strong>{universes[0]?.destination ?? "127.0.0.1:6454"}</strong><small>Detailed network settings remain available after setup.</small></div>}
            {outputError && <p className="setup-inline-error" role="alert"><strong>Could not continue.</strong> {outputError}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="setup-card stage-layout-setup">
            <header><small>STEP 3 OF 5</small><h1>Build the Stage Layout</h1><p>Add an optional PNG/JPG floor plan and choose how you want to view the venue.</p></header>
            <div className="stage-layout-preview" style={background ? { backgroundImage: `linear-gradient(rgba(9,12,16,.32),rgba(9,12,16,.65)),url(${background.dataUrl})` } : undefined}><div className="mini-truss" /><div className="mini-stage">STAGE</div>{fixtures.slice(0, 8).map((fixture, index) => <span key={fixture.id} style={{ left: `${15 + (index % 4) * 22}%`, top: `${20 + Math.floor(index / 4) * 34}%`, background: fixture.color }}>{fixture.name.slice(0, 3)}</span>)}</div>
            <div className="stage-layout-options"><div><strong>Orientation</strong><span className="segmented"><button className={stageView === "front" ? "is-active" : ""} onClick={() => setStageView("front")}>Front View</button><button className={stageView === "top" ? "is-active" : ""} onClick={() => setStageView("top")}>Top View</button></span></div><div><strong>Background image</strong><span>{background ? `${background.name} · Locked` : "No image selected"}</span><input ref={fileInput} hidden type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackground(file); }} /><button onClick={() => fileInput.current?.click()}>{background ? "Replace…" : "Add PNG/JPG…"}</button>{background && <button onClick={removeBackground}>Remove</button>}</div></div>
          </div>
        )}

        {step === 3 && (
          <div className="setup-card group-setup-card">
            <header><small>STEP 4 OF 5</small><h1>Create Fixture Groups</h1><p>Groups make selection and effects faster. Select fixture names and create a group, or continue with the complete fixture set.</p></header>
            <div className="group-builder"><div className="setup-fixture-list">{fixtures.map((fixture) => <label key={fixture.id}><input type="checkbox" checked={selectedFixtureIds.includes(fixture.id)} onChange={(event) => { const ids = event.target.checked ? [...selectedFixtureIds, fixture.id] : selectedFixtureIds.filter((id) => id !== fixture.id); selectFixtures(ids); }} /><span style={{ background: fixture.color }} /><strong>{fixture.name}</strong><small>U{fixture.universe}/{fixture.address}</small></label>)}</div><div className="group-create-panel"><label><span>Group name</span><input value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><button disabled={selectedFixtureIds.length === 0} onClick={() => { putGroup(null, groupName || "Fixture Group", selectedFixtureIds); setGroupName("New Group"); }}>＋ Create Group</button><div className="created-groups"><small>CREATED GROUPS</small>{groups.map((group) => <span key={group.id}><b>◎</b><strong>{group.name}</strong><small>{group.fixtureIds.length} fixtures</small></span>)}</div></div></div>
          </div>
        )}

        {step === 4 && (
          <div className="setup-card finish-setup-card">
            <span className="finish-check">✓</span><header><small>STEP 5 OF 5</small><h1>Your Project Is Ready</h1><p>LightHouse will open in Design mode. You can reopen Project Setup from the project menu at any time.</p></header>
            <div className="finish-summary"><div><small>OUTPUT</small><strong>{outputKind === "usb" ? "USB-DMX · Disabled" : outputKind === "artnet" ? "Art-Net" : "No Output"}</strong><span>{outputKind === "usb" ? "Configured safely; enable in Output Settings" : outputKind === "artnet" ? universes[0]?.destination : "Safe programming mode"}</span></div><div><small>FIXTURES</small><strong>{fixtures.length}</strong><span>{fixtures.reduce((total, fixture) => total + fixture.footprint, 0)} patched channels</span></div><div><small>STAGE</small><strong>{stageView === "front" ? "Front View" : "Top View"}</strong><span>{background ? "Background locked" : "No background"}</span></div><div><small>GROUPS</small><strong>{groups.length}</strong><span>Ready for scenes and effects</span></div></div>
          </div>
        )}
      </section>

      <footer className="setup-footer"><button disabled={step === 0 || outputSaving} onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</button><span>{outputSaving ? "Saving output configuration…" : "All project changes are saved automatically."}</span>{step === 0 ? <button className="primary" disabled={outputSaving || (outputKind === "usb" && !devicePath)} onClick={() => { void finishOutputStep(); }}>{outputSaving ? "Saving…" : "Continue"}</button> : step < 4 ? <button className="primary" onClick={() => setStep((current) => current + 1)}>Continue</button> : <button className="primary" onClick={onDone}>Open Design Workspace</button>}</footer>
    </main>
  );
}

function SetupProgress({ step }: { step: number }) {
  return <nav className="setup-progress" aria-label="Project setup progress">{steps.map((label, index) => <div className={index === step ? "is-current" : index < step ? "is-complete" : ""} key={label}><span>{index < step ? "✓" : index + 1}</span><strong>{label}</strong></div>)}</nav>;
}
