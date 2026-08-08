export type OperationMode = "edit" | "live";

export type FixtureKind = "dimmer" | "par" | "moving-head" | "strobe";

export interface LayoutFixture {
  id: string;
  name: string;
  kind: FixtureKind;
  universe: number;
  address: number;
  x: number;
  y: number;
  rotation: number;
  intensity: number;
  color: string;
  pan: number;
  tilt: number;
  zoom: number;
  locked: boolean;
  layer: string;
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
  url: string;
  name: string;
  opacity: number;
  locked: boolean;
}

export interface FixtureSnapshot {
  fixtures: LayoutFixture[];
}
