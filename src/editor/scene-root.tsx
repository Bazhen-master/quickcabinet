import { Canvas, useThree } from '@react-three/fiber';
import { Edges, Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, useProject } from '../app/store';
import { getCabinetModuleState, getLeafSectionInnerSpan, getLeafTierSections } from '../domain/cabinet-builder';
import { buildSnapCandidates, collidesWithAny, getBounds, getProjectCenter, type PartBounds } from '../domain/geometry';
import type { Part, PartFace } from '../domain/part';
import { getDrillGroupToken } from '../domain/project';
import { getDrillConflictIds } from '../domain/drill-spacing';
import { t } from '../i18n';

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

function getMarkerVisualLength(op: Part['operations'][number], isSelected: boolean, holeLength: number) {
  if (op.through) return Math.max(holeLength, 4);
  if (op.feature === 'cam-housing') return Math.min(Math.max(op.depth, 4), 12);
  if (op.feature === 'hinge-cup') return Math.min(Math.max(op.depth, 8), 13);
  return Math.max(holeLength, isSelected ? 2.4 : 1.2);
}

function DrillMarkers({ part }: { part: Part }) {
  const project = useProject();
  const selected = useAppStore((s) => s.selected);
  const selectedPartIds = useAppStore((s) => s.selectedPartIds);
  const selectedDrill = useAppStore((s) => s.selectedDrill);
  const selectDrillOperation = useAppStore((s) => s.selectDrillOperation);
  const showDrilling = useAppStore((s) => s.showDrilling);
  const isSelected = selectedPartIds.includes(part.id) || ((selected?.type === 'part' || selected?.type === 'face') && selected.partId === part.id);
  const conflictIds = useMemo(() => new Set(getDrillConflictIds(part)), [part]);
  const selectedDrillToken = useMemo(() => {
    if (!selectedDrill) return null;
    const selectedPart = project.parts.find((item) => item.id === selectedDrill.partId);
    const selectedOp = selectedPart?.operations.find((op) => op.id === selectedDrill.opId);
    return selectedPart && selectedOp ? getDrillGroupToken(selectedDrill.partId, selectedOp) : null;
  }, [project.parts, selectedDrill]);
  if (!showDrilling) return null;
  return <>{part.operations.map((op) => {
    const isDrillSelected = !!selectedDrillToken && getDrillGroupToken(part.id, op) === selectedDrillToken;
    const isConflict = conflictIds.has(op.id);
    const surfacePosition = getMarkerSurfacePosition(part, op.face, op.x, op.y);
    const axis = getAxisVector(op.axis);
    const holeLength = getHoleLength(part, op.axis, op.depth, op.through);
    const visualLength = getMarkerVisualLength(op, isSelected || isDrillSelected, holeLength);
    const position = surfacePosition.clone().add(axis.clone().multiplyScalar(visualLength / 2));
    const linePoints = [
      surfacePosition.clone(),
      surfacePosition.clone().add(axis.clone().multiplyScalar(visualLength)),
    ];
    return (
      <group key={op.id}>
        <mesh position={position} rotation={getMarkerRotation(op.axis)} onClick={(e) => { e.stopPropagation(); selectDrillOperation(part.id, op.id); }}>
          <cylinderGeometry args={[Math.max(op.diameter / 2, isSelected || isDrillSelected ? 2.6 : 1.6), Math.max(op.diameter / 2, isSelected || isDrillSelected ? 2.6 : 1.6), visualLength, 24]} />
          <meshStandardMaterial {...getMarkerColor(op.feature, isSelected || isDrillSelected, op.through, isConflict)} emissiveIntensity={isSelected || isDrillSelected || isConflict ? 0.45 : 0.15} />
        </mesh>
        {isDrillSelected && op.feature === 'cam-housing' ? (
          <mesh position={surfacePosition}>
            <sphereGeometry args={[1.4, 12, 12]} />
            <meshBasicMaterial color="#111827" />
          </mesh>
        ) : null}
        {isDrillSelected ? <Line points={linePoints} color="#dc2626" lineWidth={1} /> : null}
      </group>
    );
  })}</>;
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
  const selected = useAppStore((s) => s.selected);
  const measuredFaces = useAppStore((s) => s.measuredFaces);
  const selectFace = useAppStore((s) => s.selectFace);
  const addHoleToFace = useAppStore((s) => s.addHoleToFace);
  const isActive = selected?.type === 'face' && selected.partId === part.id && selected.face === face;
  const isMeasured = measuredFaces.some((item) => item?.partId === part.id && item.face === face);
  const isVisible = activeTool === 'place-hole' || activeTool === 'measure' || isActive || isMeasured || (selected?.type === 'part' && selected.partId === part.id);
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

function PartMesh({ part }: { part: Part }) {
  const selected = useAppStore((s) => s.selected);
  const selectedPartIds = useAppStore((s) => s.selectedPartIds);
  const selectPart = useAppStore((s) => s.selectPart);
  const xrayMode = useAppStore((s) => s.xrayMode);
  const themeMode = useAppStore((s) => s.themeMode);
  const isDarkBlue = themeMode === 'dark-blue';
  const isSelected = selectedPartIds.includes(part.id) || ((selected?.type === 'part' || selected?.type === 'face') && selected.partId === part.id);
  const isGroupSelected = selected?.type === 'group' && selected.groupId === part.meta?.groupId;
  const showSingleLabel = (selected?.type === 'part' || selected?.type === 'face') && selected.partId === part.id && selectedPartIds.length <= 1;
  const boxArgs = useMemo<[number, number, number]>(() => [part.width, part.height, part.thickness], [part.width, part.height, part.thickness]);
  const xrayOpacity = isSelected || isGroupSelected ? 0.48 : 0.22;
  return (
    <group position={[part.position.x, part.position.y, part.position.z]}>
      <mesh
        renderOrder={xrayMode ? 10 : 1}
        onClick={(e) => { e.stopPropagation(); selectPart(part.id, !!(e.nativeEvent as MouseEvent).ctrlKey || !!(e.nativeEvent as MouseEvent).metaKey); }}
      >
        <boxGeometry args={boxArgs} />
        <meshStandardMaterial
          color={isSelected || isGroupSelected ? '#f5d0a9' : (isDarkBlue ? '#f1f5f9' : '#d6d3d1')}
          transparent={xrayMode}
          opacity={xrayMode ? xrayOpacity : 1}
          side={xrayMode ? THREE.DoubleSide : THREE.FrontSide}
          depthWrite={!xrayMode}
          depthTest={!xrayMode}
          polygonOffset
          polygonOffsetFactor={xrayMode ? 2 : 1}
          polygonOffsetUnits={xrayMode ? 2 : 1}
        />
        <Edges renderOrder={xrayMode ? 20 : 2} color={isDarkBlue ? '#8b8b92' : '#444'} />
      </mesh>
      <FaceLayer part={part} face="front" position={[0, 0, part.thickness / 2 + 0.6]} rotation={[0, 0, 0]} size={[part.width, part.height]} />
      <FaceLayer part={part} face="back" position={[0, 0, -part.thickness / 2 - 0.6]} rotation={[0, Math.PI, 0]} size={[part.width, part.height]} />
      <FaceLayer part={part} face="top" position={[0, part.height / 2 + 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} size={[part.width, part.thickness]} />
      <FaceLayer part={part} face="bottom" position={[0, -part.height / 2 - 0.6, 0]} rotation={[Math.PI / 2, 0, 0]} size={[part.width, part.thickness]} />
      <FaceLayer part={part} face="left" position={[-part.width / 2 - 0.6, 0, 0]} rotation={[0, Math.PI / 2, 0]} size={[part.thickness, part.height]} />
      <FaceLayer part={part} face="right" position={[part.width / 2 + 0.6, 0, 0]} rotation={[0, -Math.PI / 2, 0]} size={[part.thickness, part.height]} />
      <DrillMarkers part={part} />
      {showSingleLabel && <Html position={[0, part.height / 2 + 22, 0]} center><div style={{ fontSize: 12, background: isDarkBlue ? 'rgba(36,36,39,0.94)' : 'rgba(255,255,255,0.92)', color: isDarkBlue ? '#f4f4f5' : '#111', padding: '2px 6px', borderRadius: 6, border: `1px solid ${isDarkBlue ? '#52525b' : '#ddd'}`, whiteSpace: 'nowrap' }}>{part.name}</div></Html>}
    </group>
  );
}

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
  const selectedSection = useAppStore((s) => s.selectedSection);
  const setSelectedSection = useAppStore((s) => s.setSelectedSection);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);

  const moduleState = useMemo(() => {
    if (!selected) return null;
    if (selected.type === 'group') return getCabinetModuleState(project.parts, selected.groupId);
    const groupId = project.parts.find((part) => part.id === selected.partId)?.meta?.groupId;
    return groupId ? getCabinetModuleState(project.parts, groupId) : null;
  }, [project.parts, selected]);

  const sections = useMemo(() => moduleState ? getLeafTierSections(moduleState) : [], [moduleState]);
  if (!moduleState || sections.length === 0 || selectionMode !== 'group') return null;

  const planeZ = moduleState.position.z + moduleState.depth / 2 + 6;

  return (
    <>
      {sections.map((section, idx) => {
        const innerSpan = getLeafSectionInnerSpan(moduleState, section);
        const isActive = selectedSection?.groupId === moduleState.groupId && selectedSection.sectionId === section.id && (!selectedSection.tierId || selectedSection.tierId === section.tierId);
        const isHovered = hoveredSectionId === section.id;
        const color = isActive ? '#f59e0b' : isHovered ? '#60a5fa' : '#94a3b8';
        const opacity = isActive ? 0.22 : isHovered ? 0.16 : 0.08;
        const overlayHeight = Math.max(section.clearHeight, 8);
        const overlayCenterY = (section.startY + section.endY) / 2;
        return (
          <group key={section.id} position={[moduleState.position.x + innerSpan.centerX, overlayCenterY, planeZ]}>
            <mesh
              onPointerOver={(e) => { e.stopPropagation(); setHoveredSectionId(section.id); }}
              onPointerOut={(e) => { e.stopPropagation(); setHoveredSectionId((current) => current === section.id ? null : current); }}
              onClick={(e) => { e.stopPropagation(); setSelectedSection(moduleState.groupId, section.id, section.tierId); }}
            >
              <planeGeometry args={[Math.max(innerSpan.width, 8), overlayHeight]} />
              <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            {(isActive || isHovered) ? <Html position={[0, overlayHeight / 2 + 18, 0]} center><div style={{ fontSize: 12, background: 'rgba(255,255,255,0.96)', padding: '2px 6px', borderRadius: 6, border: `1px solid ${color}`, whiteSpace: 'nowrap' }}>{`Tier ${section.tierIndex + 1} • Section ${idx + 1}`}</div></Html> : null}
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
  const { camera } = useThree();
  useEffect(() => {
    if (!controlsRef.current) return;
    if (!initializedRef.current) {
      controlsRef.current.target.copy(getCameraCenter(project, cameraState));
      controlsRef.current.update();
      initializedRef.current = true;
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
    camera.near = 1; camera.far = 30000; camera.updateProjectionMatrix();
  }, [camera, cameraState, project]);
  return <OrbitControls ref={controlsRef} makeDefault maxPolarAngle={Math.PI / 2.05} enableDamping dampingFactor={0.08} />;
}

function EmptyHint() {
  const language = useAppStore((s) => s.language);
  const themeMode = useAppStore((s) => s.themeMode);
  const isDarkBlue = themeMode === 'dark-blue';
  return <Html center><div style={{ background: isDarkBlue ? 'rgba(36,36,39,0.96)' : 'rgba(255,255,255,0.95)', border: `1px solid ${isDarkBlue ? '#52525b' : '#ddd'}`, borderRadius: 10, padding: '12px 16px', color: isDarkBlue ? '#e5e7eb' : '#444', fontSize: 14 }}>{t(language, 'workspaceHint')}</div></Html>;
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
  const floorVisualY = -2.5;
  const visibleParts = useMemo(() => project.parts.filter((part) => !part.meta?.hidden), [project.parts]);
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

  return <Canvas camera={{ position: [1600, 900, 1600], fov: 28, near: 10, far: 12000 }} gl={{ antialias: true }} onPointerMissed={() => selectPart(null)}>
    <color attach="background" args={[isDarkBlue ? '#1b1b1d' : '#f5f5f4']} />
    <ambientLight intensity={isDarkBlue ? 1.05 : 1.2} />
    <directionalLight position={[700, 1200, 700]} intensity={isDarkBlue ? 1.1 : 1.25} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorVisualY, 0]} receiveShadow><planeGeometry args={[8000, 8000]} /><meshStandardMaterial color={isDarkBlue ? '#242629' : '#e5e7eb'} side={THREE.DoubleSide} /></mesh>
    <gridHelper args={[8000, 80, isDarkBlue ? '#4b5563' : '#94a3b8', isDarkBlue ? '#2f3540' : '#cbd5e1']} position={[0, 1, 0]} />
    {showAxisIndicator ? <AxisIndicator parts={visibleParts} /> : null}
    {visibleParts.length === 0 ? <EmptyHint /> : null}
    {visibleParts.map((part) => <PartMesh key={part.id} part={part} />)}
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
  </Canvas>;
}
