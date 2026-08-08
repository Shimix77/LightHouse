import { create } from "zustand";

import type {
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
  activateScene: (id: string) => void;
  setBackground: (background: StageBackground | undefined) => void;
  undo: () => void;
  redo: () => void;
  duplicateSelection: () => void;
  deleteSelection: () => void;
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

export const useShowStore = create<ShowUiState>((set, get) => ({
  projectName: "Main Stage — Demo",
  mode: "edit",
  fixtures: initialFixtures,
  selectedFixtureIds: ["fx-5"],
  scenes: initialScenes,
  grandMaster: 1,
  blackout: false,
  blind: false,
  freeze: false,
  bpm: 120,
  background: undefined,
  undoStack: [],
  redoStack: [],
  setMode: (mode) => set({ mode }),
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
  updateSelectedFixtures: (update) =>
    set((state) => ({
      fixtures: state.fixtures.map((fixtureItem) =>
        state.selectedFixtureIds.includes(fixtureItem.id) && !fixtureItem.locked
          ? { ...fixtureItem, ...update }
          : fixtureItem,
      ),
    })),
  setGrandMaster: (grandMaster) => set({ grandMaster: clamp(grandMaster) }),
  toggleBlackout: () => set((state) => ({ blackout: !state.blackout })),
  toggleBlind: () => set((state) => ({ blind: !state.blind })),
  toggleFreeze: () => set((state) => ({ freeze: !state.freeze })),
  setBpm: (bpm) => set({ bpm: Math.max(20, Math.min(300, bpm)) }),
  activateScene: (id) =>
    set((state) => ({
      scenes: state.scenes.map((scene) => ({ ...scene, active: scene.id === id })),
    })),
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
}));

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
