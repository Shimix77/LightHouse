export interface BeatEstimate {
  bpm: number;
  confidence: number;
}

export interface BeatDetectorCallbacks {
  onEstimate: (estimate: BeatEstimate) => void;
  onLevel: (level: number, pulse: boolean) => void;
}

export class MicrophoneBeatDetector {
  private stream: MediaStream | undefined;
  private context: AudioContext | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private analyser: AnalyserNode | undefined;
  private animationFrame = 0;
  private readonly energyHistory: number[] = [];
  private readonly onsets: number[] = [];
  private previousEnergy = 0;
  private lastOnset = Number.NEGATIVE_INFINITY;
  private lastPublished = Number.NEGATIVE_INFINITY;

  constructor(private readonly callbacks: BeatDetectorCallbacks) {}

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone input is not available on this system.");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
      },
    });
    this.context = new AudioContext({ latencyHint: "interactive" });
    await this.context.resume();
    this.source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.18;
    this.source.connect(this.analyser);
    const waveform = new Float32Array(this.analyser.fftSize);
    const spectrum = new Uint8Array(this.analyser.frequencyBinCount);

    const analyze = () => {
      const analyser = this.analyser;
      const context = this.context;
      if (!analyser || !context) return;
      analyser.getFloatTimeDomainData(waveform);
      analyser.getByteFrequencyData(spectrum);
      const rms = Math.sqrt(waveform.reduce((sum, value) => sum + value * value, 0) / waveform.length);
      const hertzPerBin = context.sampleRate / analyser.fftSize;
      const lowStart = Math.max(1, Math.floor(45 / hertzPerBin));
      const lowEnd = Math.min(spectrum.length - 1, Math.ceil(180 / hertzPerBin));
      let lowEnergy = 0;
      for (let index = lowStart; index <= lowEnd; index += 1) lowEnergy += spectrum[index] ?? 0;
      lowEnergy /= Math.max(1, lowEnd - lowStart + 1) * 255;
      const energy = lowEnergy * 0.72 + Math.min(1, rms * 5) * 0.28;
      const baseline = average(this.energyHistory);
      const deviation = standardDeviation(this.energyHistory, baseline);
      const threshold = baseline + Math.max(0.025, deviation * 1.45);
      const now = performance.now();
      const onset = this.energyHistory.length >= 24
        && energy > threshold
        && energy > this.previousEnergy * 1.07
        && now - this.lastOnset >= 230;
      if (onset) {
        this.lastOnset = now;
        this.onsets.push(now);
        while (this.onsets.length > 16) this.onsets.shift();
        const estimate = estimateTempo(this.onsets);
        if (estimate && estimate.confidence >= 0.24 && now - this.lastPublished >= 450) {
          this.lastPublished = now;
          this.callbacks.onEstimate(estimate);
        }
      }
      this.energyHistory.push(energy);
      while (this.energyHistory.length > 120) this.energyHistory.shift();
      this.previousEnergy = energy;
      this.callbacks.onLevel(Math.min(1, energy * 2.2), onset);
      this.animationFrame = window.requestAnimationFrame(analyze);
    };
    this.animationFrame = window.requestAnimationFrame(analyze);
  }

  async stop(): Promise<void> {
    window.cancelAnimationFrame(this.animationFrame);
    this.source?.disconnect();
    this.analyser?.disconnect();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.stream = undefined;
    this.context = undefined;
    this.source = undefined;
    this.analyser = undefined;
    this.energyHistory.length = 0;
    this.onsets.length = 0;
  }
}

export function estimateTempo(onsets: number[]): BeatEstimate | null {
  if (onsets.length < 4) return null;
  const bpms = onsets
    .slice(1)
    .map((onset, index) => onset - (onsets[index] ?? onset))
    .filter((interval) => interval >= 250 && interval <= 1_500)
    .map((interval) => normalizeDanceTempo(60_000 / interval));
  if (bpms.length < 3) return null;
  const bpm = median(bpms);
  const deviations = bpms.map((value) => Math.abs(value - bpm));
  const consistency = Math.max(0, 1 - median(deviations) / Math.max(4, bpm * 0.08));
  const sampleConfidence = Math.min(1, bpms.length / 8);
  return {
    bpm: Math.round(bpm * 10) / 10,
    confidence: Math.max(0, Math.min(1, consistency * sampleConfidence)),
  };
}

function normalizeDanceTempo(bpm: number): number {
  let normalized = bpm;
  while (normalized < 70) normalized *= 2;
  while (normalized > 180) normalized /= 2;
  return normalized;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}
