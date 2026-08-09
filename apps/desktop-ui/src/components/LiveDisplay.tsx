import { LivePanel } from "./LivePanel";
import { useShowStore } from "../store/showStore";

export function LiveDisplay() {
  const projectName = useShowStore((state) => state.projectName);
  const connected = useShowStore((state) => state.engineConnected);
  const mode = useShowStore((state) => state.mode);
  const bpm = useShowStore((state) => state.bpm);
  const grandMaster = useShowStore((state) => state.grandMaster);
  const setGrandMaster = useShowStore((state) => state.setGrandMaster);
  const blackout = useShowStore((state) => state.blackout);
  const toggleBlackout = useShowStore((state) => state.toggleBlackout);
  const freeze = useShowStore((state) => state.freeze);
  const toggleFreeze = useShowStore((state) => state.toggleFreeze);
  const cueCursor = useShowStore((state) => state.cueCursor);
  const goNextCue = useShowStore((state) => state.goNextCue);
  const backCue = useShowStore((state) => state.backCue);
  return (
    <main className="live-display-shell">
      <header>
        <div><span>LIGHTHOUSE LIVE</span><strong>{projectName}</strong></div>
        <div className="live-display-status"><i className={`status-dot ${connected ? "is-good" : "is-error"}`} />{connected ? "ENGINE CONNECTED" : "RECONNECTING"}<b>{mode.toUpperCase()}</b><b>{Math.round(bpm)} BPM</b></div>
      </header>
      <section className="live-display-controls">
        <LivePanel />
      </section>
      <footer>
        <div className="live-display-cue"><button onClick={backCue}>◀ BACK</button><button className="live-go" onClick={goNextCue}>GO <span>{cueCursor === null ? "1" : cueCursor + 2}</span></button></div>
        <label><span>GRAND MASTER</span><input type="range" min={0} max={1} step={0.01} value={grandMaster} onChange={(event) => setGrandMaster(Number(event.target.value))} /><strong>{Math.round(grandMaster * 100)}%</strong></label>
        <button className={freeze ? "live-freeze is-active" : "live-freeze"} onClick={toggleFreeze}>FREEZE</button>
        <button className={blackout ? "live-blackout is-active" : "live-blackout"} onClick={toggleBlackout}>● BLACKOUT</button>
      </footer>
    </main>
  );
}
