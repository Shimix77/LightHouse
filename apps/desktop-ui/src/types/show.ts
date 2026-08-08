export type OperationMode = "edit" | "live";

export type FixtureKind = "dimmer" | "par" | "moving-head" | "strobe";
export type StageObjectKind = "truss" | "speaker" | "stage" | "person" | "shape";

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
  stageObjects: StageObject[];
  groups: GroupSummary[];
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

export interface StageObjectUpdate extends Omit<StageObject, "id" | "kind"> {
  objectId: string;
}

export type ProjectCommand =
  | { type: "updateLayouts"; data: { layouts: LayoutUpdate[] } }
  | { type: "patchFixture"; data: { fixtureId: string; universe: number; address: number } }
  | { type: "addFixture"; data: { name: string; definitionId: string; modeId: string; x: number; y: number } }
  | { type: "duplicateFixtures"; data: { fixtureIds: string[] } }
  | { type: "deleteFixtures"; data: { fixtureIds: string[] } }
  | { type: "addUniverse" }
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
  | { type: "deleteCue"; data: { cueListId: string; index: number } };
