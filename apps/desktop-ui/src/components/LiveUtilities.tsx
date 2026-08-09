import { useShowStore } from "../store/showStore";
import { MicrophoneBeatControl } from "./TopBar";

export function MasterBeatPanel() {
  const grandMaster = useShowStore((state) => state.grandMaster);
  const setGrandMaster = useShowStore((state) => state.setGrandMaster);
  const bpm = useShowStore((state) => state.bpm);
  const beatConfidence = useShowStore((state) => state.beatConfidence);
  const beatSource = useShowStore((state) => state.beatSource);
  const tapTempo = useShowStore((state) => state.tapTempo);
  return <aside className="master-beat-panel"><div className="vertical-master"><small>MASTER</small><strong>{Math.round(grandMaster * 100)}%</strong><input aria-label="Grand Master" type="range" min={0} max={1} step={0.01} value={grandMaster} onChange={(event) => setGrandMaster(Number(event.target.value))} /><span>FULL</span></div><div className="beat-control-card"><strong>{Math.round(bpm)} <small>BPM</small></strong><button onClick={tapTempo}>TAP</button><MicrophoneBeatControl bpm={bpm} /><label><span>BEAT</span><b>{Math.round(beatConfidence * 100)}%</b><i><u style={{ width: `${beatConfidence * 100}%` }} /></i></label><p><span className={`status-dot ${beatConfidence >= 0.45 ? "is-good" : "is-error"}`} /> {beatSource === "audio" && beatConfidence >= 0.45 ? "Microphone beat active" : "Fixed BPM ready"}</p></div></aside>;
}

export function ShortcutsPreview() {
  return <aside className="shortcuts-preview"><header>SHORTCUTS – PREVIEW</header><div><span><kbd>B</kbd><strong>Blackout</strong></span><span><kbd>F</kbd><strong>Full</strong></span><span><kbd>←</kbd><strong>Previous cue</strong></span><span><kbd>→</kbd><strong>Next cue</strong></span><span><kbd>T</kbd><strong>Tap Tempo</strong></span><span><kbd>⌘B</kbd><strong>Toggle Blind</strong></span><span><kbd>⌘F</kbd><strong>Freeze</strong></span></div><footer>Press <kbd>?</kbd> for more shortcuts</footer></aside>;
}
