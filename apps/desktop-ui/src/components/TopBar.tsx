import { useShowStore } from "../store/showStore";

export function TopBar() {
  const projectName = useShowStore((state) => state.projectName);
  const mode = useShowStore((state) => state.mode);
  const setMode = useShowStore((state) => state.setMode);
  const grandMaster = useShowStore((state) => state.grandMaster);
  const setGrandMaster = useShowStore((state) => state.setGrandMaster);
  const blackout = useShowStore((state) => state.blackout);
  const toggleBlackout = useShowStore((state) => state.toggleBlackout);
  const bpm = useShowStore((state) => state.bpm);
  const setBpm = useShowStore((state) => state.setBpm);

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
        <span className="status-dot is-good" />
        Saved now
      </div>

      <div className="mode-switch" role="group" aria-label="Operation mode">
        <button className={mode === "edit" ? "is-active" : ""} onClick={() => setMode("edit")}>EDIT</button>
        <button className={mode === "live" ? "is-live" : ""} onClick={() => setMode("live")}>LIVE</button>
      </div>

      <div className="tempo-control">
        <span className="control-kicker">TEMPO</span>
        <button className="tap-button" onClick={() => setBpm(bpm)}>TAP</button>
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
        <i className="beat-pulse" aria-hidden="true" />
      </div>

      <div className="output-status">
        <span className="status-dot is-good" />
        <div><strong>Art-Net</strong><small>1 universe · 44 Hz</small></div>
      </div>

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
