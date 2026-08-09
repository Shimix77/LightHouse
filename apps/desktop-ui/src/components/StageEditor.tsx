import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Text as PixiText,
} from "pixi.js";

import { useShowStore } from "../store/showStore";
import type { LayoutFixture, StageObject } from "../types/show";

const PIXELS_PER_METER = 48;

interface DragState {
  kind: "fixture" | "object";
  ids: string[];
  startX: number;
  startY: number;
  origins: Map<string, { x: number; y: number }>;
}

interface RectangleState {
  startX: number;
  startY: number;
}

interface TransformState {
  kind: "fixture" | "object";
  id: string;
  mode: "resize" | "rotate";
  centerX: number;
  centerY: number;
  startDistance: number;
  startAngle: number;
  width: number;
  height: number;
  rotation: number;
  nextWidth: number;
  nextHeight: number;
  nextRotation: number;
  container: Container;
}

export function StageEditor({ onFixtureDoubleClick }: { onFixtureDoubleClick?: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const gridRef = useRef<Graphics | null>(null);
  const fixtureLayerRef = useRef<Container | null>(null);
  const stageObjectLayerRef = useRef<Container | null>(null);
  const beamLayerRef = useRef<Container | null>(null);
  const overlayRef = useRef<Graphics | null>(null);
  const fixtureContainersRef = useRef(new Map<string, Container>());
  const stageObjectContainersRef = useRef(new Map<string, Container>());
  const dragRef = useRef<DragState | null>(null);
  const rectangleRef = useRef<RectangleState | null>(null);
  const transformRef = useRef<TransformState | null>(null);
  const panRef = useRef<{ x: number; y: number; worldX: number; worldY: number } | null>(null);
  const spacePressedRef = useRef(false);
  const stageToolRef = useRef<"select" | "pan" | "rectangle">("select");
  const lastFixturePointerRef = useRef<{ id: string; at: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);

  const fixtures = useShowStore((state) => state.fixtures);
  const fixtureDefinitions = useShowStore((state) => state.fixtureDefinitions);
  const stageView = useShowStore((state) => state.stageView);
  const stageTool = useShowStore((state) => state.stageTool);
  const gridEnabled = useShowStore((state) => state.gridEnabled);
  const stageObjects = useShowStore((state) => state.stageObjects);
  const selectedIds = useShowStore((state) => state.selectedFixtureIds);
  const selectedStageObjectIds = useShowStore((state) => state.selectedStageObjectIds);
  const background = useShowStore((state) => state.background);
  const selectFixtures = useShowStore((state) => state.selectFixtures);
  const selectStageObjects = useShowStore((state) => state.selectStageObjects);
  const captureHistory = useShowStore((state) => state.captureFixtureHistory);
  const moveFixtures = useShowStore((state) => state.moveFixtures);
  const moveStageObjects = useShowStore((state) => state.moveStageObjects);
  const updateSelectedFixtures = useShowStore((state) => state.updateSelectedFixtures);
  const updateSelectedStageObjects = useShowStore((state) => state.updateSelectedStageObjects);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const primaryFixture = fixtures.find((fixtureItem) => selectedSet.has(fixtureItem.id));
  const selectedStageObjectSet = useMemo(
    () => new Set(selectedStageObjectIds),
    [selectedStageObjectIds],
  );

  const beginTransform = useCallback((event: FederatedPointerEvent, kind: "fixture" | "object", item: LayoutFixture | StageObject, container: Container, mode: "resize" | "rotate") => {
    if (stageToolRef.current !== "select") return;
    event.stopPropagation();
    captureHistory();
    if (kind === "fixture") selectFixtures([item.id]);
    else selectStageObjects([item.id]);
    const world = worldRef.current;
    if (!world) return;
    const point = world.toLocal(event.global);
    transformRef.current = {
      kind,
      id: item.id,
      mode,
      centerX: item.x,
      centerY: item.y,
      startDistance: Math.hypot(point.x - item.x, point.y - item.y),
      startAngle: Math.atan2(point.y - item.y, point.x - item.x) * 180 / Math.PI,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      nextWidth: item.width,
      nextHeight: item.height,
      nextRotation: item.rotation,
      container,
    };
  }, [captureHistory, selectFixtures, selectStageObjects]);

  useEffect(() => {
    stageToolRef.current = stageTool;
    hostRef.current?.classList.toggle("is-panning", stageTool === "pan");
  }, [stageTool]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = gridEnabled;
  }, [gridEnabled, ready]);

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
        grid.visible = gridEnabled;
        const stageObjectLayer = new Container();
        const beamLayer = new Container();
        const fixtureLayer = new Container();
        const overlay = new Graphics();
        world.addChild(grid, stageObjectLayer, beamLayer, fixtureLayer, overlay);
        world.scale.set(PIXELS_PER_METER);
        world.position.set(app.screen.width / 2, app.screen.height / 2);
        app.stage.addChild(world);
        app.stage.eventMode = "static";
        app.stage.hitArea = app.screen;

        appRef.current = app;
        worldRef.current = world;
        gridRef.current = grid;
        fixtureLayerRef.current = fixtureLayer;
        stageObjectLayerRef.current = stageObjectLayer;
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
      gridRef.current = null;
      fixtureLayerRef.current = null;
      stageObjectLayerRef.current = null;
      beamLayerRef.current = null;
      overlayRef.current = null;
      fixtureContainersRef.current.clear();
      stageObjectContainersRef.current.clear();
      removeGestureListeners?.();
      if (initialized) app.destroy(true, { children: true });
    };

    function bindStageGestures(stageApp: Application, world: Container): () => void {
      const onPointerDown = (event: FederatedPointerEvent) => {
        const tool = stageToolRef.current;
        const isPan = tool === "pan" || event.button === 1 || spacePressedRef.current;
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
        if (tool === "rectangle") {
          const point = world.toLocal(event.global);
          rectangleRef.current = { startX: point.x, startY: point.y };
        }
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
        if (transformRef.current) {
          const transform = transformRef.current;
          if (transform.mode === "resize") {
            const distance = Math.hypot(point.x - transform.centerX, point.y - transform.centerY);
            const scale = Math.max(0.2, distance / Math.max(0.05, transform.startDistance));
            transform.nextWidth = Math.max(0.2, transform.width * scale);
            transform.nextHeight = Math.max(0.2, transform.height * scale);
            if (transform.kind === "fixture") {
              transform.container.scale.set(transform.nextWidth / 0.65, transform.nextHeight / 0.65);
            } else {
              transform.container.scale.set(scale);
            }
          } else {
            const angle = Math.atan2(point.y - transform.centerY, point.x - transform.centerX) * 180 / Math.PI;
            transform.nextRotation = (transform.rotation + angle - transform.startAngle + 360) % 360;
            transform.container.rotation = transform.nextRotation * Math.PI / 180;
          }
          return;
        }
        if (dragRef.current) {
          const deltaX = point.x - dragRef.current.startX;
          const deltaY = point.y - dragRef.current.startY;
          for (const id of dragRef.current.ids) {
            const container = dragRef.current.kind === "fixture"
              ? fixtureContainersRef.current.get(id)
              : stageObjectContainersRef.current.get(id);
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
          if (!spacePressedRef.current && stageToolRef.current !== "pan") {
            host.classList.remove("is-panning");
          }
          return;
        }
        const point = world.toLocal(event.global);
        if (transformRef.current) {
          const transform = transformRef.current;
          if (transform.kind === "fixture") {
            selectFixtures([transform.id]);
            updateSelectedFixtures({ width: transform.nextWidth, height: transform.nextHeight, rotation: transform.nextRotation });
          } else {
            selectStageObjects([transform.id]);
            updateSelectedStageObjects({ width: transform.nextWidth, height: transform.nextHeight, rotation: transform.nextRotation });
          }
          transformRef.current = null;
          return;
        }
        if (dragRef.current) {
          const deltaX = point.x - dragRef.current.startX;
          const deltaY = point.y - dragRef.current.startY;
          if (dragRef.current.kind === "fixture") {
            moveFixtures(dragRef.current.ids, deltaX, deltaY);
          } else {
            moveStageObjects(dragRef.current.ids, deltaX, deltaY);
          }
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
            if (ids.length > 0) {
              selectFixtures(ids, event.shiftKey);
            } else {
              const objectIds = useShowStore
                .getState()
                .stageObjects.filter((stageObject) =>
                  !stageObject.hidden
                  && stageObject.x >= left
                  && stageObject.x <= right
                  && stageObject.y >= top
                  && stageObject.y <= bottom,
                )
                .map((stageObject) => stageObject.id);
              selectStageObjects(objectIds, event.shiftKey);
            }
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
  }, [captureHistory, moveFixtures, moveStageObjects, selectFixtures, selectStageObjects, updateSelectedFixtures, updateSelectedStageObjects]);

  useEffect(() => {
    if (!ready || !stageObjectLayerRef.current) return;
    stageObjectLayerRef.current.removeChildren().forEach((child) => child.destroy({ children: true }));
    stageObjectContainersRef.current.clear();
    for (const stageObject of stageObjects) {
      if (stageObject.hidden) continue;
      let container!: Container;
      container = createStageObjectSymbol(
        stageObject,
        selectedStageObjectSet.has(stageObject.id),
        (event, mode) => beginTransform(event, "object", stageObject, container, mode),
      );
      container.position.set(stageObject.x, stageObject.y);
      container.rotation = (stageObject.rotation * Math.PI) / 180;
      container.alpha = stageObject.opacity;
      container.eventMode = stageObject.locked ? "none" : "static";
      container.cursor = stageObject.locked ? "not-allowed" : "move";
      container.on("pointerdown", (event: FederatedPointerEvent) => {
        if (stageToolRef.current !== "select") return;
        event.stopPropagation();
        const additive = event.shiftKey;
        const currentSelection = useShowStore.getState().selectedStageObjectIds;
        if (!currentSelection.includes(stageObject.id)) {
          selectStageObjects([stageObject.id], additive);
        }
        const ids = additive
          ? [...new Set([...currentSelection, stageObject.id])]
          : currentSelection.includes(stageObject.id)
            ? currentSelection
            : [stageObject.id];
        captureHistory();
        const world = worldRef.current;
        if (!world) return;
        const point = world.toLocal(event.global);
        dragRef.current = {
          kind: "object",
          ids,
          startX: point.x,
          startY: point.y,
          origins: new Map(
            useShowStore
              .getState()
              .stageObjects.filter((candidate) => ids.includes(candidate.id))
              .map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }]),
          ),
        };
      });
      stageObjectLayerRef.current.addChild(container);
      stageObjectContainersRef.current.set(stageObject.id, container);
    }
  }, [beginTransform, captureHistory, ready, selectStageObjects, selectedStageObjectSet, stageObjects]);

  useEffect(() => {
    if (!ready || !fixtureLayerRef.current || !beamLayerRef.current) return;
    fixtureLayerRef.current.removeChildren().forEach((child) => child.destroy({ children: true }));
    beamLayerRef.current.removeChildren().forEach((child) => child.destroy({ children: true }));
    fixtureContainersRef.current.clear();

    for (const fixtureItem of fixtures) {
      if (fixtureItem.hidden) continue;
      const definition = fixtureDefinitions.find((candidate) => candidate.id === fixtureItem.definitionId);
      if (definition?.beamKind !== "none") {
        const beam = createBeam(
          fixtureItem,
          definition?.beamAngleMinDegrees ?? 8,
          definition?.beamAngleMaxDegrees ?? 48,
        );
        beamLayerRef.current.addChild(beam);
      }

      let container!: Container;
      container = createFixtureSymbol(
        fixtureItem,
        selectedSet.has(fixtureItem.id),
        (event, mode) => beginTransform(event, "fixture", fixtureItem, container, mode),
      );
      container.position.set(fixtureItem.x, fixtureItem.y);
      container.scale.set(fixtureItem.width / 0.65, fixtureItem.height / 0.65);
      container.rotation = (fixtureItem.rotation * Math.PI) / 180;
      container.eventMode = fixtureItem.locked ? "none" : "static";
      container.cursor = fixtureItem.locked ? "not-allowed" : "move";
      container.on("pointerdown", (event: FederatedPointerEvent) => {
        if (stageToolRef.current !== "select") return;
        event.stopPropagation();
        const now = performance.now();
        const previous = lastFixturePointerRef.current;
        if (previous?.id === fixtureItem.id && now - previous.at <= 360) {
          onFixtureDoubleClick?.();
          lastFixturePointerRef.current = null;
        } else {
          lastFixturePointerRef.current = { id: fixtureItem.id, at: now };
        }
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
          kind: "fixture",
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
      fixtureContainersRef.current.set(fixtureItem.id, container);
    }
  }, [beginTransform, captureHistory, fixtureDefinitions, fixtures, onFixtureDoubleClick, ready, selectFixtures, selectedSet]);

  const backgroundStyle = background
    ? {
        backgroundImage: `linear-gradient(rgba(9, 12, 16, ${1 - background.opacity * 0.74}), rgba(9, 12, 16, ${1 - background.opacity * 0.74})), url("${background.dataUrl}")`,
      }
    : undefined;
  const stageWashStyle = primaryFixture
    ? {
        "--stage-wash": fixtureDisplayColor(primaryFixture),
        "--stage-wash-opacity": `${Math.round(Math.max(4, primaryFixture.intensity * 22))}%`,
      } as CSSProperties
    : undefined;

  return (
    <section className={`stage-editor stage-view-${stageView}`} style={stageWashStyle} aria-label={`2D Stage Editor · ${stageView} view`}>
      <div className="stage-meta">
        <span>{stageView.toUpperCase()} VIEW</span>
        <strong>1 m grid</strong>
        <span>{Math.round(zoom * 100)}%</span>
        <span>{fixtures.length + stageObjects.length} objects</span>
      </div>
      <div ref={hostRef} className="stage-surface" style={backgroundStyle} />
      <div className="stage-hint">{stageTool === "pan" ? "Drag to pan" : stageTool === "rectangle" ? "Drag a rectangle to select" : "Drag fixtures to move"} · Wheel to zoom · Shift for multi-select</div>
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

function createFixtureSymbol(fixtureItem: LayoutFixture, selected: boolean, onTransform: (event: FederatedPointerEvent, mode: "resize" | "rotate") => void): Container {
  const container = new Container();
  const color = parseColor(fixtureDisplayColor(fixtureItem));
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
    const selection = new Graphics()
      .roundRect(-0.46, -0.46, 0.92, 0.92, 0.08)
      .stroke({ color: 0x65d6ff, alpha: 0.95, width: 0.03 })
      .moveTo(0, -0.46).lineTo(0, -0.7).stroke({ color: 0x65d6ff, alpha: 0.9, width: 0.025 });
    container.addChild(selection);
    const handles: Array<[number, number]> = [[-0.46, -0.46], [0, -0.46], [0.46, -0.46], [-0.46, 0], [0.46, 0], [-0.46, 0.46], [0, 0.46], [0.46, 0.46]];
    for (const [x, y] of handles) {
      const handle = new Graphics().circle(0, 0, 0.065).fill({ color: 0x0a84ff }).stroke({ color: 0xffffff, width: 0.018 });
      handle.position.set(x, y);
      handle.eventMode = "static";
      handle.cursor = "nwse-resize";
      handle.on("pointerdown", (event) => onTransform(event, "resize"));
      container.addChild(handle);
    }
    const rotateHandle = new Graphics().circle(0, 0, 0.075).fill({ color: 0x0a84ff }).stroke({ color: 0xffffff, width: 0.018 });
    rotateHandle.position.set(0, -0.72);
    rotateHandle.eventMode = "static";
    rotateHandle.cursor = "grab";
    rotateHandle.on("pointerdown", (event) => onTransform(event, "rotate"));
    container.addChild(rotateHandle);
  }
  const label = new PixiText({
    text: fixtureItem.name,
    style: {
      fill: 0xf7f9fc,
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: 0.18,
      fontWeight: "600",
      stroke: { color: 0x11151b, width: 0.035 },
    },
  });
  label.anchor.set(0.5, 1);
  label.position.set(0, -0.5);
  container.addChild(label);
  return container;
}

function createStageObjectSymbol(stageObject: StageObject, selected: boolean, onTransform: (event: FederatedPointerEvent, mode: "resize" | "rotate") => void): Container {
  const container = new Container();
  const body = new Graphics();
  let objectLabel: PixiText | undefined;
  const left = -stageObject.width / 2;
  const top = -stageObject.height / 2;
  const border = selected ? 0x65d6ff : 0x667588;
  const objectName = stageObject.name.toLowerCase();
  if (stageObject.kind === "truss") {
    if (objectName.includes("circular")) {
      const radius = Math.min(stageObject.width, stageObject.height) / 2;
      body.circle(0, 0, radius).stroke({ color: 0x9aa7b7, alpha: 0.9, width: Math.max(0.08, radius * 0.14) });
      body.circle(0, 0, radius * 0.78).stroke({ color: 0x394654, alpha: 0.9, width: 0.035 });
    } else if (objectName.includes("arc")) {
      body.moveTo(left, top + stageObject.height)
        .quadraticCurveTo(0, top - stageObject.height * 0.7, left + stageObject.width, top + stageObject.height)
        .stroke({ color: 0x9aa7b7, alpha: 0.9, width: Math.max(0.08, stageObject.height * 0.2) });
    } else {
      body.roundRect(left, top, stageObject.width, stageObject.height, 0.05).fill({ color: 0x303b49 });
      const step = Math.max(0.28, stageObject.height * 1.2);
      for (let x = left; x < left + stageObject.width; x += step) {
        body.moveTo(x, top).lineTo(Math.min(x + step, left + stageObject.width), top + stageObject.height)
          .stroke({ color: 0x8c99a9, alpha: 0.72, width: 0.025 });
      }
    }
  } else if (stageObject.kind === "speaker") {
    body.roundRect(left, top, stageObject.width, stageObject.height, 0.08).fill({ color: 0x171d25 });
    const radius = Math.min(stageObject.width, stageObject.height) * 0.25;
    body.circle(0, 0, radius).fill({ color: 0x313d4c }).stroke({ color: 0x7e8a98, width: 0.025 });
  } else if (stageObject.kind === "stage") {
    body.roundRect(left, top, stageObject.width, stageObject.height, 0.08).fill({ color: 0x252d38, alpha: 0.92 });
    body.moveTo(left, 0).lineTo(left + stageObject.width, 0).stroke({ color: 0x465466, width: 0.025 });
  } else if (stageObject.kind === "person") {
    const radius = Math.min(stageObject.width, stageObject.height) * 0.16;
    body.circle(0, top + radius * 1.3, radius).fill({ color: 0xb3bfce });
    body.moveTo(0, top + radius * 2.5).lineTo(0, top + stageObject.height * 0.72)
      .stroke({ color: 0xb3bfce, width: Math.max(0.04, radius * 0.55) });
    body.moveTo(-stageObject.width * 0.25, top + stageObject.height * 0.44)
      .lineTo(stageObject.width * 0.25, top + stageObject.height * 0.44)
      .stroke({ color: 0xb3bfce, width: 0.04 });
  } else if (objectName.includes("circle")) {
    body.ellipse(0, 0, stageObject.width / 2, stageObject.height / 2)
      .fill({ color: 0x384657, alpha: 0.36 })
      .stroke({ color: border, width: selected ? 0.06 : 0.025 });
  } else if (objectName.includes("triangle")) {
    body.poly([0, top, left + stageObject.width, top + stageObject.height, left, top + stageObject.height])
      .fill({ color: 0x384657, alpha: 0.48 })
      .stroke({ color: border, width: selected ? 0.06 : 0.025 });
  } else if (objectName === "line") {
    body.moveTo(left, top + stageObject.height).lineTo(left + stageObject.width, top)
      .stroke({ color: border, width: selected ? 0.08 : 0.04 });
  } else if (objectName === "text") {
    body.roundRect(left, top, stageObject.width, stageObject.height, 0.06).fill({ color: 0x202a36, alpha: 0.24 });
    objectLabel = new PixiText({
      text: stageObject.name,
      style: { fill: 0xdde7f2, fontSize: Math.max(0.22, stageObject.height * 0.34), fontWeight: "600" },
    });
    objectLabel.anchor.set(0.5);
  } else {
    body.roundRect(left, top, stageObject.width, stageObject.height, 0.06).fill({ color: 0x384657, alpha: 0.72 });
  }
  if (selected) {
    body.rect(left, top, stageObject.width, stageObject.height).stroke({ color: border, alpha: 1, width: 0.045 })
      .moveTo(0, top).lineTo(0, top - 0.3).stroke({ color: border, alpha: 0.9, width: 0.025 });
  }
  container.addChild(body);
  if (objectLabel) container.addChild(objectLabel);
  if (selected) {
    const handles: Array<[number, number]> = [[left, top], [0, top], [left + stageObject.width, top], [left, 0], [left + stageObject.width, 0], [left, top + stageObject.height], [0, top + stageObject.height], [left + stageObject.width, top + stageObject.height]];
    for (const [x, y] of handles) {
      const handle = new Graphics().circle(0, 0, 0.07).fill({ color: 0x0a84ff }).stroke({ color: 0xffffff, width: 0.018 });
      handle.position.set(x, y);
      handle.eventMode = "static";
      handle.cursor = "nwse-resize";
      handle.on("pointerdown", (event) => onTransform(event, "resize"));
      container.addChild(handle);
    }
    const rotateHandle = new Graphics().circle(0, 0, 0.08).fill({ color: 0x0a84ff }).stroke({ color: 0xffffff, width: 0.018 });
    rotateHandle.position.set(0, top - 0.32);
    rotateHandle.eventMode = "static";
    rotateHandle.cursor = "grab";
    rotateHandle.on("pointerdown", (event) => onTransform(event, "rotate"));
    container.addChild(rotateHandle);
  }
  return container;
}

function createBeam(fixtureItem: LayoutFixture, minimumAngle: number, maximumAngle: number): Container {
  const container = new Container();
  const length = 1.5 + fixtureItem.tilt * 3.6;
  const angle = minimumAngle + (maximumAngle - minimumAngle) * fixtureItem.zoom;
  const halfWidth = Math.max(0.05, Math.min(2.2, Math.tan((angle * Math.PI) / 360) * length));
  const beam = new Graphics();
  const color = parseColor(fixtureDisplayColor(fixtureItem));
  const segments = 10;
  for (let index = segments; index >= 1; index -= 1) {
    const ratio = index / segments;
    const segmentLength = length * ratio;
    const segmentWidth = halfWidth * ratio;
    beam.poly([0, -0.13, -segmentWidth, -segmentLength, segmentWidth, -segmentLength]).fill({
      color,
      alpha: (0.012 + fixtureItem.intensity * 0.026) * (1.12 - ratio * 0.56),
    });
  }
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

function fixtureDisplayColor(fixtureItem: LayoutFixture): string {
  const raw = fixtureItem.color.replace("#", "").padEnd(6, "0");
  const white = Math.max(0, Math.min(1, fixtureItem.parameters["color.white"] ?? 0));
  const channel = (offset: number) => Math.min(255, Number.parseInt(raw.slice(offset, offset + 2), 16) + Math.round(white * 255));
  return `#${channel(0).toString(16).padStart(2, "0")}${channel(2).toString(16).padStart(2, "0")}${channel(4).toString(16).padStart(2, "0")}`;
}

function isFormField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
