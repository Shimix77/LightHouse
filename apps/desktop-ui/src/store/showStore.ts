import { create } from "zustand";

import {
  dispatchEngineCommand,
  hasNativeEngine,
  sendProjectCommand,
} from "../services/engineClient";
import type {
  CueListSummary,
  EffectSummary,
  EngineBootstrap,
  EngineCommand,
  EngineTelemetry,
  EngineView,
  FixtureDefinitionSummary,
  FixtureSnapshot,
  GroupSummary,
  LayoutFixture,
  OperationMode,
  ProjectCommand,
  SceneSummary,
  StageBackground,
  StageObject,
  StageObjectKind,
} from "../types/show";

interface ShowUiState {
  projectName: string;
  mode: OperationMode;
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
  cueLists: CueListSummary[];
  effects: EffectSummary[];
  fixtureDefinitions: FixtureDefinitionSummary[];
  universeCount: number;
  projectPath: string;
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
  setMode: (mode: OperationMode) => void;
  selectFixtures: (ids: string[], additive?: boolean) => void;
  selectStageObjects: (ids: string[], additive?: boolean) => void;
  captureFixtureHistory: () => void;
  moveFixtures: (ids: string[], deltaX: number, deltaY: number) => void;
  updateSelectedFixtures: (update: Partial<LayoutFixture>) => void;
  moveStageObjects: (ids: string[], deltaX: number, deltaY: number) => void;
  updateSelectedStageObjects: (update: Partial<StageObject>) => void;
  setGrandMaster: (value: number) => void;
  toggleBlackout: () => void;
  toggleBlind: () => void;
  commitBlind: () => void;
  clearProgrammer: () => void;
  toggleFreeze: () => void;
  setBpm: (value: number) => void;
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
  deleteSelection: () => void;
  patchFixture: (fixtureId: string, universe: number, address: number) => void;
  addFixture: (definitionId: string, modeId: string, name: string) => void;
  addUniverse: () => void;
  addStageObject: (kind: StageObjectKind, name: string) => void;
  putGroup: (groupId: string | null, name: string, fixtureIds: string[]) => void;
  deleteGroup: (groupId: string) => void;
  captureScene: (name: string, fadeMs: number) => void;
  updateScene: (sceneId: string, name: string, fadeMs: number) => void;
  deleteScene: (sceneId: string) => void;
  addCue: (sceneId: string) => void;
  deleteCue: (cueListId: string, index: number) => void;
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

const initialFixtureDefinitions: FixtureDefinitionSummary[] = [
  { id: "generic.dimmer", manufacturer: "LightHouse", model: "Generic Dimmer", modes: [{ id: "1ch", name: "1 Channel", footprint: 1 }] },
  { id: "generic.rgbw-par", manufacturer: "LightHouse", model: "Generic RGBW PAR", modes: [{ id: "5ch", name: "Intensity + RGBW", footprint: 5 }] },
  { id: "generic.moving-head-16bit", manufacturer: "LightHouse", model: "Generic 16-bit Moving Head", modes: [{ id: "10ch", name: "Pan/Tilt 16-bit + RGB + Beam", footprint: 10 }] },
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
    fixtures: initialFixtures,
    selectedFixtureIds: ["fx-5"],
    stageObjects: [],
    selectedStageObjectIds: [],
    groups: [],
    scenes: initialScenes,
    cueLists: [],
    effects: [],
    fixtureDefinitions: initialFixtureDefinitions,
    universeCount: 1,
    projectPath: "",
    grandMaster: 1,
    blackout: false,
    blind: false,
    freeze: false,
    bpm: 120,
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
    setMode: (mode) => {
      set({ mode });
      dispatch({ type: "setOperationMode", data: { mode } });
    },
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
      const selectedIds = get().selectedFixtureIds;
      set((state) => ({
        fixtures: state.fixtures.map((fixtureItem) =>
          selectedIds.includes(fixtureItem.id)
            && (!fixtureItem.locked || update.locked === false)
            ? { ...fixtureItem, ...update }
            : fixtureItem,
        ),
      }));
      for (const fixtureId of selectedIds) dispatchFixtureUpdate(fixtureId, update, dispatch);
      if (["x", "y", "width", "height", "rotation", "locked", "hidden", "layer"]
        .some((property) => property in update)) {
        persistLayouts(selectedIds);
      }
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
      set({ bpm });
      dispatch({ type: "setTempo", data: { bpm } }, "tempo");
    },
    tapTempo: () => dispatch({ type: "tapTempo" }),
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
      syncFixtureParameters(previous.fixtures, dispatch);
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
      syncFixtureParameters(next.fixtures, dispatch);
      persistLayouts(next.fixtures.map((fixtureItem) => fixtureItem.id));
      persistStageObjects(next.stageObjects.map((stageObject) => stageObject.id));
    },
    duplicateSelection: () => {
      const state = get();
      if (state.selectedStageObjectIds.length > 0) {
        if (hasNativeEngine()) {
          void mutateProject({
            type: "duplicateStageObjects",
            data: { objectIds: state.selectedStageObjectIds },
          });
          return;
        }
        state.captureFixtureHistory();
        const duplicated = state.stageObjects
          .filter((stageObject) => state.selectedStageObjectIds.includes(stageObject.id))
          .map((stageObject) => ({
            ...stageObject,
            id: `${stageObject.id}-copy-${Date.now()}`,
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
      if (hasNativeEngine() && state.selectedFixtureIds.length > 0) {
        void mutateProject({
          type: "duplicateFixtures",
          data: { fixtureIds: state.selectedFixtureIds },
        });
        return;
      }
      state.captureFixtureHistory();
      const duplicated = state.fixtures
        .filter((fixtureItem) => state.selectedFixtureIds.includes(fixtureItem.id))
        .map((fixtureItem) => ({
          ...fixtureItem,
          id: `${fixtureItem.id}-copy-${Date.now()}`,
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
    addUniverse: () => { void mutateProject({ type: "addUniverse" }); },
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
    hydrateEngine: (bootstrap) => {
      const availableIds = new Set(bootstrap.project.fixtures.map((fixtureItem) => fixtureItem.id));
      const retainedSelection = get().selectedFixtureIds.filter((id) => availableIds.has(id));
      const fallbackId = bootstrap.project.fixtures[0]?.id;
      set({
        projectName: bootstrap.project.name,
        projectPath: bootstrap.projectPath,
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
        fixtureDefinitions: bootstrap.project.fixtureDefinitions,
        background: bootstrap.project.background ?? undefined,
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
          mode: view.operationMode,
          grandMaster: view.grandMaster,
          blackout: view.blackout,
          blind: view.blind,
          freeze: view.freeze,
          bpm: view.bpm,
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
): void {
  for (const [property, parameterId] of [
    ["intensity", "intensity"],
    ["pan", "position.pan"],
    ["tilt", "position.tilt"],
    ["zoom", "beam.zoom"],
  ] as const) {
    const value = update[property];
    if (value !== undefined) {
      dispatch(
        { type: "setFixtureParameter", data: { fixtureId, parameterId, value } },
        `${fixtureId}:${parameterId}`,
      );
    }
  }
  if (update.color) {
    const [red, green, blue] = hexChannels(update.color);
    for (const [channel, value] of [["red", red], ["green", green], ["blue", blue]] as const) {
      const parameterId = `color.${channel}`;
      dispatch(
        { type: "setFixtureParameter", data: { fixtureId, parameterId, value } },
        `${fixtureId}:${parameterId}`,
      );
    }
  }
}

function syncFixtureParameters(fixtures: LayoutFixture[], dispatch: EngineDispatch): void {
  for (const fixtureItem of fixtures) {
    dispatchFixtureUpdate(fixtureItem.id, {
      intensity: fixtureItem.intensity,
      color: fixtureItem.color,
      pan: fixtureItem.pan,
      tilt: fixtureItem.tilt,
      zoom: fixtureItem.zoom,
    }, dispatch);
  }
}

function applyFixtureValues(
  fixtureItem: LayoutFixture,
  parameters: Record<string, number> | undefined,
): LayoutFixture {
  if (!parameters) return fixtureItem;
  const current = hexChannels(fixtureItem.color);
  const hasColor = ["color.red", "color.green", "color.blue"].some((id) => parameters[id] !== undefined);
  const color = hasColor
    ? rgbHex(
        parameters["color.red"] ?? current[0],
        parameters["color.green"] ?? current[1],
        parameters["color.blue"] ?? current[2],
      )
    : fixtureItem.color;
  return {
    ...fixtureItem,
    intensity: parameters.intensity ?? fixtureItem.intensity,
    color,
    pan: parameters["position.pan"] ?? fixtureItem.pan,
    tilt: parameters["position.tilt"] ?? fixtureItem.tilt,
    zoom: parameters["beam.zoom"] ?? fixtureItem.zoom,
  };
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
  };
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
    locked: false,
    hidden: false,
    layer: "Fixtures",
  };
}

function snapshot(fixtures: LayoutFixture[], stageObjects: StageObject[]): FixtureSnapshot {
  return {
    fixtures: fixtures.map((fixtureItem) => ({ ...fixtureItem })),
    stageObjects: stageObjects.map((stageObject) => ({ ...stageObject })),
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
