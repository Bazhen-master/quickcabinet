// Shift+перетаскивание полки в 3D: превью, магнит к полкам соседних секций, фиксация в раскладке шкафа при отпускании.
import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Edges, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore, useProject } from '../app/store';
import { getShelfDragRange, getShelfSnapTargets, snapShelfY } from '../domain/shelf-drag';
import type { Part } from '../domain/part';

/** Pull distance of the magnet, mm. */
const SNAP_THRESHOLD = 25;

type DragEnvironment = { camera: THREE.Camera; canvas: HTMLCanvasElement; controls: { enabled: boolean } | null };

/** Camera, canvas and orbit controls of the scene, kept by the controller so a drag can start inside the pointer-down itself. */
let environment: DragEnvironment | null = null;

/**
 * Starts a drag from a pointer-down on a shelf; returns false when the event is not a shelf drag.
 * Listeners go on right here, not in an effect: a quick drag sends its moves (and the release) before React renders.
 */
export function startShelfDrag(part: Part, event: { shiftKey: boolean; button: number }) {
  const state = useAppStore.getState();
  const env = environment;
  if (!env || !event.shiftKey || event.button !== 0 || part.meta?.role !== 'shelf' || !part.meta.sourceId || state.activeTool !== 'select') return false;
  const parts = state.history.present.parts;
  const range = getShelfDragRange(parts, part);
  const targets = getShelfSnapTargets(parts, part);
  const controls = env.controls;
  if (controls) controls.enabled = false;
  state.setShelfDrag({ partId: part.id, startY: part.position.y, y: part.position.y, targetPartId: null });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const onMove = (moveEvent: PointerEvent) => {
    const rect = env.canvas.getBoundingClientRect();
    pointer.set(((moveEvent.clientX - rect.left) / rect.width) * 2 - 1, -((moveEvent.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, env.camera);
    // A vertical plane through the shelf, turned to the camera: the pointer's height on it is the shelf height.
    const normal = new THREE.Vector3();
    env.camera.getWorldDirection(normal);
    normal.y = 0;
    if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
    normal.normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(part.position.x, part.position.y, part.position.z));
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const snapped = snapShelfY(hit.y, range, targets, SNAP_THRESHOLD);
    const current = useAppStore.getState().shelfDrag;
    const targetPartId = snapped.target?.partId ?? null;
    if (!current || (current.y === snapped.y && current.targetPartId === targetPartId)) return;
    useAppStore.getState().setShelfDrag({ ...current, y: snapped.y, targetPartId });
  };
  const finish = (commit: boolean) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    if (controls) controls.enabled = true;
    const { shelfDrag, setShelfDrag, moveShelfToHeight } = useAppStore.getState();
    setShelfDrag(null);
    if (commit && shelfDrag && Math.abs(shelfDrag.y - shelfDrag.startY) >= 0.5) moveShelfToHeight(shelfDrag.partId, shelfDrag.y);
  };
  const onUp = (upEvent: PointerEvent) => { onMove(upEvent); finish(true); };
  const onKey = (keyEvent: KeyboardEvent) => { if (keyEvent.key === 'Escape') finish(false); };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  return true;
}

export function ShelfDragController() {
  const project = useProject();
  const drag = useAppStore((s) => s.shelfDrag);
  const isDarkBlue = useAppStore((s) => s.themeMode === 'dark-blue');
  const language = useAppStore((s) => s.language);
  const { camera, gl, controls } = useThree();
  useEffect(() => {
    environment = { camera, canvas: gl.domElement, controls: controls as unknown as { enabled: boolean } | null };
    return () => { environment = null; };
  }, [camera, controls, gl]);

  const partId = drag?.partId ?? null;
  const shelf = useMemo(() => (partId ? project.parts.find((part) => part.id === partId) ?? null : null), [partId, project.parts]);
  const range = useMemo(() => (shelf ? getShelfDragRange(project.parts, shelf) : null), [project.parts, shelf]);
  if (!drag || !shelf || !range) return null;

  const target = drag.targetPartId ? project.parts.find((part) => part.id === drag.targetPartId) ?? null : null;
  const color = target ? '#22c55e' : '#f59e0b';
  const mm = language === 'ru' ? 'мм' : 'mm';
  // The range already holds the shelf's half thickness, so these are the clear gaps to the panels below and above.
  const gapBelow = Number.isFinite(range.min) ? Math.round(drag.y - range.min) : null;
  const gapAbove = Number.isFinite(range.max) ? Math.round(range.max - drag.y) : null;
  const guideFromX = target ? Math.min(shelf.position.x - shelf.width / 2, target.position.x - target.width / 2) : 0;
  const guideToX = target ? Math.max(shelf.position.x + shelf.width / 2, target.position.x + target.width / 2) : 0;
  const frontZ = shelf.position.z + shelf.thickness / 2 + 2;
  return (
    <>
      <mesh position={[shelf.position.x, drag.y, shelf.position.z]} renderOrder={40}>
        <boxGeometry args={[shelf.width, shelf.height, shelf.thickness]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} depthTest={false} depthWrite={false} />
        <Edges color={color} lineWidth={2} renderOrder={41} />
      </mesh>
      {target ? <Line points={[[guideFromX, drag.y, frontZ], [guideToX, drag.y, frontZ]]} color={color} lineWidth={2} dashed dashSize={20} gapSize={12} depthTest={false} renderOrder={42} /> : null}
      <Html position={[shelf.position.x + shelf.width / 2, drag.y, frontZ]} style={{ pointerEvents: 'none' }}>
        <div style={{ marginLeft: 12, transform: 'translateY(-50%)', fontSize: 12, whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: 6, border: `1px solid ${color}`, background: isDarkBlue ? 'rgba(24,24,27,0.94)' : 'rgba(255,255,255,0.96)', color: isDarkBlue ? '#f4f4f5' : '#111', lineHeight: 1.45 }}>
          {gapAbove !== null ? <div>↑ {Math.max(0, gapAbove)} {mm}</div> : null}
          {gapBelow !== null ? <div>↓ {Math.max(0, gapBelow)} {mm}</div> : null}
          {target ? <div style={{ color: '#16a34a', fontWeight: 600 }}>{language === 'ru' ? 'вровень с соседней полкой' : 'level with the neighbour'}</div> : null}
        </div>
      </Html>
    </>
  );
}
