export type OperationMode = "edit" | "live";

export type FixtureKind = "dimmer" | "par" | "moving-head" | "strobe";

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
  locked: boolean;
  hidden: boolean;
  layer: string;
}

export interface FixtureModeSummary {
  id: string;
  name: string;
  footprint: number;
}

export interface FixtureDefinitionSummary {
  id: string;
  manufacturer: string;
  model: string;
  modes: FixtureModeSummary[];
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

export interface FixtureSnapshot {
  fixtures: LayoutFixture[];
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
  template: string;
  targetParameter: string;
  beatSync: boolean;
}

export interface EngineTelemetry {
  framesSent: number;
  sendErrors: number;
  missedDeadlines: number;
  droppedCommands: number;
  droppedJournalEntries: number;
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
  telemetry: EngineTelemetry;
  connected: boolean;
}

export interface ProjectView {
  name: string;
  fixtures: LayoutFixture[];
  scenes: SceneSummary[];
  cueLists: CueListSummary[];
  effects: EffectSummary[];
  fixtureDefinitions: FixtureDefinitionSummary[];
  background: StageBackground | null;
  universeCount: number;
}

export interface EngineBootstrap {
  project: ProjectView;
  engine: EngineView;
  projectPath: string;
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
  | { type: "tapTempo" };

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

export type ProjectCommand =
  | { type: "updateLayouts"; data: { layouts: LayoutUpdate[] } }
  | { type: "patchFixture"; data: { fixtureId: string; universe: number; address: number } }
  | { type: "addFixture"; data: { name: string; definitionId: string; modeId: string; x: number; y: number } }
  | { type: "duplicateFixtures"; data: { fixtureIds: string[] } }
  | { type: "deleteFixtures"; data: { fixtureIds: string[] } }
  | { type: "addUniverse" }
  | { type: "putBackground"; data: { name: string; mime: string; bytes: number[] } }
  | { type: "removeBackground" };
