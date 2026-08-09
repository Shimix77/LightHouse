import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";

import { useShowStore } from "../store/showStore";
import type { LayoutFixture, StageObject } from "../types/show";

const PIXELS_PER_METER = 48;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const WORLD_EXTENT = 32;

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface Point {
  x: number;
  y: number;
}

interface DragInteraction {
  kind: "fixture-drag" | "object-drag";
  pointerId: number;
  ids: string[];
  start: Point;
  current: Point;
  origins: Map<string, Point>;
}

interface TransformInteraction {
  kind: "fixture-transform" | "object-transform";
  pointerId: number;
  id: string;
  mode: "resize" | "rotate";
  center: Point;
  startDistance: number;
  startAngle: number;
  startWidth: number;
  startHeight: number;
  startRotation: number;
  width: number;
  height: number;
  rotation: number;
}

interface PanInteraction {
  kind: "pan";
  pointerId: number;
  startClient: Point;
  startCamera: Camera;
}

interface RectangleInteraction {
  kind: "rectangle";
  pointerId: number;
  start: Point;
  current: Point;
  additive: boolean;
}

type StageInteraction = DragInteraction | TransformInteraction | PanInteraction | RectangleInteraction;
type EntityKind = "fixture" | "object";

export function StageEditor({ onFixtureDoubleClick }: { onFixtureDoubleClick?: () => void }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const interactionRef = useRef<StageInteraction | null>(null);
  const spacePressedRef = useRef(false);
  const [viewport, setViewport] = useState({ width: 960, height: 540 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [, repaint] = useState(0);

  const fixtures = useShowStore((state) => state.fixtures);
  const fixtureDefinitions = useShowStore((state) => state.fixtureDefinitions);
  const stageView = useShowStore((state) => state.stageView);
  const stageTool = useShowStore((state) => state.stageTool);
  const gridEnabled = useShowStore((state) => state.gridEnabled);
  const stageObjects = useShowStore((state) => state.stageObjects);
  const selectedIds = useShowStore((state) => state.selectedFixtureIds);
  const selectedStageObjectIds = useShowStore((state) => state.selectedStageObjectIds);
  const background = useShowStore((state) => state.background);
  const snapEnabled = useShowStore((state) => state.snapEnabled);
  const selectFixtures = useShowStore((state) => state.selectFixtures);
  const selectStageObjects = useShowStore((state) => state.selectStageObjects);
  const captureHistory = useShowStore((state) => state.captureFixtureHistory);
  const moveFixtures = useShowStore((state) => state.moveFixtures);
  const moveStageObjects = useShowStore((state) => state.moveStageObjects);
  const updateSelectedFixtures = useShowStore((state) => state.updateSelectedFixtures);
  const updateSelectedStageObjects = useShowStore((state) => state.updateSelectedStageObjects);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedObjectSet = useMemo(() => new Set(selectedStageObjectIds), [selectedStageObjectIds]);
  const frontScale = stageView === "front" ? 0.82 : 1;
  const worldScale = PIXELS_PER_METER * camera.zoom;
  const worldTransform = `translate(${viewport.width / 2 + camera.x} ${viewport.height / 2 + camera.y}) scale(${worldScale} ${worldScale * frontScale})`;

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const updateSize = () => {
      const bounds = surface.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        setViewport({ width: bounds.width, height: bounds.height });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isFormField(event.target)) return;
      event.preventDefault();
      spacePressedRef.current = true;
      surfaceRef.current?.classList.add("is-panning");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spacePressedRef.current = false;
      if (stageTool !== "pan" && interactionRef.current?.kind !== "pan") {
        surfaceRef.current?.classList.remove("is-panning");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [stageTool]);

  useEffect(() => {
    surfaceRef.current?.classList.toggle("is-panning", stageTool === "pan");
  }, [stageTool]);

  const screenToWorld = (clientX: number, clientY: number): Point => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: (clientX - bounds.left - viewport.width / 2 - camera.x) / worldScale,
      y: (clientY - bounds.top - viewport.height / 2 - camera.y) / (worldScale * frontScale),
    };
  };

  const capturePointer = (pointerId: number) => {
    try {
      svgRef.current?.setPointerCapture(pointerId);
    } catch {
      // WKWebView can reject capture when a gesture is cancelled by macOS.
    }
  };

  const startDrag = (
    event: ReactPointerEvent<SVGGElement>,
    entityKind: EntityKind,
    item: LayoutFixture | StageObject,
  ) => {
    if (stageTool !== "select" || item.locked) return;
    event.preventDefault();
    event.stopPropagation();
    capturePointer(event.pointerId);
    const additive = event.shiftKey;
    const currentIds = entityKind === "fixture" ? selectedIds : selectedStageObjectIds;
    const selected = currentIds.includes(item.id);
    const ids = additive
      ? [...new Set([...currentIds, item.id])]
      : selected
        ? currentIds
        : [item.id];
    if (entityKind === "fixture") selectFixtures([item.id], additive);
    else selectStageObjects([item.id], additive);
    captureHistory();
    const items = entityKind === "fixture" ? fixtures : stageObjects;
    const point = screenToWorld(event.clientX, event.clientY);
    interactionRef.current = {
      kind: entityKind === "fixture" ? "fixture-drag" : "object-drag",
      pointerId: event.pointerId,
      ids,
      start: point,
      current: point,
      origins: new Map(items.filter((candidate) => ids.includes(candidate.id)).map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }])),
    };
    repaint((value) => value + 1);
  };

  const startTransform = (
    event: ReactPointerEvent<SVGCircleElement>,
    entityKind: EntityKind,
    item: LayoutFixture | StageObject,
    mode: "resize" | "rotate",
  ) => {
    if (stageTool !== "select" || item.locked) return;
    event.preventDefault();
    event.stopPropagation();
    capturePointer(event.pointerId);
    captureHistory();
    if (entityKind === "fixture") selectFixtures([item.id]);
    else selectStageObjects([item.id]);
    const point = screenToWorld(event.clientX, event.clientY);
    interactionRef.current = {
      kind: entityKind === "fixture" ? "fixture-transform" : "object-transform",
      pointerId: event.pointerId,
      id: item.id,
      mode,
      center: { x: item.x, y: item.y },
      startDistance: Math.max(0.05, Math.hypot(point.x - item.x, point.y - item.y)),
      startAngle: Math.atan2(point.y - item.y, point.x - item.x) * 180 / Math.PI,
      startWidth: item.width,
      startHeight: item.height,
      startRotation: item.rotation,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
    };
    repaint((value) => value + 1);
  };

  const onSurfacePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const isPan = stageTool === "pan" || event.button === 1 || spacePressedRef.current;
    capturePointer(event.pointerId);
    if (isPan) {
      event.preventDefault();
      surfaceRef.current?.classList.add("is-panning");
      interactionRef.current = {
        kind: "pan",
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startCamera: camera,
      };
      return;
    }
    const point = screenToWorld(event.clientX, event.clientY);
    if (stageTool === "rectangle") {
      interactionRef.current = {
        kind: "rectangle",
        pointerId: event.pointerId,
        start: point,
        current: point,
        additive: event.shiftKey,
      };
      repaint((value) => value + 1);
      return;
    }
    if (!event.shiftKey) selectFixtures([]);
  };

  const onSurfacePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (interaction.kind === "pan") {
      setCamera({
        ...interaction.startCamera,
        x: interaction.startCamera.x + event.clientX - interaction.startClient.x,
        y: interaction.startCamera.y + event.clientY - interaction.startClient.y,
      });
      return;
    }
    const point = screenToWorld(event.clientX, event.clientY);
    if (isDragInteraction(interaction)) {
      interaction.current = point;
    } else if (interaction.kind === "rectangle") {
      interaction.current = point;
    } else if (isTransformInteraction(interaction) && interaction.mode === "resize") {
      const scale = Math.max(0.2, Math.hypot(point.x - interaction.center.x, point.y - interaction.center.y) / interaction.startDistance);
      interaction.width = Math.max(0.2, interaction.startWidth * scale);
      interaction.height = Math.max(0.2, interaction.startHeight * scale);
    } else if (isTransformInteraction(interaction)) {
      const angle = Math.atan2(point.y - interaction.center.y, point.x - interaction.center.x) * 180 / Math.PI;
      interaction.rotation = normalizeDegrees(interaction.startRotation + angle - interaction.startAngle);
    }
    repaint((value) => value + 1);
  };

  const finishInteraction = (event: ReactPointerEvent<SVGSVGElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    try {
      svgRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the webview.
    }
    if (interaction.kind === "pan") {
      if (!spacePressedRef.current && stageTool !== "pan") surfaceRef.current?.classList.remove("is-panning");
      return;
    }
    if (isDragInteraction(interaction)) {
      const deltaX = interaction.current.x - interaction.start.x;
      const deltaY = interaction.current.y - interaction.start.y;
      if (interaction.kind === "fixture-drag") moveFixtures(interaction.ids, deltaX, deltaY);
      else moveStageObjects(interaction.ids, deltaX, deltaY);
    } else if (isTransformInteraction(interaction)) {
      const update = { width: interaction.width, height: interaction.height, rotation: interaction.rotation };
      if (interaction.kind === "fixture-transform") {
        selectFixtures([interaction.id]);
        updateSelectedFixtures(update);
      } else {
        selectStageObjects([interaction.id]);
        updateSelectedStageObjects(update);
      }
    } else if (interaction.kind === "rectangle") {
      const left = Math.min(interaction.start.x, interaction.current.x);
      const right = Math.max(interaction.start.x, interaction.current.x);
      const top = Math.min(interaction.start.y, interaction.current.y);
      const bottom = Math.max(interaction.start.y, interaction.current.y);
      if (right - left > 0.08 || bottom - top > 0.08) {
        const fixtureIds = fixtures
          .filter((fixture) => !fixture.hidden && fixture.x >= left && fixture.x <= right && fixture.y >= top && fixture.y <= bottom)
          .map((fixture) => fixture.id);
        if (fixtureIds.length > 0) {
          selectFixtures(fixtureIds, interaction.additive);
        } else {
          const objectIds = stageObjects
            .filter((object) => !object.hidden && object.x >= left && object.x <= right && object.y >= top && object.y <= bottom)
            .map((object) => object.id);
          selectStageObjects(objectIds, interaction.additive);
        }
      }
    }
    repaint((value) => value + 1);
  };

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const local = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const before = screenToWorld(event.clientX, event.clientY);
    const nextZoom = clamp(camera.zoom * Math.exp(-event.deltaY * 0.001), MIN_ZOOM, MAX_ZOOM);
    const nextScale = PIXELS_PER_METER * nextZoom;
    setCamera({
      zoom: nextZoom,
      x: local.x - viewport.width / 2 - before.x * nextScale,
      y: local.y - viewport.height / 2 - before.y * nextScale * frontScale,
    });
  };

  const visualPosition = (entityKind: EntityKind, item: LayoutFixture | StageObject): Point => {
    const interaction = interactionRef.current;
    const expectedKind = entityKind === "fixture" ? "fixture-drag" : "object-drag";
    if (interaction?.kind !== expectedKind || !interaction.ids.includes(item.id)) return { x: item.x, y: item.y };
    const origin = interaction.origins.get(item.id) ?? { x: item.x, y: item.y };
    const next = {
      x: origin.x + interaction.current.x - interaction.start.x,
      y: origin.y + interaction.current.y - interaction.start.y,
    };
    return snapEnabled ? { x: Math.round(next.x), y: Math.round(next.y) } : next;
  };

  const visualGeometry = (entityKind: EntityKind, item: LayoutFixture | StageObject) => {
    const interaction = interactionRef.current;
    const expectedKind = entityKind === "fixture" ? "fixture-transform" : "object-transform";
    return interaction?.kind === expectedKind && interaction.id === item.id
      ? { width: interaction.width, height: interaction.height, rotation: interaction.rotation }
      : { width: item.width, height: item.height, rotation: item.rotation };
  };

  const visibleFixtures = fixtures.filter((fixture) => !fixture.hidden);
  const strongestFixture = visibleFixtures.reduce<LayoutFixture | undefined>((strongest, fixture) =>
    !strongest || fixture.intensity > strongest.intensity ? fixture : strongest, undefined);
  const selectedFixture = fixtures.find((fixture) => selectedSet.has(fixture.id));
  const washFixture = selectedFixture ?? strongestFixture;
  const washColor = washFixture ? fixtureDisplayColor(washFixture) : "#315884";
  const washOpacity = washFixture ? Math.max(0, Math.min(0.22, washFixture.intensity * 0.18)) : 0;
  const backgroundStyle = background
    ? {
        backgroundImage: `linear-gradient(rgba(9, 12, 16, ${1 - background.opacity * 0.74}), rgba(9, 12, 16, ${1 - background.opacity * 0.74})), url("${background.dataUrl}")`,
      }
    : undefined;
  const stageWashStyle = {
    "--stage-wash": washColor,
    "--stage-wash-opacity": `${Math.round(washOpacity * 100)}%`,
  } as CSSProperties;
  const rectangle = interactionRef.current?.kind === "rectangle" ? interactionRef.current : null;

  return (
    <section className={`stage-editor stage-view-${stageView}`} style={stageWashStyle} aria-label={`2D Stage Editor · ${stageView} view`}>
      <div className="stage-meta">
        <span>{stageView.toUpperCase()} VIEW</span>
        <strong>1 m grid</strong>
        <span>{Math.round(camera.zoom * 100)}%</span>
        <span>{fixtures.length + stageObjects.length} objects</span>
      </div>
      <div ref={surfaceRef} className="stage-surface" style={backgroundStyle}>
        <svg
          ref={svgRef}
          className="stage-svg"
          viewBox={`0 0 ${viewport.width} ${viewport.height}`}
          preserveAspectRatio="none"
          onPointerDown={onSurfacePointerDown}
          onPointerMove={onSurfacePointerMove}
          onPointerUp={finishInteraction}
          onPointerCancel={finishInteraction}
          onWheel={onWheel}
          role="application"
          aria-label="Interactive stage plan"
        >
          <defs>
            <filter id="fixture-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="0.08" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {visibleFixtures.filter((fixture) => fixture.intensity > 0.005).map((fixture) => {
              const definition = fixtureDefinitions.find((candidate) => candidate.id === fixture.definitionId);
              if (definition?.beamKind === "none") return null;
              const length = beamGeometry(fixture, definition?.beamAngleMinDegrees ?? 8, definition?.beamAngleMaxDegrees ?? 48).length;
              return (
                <linearGradient key={fixture.id} id={`beam-${safeSvgId(fixture.id)}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={-length}>
                  <stop offset="0" stopColor={fixtureDisplayColor(fixture)} stopOpacity={0.72 * fixture.intensity} />
                  <stop offset="0.58" stopColor={fixtureDisplayColor(fixture)} stopOpacity={0.26 * fixture.intensity} />
                  <stop offset="1" stopColor={fixtureDisplayColor(fixture)} stopOpacity="0" />
                </linearGradient>
              );
            })}
          </defs>
          {washOpacity > 0 && <rect width={viewport.width} height={viewport.height} fill={washColor} opacity={washOpacity} pointerEvents="none" />}
          <g transform={worldTransform}>
            {gridEnabled && <StageGrid />}
            {stageObjects.filter((object) => !object.hidden).map((object) => {
              const position = visualPosition("object", object);
              const geometry = visualGeometry("object", object);
              return (
                <StageObjectSymbol
                  key={object.id}
                  object={object}
                  position={position}
                  geometry={geometry}
                  selected={selectedObjectSet.has(object.id)}
                  onPointerDown={(event) => startDrag(event, "object", object)}
                  onTransform={(event, mode) => startTransform(event, "object", object, mode)}
                />
              );
            })}
            {visibleFixtures.map((fixture) => {
              const definition = fixtureDefinitions.find((candidate) => candidate.id === fixture.definitionId);
              if (fixture.intensity <= 0.005 || definition?.beamKind === "none") return null;
              const position = visualPosition("fixture", fixture);
              const geometry = visualGeometry("fixture", fixture);
              return <FixtureBeam key={fixture.id} fixture={fixture} position={position} rotation={geometry.rotation} minimumAngle={definition?.beamAngleMinDegrees ?? 8} maximumAngle={definition?.beamAngleMaxDegrees ?? 48} />;
            })}
            {visibleFixtures.map((fixture) => {
              const position = visualPosition("fixture", fixture);
              const geometry = visualGeometry("fixture", fixture);
              return (
                <FixtureSymbol
                  key={fixture.id}
                  fixture={fixture}
                  position={position}
                  geometry={geometry}
                  selected={selectedSet.has(fixture.id)}
                  onPointerDown={(event) => startDrag(event, "fixture", fixture)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    selectFixtures([fixture.id]);
                    onFixtureDoubleClick?.();
                  }}
                  onTransform={(event, mode) => startTransform(event, "fixture", fixture, mode)}
                />
              );
            })}
            {rectangle && <SelectionRectangle start={rectangle.start} end={rectangle.current} />}
          </g>
        </svg>
      </div>
      <div className="stage-hint">{stageTool === "pan" ? "Drag to pan" : stageTool === "rectangle" ? "Drag a rectangle to select" : "Drag fixtures to move"} · Wheel to zoom · Shift for multi-select</div>
    </section>
  );
}

function StageGrid() {
  const lines = [];
  for (let index = -WORLD_EXTENT; index <= WORLD_EXTENT; index += 1) {
    const major = index % 5 === 0;
    const axis = index === 0;
    const stroke = axis ? "#7891af" : major ? "#58708d" : "#47617e";
    const opacity = axis ? 0.72 : major ? 0.58 : 0.32;
    const width = axis ? 0.028 : major ? 0.022 : 0.012;
    lines.push(<line key={`v${index}`} x1={index} y1={-WORLD_EXTENT} x2={index} y2={WORLD_EXTENT} stroke={stroke} strokeOpacity={opacity} strokeWidth={width} />);
    lines.push(<line key={`h${index}`} x1={-WORLD_EXTENT} y1={index} x2={WORLD_EXTENT} y2={index} stroke={stroke} strokeOpacity={opacity} strokeWidth={width} />);
  }
  return <g className="stage-grid" pointerEvents="none">{lines}</g>;
}

function FixtureBeam({ fixture, position, rotation, minimumAngle, maximumAngle }: { fixture: LayoutFixture; position: Point; rotation: number; minimumAngle: number; maximumAngle: number }) {
  const { length, halfWidth } = beamGeometry(fixture, minimumAngle, maximumAngle);
  const panRotation = (fixture.pan - 0.5) * 68.75;
  return (
    <g transform={`translate(${position.x} ${position.y}) rotate(${rotation + panRotation})`} pointerEvents="none">
      <path d={`M 0 -0.11 L ${-halfWidth} ${-length} L ${halfWidth} ${-length} Z`} fill={`url(#beam-${safeSvgId(fixture.id)})`} />
      <path d={`M 0 -0.08 L ${-halfWidth * 0.35} ${-length * 0.9} L ${halfWidth * 0.35} ${-length * 0.9} Z`} fill={fixtureDisplayColor(fixture)} opacity={0.08 + fixture.intensity * 0.12} />
    </g>
  );
}

function FixtureSymbol({ fixture, position, geometry, selected, onPointerDown, onDoubleClick, onTransform }: {
  fixture: LayoutFixture;
  position: Point;
  geometry: { width: number; height: number; rotation: number };
  selected: boolean;
  onPointerDown: (event: ReactPointerEvent<SVGGElement>) => void;
  onDoubleClick: (event: ReactPointerEvent<SVGGElement>) => void;
  onTransform: (event: ReactPointerEvent<SVGCircleElement>, mode: "resize" | "rotate") => void;
}) {
  const halfWidth = geometry.width / 2;
  const halfHeight = geometry.height / 2;
  const radius = Math.max(0.12, Math.min(geometry.width, geometry.height) * 0.34);
  const lightColor = fixture.intensity > 0.005 ? fixtureDisplayColor(fixture) : "#05070a";
  const outline = selected ? "#14a1ff" : "#e6ebf2";
  return (
    <g
      transform={`translate(${position.x} ${position.y}) rotate(${geometry.rotation})`}
      opacity={fixture.hidden ? 0 : 1}
      className={fixture.locked ? "stage-entity is-locked" : "stage-entity"}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      style={{ cursor: fixture.locked ? "not-allowed" : "move" }}
    >
      {fixture.kind === "strobe" ? (
        <>
          <rect x={-halfWidth} y={-halfHeight * 0.72} width={geometry.width} height={geometry.height * 0.72} rx="0.06" fill="#151b24" stroke={outline} strokeWidth={selected ? 0.055 : 0.032} />
          <rect x={-halfWidth * 0.74} y={-halfHeight * 0.34} width={geometry.width * 0.74} height={geometry.height * 0.34} rx="0.03" fill={lightColor} filter={fixture.intensity > 0.02 ? "url(#fixture-glow)" : undefined} />
        </>
      ) : fixture.kind === "moving-head" ? (
        <>
          <rect x={-halfWidth} y={-halfHeight * 0.65} width={geometry.width} height={geometry.height * 0.82} rx="0.11" fill="#151b24" stroke={outline} strokeWidth={selected ? 0.055 : 0.032} />
          <circle cy={-halfHeight * 0.15} r={radius} fill={lightColor} stroke="#8594a6" strokeWidth="0.025" filter={fixture.intensity > 0.02 ? "url(#fixture-glow)" : undefined} />
          <path d={`M 0 ${-halfHeight - 0.12} L -0.1 ${-halfHeight * 0.68} L 0.1 ${-halfHeight * 0.68} Z`} fill="#eef3fa" />
        </>
      ) : (
        <>
          <circle r={Math.max(radius + 0.09, Math.min(halfWidth, halfHeight) * 0.95)} fill="#10151c" stroke={outline} strokeWidth={selected ? 0.055 : 0.038} />
          <circle r={radius} fill={lightColor} stroke="#8795a6" strokeWidth="0.024" filter={fixture.intensity > 0.02 ? "url(#fixture-glow)" : undefined} />
          <path d={`M 0 ${-halfHeight - 0.13} L -0.1 ${-halfHeight * 0.72} L 0.1 ${-halfHeight * 0.72} Z`} fill="#f1f5fb" />
        </>
      )}
      <rect x={-Math.max(0.22, fixture.name.length * 0.055)} y={-halfHeight - 0.42} width={Math.max(0.44, fixture.name.length * 0.11)} height="0.27" rx="0.12" fill={selected ? "#0a84ff" : "#26364a"} opacity="0.98" pointerEvents="none" />
      <text x="0" y={-halfHeight - 0.225} textAnchor="middle" fill="#ffffff" fontSize="0.18" fontWeight="700" paintOrder="stroke" stroke="#111820" strokeWidth="0.022" pointerEvents="none">{fixture.name}</text>
      {selected && <TransformHandles width={geometry.width} height={geometry.height} onTransform={onTransform} />}
    </g>
  );
}

function StageObjectSymbol({ object, position, geometry, selected, onPointerDown, onTransform }: {
  object: StageObject;
  position: Point;
  geometry: { width: number; height: number; rotation: number };
  selected: boolean;
  onPointerDown: (event: ReactPointerEvent<SVGGElement>) => void;
  onTransform: (event: ReactPointerEvent<SVGCircleElement>, mode: "resize" | "rotate") => void;
}) {
  const left = -geometry.width / 2;
  const top = -geometry.height / 2;
  const name = object.name.toLowerCase();
  const stroke = selected ? "#14a1ff" : "#b6c2cf";
  const segmentCount = Math.max(1, Math.round(geometry.width / Math.max(0.3, geometry.height * 1.15)));
  return (
    <g
      transform={`translate(${position.x} ${position.y}) rotate(${geometry.rotation})`}
      opacity={object.opacity}
      className={object.locked ? "stage-entity is-locked" : "stage-entity"}
      onPointerDown={onPointerDown}
      style={{ cursor: object.locked ? "not-allowed" : "move" }}
    >
      {object.kind === "truss" && name.includes("circular") ? (
        <><ellipse rx={geometry.width / 2} ry={geometry.height / 2} fill="none" stroke="#c1cad4" strokeWidth="0.12" /><ellipse rx={Math.max(0.04, geometry.width / 2 - 0.16)} ry={Math.max(0.04, geometry.height / 2 - 0.16)} fill="none" stroke="#465363" strokeWidth="0.035" /></>
      ) : object.kind === "truss" && name.includes("arc") ? (
        <path d={`M ${left} ${top + geometry.height} Q 0 ${top - geometry.height * 0.72} ${left + geometry.width} ${top + geometry.height}`} fill="none" stroke="#c1cad4" strokeWidth={Math.max(0.08, geometry.height * 0.16)} />
      ) : object.kind === "truss" ? (
        <>
          <rect x={left} y={top} width={geometry.width} height={geometry.height} fill="#18212c" stroke="#c0c9d3" strokeWidth="0.055" />
          {Array.from({ length: segmentCount }, (_, index) => {
            const x1 = left + geometry.width * index / segmentCount;
            const x2 = left + geometry.width * (index + 1) / segmentCount;
            return <path key={index} d={`M ${x1} ${top} L ${x2} ${top + geometry.height} M ${x2} ${top} L ${x1} ${top + geometry.height}`} stroke="#7f8c9b" strokeWidth="0.035" />;
          })}
        </>
      ) : object.kind === "speaker" ? (
        <><rect x={left} y={top} width={geometry.width} height={geometry.height} rx="0.07" fill="#0d1218" stroke={stroke} strokeWidth="0.035" /><circle r={Math.min(geometry.width, geometry.height) * 0.27} fill="#263241" stroke="#8593a2" strokeWidth="0.03" /><circle r={Math.min(geometry.width, geometry.height) * 0.09} fill="#0b0e13" /></>
      ) : object.kind === "stage" ? (
        <><rect x={left} y={top} width={geometry.width} height={geometry.height} rx="0.08" fill="#253141" fillOpacity="0.9" stroke={stroke} strokeWidth="0.035" /><path d={`M ${left} 0 H ${left + geometry.width}`} stroke="#63748a" strokeWidth="0.028" /></>
      ) : object.kind === "person" ? (
        <><circle cy={top + geometry.height * 0.16} r={Math.min(geometry.width, geometry.height) * 0.12} fill="#d3dae3" /><path d={`M 0 ${top + geometry.height * 0.29} V ${top + geometry.height * 0.7} M ${-geometry.width * 0.28} ${top + geometry.height * 0.42} H ${geometry.width * 0.28} M 0 ${top + geometry.height * 0.68} L ${-geometry.width * 0.22} ${top + geometry.height} M 0 ${top + geometry.height * 0.68} L ${geometry.width * 0.22} ${top + geometry.height}`} fill="none" stroke="#d3dae3" strokeWidth="0.065" strokeLinecap="round" /></>
      ) : name.includes("circle") ? (
        <ellipse rx={geometry.width / 2} ry={geometry.height / 2} fill="#425a75" fillOpacity="0.52" stroke={stroke} strokeWidth="0.035" />
      ) : name.includes("triangle") ? (
        <path d={`M 0 ${top} L ${left + geometry.width} ${top + geometry.height} L ${left} ${top + geometry.height} Z`} fill="#425a75" fillOpacity="0.58" stroke={stroke} strokeWidth="0.035" />
      ) : name === "line" ? (
        <path d={`M ${left} ${top + geometry.height} L ${left + geometry.width} ${top}`} stroke={stroke} strokeWidth="0.065" />
      ) : name === "text" ? (
        <><rect x={left} y={top} width={geometry.width} height={geometry.height} rx="0.05" fill="#26364a" fillOpacity="0.34" stroke={stroke} strokeWidth="0.03" /><text x="0" y="0.09" textAnchor="middle" fill="#edf3fa" fontSize={Math.max(0.2, geometry.height * 0.34)} fontWeight="650">{object.name}</text></>
      ) : (
        <rect x={left} y={top} width={geometry.width} height={geometry.height} rx={name.includes("round") ? 0.15 : 0.04} fill="#425a75" fillOpacity="0.64" stroke={stroke} strokeWidth="0.035" />
      )}
      {selected && <TransformHandles width={geometry.width} height={geometry.height} onTransform={onTransform} />}
    </g>
  );
}

function TransformHandles({ width, height, onTransform }: { width: number; height: number; onTransform: (event: ReactPointerEvent<SVGCircleElement>, mode: "resize" | "rotate") => void }) {
  const left = -width / 2;
  const top = -height / 2;
  const points: Point[] = [
    { x: left, y: top }, { x: 0, y: top }, { x: -left, y: top },
    { x: left, y: 0 }, { x: -left, y: 0 },
    { x: left, y: -top }, { x: 0, y: -top }, { x: -left, y: -top },
  ];
  return (
    <g className="stage-transform-handles">
      <rect x={left} y={top} width={width} height={height} fill="none" stroke="#14a1ff" strokeWidth="0.035" pointerEvents="none" />
      <line x1="0" y1={top} x2="0" y2={top - 0.34} stroke="#14a1ff" strokeWidth="0.035" pointerEvents="none" />
      {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="0.075" fill="#0a84ff" stroke="#ffffff" strokeWidth="0.022" onPointerDown={(event) => onTransform(event, "resize")} style={{ cursor: "nwse-resize" }} />)}
      <circle cx="0" cy={top - 0.36} r="0.085" fill="#0a84ff" stroke="#ffffff" strokeWidth="0.022" onPointerDown={(event) => onTransform(event, "rotate")} style={{ cursor: "grab" }} />
    </g>
  );
}

function SelectionRectangle({ start, end }: { start: Point; end: Point }) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  return <rect x={left} y={top} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} fill="#3dbde8" fillOpacity="0.12" stroke="#65d6ff" strokeWidth="0.035" pointerEvents="none" />;
}

function beamGeometry(fixture: LayoutFixture, minimumAngle: number, maximumAngle: number) {
  const length = 1.5 + fixture.tilt * 3.6;
  const angle = minimumAngle + (maximumAngle - minimumAngle) * fixture.zoom;
  const halfWidth = Math.max(0.05, Math.min(2.2, Math.tan((angle * Math.PI) / 360) * length));
  return { length, halfWidth };
}

function fixtureDisplayColor(fixture: LayoutFixture): string {
  const raw = fixture.color.replace("#", "").padEnd(6, "0");
  const white = clamp(fixture.parameters["color.white"] ?? 0, 0, 1);
  const channel = (offset: number) => Math.min(255, Number.parseInt(raw.slice(offset, offset + 2), 16) + Math.round(white * 255));
  return `#${channel(0).toString(16).padStart(2, "0")}${channel(2).toString(16).padStart(2, "0")}${channel(4).toString(16).padStart(2, "0")}`;
}

function safeSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function isDragInteraction(interaction: StageInteraction): interaction is DragInteraction {
  return interaction.kind === "fixture-drag" || interaction.kind === "object-drag";
}

function isTransformInteraction(interaction: StageInteraction): interaction is TransformInteraction {
  return interaction.kind === "fixture-transform" || interaction.kind === "object-transform";
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function isFormField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
