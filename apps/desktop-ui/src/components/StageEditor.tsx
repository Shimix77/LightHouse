import { useEffect, useMemo, useRef, useState } from "react";
import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
} from "pixi.js";

import { useShowStore } from "../store/showStore";
import type { LayoutFixture } from "../types/show";

const PIXELS_PER_METER = 48;

interface DragState {
  ids: string[];
  startX: number;
  startY: number;
  origins: Map<string, { x: number; y: number }>;
}

interface RectangleState {
  startX: number;
  startY: number;
}

export function StageEditor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const fixtureLayerRef = useRef<Container | null>(null);
  const beamLayerRef = useRef<Container | null>(null);
  const overlayRef = useRef<Graphics | null>(null);
  const containersRef = useRef(new Map<string, Container>());
  const dragRef = useRef<DragState | null>(null);
  const rectangleRef = useRef<RectangleState | null>(null);
  const panRef = useRef<{ x: number; y: number; worldX: number; worldY: number } | null>(null);
  const spacePressedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);

  const fixtures = useShowStore((state) => state.fixtures);
  const selectedIds = useShowStore((state) => state.selectedFixtureIds);
  const background = useShowStore((state) => state.background);
  const selectFixtures = useShowStore((state) => state.selectFixtures);
  const captureHistory = useShowStore((state) => state.captureFixtureHistory);
  const moveFixtures = useShowStore((state) => state.moveFixtures);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    if (!hostRef.current) return;
    const host: HTMLDivElement = hostRef.current;
    let disposed = false;
    let initialized = false;
    let removeGestureListeners: (() => void) | undefined;
    const app = new Application();

    void app
      .init({
        resizeTo: host,
        antialias: true,
        backgroundAlpha: 0,
        preference: "webgl",
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio, 2),
      })
      .then(() => {
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }
        host.appendChild(app.canvas);
        app.canvas.className = "stage-canvas";
        const world = new Container();
        const grid = createGrid();
        const beamLayer = new Container();
        const fixtureLayer = new Container();
        const overlay = new Graphics();
        world.addChild(grid, beamLayer, fixtureLayer, overlay);
        world.scale.set(PIXELS_PER_METER);
        world.position.set(app.screen.width / 2, app.screen.height / 2);
        app.stage.addChild(world);
        app.stage.eventMode = "static";
        app.stage.hitArea = app.screen;

        appRef.current = app;
        worldRef.current = world;
        fixtureLayerRef.current = fixtureLayer;
        beamLayerRef.current = beamLayer;
        overlayRef.current = overlay;
        initialized = true;
        removeGestureListeners = bindStageGestures(app, world);
        setReady(true);
      });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isFormField(event.target)) {
        event.preventDefault();
        spacePressedRef.current = true;
        host.classList.add("is-panning");
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spacePressedRef.current = false;
        host.classList.remove("is-panning");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      appRef.current = null;
      worldRef.current = null;
      fixtureLayerRef.current = null;
      beamLayerRef.current = null;
      overlayRef.current = null;
      containersRef.current.clear();
      removeGestureListeners?.();
      if (initialized) app.destroy(true, { children: true });
    };

    function bindStageGestures(stageApp: Application, world: Container): () => void {
      const onPointerDown = (event: FederatedPointerEvent) => {
        const isPan = event.button === 1 || spacePressedRef.current;
        if (isPan) {
          panRef.current = {
            x: event.global.x,
            y: event.global.y,
            worldX: world.position.x,
            worldY: world.position.y,
          };
          host.classList.add("is-panning");
          return;
        }
        const point = world.toLocal(event.global);
        rectangleRef.current = { startX: point.x, startY: point.y };
        if (!event.shiftKey) selectFixtures([]);
      };
      stageApp.stage.on("pointerdown", onPointerDown);

      const onPointerMove = (event: FederatedPointerEvent) => {
        if (panRef.current) {
          world.position.set(
            panRef.current.worldX + event.global.x - panRef.current.x,
            panRef.current.worldY + event.global.y - panRef.current.y,
          );
          return;
        }
        const point = world.toLocal(event.global);
        if (dragRef.current) {
          const deltaX = point.x - dragRef.current.startX;
          const deltaY = point.y - dragRef.current.startY;
          for (const id of dragRef.current.ids) {
            const container = containersRef.current.get(id);
            const origin = dragRef.current.origins.get(id);
            if (container && origin) {
              container.position.set(origin.x + deltaX, origin.y + deltaY);
            }
          }
          return;
        }
        if (rectangleRef.current && overlayRef.current) {
          drawSelectionRectangle(
            overlayRef.current,
            rectangleRef.current.startX,
            rectangleRef.current.startY,
            point.x,
            point.y,
          );
        }
      };
      stageApp.stage.on("pointermove", onPointerMove);

      const finishPointer = (event: FederatedPointerEvent) => {
        if (panRef.current) {
          panRef.current = null;
          if (!spacePressedRef.current) host.classList.remove("is-panning");
          return;
        }
        const point = world.toLocal(event.global);
        if (dragRef.current) {
          const deltaX = point.x - dragRef.current.startX;
          const deltaY = point.y - dragRef.current.startY;
          moveFixtures(dragRef.current.ids, deltaX, deltaY);
          dragRef.current = null;
          return;
        }
        if (rectangleRef.current) {
          const left = Math.min(rectangleRef.current.startX, point.x);
          const right = Math.max(rectangleRef.current.startX, point.x);
          const top = Math.min(rectangleRef.current.startY, point.y);
          const bottom = Math.max(rectangleRef.current.startY, point.y);
          if (Math.abs(right - left) > 0.08 || Math.abs(bottom - top) > 0.08) {
            const ids = useShowStore
              .getState()
              .fixtures.filter((fixtureItem) =>
                !fixtureItem.hidden &&
                fixtureItem.x >= left &&
                fixtureItem.x <= right &&
                fixtureItem.y >= top &&
                fixtureItem.y <= bottom,
              )
              .map((fixtureItem) => fixtureItem.id);
            selectFixtures(ids, event.shiftKey);
          }
          rectangleRef.current = null;
          overlayRef.current?.clear();
        }
      };
      stageApp.stage.on("pointerup", finishPointer);
      stageApp.stage.on("pointerupoutside", finishPointer);

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const bounds = stageApp.canvas.getBoundingClientRect();
        const screenPoint = {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        };
        const before = world.toLocal(screenPoint);
        const currentZoom = world.scale.x / PIXELS_PER_METER;
        const nextZoom = Math.max(0.25, Math.min(4, currentZoom * Math.exp(-event.deltaY * 0.001)));
        world.scale.set(PIXELS_PER_METER * nextZoom);
        const after = world.toGlobal(before);
        world.position.x += screenPoint.x - after.x;
        world.position.y += screenPoint.y - after.y;
        setZoom(nextZoom);
      };
      stageApp.canvas.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        stageApp.stage.off("pointerdown", onPointerDown);
        stageApp.stage.off("pointermove", onPointerMove);
        stageApp.stage.off("pointerup", finishPointer);
        stageApp.stage.off("pointerupoutside", finishPointer);
        stageApp.canvas.removeEventListener("wheel", onWheel);
      };
    }
  }, [captureHistory, moveFixtures, selectFixtures]);

  useEffect(() => {
    if (!ready || !fixtureLayerRef.current || !beamLayerRef.current) return;
    fixtureLayerRef.current.removeChildren().forEach((child) => child.destroy({ children: true }));
    beamLayerRef.current.removeChildren().forEach((child) => child.destroy({ children: true }));
    containersRef.current.clear();

    for (const fixtureItem of fixtures) {
      if (fixtureItem.hidden) continue;
      const beam = createBeam(fixtureItem);
      beamLayerRef.current.addChild(beam);

      const container = createFixtureSymbol(fixtureItem, selectedSet.has(fixtureItem.id));
      container.position.set(fixtureItem.x, fixtureItem.y);
      container.scale.set(fixtureItem.width / 0.65, fixtureItem.height / 0.65);
      container.rotation = (fixtureItem.rotation * Math.PI) / 180;
      container.eventMode = fixtureItem.locked ? "none" : "static";
      container.cursor = fixtureItem.locked ? "not-allowed" : "move";
      container.on("pointerdown", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        const additive = event.shiftKey;
        const currentSelection = useShowStore.getState().selectedFixtureIds;
        if (!currentSelection.includes(fixtureItem.id)) {
          selectFixtures([fixtureItem.id], additive);
        }
        const ids = additive
          ? [...new Set([...currentSelection, fixtureItem.id])]
          : currentSelection.includes(fixtureItem.id)
            ? currentSelection
            : [fixtureItem.id];
        captureHistory();
        const world = worldRef.current;
        if (!world) return;
        const point = world.toLocal(event.global);
        dragRef.current = {
          ids,
          startX: point.x,
          startY: point.y,
          origins: new Map(
            useShowStore
              .getState()
              .fixtures.filter((candidate) => ids.includes(candidate.id))
              .map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }]),
          ),
        };
      });
      fixtureLayerRef.current.addChild(container);
      containersRef.current.set(fixtureItem.id, container);
    }
  }, [captureHistory, fixtures, ready, selectFixtures, selectedSet]);

  const backgroundStyle = background
    ? {
        backgroundImage: `linear-gradient(rgba(9, 12, 16, ${1 - background.opacity * 0.74}), rgba(9, 12, 16, ${1 - background.opacity * 0.74})), url("${background.dataUrl}")`,
      }
    : undefined;

  return (
    <section className="stage-editor" aria-label="2D Stage Editor">
      <div className="stage-meta">
        <span>WORLD</span>
        <strong>1 m grid</strong>
        <span>{Math.round(zoom * 100)}%</span>
        <span>{fixtures.length} objects</span>
      </div>
      <div ref={hostRef} className="stage-surface" style={backgroundStyle} />
      <div className="stage-hint">Space + drag to pan · Wheel to zoom · Shift for multi-select</div>
    </section>
  );
}

function createGrid(): Graphics {
  const grid = new Graphics();
  for (let index = -30; index <= 30; index += 1) {
    const major = index % 5 === 0;
    grid.moveTo(index, -30).lineTo(index, 30).stroke({
      color: major ? 0x384354 : 0x26303d,
      alpha: major ? 0.55 : 0.28,
      width: major ? 0.022 : 0.012,
    });
    grid.moveTo(-30, index).lineTo(30, index).stroke({
      color: major ? 0x384354 : 0x26303d,
      alpha: major ? 0.55 : 0.28,
      width: major ? 0.022 : 0.012,
    });
  }
  grid.moveTo(-30, 0).lineTo(30, 0).stroke({ color: 0x55657a, alpha: 0.7, width: 0.03 });
  grid.moveTo(0, -30).lineTo(0, 30).stroke({ color: 0x55657a, alpha: 0.7, width: 0.03 });
  return grid;
}

function createFixtureSymbol(fixtureItem: LayoutFixture, selected: boolean): Container {
  const container = new Container();
  const color = parseColor(fixtureItem.color);
  const body = new Graphics();
  if (fixtureItem.kind === "moving-head") {
    body.roundRect(-0.31, -0.25, 0.62, 0.5, 0.12).fill({ color: 0x1c2531 });
    body.circle(0, -0.04, 0.2).fill({ color, alpha: 0.92 });
    body.moveTo(0, -0.42).lineTo(-0.11, -0.24).lineTo(0.11, -0.24).fill({ color: 0xdbe6f4 });
  } else if (fixtureItem.kind === "strobe") {
    body.roundRect(-0.36, -0.2, 0.72, 0.4, 0.06).fill({ color: 0x202a36 });
    body.rect(-0.26, -0.1, 0.52, 0.2).fill({ color, alpha: 0.92 });
  } else {
    body.circle(0, 0, 0.31).fill({ color: 0x1c2531 });
    body.circle(0, 0, 0.22).fill({ color, alpha: 0.94 });
    body.moveTo(0, -0.44).lineTo(-0.1, -0.28).lineTo(0.1, -0.28).fill({ color: 0xdbe6f4 });
  }
  body.stroke({ color: selected ? 0x65d6ff : 0x657489, alpha: 0.95, width: selected ? 0.055 : 0.025 });
  container.addChild(body);
  if (selected) {
    container.addChild(
      new Graphics()
        .circle(0, 0, 0.48)
        .stroke({ color: 0x65d6ff, alpha: 0.9, width: 0.035 }),
    );
  }
  return container;
}

function createBeam(fixtureItem: LayoutFixture): Container {
  const container = new Container();
  const length = 1.5 + fixtureItem.tilt * 3.6;
  const halfWidth = 0.18 + fixtureItem.zoom * 1.1;
  const beam = new Graphics()
    .poly([0, -0.15, -halfWidth, -length, halfWidth, -length])
    .fill({
      color: parseColor(fixtureItem.color),
      alpha: 0.04 + fixtureItem.intensity * 0.13,
    });
  container.addChild(beam);
  container.position.set(fixtureItem.x, fixtureItem.y);
  container.rotation = fixtureItem.rotation * (Math.PI / 180) + (fixtureItem.pan - 0.5) * 1.2;
  return container;
}

function drawSelectionRectangle(
  graphics: Graphics,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  graphics
    .clear()
    .rect(left, top, Math.abs(endX - startX), Math.abs(endY - startY))
    .fill({ color: 0x3dbde8, alpha: 0.08 })
    .stroke({ color: 0x65d6ff, alpha: 0.9, width: 0.025 });
}

function parseColor(color: string): number {
  return Number.parseInt(color.replace("#", ""), 16);
}

function isFormField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
