import type React from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Edges, Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, useProject } from '../app/store';
import { getCabinetModuleState, getCabinetOpenings, getLeafTierSections, getLocalZonesForSection, getOpeningRange, toOpeningRef } from '../domain/cabinet-builder';
import { getCabinetTierSpecs } from '../domain/cabinet-layout';
import { buildSnapCandidates, collidesWithAny, getBounds, getProjectCenter, type PartBounds } from '../domain/geometry';
import { getPartOutlineXY, type Part, type PartFace } from '../domain/part';
import { getDrillGroupToken } from '../domain/project';
import { getDrillConflictIds } from '../domain/drill-spacing';
import { getFaceAxis, isDrillOperation, isGrooveOperation, type DrillOperation } from '../domain/drill';
import { getFacePointWorld } from '../domain/face-coords';
import { t } from '../i18n';
import { getLocalizedPartName } from '../domain/part-label';

function getFaceFrame(part: Part, face: PartFace) {
  switch (face) {
    case 'front':
      return {
        origin: new THREE.Vector3(0, 0, part.thickness / 2),
        u: new THREE.Vector3(1, 0, 0),
        v: new THREE.Vector3(0, -1, 0),
        normal: new THREE.Vector3(0, 0, 1),
        width: part.width,
        height: part.height,
      };
    case 'back':
      return {
        origin: new THREE.Vector3(0, 0, -part.thickness / 2),
        u: new THREE.Vector3(1, 0, 0),
        v: new THREE.Vector3(0, -1, 0),
        normal: new THREE.Vector3(0, 0, -1),
        width: part.width,
        height: part.height,
      };
    case 'top':
      return {
        origin: new THREE.Vector3(0, part.height / 2, 0),
        u: new THREE.Vector3(1, 0, 0),
        v: new THREE.Vector3(0, 0, -1),
        normal: new THREE.Vector3(0, 1, 0),
        width: part.width,
        height: part.thickness,
      };
    case 'bottom':
      return {
        origin: new THREE.Vector3(0, -part.height / 2, 0),
        u: new THREE.Vector3(1, 0, 0),
        v: new THREE.Vector3(0, 0, -1),
        normal: new THREE.Vector3(0, -1, 0),
        width: part.width,
        height: part.thickness,
      };
    case 'left':
      return {
        origin: new THREE.Vector3(-part.width / 2, 0, 0),
        u: new THREE.Vector3(0, 0, -1),
        v: new THREE.Vector3(0, -1, 0),
        normal: new THREE.Vector3(-1, 0, 0),
        width: part.thickness,
        height: part.height,
      };
    case 'right':
      return {
        origin: new THREE.Vector3(part.width / 2, 0, 0),
        u: new THREE.Vector3(0, 0, -1),
        v: new THREE.Vector3(0, -1, 0),
        normal: new THREE.Vector3(1, 0, 0),
        width: part.thickness,
        height: part.height,
      };
  }
}

function getMarkerSurfacePosition(part: Part, face: PartFace, x: number, y: number) {
  const frame = getFaceFrame(part, face);
  const uOffset = x - frame.width / 2;
  const vOffset = y - frame.height / 2;
  return frame.origin
    .clone()
    .add(frame.u.clone().multiplyScalar(uOffset))
    .add(frame.v.clone().multiplyScalar(vOffset));
}

function getFacePlaneDescriptor(part: Part, face: PartFace) {
  switch (face) {
    case 'front': return { axis: 'z' as const, position: part.position.z + part.thickness / 2, direction: 1 };
    case 'back': return { axis: 'z' as const, position: part.position.z - part.thickness / 2, direction: -1 };
    case 'top': return { axis: 'y' as const, position: part.position.y + part.height / 2, direction: 1 };
    case 'bottom': return { axis: 'y' as const, position: part.position.y - part.height / 2, direction: -1 };
    case 'left': return { axis: 'x' as const, position: part.position.x - part.width / 2, direction: -1 };
    case 'right': return { axis: 'x' as const, position: part.position.x + part.width / 2, direction: 1 };
  }
}

function getFaceCenterWorld(part: Part, face: PartFace) {
  const plane = getFacePlaneDescriptor(part, face);
  switch (plane.axis) {
    case 'x': return new THREE.Vector3(plane.position, part.position.y, part.position.z);
    case 'y': return new THREE.Vector3(part.position.x, plane.position, part.position.z);
    case 'z': return new THREE.Vector3(part.position.x, part.position.y, plane.position);
  }
}

function getMeasuredFaceDistance(firstPart: Part, firstFace: PartFace, secondPart: Part, secondFace: PartFace) {
  const first = getFacePlaneDescriptor(firstPart, firstFace);
  const second = getFacePlaneDescriptor(secondPart, secondFace);
  if (first.axis !== second.axis) return null;
  return Math.abs(second.position - first.position);
}

function getAxisVector(axis: { x: number; y: number; z: number }) {
  return new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
}

function getHoleLength(part: Part, axis: { x: number; y: number; z: number }, depth: number, through: boolean) {
  const direction = getAxisVector(axis);
  const abs = { x: Math.abs(direction.x), y: Math.abs(direction.y), z: Math.abs(direction.z) };
  const thickness = abs.x > 0.5 ? part.width : abs.y > 0.5 ? part.height : part.thickness;
  return through ? thickness + 2.4 : Math.max(depth, 2.4);
}

function getMarkerRotation(axis: { x: number; y: number; z: number }) {
  const direction = getAxisVector(axis);
  const base = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(base, direction);
  return new THREE.Euler().setFromQuaternion(quaternion);
}

function getMarkerColor(feature: Part['operations'][number]['feature'], isSelected: boolean, through: boolean, isConflict: boolean) {
  if (isConflict) return { color: isSelected ? '#ef4444' : '#b91c1c', emissive: '#7f1d1d' };
  if (through) return { color: '#7c3aed', emissive: '#5b21b6' };
  if (feature === 'cam-housing') return { color: isSelected ? '#f97316' : '#ea580c', emissive: '#7c2d12' };
  if (feature === 'dowel') return { color: isSelected ? '#14b8a6' : '#0f766e', emissive: '#134e4a' };
  if (feature === 'connector-pin') return { color: isSelected ? '#f59e0b' : '#b45309', emissive: '#78350f' };
  if (feature === 'shelf-pin') return { color: isSelected ? '#84cc16' : '#4d7c0f', emissive: '#365314' };
  if (feature === 'hinge-cup') return { color: isSelected ? '#ec4899' : '#be185d', emissive: '#831843' };
  if (feature === 'hinge-plate') return { color: isSelected ? '#38bdf8' : '#0369a1', emissive: '#0c4a6e' };
  return { color: isSelected ? '#ef4444' : '#2563eb', emissive: isSelected ? '#7f1d1d' : '#1d4ed8' };
}

function getMarkerVisualLength(op: DrillOperation, isSelected: boolean, holeLength: number) {
  if (op.through) return Math.max(holeLength, 4);
  if (op.feature === 'cam-housing') return Math.min(Math.max(op.depth, 4), 12);
  if (op.feature === 'hinge-cup') return Math.min(Math.max(op.depth, 8), 13);
  return Math.max(holeLength, isSelected ? 2.4 : 1.2);
}

/** Unit cylinder along +Y: every marker is this shape scaled to its radius and length. */
const DRILL_MARKER_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 12);
const conflictIdsByPart = new WeakMap<Part, Set<string>>();

function getCachedConflictIds(part: Part) {
  let ids = conflictIdsByPart.get(part);
  if (!ids) {
    ids = new Set(getDrillConflictIds(part));
    conflictIdsByPart.set(part, ids);
  }
  return ids;
}

type DrillMarkerInstance = {
  partId: string;
  opId: string;
  feature: DrillOperation['feature'];
  drillSelected: boolean;
  matrix: THREE.Matrix4;
  color: THREE.Color;
  surface: THREE.Vector3;
  tip: THREE.Vector3;
};

/**
 * All hole markers of the scene in one InstancedMesh — one draw call instead of one per hole (a kitchen has
 * thousands). A click resolves the hole through instanceId.
 */
function DrillMarkerInstances({ parts }: { parts: Part[] }) {
  const showDrilling = useAppStore((s) => s.showDrilling);
  const selectDrillOperation = useAppStore((s) => s.selectDrillOperation);
  // Primitive selector results: markers are rebuilt only when the relevant selection really changes.
  const selectedPartKey = useAppStore((s) => {
    const ids = new Set(s.selectedPartIds);
    if (s.selected?.type === 'part' || s.selected?.type === 'face') ids.add(s.selected.partId);
    return [...ids].sort().join('|');
  });
  const selectedDrillToken = useAppStore((s) => {
    const drill = s.selectedDrill;
    if (!drill) return null;
    const op = s.history.present.parts.find((part) => part.id === drill.partId)?.operations.filter(isDrillOperation).find((item) => item.id === drill.opId);
    return op ? getDrillGroupToken(drill.partId, op) : null;
  });
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const instances = useMemo<DrillMarkerInstance[]>(() => {
    if (!showDrilling) return [];
    const selectedIds = new Set(selectedPartKey ? selectedPartKey.split('|') : []);
    const up = new THREE.Vector3(0, 1, 0);
    return parts.flatMap((part) => {
      const conflicts = getCachedConflictIds(part);
      const origin = new THREE.Vector3(part.position.x, part.position.y, part.position.z);
      return part.operations.filter(isDrillOperation).map((op) => {
        const drillSelected = !!selectedDrillToken && getDrillGroupToken(part.id, op) === selectedDrillToken;
        const highlighted = selectedIds.has(part.id) || drillSelected;
        const axis = getAxisVector(op.axis);
        const visualLength = getMarkerVisualLength(op, highlighted, getHoleLength(part, op.axis, op.depth, op.through));
        const radius = Math.max(op.diameter / 2, highlighted ? 2.6 : 1.6);
        const surface = getMarkerSurfacePosition(part, op.face, op.x, op.y).add(origin);
        const center = surface.clone().add(axis.clone().multiplyScalar(visualLength / 2));
        return {
          partId: part.id,
          opId: op.id,
          feature: op.feature,
          drillSelected,
          matrix: new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromUnitVectors(up, axis), new THREE.Vector3(radius, visualLength, radius)),
          color: new THREE.Color(getMarkerColor(op.feature, highlighted, op.through, conflicts.has(op.id)).color),
          surface,
          tip: surface.clone().add(axis.clone().multiplyScalar(visualLength)),
        };
      });
    });
  }, [parts, selectedDrillToken, selectedPartKey, showDrilling]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    instances.forEach((instance, index) => {
      mesh.setMatrixAt(index, instance.matrix);
      mesh.setColorAt(index, instance.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [instances]);

  if (instances.length === 0) return null;
  return (
    <>
      <instancedMesh
        // The instance count is fixed when the mesh is created, so another count needs a fresh mesh.
        key={instances.length}
        ref={meshRef}
        args={[DRILL_MARKER_GEOMETRY, undefined, instances.length]}
        onClick={(e) => {
          e.stopPropagation();
          const instance = e.instanceId === undefined ? null : instances[e.instanceId];
          if (instance) selectDrillOperation(instance.partId, instance.opId);
        }}
      >
        <meshStandardMaterial emissive="#1f1f1f" />
      </instancedMesh>
      {instances.filter((instance) => instance.drillSelected).map((instance) => (
        <group key={`${instance.partId}:${instance.opId}`}>
          {instance.feature === 'cam-housing' ? (
            <mesh position={instance.surface}>
              <sphereGeometry args={[1.4, 12, 12]} />
              <meshBasicMaterial color="#111827" />
            </mesh>
          ) : null}
          <Line points={[instance.surface, instance.tip]} color="#dc2626" lineWidth={1} />
        </group>
      ))}
    </>
  );
}

const GROOVE_MARKER_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

/** Пазы — тёмные вырезы по грани: длина вдоль паза, ширина поперёк, глубина внутрь детали. Видны вместе с присадкой. */
function GrooveMarkers({ parts }: { parts: Part[] }) {
  const showDrilling = useAppStore((s) => s.showDrilling);
  const grooves = useMemo(() => {
    if (!showDrilling) return [];
    return parts.flatMap((part) => part.operations.filter(isGrooveOperation).map((op) => {
      const start = getFacePointWorld(part, op.face, op);
      const end = getFacePointWorld(part, op.face, { x: op.x2, y: op.y2 });
      const along = new THREE.Vector3(end.x - start.x, end.y - start.y, end.z - start.z);
      const length = along.length();
      along.normalize();
      const inward = getAxisVector(getFaceAxis(op.face));
      const across = new THREE.Vector3().crossVectors(along, inward);
      // Чуть глубже и длиннее реального, чтобы вырез не мерцал на одной плоскости с гранью.
      const center = new THREE.Vector3(start.x + end.x, start.y + end.y, start.z + end.z)
        .multiplyScalar(0.5)
        .add(inward.clone().multiplyScalar(op.depth / 2 - 0.25));
      const matrix = new THREE.Matrix4()
        .makeBasis(along, inward, across)
        .scale(new THREE.Vector3(length + 0.5, op.depth + 0.5, op.width))
        .setPosition(center);
      return { key: `${part.id}:${op.id}`, matrix };
    }));
  }, [parts, showDrilling]);

  return (
    <>
      {grooves.map((groove) => (
        <mesh key={groove.key} geometry={GROOVE_MARKER_GEOMETRY} matrixAutoUpdate={false} matrix={groove.matrix} raycast={() => null}>
          <meshStandardMaterial color="#3f3f46" />
        </mesh>
      ))}
    </>
  );
}

function pointToFaceCoordinates(part: Part, face: PartFace, local: THREE.Vector3) {
  switch (face) {
    case 'front':
    case 'back': return { x: local.x + part.width / 2, y: part.height / 2 - local.y };
    case 'top':
    case 'bottom': return { x: local.x + part.width / 2, y: part.thickness / 2 - local.z };
    case 'left':
    case 'right': return { x: part.thickness / 2 - local.z, y: part.height / 2 - local.y };
  }
}

function FaceLayer({ part, face, position, rotation, size }: { part: Part; face: PartFace; position: [number, number, number]; rotation: [number, number, number]; size: [number, number]; }) {
  const activeTool = useAppStore((s) => s.activeTool);
  const selectFace = useAppStore((s) => s.selectFace);
  const addHoleToFace = useAppStore((s) => s.addHoleToFace);
  // Boolean selectors: a face layer re-renders only when its own state flips, not on every selection change.
  const isActive = useAppStore((s) => s.selected?.type === 'face' && s.selected.partId === part.id && s.selected.face === face);
  const isPartSelected = useAppStore((s) => s.selected?.type === 'part' && s.selected.partId === part.id);
  const isMeasured = useAppStore((s) => s.measuredFaces.some((item) => item?.partId === part.id && item.face === face));
  const isVisible = activeTool === 'place-hole' || activeTool === 'measure' || isActive || isMeasured || isPartSelected;
  if (!isVisible) return null;
  return <mesh position={position} rotation={rotation} onClick={(e) => { e.stopPropagation(); selectFace(part.id, face); if (activeTool !== 'place-hole') return; const local = e.point.clone().sub(new THREE.Vector3(part.position.x, part.position.y, part.position.z)); const coords = pointToFaceCoordinates(part, face, local); addHoleToFace(part.id, face, coords.x, coords.y); }}><planeGeometry args={size} /><meshBasicMaterial color={isActive || isMeasured ? '#f59e0b' : '#fbbf24'} transparent opacity={isActive || isMeasured ? 0.2 : 0.05} side={THREE.DoubleSide} depthWrite={false} /></mesh>;
}

function MeasurementOverlay() {
  const project = useProject();
  const language = useAppStore((s) => s.language);
  const activeTool = useAppStore((s) => s.activeTool);
  const measuredFaces = useAppStore((s) => s.measuredFaces);

  const measurement = useMemo(() => {
    const [first, second] = measuredFaces;
    if (!first || !second) return null;
    const firstPart = project.parts.find((part) => part.id === first.partId);
    const secondPart = project.parts.find((part) => part.id === second.partId);
    if (!firstPart || !secondPart) return null;
    const distance = getMeasuredFaceDistance(firstPart, first.face, secondPart, second.face);
    const firstCenter = getFaceCenterWorld(firstPart, first.face);
    const secondCenter = getFaceCenterWorld(secondPart, second.face);
    const midpoint = firstCenter.clone().add(secondCenter).multiplyScalar(0.5);
    return { distance, firstCenter, secondCenter, midpoint };
  }, [measuredFaces, project.parts]);

  if (activeTool !== 'measure') return null;
  if (!measurement) return null;

  return (
    <group>
      {measurement.distance !== null ? <Line points={[measurement.firstCenter, measurement.secondCenter]} color="#f59e0b" lineWidth={1.5} /> : null}
      <Html position={measurement.midpoint.toArray() as [number, number, number]} center>
        <div style={{ fontSize: 12, background: 'rgba(24,24,27,0.94)', color: '#f4f4f5', padding: '6px 10px', borderRadius: 8, border: '1px solid #52525b', whiteSpace: 'nowrap' }}>
          {measurement.distance !== null
            ? `${t(language, 'measureDistance')}: ${Math.round(measurement.distance)} mm`
            : t(language, 'measureParallelHint')}
        </div>
      </Html>
    </group>
  );
}

const ROLE_COLORS: Record<string, string> = {
  'left-side': '#818cf8', 'right-side': '#818cf8',
  'top': '#f472b6', 'bottom': '#f472b6',
  'shelf': '#34d399',
  'partition': '#fbbf24',
  'back-panel': '#a78bfa',
  'front-left': '#f87171', 'front-right': '#f87171', 'front-flap': '#f87171',
  'plinth-front': '#22d3ee', 'plinth-left': '#22d3ee', 'plinth-right': '#22d3ee', 'plinth-back': '#22d3ee',
  'tier-divider': '#fb923c',
  'apron': '#60a5fa',
  'back-rail': '#60a5fa',
};

const HOVER_COLOR = '#3b82f6';

/** Outline drawn on top of everything, so a part hovered in the project tree is visible even inside the cabinet. */
function HoverOutline({ args }: { args: [number, number, number] }) {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(...args);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [args]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} renderOrder={40}>
      <lineBasicMaterial color={HOVER_COLOR} depthTest={false} depthWrite={false} transparent opacity={0.3} toneMapped={false} />
    </lineSegments>
  );
}

/** Пластина с угловыми вырезами (ХДФ под навесы): контур в XY, выдавленный на толщину, по центру детали. */
function NotchedPanelGeometry({ part }: { part: Part }) {
  const geometry = useMemo(() => {
    const outline = getPartOutlineXY(part);
    const shape = new THREE.Shape(outline.map((point) => new THREE.Vector2(point.x - part.width / 2, point.y - part.height / 2)));
    const extruded = new THREE.ExtrudeGeometry(shape, { depth: part.thickness, bevelEnabled: false });
    extruded.translate(0, 0, -part.thickness / 2);
    return extruded;
  }, [part]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}

// Memoized: a project change keeps unchanged parts as the same objects, so only changed parts re-render.
const PartMesh = memo(function PartMesh({ part }: { part: Part }) {
  const selectPart = useAppStore((s) => s.selectPart);
  const language = useAppStore((s) => s.language);
  const xrayMode = useAppStore((s) => s.xrayMode);
  const themeMode = useAppStore((s) => s.themeMode);
  const showRoleColors = useAppStore((s) => s.showRoleColors);
  const materialColor = useAppStore((s) => s.materialColor);
  // Boolean selector: only parts whose hover state flips re-render.
  const isHovered = useAppStore((s) => s.hoveredPartIds.includes(part.id));
  const isDarkBlue = themeMode === 'dark-blue';
  // Boolean selectors (like isHovered): selecting one part must not re-render every other part.
  const isSelected = useAppStore((s) => s.selectedPartIds.includes(part.id) || ((s.selected?.type === 'part' || s.selected?.type === 'face') && s.selected.partId === part.id));
  const isGroupSelected = useAppStore((s) => s.selected?.type === 'group' && s.selected.groupId === part.meta?.groupId);
  const showSingleLabel = useAppStore((s) => (s.selected?.type === 'part' || s.selected?.type === 'face') && s.selected.partId === part.id && s.selectedPartIds.length <= 1);
  const boxArgs = useMemo<[number, number, number]>(() => [part.width, part.height, part.thickness], [part.width, part.height, part.thickness]);
  const xrayOpacity = isSelected || isGroupSelected || isHovered ? 0.48 : 0.22;
  const roleColor = showRoleColors ? (ROLE_COLORS[part.meta?.role ?? ''] ?? '#94a3b8') : null;
  const meshColor = isSelected || isGroupSelected ? '#f5d0a9' : (roleColor ?? part.meta?.displayColor ?? materialColor ?? (isDarkBlue ? '#f1f5f9' : '#d6d3d1'));
  return (
    <group
      position={[part.position.x, part.position.y, part.position.z]}
      // On the group, not the box: face layers and drill markers sit in front of the box and would swallow the hover.
      onPointerOver={(e) => { e.stopPropagation(); useAppStore.getState().setHoveredPartIds([part.id], 'scene'); }}
      onPointerOut={(e) => {
        e.stopPropagation();
        const { hoverSource, hoveredPartIds, setHoveredPartIds } = useAppStore.getState();
        if (hoverSource === 'scene' && hoveredPartIds.length === 1 && hoveredPartIds[0] === part.id) setHoveredPartIds([], 'scene');
      }}
    >
      <mesh
        renderOrder={xrayMode ? 10 : 1}
        onClick={(e) => { e.stopPropagation(); selectPart(part.id, !!(e.nativeEvent as MouseEvent).ctrlKey || !!(e.nativeEvent as MouseEvent).metaKey); }}
      >
        {part.cornerNotches?.length ? <NotchedPanelGeometry part={part} /> : <boxGeometry args={boxArgs} />}
        <meshStandardMaterial
          color={meshColor}
          emissive={isHovered ? HOVER_COLOR : '#000000'}
          emissiveIntensity={isHovered ? 0.105 : 0}
          transparent={xrayMode}
          opacity={xrayMode ? xrayOpacity : 1}
          side={xrayMode ? THREE.DoubleSide : THREE.FrontSide}
          depthWrite={!xrayMode}
          depthTest={!xrayMode}
          polygonOffset={xrayMode}
          polygonOffsetFactor={xrayMode ? 2 : 1}
          polygonOffsetUnits={xrayMode ? 2 : 1}
        />
        <Edges renderOrder={xrayMode ? 20 : 2} color={isHovered ? HOVER_COLOR : (isDarkBlue ? '#8b8b92' : '#444')} />
      </mesh>
      {isHovered ? <HoverOutline args={boxArgs} /> : null}
      <FaceLayer part={part} face="front" position={[0, 0, part.thickness / 2 + 0.6]} rotation={[0, 0, 0]} size={[part.width, part.height]} />
      <FaceLayer part={part} face="back" position={[0, 0, -part.thickness / 2 - 0.6]} rotation={[0, Math.PI, 0]} size={[part.width, part.height]} />
      <FaceLayer part={part} face="top" position={[0, part.height / 2 + 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} size={[part.width, part.thickness]} />
      <FaceLayer part={part} face="bottom" position={[0, -part.height / 2 - 0.6, 0]} rotation={[Math.PI / 2, 0, 0]} size={[part.width, part.thickness]} />
      <FaceLayer part={part} face="left" position={[-part.width / 2 - 0.6, 0, 0]} rotation={[0, Math.PI / 2, 0]} size={[part.thickness, part.height]} />
      <FaceLayer part={part} face="right" position={[part.width / 2 + 0.6, 0, 0]} rotation={[0, -Math.PI / 2, 0]} size={[part.thickness, part.height]} />
      {showSingleLabel && (
        <Html position={[0, part.height / 2 + 22, 0]} center>
          <div style={{ fontSize: 12, background: isDarkBlue ? 'rgba(36,36,39,0.94)' : 'rgba(255,255,255,0.92)', color: isDarkBlue ? '#f4f4f5' : '#111', padding: '3px 7px 4px', borderRadius: 6, border: `1px solid ${isDarkBlue ? '#52525b' : '#ddd'}`, whiteSpace: 'nowrap', lineHeight: 1.4 }}>
            <div style={{ fontWeight: 600 }}>{getLocalizedPartName(part, language)}</div>
            <div style={{ fontSize: 10, color: isDarkBlue ? '#a1a1aa' : '#78716c' }}>{part.width}×{part.height}×{part.thickness} мм</div>
          </div>
        </Html>
      )}
    </group>
  );
});

type SceneSnapCandidate = {
  key: string;
  targetPartId: string;
  candidateId: string;
  label: string;
  previewBounds: PartBounds;
  nextPosition: { x: number; y: number; z: number };
};

function offsetBounds(bounds: PartBounds, nextPosition: { x: number; y: number; z: number }, current: { x: number; y: number; z: number }): PartBounds {
  const dx = nextPosition.x - current.x;
  const dy = nextPosition.y - current.y;
  const dz = nextPosition.z - current.z;
  return {
    ...bounds,
    minX: bounds.minX + dx,
    maxX: bounds.maxX + dx,
    minY: bounds.minY + dy,
    maxY: bounds.maxY + dy,
    minZ: bounds.minZ + dz,
    maxZ: bounds.maxZ + dz,
  };
}

function SnapPreview({ candidate }: { candidate: SceneSnapCandidate }) {
  const applySceneSnapCandidate = useAppStore((s) => s.applySceneSnapCandidate);
  const center: [number, number, number] = [
    (candidate.previewBounds.minX + candidate.previewBounds.maxX) / 2,
    (candidate.previewBounds.minY + candidate.previewBounds.maxY) / 2,
    (candidate.previewBounds.minZ + candidate.previewBounds.maxZ) / 2,
  ];
  const size: [number, number, number] = [
    Math.max(candidate.previewBounds.width, 2),
    Math.max(candidate.previewBounds.height, 2),
    Math.max(candidate.previewBounds.depth, 2),
  ];

  return (
    <group position={center}>
      <mesh onClick={(e) => { e.stopPropagation(); applySceneSnapCandidate(candidate.targetPartId, candidate.candidateId); }}>
        <boxGeometry args={size} />
        <meshBasicMaterial color="#22c55e" transparent opacity={0.1} depthWrite={false} />
        <Edges color="#16a34a" />
      </mesh>
      <Html position={[0, size[1] / 2 + 24, 0]} center>
        <button
          onClick={(e) => { e.stopPropagation(); applySceneSnapCandidate(candidate.targetPartId, candidate.candidateId); }}
          style={{
            fontSize: 12,
            background: 'rgba(255,255,255,0.96)',
            padding: '4px 8px',
            borderRadius: 8,
            border: '1px solid #bbf7d0',
            color: '#166534',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {candidate.label}
        </button>
      </Html>
    </group>
  );
}

function SectionOverlay() {
  const project = useProject();
  const selected = useAppStore((s) => s.selected);
  const selectionMode = useAppStore((s) => s.selectionMode);
  const placingFronts = useAppStore((s) => s.activeTool === 'place-front');
  // The front tool shows the openings of every cabinet; otherwise only the selected cabinet's, in group selection mode.
  const groupIds = useMemo(() => {
    if (placingFronts) return [...new Set(project.parts.map((part) => part.meta?.groupId).filter((id): id is string => Boolean(id)))];
    if (selectionMode !== 'group' || !selected) return [];
    const groupId = selected.type === 'group' ? selected.groupId : project.parts.find((part) => part.id === selected.partId)?.meta?.groupId;
    return groupId ? [groupId] : [];
  }, [placingFronts, project.parts, selected, selectionMode]);
  return <>{groupIds.map((groupId) => <CabinetOpeningsOverlay key={groupId} groupId={groupId} placingFronts={placingFronts} />)}</>;
}

function CabinetOpeningsOverlay({ groupId, placingFronts }: { groupId: string; placingFronts: boolean }) {
  const project = useProject();
  const selectedSection = useAppStore((s) => s.selectedSection);
  const selectedOpening = useAppStore((s) => s.selectedOpening);
  const selectOpening = useAppStore((s) => s.selectOpening);
  const language = useAppStore((s) => s.language);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const moduleState = getCabinetModuleState(project.parts, groupId);

  // One overlay per free cell (between shelves and dividers) and one per front: the cells under a stretched front merge
  // into its opening. A click picks that opening, plus the section/zone of its bottom cell for the rest of the panel.
  const openings = useMemo(() => moduleState ? getCabinetOpenings(project.parts, moduleState.groupId) : [], [moduleState, project.parts]);
  const overlays = useMemo(() => {
    if (!moduleState) return [];
    const sections = getLeafTierSections(moduleState);
    const frontCells = getCabinetTierSpecs(moduleState.layout)
      .flatMap((tier) => (tier.layout.fronts ?? []).map((spec) => getOpeningRange(openings, { ...spec, tierId: tier.id })))
      .flatMap((range) => (range ? [range.cells.slice(range.from, range.to + 1)] : []));
    const covered = new Set(frontCells.flat());
    const groups = [
      ...frontCells.map((cells) => ({ cells, isFront: true })),
      ...openings.filter((cell) => !covered.has(cell)).map((cell) => ({ cells: [cell], isFront: false })),
    ];
    return groups.map(({ cells, isFront }) => {
      const bottom = cells[0]!;
      const top = cells[cells.length - 1]!;
      const sectionIndex = sections.filter((section) => section.tierId === bottom.tierId).findIndex((section) => section.id === bottom.sectionId);
      const zones = getLocalZonesForSection(moduleState, bottom.sectionId, bottom.tierId);
      const centerY = (bottom.startY + bottom.endY) / 2;
      const zoneId = zones.length > 1 ? zones.find((zone) => centerY >= zone.startY && centerY <= zone.endY)?.id ?? null : null;
      return {
        key: `${bottom.tierId}|${bottom.sectionId}|${bottom.bottomBoundaryId}|${top.topBoundaryId}`,
        cells,
        bottom,
        top,
        ref: toOpeningRef(bottom, top),
        isFront,
        hasDrawers: cells.some((cell) => cell.hasDrawers),
        sectionIndex,
        zoneId,
      };
    });
  }, [moduleState, openings]);
  if (!moduleState || overlays.length === 0) return null;

  // In front of the fronts, so an opening that already has a front can still be picked.
  const planeZ = moduleState.position.z + moduleState.depth / 2 + moduleState.thickness + 6;
  const openingSelection = selectedOpening?.groupId === moduleState.groupId ? selectedOpening : null;
  const mm = language === 'ru' ? 'мм' : 'mm';
  // The picked opening is a column of cells, possibly across tiers.
  const range = openingSelection ? getOpeningRange(openings, openingSelection) : null;
  const pickedCells = range ? range.cells.slice(range.from, range.to + 1) : [];

  return (
    <>
      {overlays.map(({ key, cells, bottom, top, ref, isFront, hasDrawers, sectionIndex, zoneId }) => {
        const inOpening = cells.some((cell) => pickedCells.includes(cell));
        const sectionActive = !openingSelection
          && selectedSection?.groupId === moduleState.groupId
          && selectedSection.sectionId === bottom.sectionId
          && (!selectedSection.tierId || selectedSection.tierId === bottom.tierId)
          && (!selectedSection.zoneId || selectedSection.zoneId === zoneId);
        const isHovered = hoveredKey === key;
        const color = inOpening || sectionActive ? '#f59e0b' : isHovered ? '#60a5fa' : '#94a3b8';
        // The front tool lights every opening up; drawer cells stay dim since no front goes there.
        const idleOpacity = placingFronts ? (hasDrawers ? 0.04 : 0.12) : 0.06;
        const opacity = inOpening ? 0.28 : isHovered ? 0.18 : sectionActive ? 0.12 : idleOpacity;
        const width = Math.max(bottom.endX - bottom.startX, 8);
        const height = Math.max(top.endY - bottom.startY, 8);
        // One label per picked opening (on the overlay holding its top cell, with the whole size), or on the hovered one.
        const showRangeLabel = Boolean(range && cells.includes(range.cells[range.to]!));
        const labelHeight = range && showRangeLabel ? range.cells[range.to]!.endY - range.cells[range.from]!.startY : height;
        const kind = hasDrawers
          ? (language === 'ru' ? 'ящики' : 'drawers')
          : isFront
            ? (language === 'ru' ? 'фасад' : 'front')
            : t(language, 'opening').toLowerCase();
        const tierLabel = top.tierIndex === bottom.tierIndex ? `${bottom.tierIndex + 1}` : `${top.tierIndex + 1}–${bottom.tierIndex + 1}`;
        const label = `${t(language, 'tier')} ${tierLabel} · ${t(language, 'section')} ${sectionIndex + 1} · ${kind} ${Math.round(labelHeight)} × ${Math.round(width)} ${mm}`;
        return (
          <group key={key} position={[(bottom.startX + bottom.endX) / 2, (bottom.startY + top.endY) / 2, planeZ]}>
            <mesh
              onPointerOver={(e) => { e.stopPropagation(); setHoveredKey(key); }}
              onPointerOut={(e) => { e.stopPropagation(); setHoveredKey((current) => current === key ? null : current); }}
              onClick={(e) => {
                e.stopPropagation();
                selectOpening(
                  moduleState.groupId,
                  { sectionId: bottom.sectionId, tierId: bottom.tierId, zoneId },
                  hasDrawers ? null : ref,
                  e.nativeEvent.shiftKey
                );
              }}
            >
              <planeGeometry args={[width, height]} />
              <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
              {placingFronts || inOpening ? <Edges color={color} /> : null}
            </mesh>
            {(showRangeLabel || isHovered) ? <Html position={[0, height / 2 + 18, 0]} center><div style={{ fontSize: 12, color: '#111', background: 'rgba(255,255,255,0.96)', padding: '2px 6px', borderRadius: 6, border: `1px solid ${color}`, whiteSpace: 'nowrap' }}>{label}</div></Html> : null}
          </group>
        );
      })}
    </>
  );
}

function getCameraCenter(project: ReturnType<typeof useProject>, cameraState: ReturnType<typeof useAppStore.getState>['camera']) {
  if (cameraState.targetGroupId) {
    const group = project.parts.filter((part) => part.meta?.groupId === cameraState.targetGroupId);
    return new THREE.Vector3(...Object.values(getProjectCenter(group)) as [number, number, number]);
  }
  if (cameraState.targetPartId) {
    const targetPart = project.parts.find((part) => part.id === cameraState.targetPartId) ?? null;
    return targetPart
      ? new THREE.Vector3(targetPart.position.x, targetPart.position.y, targetPart.position.z)
      : new THREE.Vector3(0, 0, 0);
  }
  return new THREE.Vector3(...Object.values(getProjectCenter(project.parts)) as [number, number, number]);
}

function CameraRig() {
  const project = useProject();
  const cameraState = useAppStore((s) => s.camera);
  const controlsRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const lastFocusVersionRef = useRef(-1);
  const lastPresetVersionRef = useRef(-1);
  const [topViewActive, setTopViewActive] = useState(false);
  const { camera } = useThree();
  useEffect(() => {
    if (!controlsRef.current) return;
    if (!initializedRef.current) {
      controlsRef.current.target.copy(getCameraCenter(project, cameraState));
      controlsRef.current.update();
      initializedRef.current = true;
      lastFocusVersionRef.current = cameraState.focusVersion;
      lastPresetVersionRef.current = cameraState.presetVersion;
    } else if (cameraState.presetVersion !== lastPresetVersionRef.current && cameraState.preset) {
      lastPresetVersionRef.current = cameraState.presetVersion;
      const center = getCameraCenter(project, cameraState);
      controlsRef.current.target.copy(center);
      const allParts = project.parts;
      const spread = allParts.length > 0 ? Math.max(
        ...allParts.map((p) => Math.max(p.width, p.height, p.thickness))
      ) : 400;
      const D = Math.max(900, spread * 4);
      setTopViewActive(cameraState.preset === 'top');
      switch (cameraState.preset) {
        case 'front': camera.position.set(center.x, center.y + D * 0.08, center.z + D); break;
        case 'left':  camera.position.set(center.x - D, center.y + D * 0.08, center.z); break;
        case 'top':   camera.position.set(center.x + 1, center.y + D, center.z + 1); break;
        case 'iso':   camera.position.set(center.x + D * 0.65, center.y + D * 0.45, center.z + D * 0.65); break;
      }
      controlsRef.current.update();
      lastFocusVersionRef.current = cameraState.focusVersion;
    } else if (cameraState.focusVersion !== lastFocusVersionRef.current) {
      const center = getCameraCenter(project, cameraState);
      const currentTarget = controlsRef.current.target.clone();
      const offset = camera.position.clone().sub(currentTarget);
      controlsRef.current.target.copy(center);
      camera.position.copy(center.clone().add(offset));
      controlsRef.current.update();
      lastFocusVersionRef.current = cameraState.focusVersion;
    }
    camera.near = 5; camera.far = 12000; camera.updateProjectionMatrix();
  }, [camera, cameraState, project]);
  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      maxPolarAngle={topViewActive ? Math.PI * 0.95 : Math.PI / 2.05}
      minDistance={140}
      maxDistance={7098}
      enableDamping
      dampingFactor={0.08}
      onChange={() => { if (topViewActive) setTopViewActive(false); }}
    />
  );
}

function EmptyHint() {
  const language = useAppStore((s) => s.language);
  const themeMode = useAppStore((s) => s.themeMode);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;
  const isDarkBlue = themeMode === 'dark-blue';
  return (
    <Html center position={[0, isMobile ? 180 : 0, 0]} zIndexRange={[1, 0]}>
      <div
        style={{
          background: isDarkBlue ? 'rgba(36,36,39,0.96)' : 'rgba(255,255,255,0.95)',
          border: `1px solid ${isDarkBlue ? '#52525b' : '#ddd'}`,
          borderRadius: 10,
          padding: '12px 16px',
          color: isDarkBlue ? '#e5e7eb' : '#444',
          fontSize: 14,
          pointerEvents: 'none',
        }}
      >
        {t(language, 'workspaceHint')}
      </div>
    </Html>
  );
}

function AxisIndicator({ parts }: { parts: Part[] }) {
  const bounds = useMemo(() => getBounds(parts), [parts]);
  if (parts.length === 0 || bounds.width === 0 && bounds.height === 0 && bounds.depth === 0) return null;

  const guideLength = Math.max(120, Math.min(Math.max(bounds.width, bounds.height, bounds.depth) * 0.2, 320));
  const labelOffset = 18;
  const origin: [number, number, number] = [
    (bounds.minX + bounds.maxX) / 2,
    bounds.maxY + guideLength * 0.7,
    (bounds.minZ + bounds.maxZ) / 2,
  ];

  return (
    <group position={origin}>
      <mesh>
        <sphereGeometry args={[6, 16, 16]} />
        <meshBasicMaterial color="#111827" />
      </mesh>
      <Line points={[[0, 0, 0], [guideLength, 0, 0]]} color="#dc2626" lineWidth={2} />
      <Line points={[[0, 0, 0], [0, guideLength, 0]]} color="#16a34a" lineWidth={2} />
      <Line points={[[0, 0, 0], [0, 0, guideLength]]} color="#2563eb" lineWidth={2} />
      <Html position={[guideLength + labelOffset, 0, 0]} center><div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b', background: 'rgba(255,255,255,0.92)', border: '1px solid #fecaca', borderRadius: 999, padding: '2px 7px' }}>X</div></Html>
      <Html position={[0, guideLength + labelOffset, 0]} center><div style={{ fontSize: 13, fontWeight: 700, color: '#166534', background: 'rgba(255,255,255,0.92)', border: '1px solid #bbf7d0', borderRadius: 999, padding: '2px 7px' }}>Y</div></Html>
      <Html position={[0, 0, guideLength + labelOffset]} center><div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', background: 'rgba(255,255,255,0.92)', border: '1px solid #bfdbfe', borderRadius: 999, padding: '2px 7px' }}>Z</div></Html>
    </group>
  );
}

export function SceneRoot() {
  const project = useProject();
  const selected = useAppStore((s) => s.selected);
  const selectedPartIds = useAppStore((s) => s.selectedPartIds);
  const experimentalMoveMode = useAppStore((s) => s.experimentalMoveMode);
  const showAxisIndicator = useAppStore((s) => s.showAxisIndicator);
  const language = useAppStore((s) => s.language);
  const themeMode = useAppStore((s) => s.themeMode);
  const isDarkBlue = themeMode === 'dark-blue';
  const selectPart = useAppStore((s) => s.selectPart);
  const setCameraPreset = useAppStore((s) => s.setCameraPreset);
  const showRoleColors = useAppStore((s) => s.showRoleColors);
  const setShowRoleColors = useAppStore((s) => s.setShowRoleColors);
  const floorVisualY = -2.5;
  const visibleParts = useMemo(() => project.parts.filter((part) => !part.meta?.hidden), [project.parts]);
  const floorTexture = useMemo(() => {
    const size = 512;
    const cell = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Keep the "light theme" floor look, but darken it for dark mode.
    ctx.fillStyle = isDarkBlue ? '#9ca3af' : '#e5e7eb';
    ctx.fillRect(0, 0, size, size);

    // Subtle checker base keeps depth perception without thin-line shimmer.
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        const isAlt = ((x / cell) + (y / cell)) % 2 === 0;
        ctx.fillStyle = isAlt
          ? (isDarkBlue ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.03)')
          : 'rgba(0,0,0,0)';
        ctx.fillRect(x, y, cell, cell);
      }
    }

    // Draw thicker major lines and softer minor lines.
    for (let i = 0; i <= size; i += cell) {
      const major = i % (cell * 4) === 0;
      ctx.strokeStyle = major
        ? (isDarkBlue ? 'rgba(148,163,184,0.55)' : 'rgba(71,85,105,0.38)')
        : (isDarkBlue ? 'rgba(148,163,184,0.45)' : 'rgba(71,85,105,0.22)');
      ctx.lineWidth = major ? 2.2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(i + 0.5, 0);
      ctx.lineTo(i + 0.5, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i + 0.5);
      ctx.lineTo(size, i + 0.5);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(18, 18);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  }, [isDarkBlue]);

  useEffect(() => {
    return () => {
      floorTexture?.dispose();
    };
  }, [floorTexture]);
  const sceneSnapCandidates = useMemo<SceneSnapCandidate[]>(() => {
    if (!experimentalMoveMode || !selected) return [];

    const selectedParts =
      selected.type === 'group'
        ? visibleParts.filter((part) => part.meta?.groupId === selected.groupId)
        : selectedPartIds.length > 1
        ? visibleParts.filter((part) => selectedPartIds.includes(part.id))
        : visibleParts.filter((part) => part.id === selected.partId);

    if (selectedParts.length === 0) return [];

    const movingBounds = getBounds(selectedParts);
    const current = {
      x: (movingBounds.minX + movingBounds.maxX) / 2,
      y: (movingBounds.minY + movingBounds.maxY) / 2,
      z: (movingBounds.minZ + movingBounds.maxZ) / 2,
    };
    const movedIds = new Set(selectedParts.map((part) => part.id));
    const neighborBounds = visibleParts
      .filter((part) => !movedIds.has(part.id))
      .map((part) => ({ partId: part.id, bounds: getBounds([part]), name: part.name }));

    const candidates = neighborBounds.flatMap((target) =>
      buildSnapCandidates(movingBounds, target.bounds, current).flatMap((candidate): SceneSnapCandidate[] => {
        const previewBounds = offsetBounds(movingBounds, candidate.nextPosition, current);
        const collisionBounds = neighborBounds
          .filter((neighbor) => neighbor.partId !== target.partId)
          .map((neighbor) => neighbor.bounds);
        if (collidesWithAny(previewBounds, collisionBounds)) return [];
        return [{
          key: `${target.partId}:${candidate.id}`,
          targetPartId: target.partId,
          candidateId: candidate.id,
          label: `${candidate.label} - ${target.name}`,
          previewBounds,
          nextPosition: candidate.nextPosition,
        }];
      })
    );

    const deduped = new Map<string, SceneSnapCandidate>();
    candidates.forEach((candidate) => {
      const existing = deduped.get(candidate.key);
      if (!existing) {
        deduped.set(candidate.key, candidate);
        return;
      }
      const currentDistance =
        Math.abs(candidate.nextPosition.x - current.x) +
        Math.abs(candidate.nextPosition.y - current.y) +
        Math.abs(candidate.nextPosition.z - current.z);
      const existingDistance =
        Math.abs(existing.nextPosition.x - current.x) +
        Math.abs(existing.nextPosition.y - current.y) +
        Math.abs(existing.nextPosition.z - current.z);
      if (currentDistance < existingDistance) deduped.set(candidate.key, candidate);
    });

    return [...deduped.values()];
  }, [experimentalMoveMode, selected, selectedPartIds, visibleParts]);

  const overlayShowDrilling = useAppStore((s) => s.showDrilling);
  const setOverlayShowDrilling = useAppStore((s) => s.setShowDrilling);
  const overlayXrayMode = useAppStore((s) => s.xrayMode);
  const setOverlayXrayMode = useAppStore((s) => s.setXrayMode);
  const overlayBg = isDarkBlue ? 'rgba(24,24,27,0.82)' : 'rgba(255,255,255,0.88)';
  const overlayBorder = isDarkBlue ? '#3f3f46' : '#d6d3d1';
  const overlayText = isDarkBlue ? '#e5e7eb' : '#222';
  const overlayBtn = (active: boolean): React.CSSProperties => ({
    padding: '4px 9px', borderRadius: 6, fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer',
    border: `1px solid ${active ? '#f59e0b' : overlayBorder}`,
    background: active ? (isDarkBlue ? '#3f2c16' : '#fff7ed') : 'transparent',
    color: active ? (isDarkBlue ? '#fde68a' : '#9a3412') : overlayText,
  });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
      <Canvas camera={{ position: [1600, 900, 1600], fov: 28, near: 10, far: 12000 }} gl={{ antialias: true }} style={{ width: '100%', height: '100%' }} onPointerMissed={() => selectPart(null)}>
        <color attach="background" args={[isDarkBlue ? '#1b1b1d' : '#f5f5f4']} />
        <ambientLight intensity={isDarkBlue ? 1.05 : 1.2} />
        <directionalLight position={[700, 1200, 700]} intensity={isDarkBlue ? 1.1 : 1.25} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorVisualY, 0]} receiveShadow>
          <planeGeometry args={[8000, 8000]} />
          <meshBasicMaterial
            color="#7c7c7c"
            map={floorTexture ?? undefined}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        {showAxisIndicator ? <AxisIndicator parts={visibleParts} /> : null}
        {visibleParts.length === 0 ? <EmptyHint /> : null}
        {visibleParts.map((part) => <PartMesh key={part.id} part={part} />)}
        <DrillMarkerInstances parts={visibleParts} />
        <GrooveMarkers parts={visibleParts} />
        <SectionOverlay />
        <MeasurementOverlay />
        {sceneSnapCandidates.map((candidate) => <SnapPreview key={candidate.key} candidate={candidate} />)}
        {selected && sceneSnapCandidates.length > 0 ? (
          <Html position={[0, 260, 0]} center>
            <div style={{ background: isDarkBlue ? 'rgba(36,36,39,0.96)' : 'rgba(255,255,255,0.95)', border: `1px solid ${isDarkBlue ? '#4ade80' : '#d9f99d'}`, borderRadius: 10, padding: '8px 12px', color: isDarkBlue ? '#bbf7d0' : '#3f6212', fontSize: 13 }}>
              {sceneSnapCandidates.length} {t(language, 'snapCandidates')}
            </div>
          </Html>
        ) : null}
        <CameraRig />
      </Canvas>

      {/* Camera presets + role color overlay */}
      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 5 }}>
        <div style={{ display: 'flex', gap: 4, background: overlayBg, border: `1px solid ${overlayBorder}`, borderRadius: 8, padding: '4px 5px', backdropFilter: 'blur(8px)' }}>
          {(['iso', 'front', 'left', 'top'] as const).map((preset) => (
            <button key={preset} style={overlayBtn(false)} onClick={() => setCameraPreset(preset)} title={preset === 'iso' ? '3D вид' : preset === 'front' ? 'Спереди' : preset === 'left' ? 'Сбоку' : 'Сверху'}>
              {preset === 'iso' ? '⬡' : preset === 'front' ? 'F' : preset === 'left' ? 'L' : 'T'}
            </button>
          ))}
          <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', margin: '2px 1px', background: overlayBorder }} />
          <button style={overlayBtn(overlayShowDrilling)} onClick={() => setOverlayShowDrilling(!overlayShowDrilling)} title={t(language, 'showDrilling')} aria-label={t(language, 'showDrilling')} aria-pressed={overlayShowDrilling}>
            ◉
          </button>
          <button style={overlayBtn(overlayXrayMode)} onClick={() => setOverlayXrayMode(!overlayXrayMode)} title={t(language, 'xrayMode')} aria-label={t(language, 'xrayMode')} aria-pressed={overlayXrayMode}>
            ◐
          </button>
        </div>
        <button
          style={{ ...overlayBtn(showRoleColors), background: showRoleColors ? (isDarkBlue ? '#3f2c16' : '#fff7ed') : overlayBg, backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}
          onClick={() => setShowRoleColors(!showRoleColors)}
          title={language === 'ru' ? 'Цвета по роли' : 'Role colors'}
        >
          {language === 'ru' ? '🎨 Роли' : '🎨 Roles'}
        </button>
        {showRoleColors && (
          <div style={{ background: overlayBg, border: `1px solid ${overlayBorder}`, borderRadius: 8, padding: '6px 8px', fontSize: 10, backdropFilter: 'blur(8px)', display: 'grid', gap: 2 }}>
            {[
              ['#818cf8', language === 'ru' ? 'Боковые' : 'Sides'],
              ['#f472b6', language === 'ru' ? 'Верх/низ' : 'Top/btm'],
              ['#34d399', language === 'ru' ? 'Полки' : 'Shelves'],
              ['#fbbf24', language === 'ru' ? 'Перегородки' : 'Partitions'],
              ['#a78bfa', language === 'ru' ? 'Задняя ст.' : 'Back panel'],
              ['#f87171', language === 'ru' ? 'Фасады' : 'Fronts'],
              ['#22d3ee', language === 'ru' ? 'Плинтус' : 'Plinth'],
              ['#fb923c', language === 'ru' ? 'Ярус-делит.' : 'Tier div.'],
            ].map(([color, label]) => (
              <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ color: overlayText }}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


