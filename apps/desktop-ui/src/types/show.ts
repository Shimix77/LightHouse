export type OperationMode = "edit" | "live";
export type StageView = "front" | "top";

export type FixtureKind = "dimmer" | "par" | "moving-head" | "strobe";
export type StageObjectKind = "truss" | "speaker" | "stage" | "person" | "shape";
export type EffectTemplate = "pulse" | "sineWave" | "chase" | "fill" | "randomFlicker" | "sparkle" | "twoColorChase" | "rainbow" | "colorWave" | "randomColor" | "panSweep" | "tiltBounce" | "circle" | "figureEight" | "fireCandleFlicker";
export type EffectDirection = "forward" | "reverse";
export type EffectBlend = "replace" | "add";
export type EffectOrder = "fixtureOrder" | "layoutX" | "layoutY";
export type BeatSource = "fixed" | "tap" | "audio";
export type DisconnectPolicy = "holdLastLook" | "blackoutAfterTimeout";

export interface LayoutFixture {
  id: string;
  name: string;
  kind: FixtureKind;
  definitionId: string;
  modeId: string;
  footprint: number;
  universe: number;
  address: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  intensity: number;
  color: string;
  pan: number;
  tilt: number;
  zoom: number;
  parameters: Record<string, number>;
  locked: boolean;
  hidden: boolean;
  layer: string;
}

export interface FixtureModeSummary {
  id: string;
  name: string;
  footprint: number;
  parameters: FixtureParameterSummary[];
}

export interface FixtureParameterSummary {
  id: string;
  name: string;
  capability: "intensity" | "color" | "position" | "beam" | "shutter" | "gobo" | "custom";
  defaultValue: number;
  resolution: 8 | 16;
  coarseChannel: number;
  fineChannel: number | null;
  invert: boolean;
}

export interface FixtureDefinitionSummary {
  id: string;
  manufacturer: string;
  model: string;
  source: "generic" | "ofl" | "custom";
  modes: FixtureModeSummary[];
}

export interface CustomFixtureChannel {
  name: string;
  parameterId: string;
  capability: "intensity" | "color" | "position" | "beam" | "shutter" | "gobo" | "custom";
  coarseChannel: number;
  fineChannel: number | null;
  defaultValue: number;
  invert: boolean;
}

export interface CustomFixtureInput {
  manufacturer: string;
  model: string;
  modeId: string;
  modeName: string;
  footprint: number;
  channels: CustomFixtureChannel[];
}

export interface SceneSummary {
  id: string;
  number: string;
  name: string;
  color: string;
  active: boolean;
  fadeMs: number;
}

export interface StageBackground {
  dataUrl: string;
  name: string;
  opacity: number;
  locked: boolean;
}

export interface StageObject {
  id: string;
  name: string;
  kind: StageObjectKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
  hidden: boolean;
  layer: string;
  opacity: number;
}

export interface GroupSummary {
  id: string;
  name: string;
  fixtureIds: string[];
}

export interface FixtureSnapshot {
  fixtures: LayoutFixture[];
  stageObjects: StageObject[];
}

export interface CueEntrySummary {
  number: string;
  name: string;
  sceneId: string;
  fadeMs: number | null;
}

export interface CueListSummary {
  id: string;
  name: string;
  entries: CueEntrySummary[];
}

export interface EffectSummary {
  id: string;
  name: string;
  template: EffectTemplate;
  targetParameter: string;
  amplitude: number;
  offset: number;
  speedHz: number;
  beatMultiplier: number;
  beatSync: boolean;
  spatialPhase: number;
  direction: EffectDirection;
  blend: EffectBlend;
  order: EffectOrder;
  active: boolean;
}

export interface LiveControlSummary {
  id: string;
  label: string;
  sceneId: string | null;
  effectId: string | null;
  page: number;
  position: number;
  gridX: number;
  gridY: number;
  width: number;
  height: number;
  color: string;
  behavior: "toggle" | "flash" | "push" | "radio";
}

export interface EngineTelemetry {
  framesSent: number;
  sendErrors: number;
  missedDeadlines: number;
  droppedCommands: number;
  droppedJournalEntries: number;
  watchdogBlackout: boolean;
}

export interface ProjectSettingsSummary {
  dmxRefreshHz: number;
  disconnectPolicy: DisconnectPolicy;
  disconnectTimeoutMs: number;
}

export interface UniverseSummary {
  id: number;
  name: string;
  enabled: boolean;
  protocol: "artNet" | "usbDmx" | "none";
  portAddress: number;
  destination: string;
  interface: string | null;
  broadcast: boolean;
  devicePath: string | null;
}

export interface EngineFixtureValues {
  fixtureId: string;
  parameters: Record<string, number>;
}

export interface CueRuntimeView {
  cueListId: string;
  cursor: number | null;
  paused: boolean;
}

export interface EngineView {
  revision: number;
  operationMode: OperationMode;
  fixtureValues: EngineFixtureValues[];
  activeSceneIds: string[];
  activeEffectIds: string[];
  cueRuntime: CueRuntimeView[];
  grandMaster: number;
  blackout: boolean;
  blind: boolean;
  freeze: boolean;
  bpm: number;
  beatSource: BeatSource;
  beatConfidence: number;
  telemetry: EngineTelemetry;
  connected: boolean;
}

export interface ProjectView {
  name: string;
  fixtures: LayoutFixture[];
  stageObjects: StageObject[];
  groups: GroupSummary[];
  scenes: SceneSummary[];
  cueLists: CueListSummary[];
  effects: EffectSummary[];
  liveControls: LiveControlSummary[];
  fixtureDefinitions: FixtureDefinitionSummary[];
  background: StageBackground | null;
  universes: UniverseSummary[];
  settings: ProjectSettingsSummary;
  universeCount: number;
}

export interface EngineBootstrap {
  project: ProjectView;
  engine: EngineView;
  projectPath: string;
  recentProjects: RecentProject[];
  recoveryNotice: string | null;
}

export interface RecentProject {
  name: string;
  path: string;
}

export type EngineCommand =
  | { type: "setFixtureParameter"; data: { fixtureId: string; parameterId: string; value: number } }
  | { type: "clearProgrammer"; data: { fixtureId: string | null } }
  | { type: "activateScene"; data: { sceneId: string; fadeMs: number | null } }
  | { type: "releaseScene"; data: { sceneId: string; fadeMs: number | null } }
  | { type: "goNextCue"; data: { cueListId: string } }
  | { type: "backCue"; data: { cueListId: string } }
  | { type: "pauseCueList"; data: { cueListId: string } }
  | { type: "resumeCueList"; data: { cueListId: string } }
  | { type: "setGrandMaster"; data: { value: number } }
  | { type: "setBlackout"; data: { enabled: boolean } }
  | { type: "setBlind"; data: { enabled: boolean } }
  | { type: "commitBlind" }
  | { type: "setFreeze"; data: { enabled: boolean } }
  | { type: "setOperationMode"; data: { mode: OperationMode } }
  | { type: "setTempo"; data: { bpm: number } }
  | { type: "setAudioTempo"; data: { bpm: number; confidence: number } }
  | { type: "tapTempo" }
  | { type: "startEffect"; data: { effectId: string; fixtureIds: string[] } }
  | { type: "stopEffect"; data: { effectId: string } }
  | { type: "applyFan"; data: { fixtureIds: string[]; parameterId: string; base: number; spread: number } }
  | { type: "applyColorFan"; data: { fixtureIds: string[]; startRgb: [number, number, number]; endRgb: [number, number, number] } };

export interface LayoutUpdate {
  fixtureId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
  hidden: boolean;
  layer: string;
}

export interface StageObjectUpdate extends Omit<StageObject, "id" | "kind"> {
  objectId: string;
}

export type ProjectCommand =
  | { type: "updateLayouts"; data: { layouts: LayoutUpdate[] } }
  | { type: "patchFixture"; data: { fixtureId: string; universe: number; address: number } }
  | { type: "addFixture"; data: { name: string; definitionId: string; modeId: string; x: number; y: number } }
  | { type: "addFixturesAtPatch"; data: { name: string; definitionId: string; modeId: string; quantity: number; universe: number; address: number } }
  | { type: "putCustomFixtureDefinition"; data: CustomFixtureInput & { definitionId: string } }
  | { type: "duplicateFixtures"; data: { fixtureIds: string[] } }
  | { type: "deleteFixtures"; data: { fixtureIds: string[] } }
  | { type: "addUniverse" }
  | { type: "putUniverseOutput"; data: { universe: number; name: string; enabled: boolean; protocol: UniverseSummary["protocol"]; portAddress: number; destination: string; interface: string | null; broadcast: boolean; devicePath: string | null } }
  | { type: "putProjectSettings"; data: ProjectSettingsSummary }
  | { type: "putBackground"; data: { name: string; mime: string; bytes: number[] } }
  | { type: "removeBackground" }
  | { type: "addStageObject"; data: { kind: StageObjectKind; name: string; x: number; y: number } }
  | { type: "updateStageObjects"; data: { objects: StageObjectUpdate[] } }
  | { type: "duplicateStageObjects"; data: { objectIds: string[] } }
  | { type: "deleteStageObjects"; data: { objectIds: string[] } }
  | { type: "putGroup"; data: { groupId: string | null; name: string; fixtureIds: string[] } }
  | { type: "deleteGroup"; data: { groupId: string } }
  | { type: "captureScene"; data: { name: string; fixtureIds: string[]; fadeMs: number } }
  | { type: "updateScene"; data: { sceneId: string; name: string; fadeMs: number } }
  | { type: "deleteScene"; data: { sceneId: string } }
  | { type: "addCue"; data: { cueListId: string | null; sceneId: string } }
  | { type: "deleteCue"; data: { cueListId: string; index: number } }
  | { type: "putEffect"; data: { effectId: string | null; name: string; template: EffectTemplate; targetParameter: string; amplitude: number; offset: number; speedHz: number; beatMultiplier: number; beatSync: boolean; spatialPhase: number; direction: EffectDirection; blend: EffectBlend; order: EffectOrder } }
  | { type: "deleteEffect"; data: { effectId: string } }
  | { type: "putLiveControl"; data: { controlId: string | null; label: string; sceneId: string | null; effectId: string | null; page: number; position: number } }
  | { type: "updateLiveControlLayout"; data: { controlId: string; gridX: number; gridY: number; width: number; height: number; color: string; behavior: LiveControlSummary["behavior"] } }
  | { type: "deleteLiveControl"; data: { controlId: string } };
