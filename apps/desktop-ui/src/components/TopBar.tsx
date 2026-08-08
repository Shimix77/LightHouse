import { useEffect, useRef, useState } from "react";

import { MicrophoneBeatDetector } from "../services/audioBeatDetector";
import { useShowStore } from "../store/showStore";
import { openLiveDisplay } from "../services/engineClient";

export function TopBar() {
  const projectName = useShowStore((state) => state.projectName);
  const mode = useShowStore((state) => state.mode);
  const setMode = useShowStore((state) => state.setMode);
  const grandMaster = useShowStore((state) => state.grandMaster);
  const setGrandMaster = useShowStore((state) => state.setGrandMaster);
  const blackout = useShowStore((state) => state.blackout);
  const toggleBlackout = useShowStore((state) => state.toggleBlackout);
  const bpm = useShowStore((state) => state.bpm);
  const beatSource = useShowStore((state) => state.beatSource);
  const setBpm = useShowStore((state) => state.setBpm);
  const tapTempo = useShowStore((state) => state.tapTempo);
  const engineConnected = useShowStore((state) => state.engineConnected);
  const universeCount = useShowStore((state) => state.universeCount);
  const telemetry = useShowStore((state) => state.engineTelemetry);

  return (
    <header className="top-bar">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true"><span /></div>
        <div>
          <div className="brand-name">LIGHTHOUSE</div>
          <div className="project-name">{projectName}</div>
        </div>
      </div>

      <div className="save-status" title="Project changes are saved">
        <span className={`status-dot ${engineConnected ? "is-good" : ""}`} />
        Saved now
      </div>

      <div className="mode-switch" role="group" aria-label="Operation mode">
        <button className={mode === "edit" ? "is-active" : ""} onClick={() => setMode("edit")}>EDIT</button>
        <button className={mode === "live" ? "is-live" : ""} onClick={() => setMode("live")}>LIVE</button>
      </div>

      <div className="tempo-control">
        <span className="control-kicker">TEMPO</span>
        <button className="tap-button" onClick={tapTempo}>TAP</button>
        <label>
          <input
            aria-label="Tempo BPM"
            type="number"
            min={20}
            max={300}
            value={Math.round(bpm)}
            onChange={(event) => setBpm(Number(event.target.value))}
          />
          <span>BPM</span>
        </label>
        <i className={`beat-pulse ${beatSource === "audio" ? "is-audio" : ""}`} aria-hidden="true" />
        <MicrophoneBeatControl bpm={bpm} />
      </div>

      <div className="output-status">
        <span className={`status-dot ${engineConnected && telemetry.sendErrors === 0 ? "is-good" : "is-error"}`} />
        <div><strong>Art-Net</strong><small>{universeCount} universe{universeCount === 1 ? "" : "s"} · 44 Hz</small></div>
      </div>

      <button className="live-window-button" title="Open Live panel on another display" onClick={() => { void openLiveDisplay(); }}>▣ LIVE WINDOW</button>

      <label className="master-control">
        <span>GRAND MASTER</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={grandMaster}
          onChange={(event) => setGrandMaster(Number(event.target.value))}
        />
        <strong>{Math.round(grandMaster * 100)}%</strong>
      </label>

      <button
        className={`blackout-button ${blackout ? "is-active" : ""}`}
        onClick={toggleBlackout}
        aria-pressed={blackout}
      >
        <span aria-hidden="true">●</span>
        BLACKOUT
      </button>
    </header>
  );
}

type MicrophoneState = "off" | "requesting" | "listening" | "error";

function MicrophoneBeatControl({ bpm }: { bpm: number }) {
  const setAudioTempo = useShowStore((state) => state.setAudioTempo);
  const setBpm = useShowStore((state) => state.setBpm);
  const beatConfidence = useShowStore((state) => state.beatConfidence);
  const detector = useRef<MicrophoneBeatDetector | undefined>(undefined);
  const levelUpdateAt = useRef(0);
  const pulseTimer = useRef<number | undefined>(undefined);
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("off");
  const [level, setLevel] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [error, setError] = useState<string>();

  const stop = async (returnToFixedTempo: boolean) => {
    const activeDetector = detector.current;
    detector.current = undefined;
    if (activeDetector) await activeDetector.stop();
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    setLevel(0);
    setPulse(false);
    setMicrophoneState("off");
    if (returnToFixedTempo) setBpm(bpm);
  };

  useEffect(() => () => {
    const activeDetector = detector.current;
    detector.current = undefined;
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    if (activeDetector) void activeDetector.stop();
  }, []);

  const toggle = async () => {
    if (microphoneState === "listening") {
      await stop(true);
      return;
    }
    if (microphoneState === "requesting") return;
    setMicrophoneState("requesting");
    setError(undefined);
    const nextDetector = new MicrophoneBeatDetector({
      onEstimate: ({ bpm: detectedBpm, confidence }) => setAudioTempo(detectedBpm, confidence),
      onLevel: (nextLevel, onset) => {
        const now = performance.now();
        if (now - levelUpdateAt.current >= 100) {
          levelUpdateAt.current = now;
          setLevel(nextLevel);
        }
        if (onset) {
          setPulse(true);
          if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
          pulseTimer.current = window.setTimeout(() => setPulse(false), 130);
        }
      },
    });
    detector.current = nextDetector;
    try {
      await nextDetector.start();
      setMicrophoneState("listening");
    } catch (cause) {
      await nextDetector.stop();
      detector.current = undefined;
      setError(cause instanceof Error ? cause.message : String(cause));
      setMicrophoneState("error");
    }
  };

  const label = microphoneState === "requesting"
    ? "ALLOW…"
    : microphoneState === "listening"
      ? `MIC ${Math.round(beatConfidence * 100)}%`
      : microphoneState === "error" ? "MIC !" : "MIC";

  return (
    <button
      className={`microphone-beat ${microphoneState === "listening" ? "is-listening" : ""} ${pulse ? "is-pulse" : ""}`}
      type="button"
      onClick={() => { void toggle(); }}
      disabled={microphoneState === "requesting"}
      aria-pressed={microphoneState === "listening"}
      title={error ?? (microphoneState === "listening"
        ? "Stop microphone beat detection and keep the current BPM"
        : "Detect song tempo from the microphone")}
    >
      <span aria-hidden="true">●</span>
      {label}
      <i aria-hidden="true"><b style={{ transform: `scaleX(${level})` }} /></i>
    </button>
  );
}
