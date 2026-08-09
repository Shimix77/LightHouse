import { create, type StoreApi } from "zustand";

import {
  createProject,
  dispatchEngineCommand,
  hasNativeEngine,
  openProject,
  openRecentProject,
  saveProjectAs,
  sendProjectCommand,
} from "../services/engineClient";
import type {
  BeatSource,
  CueListSummary,
  CustomFixtureInput,
  EffectSummary,
  EngineBootstrap,
  EngineCommand,
  EngineTelemetry,
  EngineView,
  FixtureDefinitionSummary,
  FixtureSnapshot,
  GroupSummary,
  LayoutFixture,
  LiveControlSummary,
  OperationMode,
  ProjectCommand,
  ProjectSettingsSummary,
  RecentProject,
  SceneSummary,
  StageBackground,
  StageObject,
  StageObjectKind,
  StageView,
  UniverseSummary,
} from "../types/show";

interface ShowUiState {
  projectName: string;
  mode: OperationMode;
  stageView: StageView;
  stageTool: "select" | "pan" | "rectangle";
  gridEnabled: boolean;
  fixtures: LayoutFixture[];
  selectedFixtureIds: string[];
  stageObjects: StageObject[];
  selectedStageObjectIds: string[];
  groups: GroupSummary[];
  scenes: SceneSummary[];
  grandMaster: number;
  blackout: boolean;
  blind: boolean;
  freeze: boolean;
  bpm: number;
  beatSource: BeatSource;
  beatConfidence: number;
  cueLists: CueListSummary[];
  effects: EffectSummary[];
  liveControls: LiveControlSummary[];
  livePage: number;
  fixtureDefinitions: FixtureDefinitionSummary[];
  universes: UniverseSummary[];
  projectSettings: ProjectSettingsSummary;
  universeCount: number;
  projectPath: string;
  recentProjects: RecentProject[];
  recoveryNotice: string | undefined;
  projectBusy: boolean;
  engineConnected: boolean;
  engineError: string | undefined;
  engineRevision: number;
  engineTelemetry: EngineTelemetry;
  cueCursor: number | null;
  cuePaused: boolean;
  background: StageBackground | undefined;
  snapEnabled: boolean;
  undoStack: FixtureSnapshot[];
  redoStack: FixtureSnapshot[];
  clipboardFixtureIds: string[];
  clipboardStageObjectIds: string[];
  setMode: (mode: OperationMode) => void;
  setStageView: (view: StageView) => void;
  setStageTool: (tool: "select" | "pan" | "rectangle") => void;
  toggleGrid: () => void;
  selectFixtures: (ids: string[], additive?: boolean) => void;
  selectStageObjects: (ids: string[], additive?: boolean) => void;
  captureFixtureHistory: () => void;
  moveFixtures: (ids: string[], deltaX: number, deltaY: number) => void;
  updateSelectedFixtures: (update: Partial<LayoutFixture>) => void;
  updateSelectedFixtureAxes: (invertPan: boolean, invertTilt: boolean) => void;
  setSelectedParameter: (parameterId: string, value: number) => void;
  testFixtureParameter: (fixtureId: string, parameterId: string, value: number) => void;
  moveStageObjects: (ids: string[], deltaX: number, deltaY: number) => void;
  updateSelectedStageObjects: (update: Partial<StageObject>) => void;
  setGrandMaster: (value: number) => void;
  toggleBlackout: () => void;
  toggleBlind: () => void;
  commitBlind: () => void;
  clearProgrammer: () => void;
  toggleFreeze: () => void;
  setBpm: (value: number) => void;
  setAudioTempo: (bpm: number, confidence: number) => void;
  tapTempo: () => void;
  activateScene: (id: string) => void;
  goNextCue: () => void;
  backCue: () => void;
  toggleCuePause: () => void;
  importBackground: (file: File) => Promise<void>;
  removeBackground: () => void;
  toggleSnap: () => void;
  undo: () => void;
  redo: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
  deleteSelection: () => void;
  patchFixture: (fixtureId: string, universe: number, address: number) => void;
  addFixture: (definitionId: string, modeId: string, name: string) => void;
  addFixturesAtPatch: (definitionId: string, modeId: string, name: string, quantity: number, universe: number, address: number) => Promise<boolean>;
  putCustomFixture: (fixture: CustomFixtureInput, definitionId?: string) => Promise<string | null>;
  newProject: () => Promise<void>;
  openProject: () => Promise<void>;
  openRecentProject: (path: string) => Promise<void>;
  saveProjectAs: () => Promise<void>;
  dismissRecoveryNotice: () => void;
  addUniverse: () => void;
  putUniverseOutput: (universe: UniverseSummary) => Promise<boolean>;
  putProjectSettings: (settings: ProjectSettingsSummary) => Promise<boolean>;
  addStageObject: (kind: StageObjectKind, name: string) => void;
  putGroup: (groupId: string | null, name: string, fixtureIds: string[]) => void;
  deleteGroup: (groupId: string) => void;
  captureScene: (name: string, fadeMs: number) => void;
  captureSceneSnapshot: (name: string, fadeMs: number) => void;
  recaptureScene: (sceneId: string) => void;
  updateScene: (sceneId: string, name: string, fadeMs: number) => void;
  deleteScene: (sceneId: string) => void;
  addCue: (sceneId: string) => void;
  deleteCue: (cueListId: string, index: number) => void;
  toggleEffect: (effectId: string) => void;
  applyFan: (parameterId: string, base: number, spread: number) => void;
  applyColorFan: (startColor: string, endColor: string) => void;
  saveEffect: (effect: Omit<EffectSummary, "id" | "active"> & { id: string | null }) => void;
  deleteEffect: (effectId: string) => void;
  addLiveControl: (label: string, sceneId: string | null, effectId: string | null) => void;
  deleteLiveControl: (controlId: string) => void;
  triggerLiveControl: (controlId: string) => void;
  releaseLiveControl: (controlId: string) => void;
  setLiveControlLevel: (controlId: string, level: number) => void;
  updateLiveControlLayout: (controlId: string, update: Pick<LiveControlSummary, "gridX" | "gridY" | "width" | "height" | "color" | "behavior" | "controlType" | "fadeInMs" | "fadeOutMs" | "dimmer" | "beatMultiplier">) => Promise<boolean>;
  setLivePage: (page: number) => void;
  hydrateEngine: (bootstrap: EngineBootstrap) => void;
  applyEngineView: (view: EngineView) => void;
  setEngineError: (message: string) => void;
}

const initialFixtures: LayoutFixture[] = [
  fixture("fx-1", "Front PAR L", "par", 1, 1, -4.2, -2.6, "#ffb15a"),
  fixture("fx-2", "Front PAR R", "par", 1, 6, 4.2, -2.6, "#ffb15a"),
  fixture("fx-3", "Wash Left", "moving-head", 1, 11, -5.5, 1.2, "#5cb8ff"),
  fixture("fx-4", "Wash Right", "moving-head", 1, 21, 5.5, 1.2, "#5cb8ff"),
  fixture("fx-5", "Back Center", "moving-head", 1, 31, 0, 4.2, "#bd7cff"),
  fixture("fx-6", "Strobe", "strobe", 1, 41, 0, -0.2, "#ffffff"),
];

const initialScenes: SceneSummary[] = [
  { id: "scene-1", number: "1", name: "Warm Welcome", color: "#ff9f43", active: true, fadeMs: 1200 },
  { id: "scene-2", number: "2", name: "Blue Air", color: "#4da3ff", active: false, fadeMs: 1800 },
  { id: "scene-3", number: "3", name: "Violet Motion", color: "#a970ff", active: false, fadeMs: 900 },
  { id: "scene-4", number: "4", name: "Full Energy", color: "#ff4d6d", active: false, fadeMs: 300 },
];

const initialLiveControls: LiveControlSummary[] = initialScenes.map((scene, index) => ({
  id: `live-${index + 1}`,
  label: scene.name,
  sceneId: scene.id,
  effectId: null,
  page: 1,
  position: index,
  gridX: (index % 2) * 6,
  gridY: Math.floor(index / 2),
  width: 6,
  height: 1,
  color: scene.color,
  behavior: index === 3 ? "flash" : "radio",
  controlType: "button",
  fadeInMs: scene.fadeMs,
  fadeOutMs: scene.fadeMs,
  dimmer: 1,
  beatMultiplier: 1,
}));

const initialFixtureDefinitions: FixtureDefinitionSummary[] = [
  { id: "generic.dimmer", manufacturer: "LightHouse", model: "Generic Dimmer", source: "generic", modes: [{ id: "1ch", name: "1 Channel", footprint: 1, parameters: [
    { id: "intensity", name: "Intensity", capability: "intensity", defaultValue: 0, resolution: 8, coarseChannel: 1, fineChannel: null, invert: false },
  ] }] },
  { id: "generic.led-par-rgbw-4ch", manufacturer: "LightHouse", model: "Generic LED PAR RGBW (4ch)", source: "generic", fixtureType: "par", icon: "par", beamKind: "spot", virtualColor: true, modes: [{ id: "rgbw", name: "RGBW", footprint: 4, parameters: [
    { id: "color.red", name: "Red", capability: "color", defaultValue: 0, resolution: 8, coarseChannel: 1, fineChannel: null, invert: false },
    { id: "color.green", name: "Green", capability: "color", defaultValue: 0, resolution: 8, coarseChannel: 2, fineChannel: null, invert: false },
    { id: "color.blue", name: "Blue", capability: "color", defaultValue: 0, resolution: 8, coarseChannel: 3, fineChannel: null, invert: false },
    { id: "color.white", name: "White", capability: "color", defaultValue: 0, resolution: 8, coarseChannel: 4, fineChannel: null, invert: false },
  ] }] },
  { id: "generic.rgbw-par", manufacturer: "LightHouse", model: "Generic RGBW PAR", source: "generic", modes: [{ id: "5ch", name: "Intensity + RGBW", footprint: 5, parameters: [
    { id: "intensity", name: "Intensity", capability: "intensity", defaultValue: 0, resolution: 8, coarseChannel: 1, fineChannel: null, invert: false },
    { id: "color.red", name: "Red", capability: "color", defaultValue: 0, resolution: 8, coarseChannel: 2, fineChannel: null, invert: false },
    { id: "color.green", name: "Green", capability: "color", defaultValue: 0, resolution: 8, coarseChannel: 3, fineChannel: null, invert: false },
    { id: "color.blue", name: "Blue", capability: "color", defaultValue: 0, resolution: 8, coarseChannel: 4, fineChannel: null, invert: false },
    { id: "color.white", name: "White", capability: "color", defaultValue: 0, resolution: 8, coarseChannel: 5, fineChannel: null, invert: false },
  ] }] },
  { id: "generic.moving-head-16bit", manufacturer: "LightHouse", model: "Generic 16-bit Moving Head", source: "generic", modes: [{ id: "10ch", name: "Pan/Tilt 16-bit + RGB + Beam", footprint: 10, parameters: [
    { id: "position.pan", name: "Pan", capability: "position", defaultValue: 0.5, resolution: 16, coarseChannel: 1, fineChannel: 2, invert: false },
    { id: "position.tilt", name: "Tilt", capability: "position", defaultValue: 0.5, resolution: 16, coarseChannel: 3, fineChannel: 4, invert: false },
    { id: "intensity", name: "Intensity", capability: "intensity", defaultValue: 0, resolution: 8, coarseChannel: 5, fineChannel: null, invert: false },
    { id: "color.red", name: "Red", capability: "color", defaultValue: 0, resolution: 8, coarseChannel: 6, fineChannel: null, invert: false },
    { id: "color.green", name: "Green", capability: "color", defaultValue: 0, resolution: 8, coarseChannel: 7, fineChannel: null, invert: false },
    { id: "color.blue", name: "Blue", capability: "color", defaultValue: 0, resolution: 8, coarseChannel: 8, fineChannel: null, invert: false },
    { id: "beam.zoom", name: "Zoom", capability: "beam", defaultValue: 0.5, resolution: 8, coarseChannel: 9, fineChannel: null, invert: false },
    { id: "shutter", name: "Shutter / Strobe", capability: "shutter", defaultValue: 0, resolution: 8, coarseChannel: 10, fineChannel: null, invert: false },
  ] }] },
];

export const useShowStore = create<ShowUiState>((set, get) => {
  const onEngineView = (view: EngineView) => get().applyEngineView(view);
  const onEngineError = (message: string) => set({ engineConnected: false, engineError: message });
  const dispatch = (command: EngineCommand, key?: string) =>
    dispatchEngineCommand(command, onEngineView, onEngineError, key);
  const mutateProject = async (
    command: ProjectCommand,
    preserveHistory = false,
  ): Promise<boolean> => {
    if (!hasNativeEngine()) return false;
    try {
      const undoStack = get().undoStack;
      const redoStack = get().redoStack;
      get().hydrateEngine(await sendProjectCommand(command));
      if (preserveHistory) set({ undoStack, redoStack });
      return true;
    } catch (error) {
      set({ engineError: error instanceof Error ? error.message : String(error) });
      return false;
    }
  };
  const runProjectOperation = async (
    operation: () => Promise<EngineBootstrap | null>,
  ): Promise<void> => {
    if (!hasNativeEngine()) return;
    set({ projectBusy: true, engineError: undefined });
    try {
      const bootstrap = await operation();
      if (bootstrap) get().hydrateEngine(bootstrap);
    } catch (error) {
      set({ engineError: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ projectBusy: false });
    }
  };
  const persistLayouts = (ids: string[]) => {
    const layouts = get().fixtures
      .filter((fixtureItem) => ids.includes(fixtureItem.id))
      .map((fixtureItem) => ({
        fixtureId: fixtureItem.id,
        x: fixtureItem.x,
        y: fixtureItem.y,
        width: fixtureItem.width,
        height: fixtureItem.height,
        rotation: fixtureItem.rotation,
        locked: fixtureItem.locked,
        hidden: fixtureItem.hidden,
        layer: fixtureItem.layer,
      }));
    if (layouts.length > 0) {
      void mutateProject({ type: "updateLayouts", data: { layouts } }, true);
    }
  };
  const persistStageObjects = (ids: string[]) => {
    const objects = get().stageObjects
      .filter((stageObject) => ids.includes(stageObject.id))
      .map((stageObject) => ({
        objectId: stageObject.id,
        name: stageObject.name,
        x: stageObject.x,
        y: stageObject.y,
        width: stageObject.width,
        height: stageObject.height,
        rotation: stageObject.rotation,
        locked: stageObject.locked,
        hidden: stageObject.hidden,
        layer: stageObject.layer,
        opacity: stageObject.opacity,
      }));
    if (objects.length > 0) {
      void mutateProject({ type: "updateStageObjects", data: { objects } }, true);
    }
  };

  return {
    projectName: "Main Stage — Demo",
    mode: "edit",
    stageView: readStageView(),
    stageTool: "select",
    gridEnabled: true,
    fixtures: initialFixtures,
    selectedFixtureIds: ["fx-5"],
    stageObjects: [],
    selectedStageObjectIds: [],
    groups: [],
    scenes: initialScenes,
    cueLists: [],
    effects: [],
    liveControls: initialLiveControls,
    livePage: 1,
    fixtureDefinitions: initialFixtureDefinitions,
    universes: [{ id: 1, name: "Universe 1", enabled: true, protocol: "artNet", portAddress: 0, destination: "127.0.0.1:6454", interface: null, broadcast: false, devicePath: null }],
    projectSettings: { dmxRefreshHz: 44, disconnectPolicy: "holdLastLook", disconnectTimeoutMs: 10_000 },
    universeCount: 1,
    projectPath: "",
    recentProjects: [],
    recoveryNotice: undefined,
    projectBusy: false,
    grandMaster: 1,
    blackout: false,
    blind: false,
    freeze: false,
    bpm: 120,
    beatSource: "fixed",
    beatConfidence: 1,
    engineConnected: false,
    engineError: undefined,
    engineRevision: 0,
    engineTelemetry: emptyTelemetry(),
    cueCursor: null,
    cuePaused: false,
    background: undefined,
    snapEnabled: true,
    undoStack: [],
    redoStack: [],
    clipboardFixtureIds: [],
    clipboardStageObjectIds: [],
    setMode: (mode) => {
      set({ mode });
      dispatch({ type: "setOperationMode", data: { mode } });
    },
    setStageView: (stageView) => {
      window.localStorage.setItem("lighthouse.stageView", stageView);
      set({ stageView });
    },
    setStageTool: (stageTool) => set({ stageTool }),
    toggleGrid: () => set((state) => ({ gridEnabled: !state.gridEnabled })),
    selectFixtures: (ids, additive = false) =>
      set((state) => ({
        selectedFixtureIds: additive
          ? [...new Set([...state.selectedFixtureIds, ...ids])]
          : ids,
        selectedStageObjectIds: [],
      })),
    selectStageObjects: (ids, additive = false) =>
      set((state) => ({
        selectedStageObjectIds: additive
          ? [...new Set([...state.selectedStageObjectIds, ...ids])]
          : ids,
        selectedFixtureIds: [],
      })),
    captureFixtureHistory: () =>
      set((state) => ({
        undoStack: [...state.undoStack.slice(-49), snapshot(state.fixtures, state.stageObjects)],
        redoStack: [],
      })),
    moveFixtures: (ids, deltaX, deltaY) => {
      set((state) => ({
        fixtures: state.fixtures.map((fixtureItem) =>
          ids.includes(fixtureItem.id) && !fixtureItem.locked
            ? {
                ...fixtureItem,
                x: state.snapEnabled ? Math.round(fixtureItem.x + deltaX) : fixtureItem.x + deltaX,
                y: state.snapEnabled ? Math.round(fixtureItem.y + deltaY) : fixtureItem.y + deltaY,
              }
            : fixtureItem,
        ),
      }));
      persistLayouts(ids);
    },
    updateSelectedFixtures: (update) => {
      const state = get();
      const selectedIds = state.selectedFixtureIds;
      set((state) => ({
        fixtures: state.fixtures.map((fixtureItem) =>
          selectedIds.includes(fixtureItem.id)
            && (!fixtureItem.locked || update.locked === false)
            ? { ...fixtureItem, ...update }
            : fixtureItem,
        ),
      }));
      for (const fixtureId of selectedIds) {
        const fixtureItem = state.fixtures.find((fixture) => fixture.id === fixtureId);
        const parameterIds = fixtureItem
          ? state.fixtureDefinitions
              .find((definition) => definition.id === fixtureItem.definitionId)
              ?.modes.find((mode) => mode.id === fixtureItem.modeId)
              ?.parameters.map((parameter) => parameter.id)
          : undefined;
        dispatchFixtureUpdate(fixtureId, update, dispatch, parameterIds);
      }
      if (["x", "y", "width", "height", "rotation", "locked", "hidden", "layer"]
        .some((property) => property in update)) {
        persistLayouts(selectedIds);
      }
    },
    updateSelectedFixtureAxes: (invertPan, invertTilt) => {
      const fixtureIds = get().selectedFixtureIds;
      if (fixtureIds.length === 0) return;
      set((state) => ({
        fixtures: state.fixtures.map((fixtureItem) => fixtureIds.includes(fixtureItem.id)
          ? { ...fixtureItem, invertPan, invertTilt }
          : fixtureItem),
      }));
      void mutateProject({
        type: "updateFixtureSettings",
        data: { fixtureIds, invertPan, invertTilt },
      });
    },
    setSelectedParameter: (parameterId, value) => {
      const normalized = clamp(value);
      const selectedIds = get().selectedFixtureIds;
      set((state) => ({
        fixtures: state.fixtures.map((fixtureItem) => selectedIds.includes(fixtureItem.id)
          ? { ...fixtureItem, parameters: { ...fixtureItem.parameters, [parameterId]: normalized } }
          : fixtureItem),
      }));
      for (const fixtureId of selectedIds) {
        dispatch(
          { type: "setFixtureParameter", data: { fixtureId, parameterId, value: normalized } },
          `${fixtureId}:${parameterId}`,
        );
      }
    },
    testFixtureParameter: (fixtureId, parameterId, value) => {
      const normalized = clamp(value);
      set((state) => ({
        fixtures: state.fixtures.map((fixtureItem) => fixtureItem.id === fixtureId
          ? { ...fixtureItem, parameters: { ...fixtureItem.parameters, [parameterId]: normalized } }
          : fixtureItem),
      }));
      dispatch(
        { type: "setFixtureParameter", data: { fixtureId, parameterId, value: normalized } },
        `fixture-test:${fixtureId}:${parameterId}`,
      );
    },
    moveStageObjects: (ids, deltaX, deltaY) => {
      set((state) => ({
        stageObjects: state.stageObjects.map((stageObject) =>
          ids.includes(stageObject.id) && !stageObject.locked
            ? {
                ...stageObject,
                x: state.snapEnabled ? Math.round(stageObject.x + deltaX) : stageObject.x + deltaX,
                y: state.snapEnabled ? Math.round(stageObject.y + deltaY) : stageObject.y + deltaY,
              }
            : stageObject,
        ),
      }));
      persistStageObjects(ids);
    },
    updateSelectedStageObjects: (update) => {
      const selectedIds = get().selectedStageObjectIds;
      set((state) => ({
        stageObjects: state.stageObjects.map((stageObject) =>
          selectedIds.includes(stageObject.id)
            && (!stageObject.locked || update.locked === false)
            ? { ...stageObject, ...update }
            : stageObject,
        ),
      }));
      persistStageObjects(selectedIds);
    },
    setGrandMaster: (value) => {
      const grandMaster = clamp(value);
      set({ grandMaster });
      dispatch({ type: "setGrandMaster", data: { value: grandMaster } }, "grand-master");
    },
    toggleBlackout: () => {
      const enabled = !get().blackout;
      set({ blackout: enabled });
      dispatch({ type: "setBlackout", data: { enabled } });
    },
    toggleBlind: () => {
      const enabled = !get().blind;
      set({ blind: enabled });
      dispatch({ type: "setBlind", data: { enabled } });
    },
    commitBlind: () => dispatch({ type: "commitBlind" }),
    clearProgrammer: () => dispatch({ type: "clearProgrammer", data: { fixtureId: null } }),
    toggleFreeze: () => {
      const enabled = !get().freeze;
      set({ freeze: enabled });
      dispatch({ type: "setFreeze", data: { enabled } });
    },
    setBpm: (value) => {
      const bpm = Math.max(20, Math.min(300, value));
      set({ bpm, beatSource: "fixed", beatConfidence: 1 });
      dispatch({ type: "setTempo", data: { bpm } }, "tempo");
    },
    setAudioTempo: (value, confidence) => {
      const bpm = Math.max(20, Math.min(300, value));
      const beatConfidence = clamp(confidence);
      set({ bpm, beatSource: "audio", beatConfidence });
      dispatch(
        { type: "setAudioTempo", data: { bpm, confidence: beatConfidence } },
        "audio-tempo",
      );
    },
    tapTempo: () => {
      set({ beatSource: "tap", beatConfidence: 1 });
      dispatch({ type: "tapTempo" });
    },
    activateScene: (id) => {
      const active = get().scenes.find((scene) => scene.id === id)?.active ?? false;
      set((state) => ({
        scenes: state.scenes.map((scene) => scene.id === id ? { ...scene, active: !active } : scene),
      }));
      dispatch(active
        ? { type: "releaseScene", data: { sceneId: id, fadeMs: null } }
        : { type: "activateScene", data: { sceneId: id, fadeMs: null } });
    },
    goNextCue: () => {
      const cueList = get().cueLists[0];
      if (cueList) dispatch({ type: "goNextCue", data: { cueListId: cueList.id } });
    },
    backCue: () => {
      const cueList = get().cueLists[0];
      if (cueList) dispatch({ type: "backCue", data: { cueListId: cueList.id } });
    },
    toggleCuePause: () => {
      const state = get();
      const cueList = state.cueLists[0];
      if (!cueList) return;
      dispatch(state.cuePaused
        ? { type: "resumeCueList", data: { cueListId: cueList.id } }
        : { type: "pauseCueList", data: { cueListId: cueList.id } });
    },
    importBackground: async (file) => {
      if (!(["image/png", "image/jpeg"] as string[]).includes(file.type)) {
        set({ engineError: "Floor plan must be a PNG or JPEG image." });
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        set({ engineError: "Floor plan must be 12 MB or smaller." });
        return;
      }
      if (!hasNativeEngine()) {
        const previous = get().background;
        if (previous?.dataUrl.startsWith("blob:")) URL.revokeObjectURL(previous.dataUrl);
        set({
          background: {
            dataUrl: URL.createObjectURL(file),
            name: file.name,
            opacity: 0.55,
            locked: true,
          },
          engineError: undefined,
        });
        return;
      }
      await mutateProject({
        type: "putBackground",
        data: {
          name: file.name,
          mime: file.type,
          bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
        },
      });
    },
    removeBackground: () => {
      const previous = get().background;
      if (previous?.dataUrl.startsWith("blob:")) URL.revokeObjectURL(previous.dataUrl);
      if (hasNativeEngine()) {
        void mutateProject({ type: "removeBackground" });
      } else {
        set({ background: undefined });
      }
    },
    toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
    undo: () => {
      const state = get();
      const previous = state.undoStack.at(-1);
      if (!previous) return;
      set({
        fixtures: previous.fixtures,
        stageObjects: previous.stageObjects,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, snapshot(state.fixtures, state.stageObjects)],
      });
      syncFixtureParameters(previous.fixtures, state.fixtureDefinitions, dispatch);
      persistLayouts(previous.fixtures.map((fixtureItem) => fixtureItem.id));
      persistStageObjects(previous.stageObjects.map((stageObject) => stageObject.id));
    },
    redo: () => {
      const state = get();
      const next = state.redoStack.at(-1);
      if (!next) return;
      set({
        fixtures: next.fixtures,
        stageObjects: next.stageObjects,
        undoStack: [...state.undoStack, snapshot(state.fixtures, state.stageObjects)],
        redoStack: state.redoStack.slice(0, -1),
      });
      syncFixtureParameters(next.fixtures, state.fixtureDefinitions, dispatch);
      persistLayouts(next.fixtures.map((fixtureItem) => fixtureItem.id));
      persistStageObjects(next.stageObjects.map((stageObject) => stageObject.id));
    },
    copySelection: () => {
      const state = get();
      if (state.selectedStageObjectIds.length > 0) {
        set({
          clipboardFixtureIds: [],
          clipboardStageObjectIds: [...state.selectedStageObjectIds],
        });
      } else if (state.selectedFixtureIds.length > 0) {
        set({
          clipboardFixtureIds: [...state.selectedFixtureIds],
          clipboardStageObjectIds: [],
        });
      }
    },
    pasteSelection: () => {
      const state = get();
      const stageObjectIds = state.clipboardStageObjectIds.filter((id) =>
        state.stageObjects.some((stageObject) => stageObject.id === id));
      if (stageObjectIds.length > 0) {
        if (hasNativeEngine()) {
          void mutateProject({ type: "duplicateStageObjects", data: { objectIds: stageObjectIds } });
          return;
        }
        state.captureFixtureHistory();
        const pastedAt = Date.now();
        const duplicated = state.stageObjects
          .filter((stageObject) => stageObjectIds.includes(stageObject.id))
          .map((stageObject) => ({
            ...stageObject,
            id: `${stageObject.id}-copy-${pastedAt}`,
            name: `${stageObject.name} Copy`,
            x: stageObject.x + 0.6,
            y: stageObject.y + 0.6,
          }));
        set((current) => ({
          stageObjects: [...current.stageObjects, ...duplicated],
          selectedStageObjectIds: duplicated.map((stageObject) => stageObject.id),
        }));
        return;
      }
      const fixtureIds = state.clipboardFixtureIds.filter((id) =>
        state.fixtures.some((fixtureItem) => fixtureItem.id === id));
      if (fixtureIds.length === 0) {
        set({ engineError: "Copy one or more fixtures or stage objects before pasting." });
        return;
      }
      if (hasNativeEngine()) {
        void mutateProject({ type: "duplicateFixtures", data: { fixtureIds } });
        return;
      }
      state.captureFixtureHistory();
      const pastedAt = Date.now();
      const duplicated = state.fixtures
        .filter((fixtureItem) => fixtureIds.includes(fixtureItem.id))
        .map((fixtureItem) => ({
          ...fixtureItem,
          id: `${fixtureItem.id}-copy-${pastedAt}`,
          name: `${fixtureItem.name} Copy`,
          x: fixtureItem.x + 0.6,
          y: fixtureItem.y + 0.6,
          address: 0,
        }));
      set((current) => ({
        fixtures: [...current.fixtures, ...duplicated],
        selectedFixtureIds: duplicated.map((fixtureItem) => fixtureItem.id),
      }));
    },
    duplicateSelection: () => {
      get().copySelection();
      get().pasteSelection();
    },
    deleteSelection: () => {
      const state = get();
      if (state.selectedStageObjectIds.length > 0) {
        if (hasNativeEngine()) {
          void mutateProject({
            type: "deleteStageObjects",
            data: { objectIds: state.selectedStageObjectIds },
          });
          return;
        }
        state.captureFixtureHistory();
        set((current) => ({
          stageObjects: current.stageObjects.filter(
            (stageObject) => !current.selectedStageObjectIds.includes(stageObject.id),
          ),
          selectedStageObjectIds: [],
        }));
        return;
      }
      if (hasNativeEngine() && state.selectedFixtureIds.length > 0) {
        void mutateProject({
          type: "deleteFixtures",
          data: { fixtureIds: state.selectedFixtureIds },
        });
        return;
      }
      state.captureFixtureHistory();
      set((current) => ({
        fixtures: current.fixtures.filter(
          (fixtureItem) => !current.selectedFixtureIds.includes(fixtureItem.id),
        ),
        selectedFixtureIds: [],
      }));
    },
    patchFixture: (fixtureId, universe, address) =>
      void mutateProject({ type: "patchFixture", data: { fixtureId, universe, address } }),
    addFixture: (definitionId, modeId, name) =>
      void mutateProject({
        type: "addFixture",
        data: { definitionId, modeId, name, x: 0, y: 0 },
      }),
    addFixturesAtPatch: (definitionId, modeId, name, quantity, universe, address) =>
      mutateProject({
        type: "addFixturesAtPatch",
        data: { definitionId, modeId, name, quantity, universe, address },
      }),
    putCustomFixture: async (fixture, existingDefinitionId) => {
      const definitionId = existingDefinitionId ?? `custom.${crypto.randomUUID()}`;
      const saved = await mutateProject({
        type: "putCustomFixtureDefinition",
        data: { ...fixture, definitionId },
      });
      return saved ? definitionId : null;
    },
    newProject: () => runProjectOperation(createProject),
    openProject: () => runProjectOperation(openProject),
    openRecentProject: (path) => runProjectOperation(() => openRecentProject(path)),
    saveProjectAs: () => runProjectOperation(saveProjectAs),
    dismissRecoveryNotice: () => set({ recoveryNotice: undefined }),
    addUniverse: () => { void mutateProject({ type: "addUniverse" }); },
    putUniverseOutput: (universe) => mutateProject({
      type: "putUniverseOutput",
      data: {
        universe: universe.id,
        name: universe.name,
        enabled: universe.enabled,
        protocol: universe.protocol,
        portAddress: universe.portAddress,
        destination: universe.destination,
        interface: universe.interface,
        broadcast: universe.broadcast,
        devicePath: universe.devicePath,
      },
    }),
    putProjectSettings: (settings) => mutateProject({
      type: "putProjectSettings",
      data: settings,
    }),
    addStageObject: (kind, name) => {
      void mutateProject({ type: "addStageObject", data: { kind, name, x: 0, y: 0 } });
    },
    putGroup: (groupId, name, fixtureIds) => {
      void mutateProject({ type: "putGroup", data: { groupId, name, fixtureIds } });
    },
    deleteGroup: (groupId) => {
      void mutateProject({ type: "deleteGroup", data: { groupId } });
    },
    captureScene: (name, fadeMs) => {
      void mutateProject({
        type: "captureScene",
        data: { name, fadeMs, fixtureIds: get().selectedFixtureIds },
      });
    },
    captureSceneSnapshot: (name, fadeMs) => {
      void mutateProject({
        type: "captureScene",
        data: { name, fadeMs, fixtureIds: get().fixtures.map((fixtureItem) => fixtureItem.id) },
      });
    },
    recaptureScene: (sceneId) => {
      const selectedFixtureIds = get().selectedFixtureIds;
      void mutateProject({
        type: "recaptureScene",
        data: {
          sceneId,
          fixtureIds: selectedFixtureIds.length > 0
            ? selectedFixtureIds
            : get().fixtures.map((fixtureItem) => fixtureItem.id),
        },
      });
    },
    updateScene: (sceneId, name, fadeMs) => {
      void mutateProject({ type: "updateScene", data: { sceneId, name, fadeMs } });
    },
    deleteScene: (sceneId) => {
      void mutateProject({ type: "deleteScene", data: { sceneId } });
    },
    addCue: (sceneId) => {
      const cueListId = get().cueLists[0]?.id ?? null;
      void mutateProject({ type: "addCue", data: { cueListId, sceneId } });
    },
    deleteCue: (cueListId, index) => {
      void mutateProject({ type: "deleteCue", data: { cueListId, index } });
    },
    toggleEffect: (effectId) => {
      const effect = get().effects.find((entry) => entry.id === effectId);
      if (!effect) return;
      dispatch(effect.active
        ? { type: "stopEffect", data: { effectId } }
        : {
            type: "startEffect",
            data: { effectId, fixtureIds: get().selectedFixtureIds },
          });
    },
    applyFan: (parameterId, base, spread) => {
      const fixtureIds = get().selectedFixtureIds;
      if (fixtureIds.length === 0) {
        set({ engineError: "Select at least two fixtures for fanning." });
        return;
      }
      dispatch({ type: "applyFan", data: { fixtureIds, parameterId, base, spread } });
    },
    applyColorFan: (startColor, endColor) => {
      const fixtureIds = get().selectedFixtureIds;
      if (fixtureIds.length === 0) {
        set({ engineError: "Select at least two fixtures for color fanning." });
        return;
      }
      dispatch({
        type: "applyColorFan",
        data: {
          fixtureIds,
          startRgb: hexChannels(startColor),
          endRgb: hexChannels(endColor),
        },
      });
    },
    saveEffect: (effect) => {
      void mutateProject({
        type: "putEffect",
        data: {
          effectId: effect.id,
          name: effect.name,
          template: effect.template,
          targetParameter: effect.targetParameter,
          amplitude: effect.amplitude,
          offset: effect.offset,
          speedHz: effect.speedHz,
          beatMultiplier: effect.beatMultiplier,
          beatSync: effect.beatSync,
          spatialPhase: effect.spatialPhase,
          direction: effect.direction,
          blend: effect.blend,
          order: effect.order,
        },
      });
    },
    deleteEffect: (effectId) => {
      void mutateProject({ type: "deleteEffect", data: { effectId } });
    },
    addLiveControl: (label, sceneId, effectId) => {
      const page = get().livePage;
      const position = get().liveControls
        .filter((control) => control.page === page)
        .reduce((highest, control) => Math.max(highest, control.position + 1), 0);
      void mutateProject({
        type: "putLiveControl",
        data: { controlId: null, label, sceneId, effectId, page, position },
      });
    },
    deleteLiveControl: (controlId) => {
      void mutateProject({ type: "deleteLiveControl", data: { controlId } });
    },
    triggerLiveControl: (controlId) => {
      const state = get();
      const control = state.liveControls.find((entry) => entry.id === controlId);
      if (!control) return;
      const active = isLiveTargetActive(control, state.scenes, state.effects);

      if (control.behavior === "radio") {
        for (const other of state.liveControls) {
          if (other.id !== control.id && other.page === control.page && other.behavior === "radio") {
            setLiveTargetActive(other, false, get, set, dispatch);
          }
        }
        setLiveTargetActive(control, true, get, set, dispatch);
        return;
      }
      if (control.behavior === "push" || control.behavior === "flash") {
        setLiveTargetActive(control, true, get, set, dispatch);
        return;
      }
      setLiveTargetActive(control, !active, get, set, dispatch);
    },
    releaseLiveControl: (controlId) => {
      const control = get().liveControls.find((entry) => entry.id === controlId);
      if (control?.behavior === "flash") {
        setLiveTargetActive(control, false, get, set, dispatch);
      }
    },
    setLiveControlLevel: (controlId, value) => {
      const level = clamp(value);
      const state = get();
      const control = state.liveControls.find((entry) => entry.id === controlId);
      if (!control) return;
      if (control.sceneId) {
        const active = state.scenes.some((scene) => scene.id === control.sceneId && scene.active);
        if (level <= 0.001) {
          if (active) setLiveTargetActive(control, false, get, set, dispatch);
          return;
        }
        if (!active) setLiveTargetActive(control, true, get, set, dispatch);
        dispatch({ type: "setSceneLevel", data: { sceneId: control.sceneId, level } }, `scene-level:${control.sceneId}`);
        return;
      }
      const active = state.effects.some((effect) => effect.id === control.effectId && effect.active);
      if ((level > 0.001) !== active) {
        setLiveTargetActive(control, level > 0.001, get, set, dispatch);
      }
    },
    updateLiveControlLayout: (controlId, update) => mutateProject({
      type: "updateLiveControlLayout",
      data: { controlId, ...update },
    }),
    setLivePage: (livePage) => set({ livePage: Math.max(1, livePage) }),
    hydrateEngine: (bootstrap) => {
      const availableIds = new Set(bootstrap.project.fixtures.map((fixtureItem) => fixtureItem.id));
      const retainedSelection = get().selectedFixtureIds.filter((id) => availableIds.has(id));
      const fallbackId = bootstrap.project.fixtures[0]?.id;
      set({
        projectName: bootstrap.project.name,
        projectPath: bootstrap.projectPath,
        recentProjects: bootstrap.recentProjects,
        recoveryNotice: bootstrap.recoveryNotice ?? undefined,
        fixtures: bootstrap.project.fixtures,
        stageObjects: bootstrap.project.stageObjects,
        selectedStageObjectIds: get().selectedStageObjectIds.filter((id) =>
          bootstrap.project.stageObjects.some((stageObject) => stageObject.id === id),
        ),
        groups: bootstrap.project.groups,
        selectedFixtureIds: retainedSelection.length > 0
          ? retainedSelection
          : fallbackId ? [fallbackId] : [],
        scenes: bootstrap.project.scenes,
        cueLists: bootstrap.project.cueLists,
        effects: bootstrap.project.effects,
        liveControls: bootstrap.project.liveControls,
        fixtureDefinitions: bootstrap.project.fixtureDefinitions,
        background: bootstrap.project.background ?? undefined,
        universes: bootstrap.project.universes,
        projectSettings: bootstrap.project.settings,
        universeCount: bootstrap.project.universeCount,
        undoStack: [],
        redoStack: [],
        engineError: undefined,
      });
      get().applyEngineView(bootstrap.engine);
    },
    applyEngineView: (view) =>
      set((state) => {
        const fixtureValues = new Map(view.fixtureValues.map((entry) => [entry.fixtureId, entry.parameters]));
        const activeScenes = new Set(view.activeSceneIds);
        const primaryCue = view.cueRuntime[0];
        return {
          fixtures: state.fixtures.map((fixtureItem) => applyFixtureValues(fixtureItem, fixtureValues.get(fixtureItem.id))),
          scenes: state.scenes.map((scene) => ({ ...scene, active: activeScenes.has(scene.id) })),
          effects: state.effects.map((effect) => ({
            ...effect,
            active: view.activeEffectIds.includes(effect.id),
          })),
          mode: view.operationMode,
          grandMaster: view.grandMaster,
          blackout: view.blackout,
          blind: view.blind,
          freeze: view.freeze,
          bpm: view.bpm,
          beatSource: view.beatSource,
          beatConfidence: view.beatConfidence,
          engineConnected: view.connected,
          engineError: undefined,
          engineRevision: view.revision,
          engineTelemetry: view.telemetry,
          cueCursor: primaryCue?.cursor ?? null,
          cuePaused: primaryCue?.paused ?? false,
        };
      }),
    setEngineError: (message) => set({ engineConnected: false, engineError: message }),
  };
});

type EngineDispatch = (command: EngineCommand, coalescingKey?: string) => void;

function dispatchFixtureUpdate(
  fixtureId: string,
  update: Partial<LayoutFixture>,
  dispatch: EngineDispatch,
  availableParameterIds?: string[],
): void {
  for (const [property, parameterId] of [
    ["intensity", "intensity"],
    ["pan", "position.pan"],
    ["tilt", "position.tilt"],
    ["zoom", "beam.zoom"],
  ] as const) {
    const value = update[property];
    if (value !== undefined) {
      const targets = availableParameterIds?.filter((candidate) =>
        candidate === parameterId || candidate.startsWith(`${parameterId}.pixel-`)
      );
      for (const target of targets && targets.length > 0 ? targets : [parameterId]) {
        dispatch(
          { type: "setFixtureParameter", data: { fixtureId, parameterId: target, value } },
          `${fixtureId}:${target}`,
        );
      }
    }
  }
  if (update.color) {
    const [red, green, blue] = hexChannels(update.color);
    for (const [channel, value] of [["red", red], ["green", green], ["blue", blue]] as const) {
      const prefix = `color.${channel}`;
      const targets = availableParameterIds?.filter((parameterId) =>
        parameterId === prefix || parameterId.startsWith(`${prefix}.pixel-`)
      );
      for (const parameterId of targets && targets.length > 0 ? targets : [prefix]) {
        dispatch(
          { type: "setFixtureParameter", data: { fixtureId, parameterId, value } },
          `${fixtureId}:${parameterId}`,
        );
      }
    }
  }
}

function syncFixtureParameters(
  fixtures: LayoutFixture[],
  definitions: FixtureDefinitionSummary[],
  dispatch: EngineDispatch,
): void {
  for (const fixtureItem of fixtures) {
    const parameterIds = definitions
      .find((definition) => definition.id === fixtureItem.definitionId)
      ?.modes.find((mode) => mode.id === fixtureItem.modeId)
      ?.parameters.map((parameter) => parameter.id);
    dispatchFixtureUpdate(fixtureItem.id, {
      intensity: fixtureItem.intensity,
      color: fixtureItem.color,
      pan: fixtureItem.pan,
      tilt: fixtureItem.tilt,
      zoom: fixtureItem.zoom,
    }, dispatch, parameterIds);
    for (const [parameterId, value] of Object.entries(fixtureItem.parameters)) {
      dispatch(
        { type: "setFixtureParameter", data: { fixtureId: fixtureItem.id, parameterId, value } },
        `${fixtureItem.id}:${parameterId}`,
      );
    }
  }
}

function applyFixtureValues(
  fixtureItem: LayoutFixture,
  parameters: Record<string, number> | undefined,
): LayoutFixture {
  if (!parameters) return fixtureItem;
  const current = hexChannels(fixtureItem.color);
  const hasColor = Object.keys(parameters).some((id) =>
    ["color.red", "color.green", "color.blue"].some((prefix) =>
      id === prefix || id.startsWith(`${prefix}.pixel-`)
    )
  );
  const color = hasColor
    ? rgbHex(
        parameterOrPixelAverage(parameters, "color.red", current[0]),
        parameterOrPixelAverage(parameters, "color.green", current[1]),
        parameterOrPixelAverage(parameters, "color.blue", current[2]),
      )
    : fixtureItem.color;
  return {
    ...fixtureItem,
    intensity: parameterOrPixelAverage(parameters, "intensity", fixtureItem.intensity),
    color,
    pan: parameterOrPixelAverage(parameters, "position.pan", fixtureItem.pan),
    tilt: parameterOrPixelAverage(parameters, "position.tilt", fixtureItem.tilt),
    zoom: parameterOrPixelAverage(parameters, "beam.zoom", fixtureItem.zoom),
    parameters: { ...fixtureItem.parameters, ...parameters },
  };
}

function parameterOrPixelAverage(
  parameters: Record<string, number>,
  prefix: string,
  fallback: number,
): number {
  const values = Object.entries(parameters)
    .filter(([id]) => id === prefix || id.startsWith(`${prefix}.pixel-`))
    .map(([, value]) => value);
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : fallback;
}

function hexChannels(color: string): [number, number, number] {
  const normalized = color.replace("#", "").padEnd(6, "f");
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function rgbHex(red: number, green: number, blue: number): string {
  const channel = (value: number) => Math.round(clamp(value) * 255).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function emptyTelemetry(): EngineTelemetry {
  return {
    framesSent: 0,
    sendErrors: 0,
    missedDeadlines: 0,
    droppedCommands: 0,
    droppedJournalEntries: 0,
    watchdogBlackout: false,
  };
}

function readStageView(): StageView {
  const value = window.localStorage.getItem("lighthouse.stageView");
  return value === "top" ? "top" : "front";
}

function fixture(
  id: string,
  name: string,
  kind: LayoutFixture["kind"],
  universe: number,
  address: number,
  x: number,
  y: number,
  color: string,
): LayoutFixture {
  return {
    id,
    name,
    kind,
    definitionId: kind === "moving-head" ? "generic.moving-head-16bit" : kind === "par" ? "generic.rgbw-par" : "generic.dimmer",
    modeId: kind === "moving-head" ? "10ch" : kind === "par" ? "5ch" : "1ch",
    footprint: kind === "moving-head" ? 10 : kind === "par" ? 5 : 1,
    universe,
    address,
    x,
    y,
    width: 0.65,
    height: 0.65,
    rotation: 0,
    intensity: 0.72,
    color,
    pan: 0.5,
    tilt: 0.5,
    zoom: 0.45,
    invertPan: false,
    invertTilt: false,
    parameters: {},
    locked: false,
    hidden: false,
    layer: "Fixtures",
  };
}

function snapshot(fixtures: LayoutFixture[], stageObjects: StageObject[]): FixtureSnapshot {
  return {
    fixtures: fixtures.map((fixtureItem) => ({
      ...fixtureItem,
      parameters: { ...fixtureItem.parameters },
    })),
    stageObjects: stageObjects.map((stageObject) => ({ ...stageObject })),
  };
}

function isLiveTargetActive(
  control: LiveControlSummary,
  scenes: SceneSummary[],
  effects: EffectSummary[],
): boolean {
  if (control.sceneId) return scenes.some((scene) => scene.id === control.sceneId && scene.active);
  return effects.some((effect) => effect.id === control.effectId && effect.active);
}

function setLiveTargetActive(
  control: LiveControlSummary,
  enabled: boolean,
  getState: StoreApi<ShowUiState>["getState"],
  setState: StoreApi<ShowUiState>["setState"],
  dispatch: EngineDispatch,
): void {
  const state = getState();
  if (control.sceneId) {
    const scene = state.scenes.find((entry) => entry.id === control.sceneId);
    if (!scene || scene.active === enabled) return;
    setState((current) => ({
      scenes: current.scenes.map((entry) =>
        entry.id === control.sceneId ? { ...entry, active: enabled } : entry
      ),
    }));
    dispatch(enabled
      ? { type: "activateScene", data: { sceneId: scene.id, fadeMs: control.fadeInMs } }
      : { type: "releaseScene", data: { sceneId: scene.id, fadeMs: control.fadeOutMs } });
    return;
  }

  const effect = state.effects.find((entry) => entry.id === control.effectId);
  if (!effect || effect.active === enabled) return;
  setState((current) => ({
    effects: current.effects.map((entry) =>
      entry.id === control.effectId ? { ...entry, active: enabled } : entry
    ),
  }));
  dispatch(enabled
    ? { type: "startEffect", data: { effectId: effect.id, fixtureIds: [] } }
    : { type: "stopEffect", data: { effectId: effect.id } });
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
