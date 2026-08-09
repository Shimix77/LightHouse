import { useEffect, useState } from "react";

import { hasNativeEngine, listUsbDmxDevices } from "../services/engineClient";
import type { UsbDmxDevice } from "../services/engineClient";
import { useShowStore } from "../store/showStore";
import { FixtureManager } from "./FixtureManager";
import { MacWindowControls } from "./MacWindowControls";
import { StageEditor } from "./StageEditor";
import { StageObjectPalette } from "./StageObjectPalette";
import { StageSetupInspector } from "./StageSetupInspector";
import { StageToolbar } from "./StageToolbar";

type OutputKind = "none" | "artnet" | "usb";
type SetupStep = "output" | "patch" | "stage";

interface ProjectSetupProps {
  onDone: () => void;
  onCancel: () => void;
}

const stageGuide = [
  {
    eyebrow: "BUILD YOUR PREVIEW",
    title: "Arrange fixtures like the real venue",
    body: "Move and resize fixtures, then add truss, stage objects, text or a PNG/JPG floor plan from the palette on the right.",
  },
  {
    eyebrow: "LIGHT BEAM DIRECTIONS",
    title: "Point every fixture toward the stage",
    body: "Select a fixture and use Beam Direction on the right. The preview responds to direction, zoom, color and intensity.",
  },
  {
    eyebrow: "THAT’S IT",
    title: "Your project is ready to design",
    body: "Everything on this canvas is already part of the real project. You can return to setup at any time.",
  },
] as const;

export function ProjectSetup({ onDone, onCancel }: ProjectSetupProps) {
  const [step, setStep] = useState<SetupStep>("output");
  const [stageGuideStep, setStageGuideStep] = useState(0);
  const [outputKind, setOutputKind] = useState<OutputKind>("usb");
  const [devices, setDevices] = useState<UsbDmxDevice[]>([]);
  const [devicePath, setDevicePath] = useState("");
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [outputSaving, setOutputSaving] = useState(false);
  const [outputError, setOutputError] = useState<string>();
  const projectName = useShowStore((state) => state.projectName);
  const projectPath = useShowStore((state) => state.projectPath);
  const universes = useShowStore((state) => state.universes);
  const putUniverseOutput = useShowStore((state) => state.putUniverseOutput);

  useEffect(() => {
    let cancelled = false;
    void detectDevices().then((entries) => {
      if (cancelled) return;
      let remembered: { kind?: OutputKind; devicePath?: string | null } | undefined;
      try {
        remembered = JSON.parse(
          window.localStorage.getItem(`lighthouse.output.${projectPath || "preview"}`) ?? "null",
        ) as { kind?: OutputKind; devicePath?: string | null } | undefined;
      } catch {
        remembered = undefined;
      }
      setDevices(entries);
      const rememberedDevice = entries.find((entry) => entry.path === remembered?.devicePath);
      setDevicePath(rememberedDevice?.path ?? entries[0]?.path ?? "");
      if (remembered?.kind === "none" || remembered?.kind === "artnet") {
        setOutputKind(remembered.kind);
      } else if (remembered?.kind === "usb" && entries.length > 0) {
        setOutputKind("usb");
      }
    }).finally(() => {
      if (!cancelled) setDeviceLoading(false);
    });
    return () => { cancelled = true; };
  }, [projectPath]);

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
        setStep("patch");
      } else {
        setOutputError(useShowStore.getState().engineError || "The output setting could not be saved.");
      }
    } finally {
      setOutputSaving(false);
    }
  };

  if (step === "patch") {
    return (
      <main className="guided-editor-shell is-light">
        <SetupTitlebar projectName={projectName} onCancel={onCancel} onSkip={onDone} />
        <FixtureManager
          embedded
          onBack={() => setStep("output")}
          onDone={() => setStep("stage")}
          onShowInStage={() => setStep("stage")}
        />
      </main>
    );
  }

  if (step === "stage") {
    const guide = stageGuide[stageGuideStep]!;
    return (
      <main className="guided-editor-shell is-stage">
        <SetupTitlebar projectName={projectName} onCancel={onCancel} onSkip={onDone} dark />
        <section className="guided-stage-workspace">
          <div className="guided-stage-main">
            <StageToolbar />
            <StageEditor />
          </div>
          <aside className="guided-stage-sidebar">
            <StageObjectPalette />
            <StageSetupInspector />
          </aside>
        </section>
        <TutorialFooter
          eyebrow={guide.eyebrow}
          title={guide.title}
          body={guide.body}
          backLabel={stageGuideStep === 0 ? "Back to Patch" : "Back"}
          nextLabel={stageGuideStep === stageGuide.length - 1 ? "Go to Design" : "Next"}
          onBack={() => stageGuideStep === 0 ? setStep("patch") : setStageGuideStep((value) => value - 1)}
          onNext={() => stageGuideStep === stageGuide.length - 1 ? onDone() : setStageGuideStep((value) => value + 1)}
        />
      </main>
    );
  }

  return (
    <main className="guided-editor-shell is-light">
      <SetupTitlebar projectName={projectName} onCancel={onCancel} onSkip={onDone} />
      <section className="output-guide-content">
        <div className="setup-card output-setup-card">
          <header><small>DMX OUTPUT</small><h1>Choose DMX Output</h1><p>You can change this later. A detected USB interface stays physically disabled until you explicitly enable output.</p></header>
          <div className="output-choice-grid">
            <button className={outputKind === "usb" ? "is-selected" : ""} onClick={() => setOutputKind("usb")}><span>⌁</span><strong>USB-DMX</strong><small>Direct cable connected to this Mac</small><i>{devices.length > 0 ? "DETECTED" : "NOT FOUND"}</i></button>
            <button className={outputKind === "artnet" ? "is-selected" : ""} onClick={() => setOutputKind("artnet")}><span>⌘</span><strong>Art-Net</strong><small>Network node using IP and Universe</small><i>AVAILABLE</i></button>
            <button className={outputKind === "none" ? "is-selected" : ""} onClick={() => setOutputKind("none")}><span>○</span><strong>No DMX Output</strong><small>Design and program without hardware</small><i>SAFE</i></button>
          </div>
          {outputKind === "usb" && <div className="usb-device-picker"><div><span className={`status-dot ${devices.length > 0 ? "is-good" : "is-error"}`} /><div><strong>{deviceLoading ? "Looking for USB-DMX interfaces…" : devices.length > 0 ? "DOREMiDi-compatible FTDI interface detected" : "No USB serial interface detected"}</strong><small>Read-only discovery · no DMX data has been sent</small></div></div><label><span>Device</span><select value={devicePath} onChange={(event) => setDevicePath(event.target.value)}>{devices.length === 0 ? <option value="">Connect the cable and try again</option> : devices.map((device) => <option value={device.path} key={device.path}>{device.name} — {device.path}</option>)}</select></label><p className="usb-setup-safety">The cable is saved to this project with output disabled. LightHouse warns you immediately before physical DMX starts.</p><button onClick={() => { setDeviceLoading(true); void detectDevices().then((entries) => { setDevices(entries); setDevicePath(entries[0]?.path ?? ""); }).finally(() => setDeviceLoading(false)); }}>↻ Detect Again</button></div>}
          {outputKind === "artnet" && <div className="artnet-summary"><span>Universe 1</span><strong>{universes[0]?.destination ?? "127.0.0.1:6454"}</strong><small>Detailed network settings remain available after setup.</small></div>}
          {outputError && <p className="setup-inline-error" role="alert"><strong>Could not continue.</strong> {outputError}</p>}
        </div>
      </section>
      <TutorialFooter
        eyebrow="DMX OUTPUT"
        title="Connect LightHouse to your lights"
        body="Choose USB-DMX, Art-Net or a safe offline project. Newly detected hardware never starts output without confirmation."
        backLabel="Back"
        nextLabel={outputSaving ? "Saving…" : "Next"}
        backDisabled
        nextDisabled={outputSaving || (outputKind === "usb" && !devicePath)}
        onBack={() => undefined}
        onNext={() => { void finishOutputStep(); }}
      />
    </main>
  );
}

function SetupTitlebar({ projectName, onCancel, onSkip, dark = false }: { projectName: string; onCancel: () => void; onSkip: () => void; dark?: boolean }) {
  return <header className={`guided-titlebar ${dark ? "is-dark" : ""}`}><MacWindowControls /><button onClick={onCancel}>Cancel</button><div><small>PROJECT SETUP</small><strong>{projectName}</strong></div><button onClick={onSkip}>Skip Setup</button></header>;
}

export function TutorialFooter({ eyebrow, title, body, backLabel, nextLabel, backDisabled = false, nextDisabled = false, onBack, onNext }: { eyebrow: string; title: string; body: string; backLabel: string; nextLabel: string; backDisabled?: boolean; nextDisabled?: boolean; onBack: () => void; onNext: () => void }) {
  return <footer className="guided-tutorial-footer"><button disabled={backDisabled} onClick={onBack}>‹ {backLabel}</button><div><small>{eyebrow}</small><strong>{title}</strong><span>{body}</span></div><button className="primary" disabled={nextDisabled} onClick={onNext}>{nextLabel} ›</button></footer>;
}

async function detectDevices(): Promise<UsbDmxDevice[]> {
  try {
    return await listUsbDmxDevices();
  } catch {
    return [];
  }
}
