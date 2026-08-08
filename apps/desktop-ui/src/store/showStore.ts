import { create } from "zustand";

import { dispatchEngineCommand } from "../services/engineClient";
import type {
  CueListSummary,
  EffectSummary,
  EngineBootstrap,
  EngineCommand,
  EngineTelemetry,
  EngineView,
  FixtureSnapshot,
  LayoutFixture,
  OperationMode,
  SceneSummary,
  StageBackground,
} from "../types/show";

interface ShowUiState {
  projectName: string;
  mode: OperationMode;
  fixtures: LayoutFixture[];
  selectedFixtureIds: string[];
  scenes: SceneSummary[];
  grandMaster: number;
  blackout: boolean;
  blind: boolean;
  freeze: boolean;
  bpm: number;
  cueLists: CueListSummary[];
  effects: EffectSummary[];
  universeCount: number;
  projectPath: string;
  engineConnected: boolean;
  engineError: string | undefined;
  engineRevision: number;
  engineTelemetry: EngineTelemetry;
  cueCursor: number | null;
  cuePaused: boolean;
  background: StageBackground | undefined;
  undoStack: FixtureSnapshot[];
  redoStack: FixtureSnapshot[];
  setMode: (mode: OperationMode) => void;
  selectFixtures: (ids: string[], additive?: boolean) => void;
  captureFixtureHistory: () => void;
  moveFixtures: (ids: string[], deltaX: number, deltaY: number) => void;
  updateSelectedFixtures: (update: Partial<LayoutFixture>) => void;
  setGrandMaster: (value: number) => void;
  toggleBlackout: () => void;
  toggleBlind: () => void;
  toggleFreeze: () => void;
  setBpm: (value: number) => void;
  tapTempo: () => void;
  activateScene: (id: string) => void;
  goNextCue: () => void;
  backCue: () => void;
  toggleCuePause: () => void;
  setBackground: (background: StageBackground | undefined) => void;
  undo: () => void;
  redo: () => void;
  duplicateSelection: () => void;
  deleteSelection: () => void;
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

export const useShowStore = create<ShowUiState>((set, get) => {
  const onEngineView = (view: EngineView) => get().applyEngineView(view);
  const onEngineError = (message: string) => set({ engineConnected: false, engineError: message });
  const dispatch = (command: EngineCommand, key?: string) =>
    dispatchEngineCommand(command, onEngineView, onEngineError, key);

  return {
    projectName: "Main Stage — Demo",
    mode: "edit",
    fixtures: initialFixtures,
    selectedFixtureIds: ["fx-5"],
    scenes: initialScenes,
    cueLists: [],
    effects: [],
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
      })),
    captureFixtureHistory: () =>
      set((state) => ({
        undoStack: [...state.undoStack.slice(-49), snapshot(state.fixtures)],
        redoStack: [],
      })),
    moveFixtures: (ids, deltaX, deltaY) =>
      set((state) => ({
        fixtures: state.fixtures.map((fixtureItem) =>
          ids.includes(fixtureItem.id) && !fixtureItem.locked
            ? { ...fixtureItem, x: fixtureItem.x + deltaX, y: fixtureItem.y + deltaY }
            : fixtureItem,
        ),
      })),
    updateSelectedFixtures: (update) => {
      const selectedIds = get().selectedFixtureIds;
      set((state) => ({
        fixtures: state.fixtures.map((fixtureItem) =>
          selectedIds.includes(fixtureItem.id) && !fixtureItem.locked
            ? { ...fixtureItem, ...update }
            : fixtureItem,
        ),
      }));
      for (const fixtureId of selectedIds) dispatchFixtureUpdate(fixtureId, update, dispatch);
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
    setBackground: (background) => set({ background }),
    undo: () => {
      const state = get();
      const previous = state.undoStack.at(-1);
      if (!previous) return;
      set({
        fixtures: previous.fixtures,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, snapshot(state.fixtures)],
      });
      syncFixtureParameters(previous.fixtures, dispatch);
    },
    redo: () => {
      const state = get();
      const next = state.redoStack.at(-1);
      if (!next) return;
      set({
        fixtures: next.fixtures,
        undoStack: [...state.undoStack, snapshot(state.fixtures)],
        redoStack: state.redoStack.slice(0, -1),
      });
      syncFixtureParameters(next.fixtures, dispatch);
    },
    duplicateSelection: () => {
      const state = get();
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
      state.captureFixtureHistory();
      set((current) => ({
        fixtures: current.fixtures.filter(
          (fixtureItem) => !current.selectedFixtureIds.includes(fixtureItem.id),
        ),
        selectedFixtureIds: [],
      }));
    },
    hydrateEngine: (bootstrap) => {
      const selectedId = bootstrap.project.fixtures[0]?.id;
      set({
        projectName: bootstrap.project.name,
        projectPath: bootstrap.projectPath,
        fixtures: bootstrap.project.fixtures,
        selectedFixtureIds: selectedId ? [selectedId] : [],
        scenes: bootstrap.project.scenes,
        cueLists: bootstrap.project.cueLists,
        effects: bootstrap.project.effects,
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
    universe,
    address,
    x,
    y,
    rotation: 0,
    intensity: 0.72,
    color,
    pan: 0.5,
    tilt: 0.5,
    zoom: 0.45,
    locked: false,
    layer: "Fixtures",
  };
}

function snapshot(fixtures: LayoutFixture[]): FixtureSnapshot {
  return { fixtures: fixtures.map((fixtureItem) => ({ ...fixtureItem })) };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
