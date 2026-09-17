import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore, useProject } from '../app/store';
import type { ProjectSketch } from '../domain/sketch';
import { createSketchFromFile, pickImageFile } from '../infra/sketch-image';
import { IconTrash } from './project-tree';

type Size = { width: number; height: number };
type Point = { x: number; y: number };
type WindowRect = { left: number; bottom: number; width: number; height: number };
type WindowPrefs = { rect: WindowRect; opacity: number; collapsed: boolean };
/** Screen transform of the image inside the viewport; rotation is in quarter turns (0..3). */
type ViewState = { scale: number; tx: number; ty: number; rotation: number };
/** Which window edges a resize drag moves; `null` means the whole window is dragged. */
type ResizeEdges = { top?: boolean; right?: boolean; bottom?: boolean };

const PREFS_STORAGE_KEY = 'furniture_v9:sketch-window:v2';
const HEADER_H = 34;
const TOOLS_H = 32;
const MIN_W = 240;
const MIN_H = 170;
const HIDE_DELAY_MS = 300;
const TOUCH_HIDE_DELAY_MS = 3000;
const ZOOM_STEP = 1.25;

const RU = {
  title: 'Эскиз',
  add: 'Добавить изображение (или Ctrl+V)',
  remove: 'Удалить эскиз из проекта',
  confirmRemove: 'Удалить эскиз из проекта?',
  collapse: 'Свернуть',
  expand: 'Развернуть',
  close: 'Закрыть окно',
  prev: 'Предыдущий эскиз',
  next: 'Следующий эскиз',
  rename: 'Двойной клик — переименовать',
  choose: 'Выбрать изображение',
  loading: 'Загрузка…',
  dropHint: 'или перетащите файл сюда · Ctrl+V — вставить из буфера',
  loadFailed: 'Не удалось загрузить изображение',
  zoomIn: 'Приблизить (+)',
  zoomOut: 'Отдалить (−)',
  fit: 'Вписать (0 или двойной клик по изображению)',
  rotate: 'Повернуть на 90° (R)',
  opacity: 'Непрозрачность',
  sketchName: 'Название эскиза',
};

const EN: typeof RU = {
  title: 'Sketch',
  add: 'Add image (or Ctrl+V)',
  remove: 'Remove sketch from project',
  confirmRemove: 'Remove this sketch from the project?',
  collapse: 'Collapse',
  expand: 'Expand',
  close: 'Close window',
  prev: 'Previous sketch',
  next: 'Next sketch',
  rename: 'Double-click to rename',
  choose: 'Choose image',
  loading: 'Loading…',
  dropHint: 'or drop a file here · Ctrl+V to paste',
  loadFailed: 'Could not load image',
  zoomIn: 'Zoom in (+)',
  zoomOut: 'Zoom out (−)',
  fit: 'Fit (0 or double-click the image)',
  rotate: 'Rotate 90° (R)',
  opacity: 'Opacity',
  sketchName: 'Sketch name',
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function loadPrefs(defaultLeft: number): WindowPrefs {
  const fallback: WindowPrefs = { rect: { left: defaultLeft, bottom: 10, width: 400, height: 300 }, opacity: 1, collapsed: false };
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<WindowPrefs>;
    const rect = parsed.rect;
    if (!rect || ![rect.left, rect.bottom, rect.width, rect.height].every(Number.isFinite)) return fallback;
    return { rect, opacity: clamp(Number(parsed.opacity) || 1, 0.2, 1), collapsed: Boolean(parsed.collapsed) };
  } catch {
    return fallback;
  }
}

function clampRect(rect: WindowRect, container: Size, visibleHeight: number): WindowRect {
  if (!container.width || !container.height) return rect;
  const width = clamp(rect.width, Math.min(MIN_W, container.width), container.width);
  const height = clamp(rect.height, Math.min(MIN_H, container.height), container.height);
  return {
    width,
    height,
    left: clamp(rect.left, 0, container.width - width),
    bottom: clamp(rect.bottom, 0, container.height - Math.min(visibleHeight, height)),
  };
}

function fitView(sketch: ProjectSketch, size: Size, rotation: number): ViewState {
  const rotated = rotation % 2 === 1;
  const w = rotated ? sketch.height : sketch.width;
  const h = rotated ? sketch.width : sketch.height;
  return { scale: Math.max(0.02, Math.min(size.width / w, size.height / h) * 0.96), rotation, tx: size.width / 2, ty: size.height / 2 };
}

function SketchIcon({ path, size = 14 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  plus: 'M8 3.5v9M3.5 8h9',
  close: 'M4 4l8 8M12 4l-8 8',
  collapseDown: 'M4 6l4 4 4-4',
  expandUp: 'M4 10l4-4 4 4',
  prev: 'M10 3.5L5.5 8l4.5 4.5',
  next: 'M6 3.5l4.5 4.5L6 12.5',
  zoomIn: 'M7 4.5v5M4.5 7h5M11 11l3 3M12 7A5 5 0 1 1 2 7a5 5 0 0 1 10 0Z',
  zoomOut: 'M4.5 7h5M11 11l3 3M12 7A5 5 0 1 1 2 7a5 5 0 0 1 10 0Z',
  rotate: 'M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5',
  opacity: 'M8 2.5a5.5 5.5 0 1 0 0 11V2.5ZM8 2.5a5.5 5.5 0 0 1 0 11',
  image: 'M2.5 3.5h11v9h-11zM4.5 10.5l2.5-3 2 2 1.5-1.5 2 2.5',
};

/**
 * Floating reference-drawing window. Mounted in the main layout container so it can be dragged
 * over the side panels. Once a sketch is shown, the frame (header, tools, border) appears only on hover.
 */
export function SketchWindow({ defaultLeft = 10 }: { defaultLeft?: number }) {
  const project = useProject();
  const language = useAppStore((s) => s.language);
  const isDarkBlue = useAppStore((s) => s.themeMode === 'dark-blue');
  const open = useAppStore((s) => s.sketchPanelOpen);
  const activeSketchId = useAppStore((s) => s.activeSketchId);
  const setOpen = useAppStore((s) => s.setSketchPanelOpen);
  const setActiveSketch = useAppStore((s) => s.setActiveSketch);
  const addSketch = useAppStore((s) => s.addSketch);
  const renameSketch = useAppStore((s) => s.renameSketch);
  const removeSketch = useAppStore((s) => s.removeSketch);
  const L = language === 'ru' ? RU : EN;

  const sketches = project.sketches ?? [];
  const sketchIndex = Math.max(0, sketches.findIndex((item) => item.id === activeSketchId));
  const sketch = sketches[sketchIndex] ?? null;

  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const windowDragRef = useRef<{ edges: ResizeEdges | null; startX: number; startY: number; rect: WindowRect } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const cancelRenameRef = useRef(false);
  // Latest view actions for the keyboard handler, which is registered before the early return below.
  const viewActionsRef = useRef<{ fit: () => void; zoom: (factor: number) => void; rotate: () => void } | null>(null);
  const [prefs, setPrefs] = useState<WindowPrefs>(() => loadPrefs(defaultLeft));
  const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 });
  const [views, setViews] = useState<Record<string, ViewState>>({});
  const [hovered, setHovered] = useState(false);
  const [selectFocused, setSelectFocused] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const view = sketch ? views[sketch.id] ?? null : null;
  const showsImage = Boolean(sketch) && !prefs.collapsed;

  const importFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      addSketch(await createSketchFromFile(file));
    } catch {
      setNotice(L.loadFailed);
    } finally {
      setBusy(false);
    }
  }, [addSketch, L]);

  useEffect(() => {
    try { window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs)); } catch { /* per-browser convenience only */ }
  }, [prefs]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.kind === 'file' && entry.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void importFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [importFile]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => () => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
  }, []);

  useEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!open || !parent) return;
    const observer = new ResizeObserver(([entry]) => setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(parent);
    return () => observer.disconnect();
  }, [open]);

  const hasViewport = open && showsImage;
  useEffect(() => {
    const element = viewportRef.current;
    if (!hasViewport || !element) return;
    const observer = new ResizeObserver(([entry]) => setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasViewport]);

  useEffect(() => {
    if (!sketch || !viewportSize.width || !viewportSize.height || views[sketch.id]) return;
    setViews((prev) => ({ ...prev, [sketch.id]: fitView(sketch, viewportSize, 0) }));
  }, [sketch, viewportSize, views]);

  // Stop renaming when another sketch becomes active.
  useEffect(() => {
    setRenaming(false);
  }, [sketch?.id]);

  // View shortcuts while the pointer is over the window: 0 fit, +/- zoom, R rotate (by key position, any layout).
  const keyboardActive = open && hovered && showsImage;
  useEffect(() => {
    if (!keyboardActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const actions = viewActionsRef.current;
      if (!actions) return;
      if (event.key === '0' || event.code === 'Numpad0') actions.fit();
      else if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') actions.zoom(ZOOM_STEP);
      else if (event.key === '-' || event.code === 'NumpadSubtract') actions.zoom(1 / ZOOM_STEP);
      else if (event.code === 'KeyR') actions.rotate();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keyboardActive]);

  if (!open) return null;

  const chromeVisible = !showsImage || hovered || selectFocused || renaming || busy || dropActive || Boolean(notice);
  const rect = clampRect(prefs.rect, containerSize, prefs.collapsed || !sketch ? HEADER_H : HEADER_H + TOOLS_H);
  const c = isDarkBlue
    ? { bg: 'rgba(24,24,27,0.96)', header: 'rgba(39,39,42,0.94)', border: '#3f3f46', text: '#e5e7eb', muted: '#a1a1aa', viewport: 'rgba(15,15,17,0.9)', btn: '#27272a', hover: 'rgba(255,255,255,0.08)' }
    : { bg: 'rgba(255,255,255,0.97)', header: 'rgba(245,245,244,0.94)', border: '#d6d3d1', text: '#1c1917', muted: '#78716c', viewport: 'rgba(231,229,228,0.9)', btn: '#fff', hover: 'rgba(0,0,0,0.06)' };
  const iconButton = (disabled = false, color?: string): React.CSSProperties => ({
    width: 26, height: 26, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    border: 'none', borderRadius: 6, background: 'transparent', color: color ?? c.text,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
  });
  const chromeFade: React.CSSProperties = {
    opacity: chromeVisible ? 1 : 0,
    pointerEvents: chromeVisible ? 'auto' : 'none',
    transition: 'opacity 160ms ease',
  };

  const showChrome = () => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
    setHovered(true);
  };
  const scheduleHide = (delay: number) => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setHovered(false);
    }, delay);
  };

  const setView = (next: ViewState) => {
    if (sketch) setViews((prev) => ({ ...prev, [sketch.id]: next }));
  };
  const viewportCenter = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
  const zoomAt = (point: Point, factor: number) => {
    if (!view) return;
    const scale = clamp(view.scale * factor, 0.02, 40);
    const k = scale / view.scale;
    setView({ ...view, scale, tx: point.x - (point.x - view.tx) * k, ty: point.y - (point.y - view.ty) * k });
  };
  const fitCurrent = () => { if (sketch && view) setView(fitView(sketch, viewportSize, view.rotation)); };
  const rotateCurrent = () => { if (sketch && view) setView(fitView(sketch, viewportSize, (view.rotation + 1) % 4)); };
  viewActionsRef.current = { fit: fitCurrent, zoom: (factor) => zoomAt(viewportCenter, factor), rotate: rotateCurrent };
  // 100% = the image fits the window.
  const zoomPercent = sketch && view ? Math.round((view.scale / fitView(sketch, viewportSize, view.rotation).scale) * 100) : 100;

  const localPoint = (event: { clientX: number; clientY: number }): Point => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    return bounds ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top } : { x: 0, y: 0 };
  };

  const pickFile = async () => importFile(await pickImageFile());

  const startWindowDrag = (edges: ResizeEdges | null) => (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (!edges && (event.target as HTMLElement).closest('button,select,input'))) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    windowDragRef.current = { edges, startX: event.clientX, startY: event.clientY, rect };
  };
  const moveWindowDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = windowDragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    let next: WindowRect;
    if (!drag.edges) {
      next = { ...drag.rect, left: drag.rect.left + dx, bottom: drag.rect.bottom - dy };
    } else {
      next = { ...drag.rect };
      if (drag.edges.right) next.width = drag.rect.width + dx;
      // The window is anchored by its bottom edge: the top edge changes only the height…
      if (drag.edges.top) {
        const roomAbove = containerSize.height > 0 ? containerSize.height - drag.rect.bottom : Number.POSITIVE_INFINITY;
        next.height = Math.min(drag.rect.height - dy, roomAbove);
      }
      // …while growing downwards must also lower `bottom`.
      if (drag.edges.bottom) {
        const grow = Math.min(dy, drag.rect.bottom);
        next.height = drag.rect.height + grow;
        next.bottom = drag.rect.bottom - grow;
      }
    }
    setPrefs((prev) => ({ ...prev, rect: clampRect(next, containerSize, prev.collapsed ? HEADER_H : HEADER_H + TOOLS_H) }));
  };
  const endWindowDrag = () => { windowDragRef.current = null; };
  const resizeHandlers = (edges: ResizeEdges) => ({
    onPointerDown: startWindowDrag(edges),
    onPointerMove: moveWindowDrag,
    onPointerUp: endWindowDrag,
    onPointerCancel: endWindowDrag,
  });

  const toggleCollapsed = () => setPrefs((prev) => ({ ...prev, collapsed: !prev.collapsed }));

  const switchSketch = (step: number) => {
    if (sketches.length < 2) return;
    const nextSketch = sketches[(sketchIndex + step + sketches.length) % sketches.length];
    if (nextSketch) setActiveSketch(nextSketch.id);
  };

  const startRename = () => {
    if (!sketch) return;
    cancelRenameRef.current = false;
    setRenameDraft(sketch.name);
    setRenaming(true);
  };
  const commitRename = () => {
    setRenaming(false);
    const name = renameDraft.trim();
    if (cancelRenameRef.current || !sketch || !name || name === sketch.name) return;
    renameSketch(sketch.id, name);
  };

  const handleRemoveSketch = () => {
    if (!sketch || !window.confirm(L.confirmRemove)) return;
    removeSketch(sketch.id);
  };

  const header = (
    <div
      onPointerDown={startWindowDrag(null)}
      onPointerMove={moveWindowDrag}
      onPointerUp={endWindowDrag}
      onPointerCancel={endWindowDrag}
      style={{
        height: HEADER_H, display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px 0 8px', boxSizing: 'border-box', cursor: 'move', touchAction: 'none',
        background: c.header, borderBottom: `1px solid ${c.border}`, backdropFilter: 'blur(6px)',
        ...(showsImage ? { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, ...chromeFade } : { flex: '0 0 auto' }),
      }}
    >
      <span style={{ display: 'inline-flex', color: c.muted, marginRight: 4 }}><SketchIcon path={ICONS.image} /></span>
      {sketch && renaming ? (
        <input
          autoFocus
          value={renameDraft}
          onChange={(event) => setRenameDraft(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancelRenameRef.current = true;
            if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
          }}
          aria-label={L.sketchName}
          style={{ flex: 1, minWidth: 0, height: 24, padding: '0 6px', borderRadius: 5, border: '1px solid #f59e0b', background: c.btn, color: c.text, fontSize: 12, fontWeight: 600, outline: 'none' }}
        />
      ) : (
        <span
          data-rename=""
          onDoubleClick={startRename}
          title={sketch ? L.rename : undefined}
          style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: sketch ? c.text : c.muted }}
        >
          {sketch?.name ?? L.title}
        </span>
      )}
      {sketches.length > 1 ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', flex: '0 0 auto', fontSize: 11, color: c.muted, fontVariantNumeric: 'tabular-nums' }}>
          <button className="sk-btn" onClick={() => switchSketch(-1)} title={L.prev} aria-label={L.prev} style={iconButton()}><SketchIcon path={ICONS.prev} /></button>
          {sketchIndex + 1}/{sketches.length}
          <button className="sk-btn" onClick={() => switchSketch(1)} title={L.next} aria-label={L.next} style={iconButton()}><SketchIcon path={ICONS.next} /></button>
        </span>
      ) : null}
      <button className="sk-btn" disabled={busy} onClick={() => { void pickFile(); }} title={L.add} aria-label={L.add} style={iconButton(busy)}><SketchIcon path={ICONS.plus} /></button>
      {sketch ? (
        <button className="sk-btn" onClick={toggleCollapsed} title={prefs.collapsed ? L.expand : L.collapse} aria-label={prefs.collapsed ? L.expand : L.collapse} style={iconButton()}>
          <SketchIcon path={prefs.collapsed ? ICONS.expandUp : ICONS.collapseDown} />
        </button>
      ) : null}
      <button className="sk-btn" onClick={() => setOpen(false)} title={L.close} aria-label={L.close} style={iconButton()}><SketchIcon path={ICONS.close} /></button>
    </div>
  );

  const edgeHandleBase: React.CSSProperties = { position: 'absolute', zIndex: 4, touchAction: 'none', ...chromeFade };

  return (
    <div
      ref={rootRef}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') showChrome(); }}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') scheduleHide(HIDE_DELAY_MS); }}
      onPointerDownCapture={(event) => {
        if (event.pointerType === 'mouse') return;
        showChrome();
        scheduleHide(TOUCH_HIDE_DELAY_MS);
      }}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        void importFile(event.dataTransfer.files[0]);
      }}
      style={{
        position: 'absolute', left: rect.left, bottom: rect.bottom, width: rect.width, height: showsImage || !sketch ? rect.height : HEADER_H,
        zIndex: 30, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', borderRadius: 10,
        border: `1px solid ${dropActive ? '#f59e0b' : chromeVisible ? c.border : 'transparent'}`,
        background: showsImage ? 'transparent' : c.bg,
        boxShadow: chromeVisible ? '0 10px 28px rgba(0,0,0,0.28)' : 'none',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        color: c.text, fontSize: 12, userSelect: 'none',
      }}
    >
      <style>{`
        .sk-btn:not(:disabled):hover { background: ${c.hover} !important; }
        .sk-btn:focus { outline: none; }
        .sk-btn:focus-visible { outline: 2px solid #f59e0b; outline-offset: -2px; }
      `}</style>
      {/* Inner clip keeps rounded corners while the resize handles may sit on the border. */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 9, overflow: 'hidden' }}>
        {header}

        {showsImage && sketch ? (
          <>
            <div
              style={{
                position: 'absolute', top: HEADER_H, left: 0, right: 0, height: TOOLS_H, zIndex: 2, boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px', overflowX: 'auto', scrollbarWidth: 'none',
                background: c.header, borderBottom: `1px solid ${c.border}`, backdropFilter: 'blur(6px)', ...chromeFade,
              }}
            >
              <button className="sk-btn" disabled={!view} onClick={() => zoomAt(viewportCenter, 1 / ZOOM_STEP)} title={L.zoomOut} aria-label={L.zoomOut} style={iconButton(!view)}><SketchIcon path={ICONS.zoomOut} /></button>
              <button
                className="sk-btn"
                disabled={!view}
                onClick={fitCurrent}
                title={L.fit}
                style={{ ...iconButton(!view), width: 46, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
              >
                {zoomPercent}%
              </button>
              <button className="sk-btn" disabled={!view} onClick={() => zoomAt(viewportCenter, ZOOM_STEP)} title={L.zoomIn} aria-label={L.zoomIn} style={iconButton(!view)}><SketchIcon path={ICONS.zoomIn} /></button>
              <button className="sk-btn" disabled={!view} onClick={rotateCurrent} title={L.rotate} aria-label={L.rotate} style={iconButton(!view)}><SketchIcon path={ICONS.rotate} /></button>
              <span aria-hidden="true" style={{ width: 1, height: 16, margin: '0 4px', background: c.border, flex: '0 0 auto' }} />
              <label title={L.opacity} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto', color: c.muted }}>
                <SketchIcon path={ICONS.opacity} />
                <input
                  type="range" min={0.2} max={1} step={0.05} value={prefs.opacity} aria-label={L.opacity}
                  onFocus={() => setSelectFocused(true)}
                  onBlur={() => setSelectFocused(false)}
                  onChange={(event) => setPrefs((prev) => ({ ...prev, opacity: Number(event.target.value) }))}
                  style={{ width: 64, accentColor: '#f59e0b' }}
                />
              </label>
              {notice ? <span style={{ marginLeft: 6, fontSize: 11, color: '#ef4444', whiteSpace: 'nowrap' }}>{notice}</span> : null}
              <span style={{ flex: 1 }} />
              <button className="sk-btn" onClick={handleRemoveSketch} title={L.remove} aria-label={L.remove} style={iconButton(false, '#ef4444')}><IconTrash /></button>
            </div>

            <div
              ref={viewportRef}
              onPointerDown={(event) => {
                if (!view || (event.button !== 0 && event.button !== 1)) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                panRef.current = { startX: event.clientX, startY: event.clientY, tx: view.tx, ty: view.ty };
              }}
              onPointerMove={(event) => {
                const pan = panRef.current;
                if (!pan || !view) return;
                setView({ ...view, tx: pan.tx + event.clientX - pan.startX, ty: pan.ty + event.clientY - pan.startY });
              }}
              onPointerUp={() => { panRef.current = null; }}
              onPointerCancel={() => { panRef.current = null; }}
              onDoubleClick={fitCurrent}
              onWheel={(event) => zoomAt(localPoint(event), Math.exp(-event.deltaY * 0.0015))}
              style={{
                position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'grab', touchAction: 'none', opacity: prefs.opacity,
                background: chromeVisible ? c.viewport : 'transparent', transition: 'background-color 160ms ease',
              }}
            >
              {view ? (
                <img
                  src={sketch.dataUrl}
                  alt={sketch.name}
                  draggable={false}
                  style={{
                    position: 'absolute', left: 0, top: 0, width: sketch.width, height: sketch.height, maxWidth: 'none', pointerEvents: 'none', transformOrigin: '0 0',
                    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale}) rotate(${view.rotation * 90}deg) translate(${-sketch.width / 2}px, ${-sketch.height / 2}px)`,
                  }}
                />
              ) : null}
            </div>
          </>
        ) : !sketch ? (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 16, textAlign: 'center' }}>
            <div>
              <button
                onClick={() => { void pickFile(); }}
                disabled={busy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #f59e0b', background: '#f59e0b', color: '#111', fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}
              >
                <SketchIcon path={ICONS.plus} />
                {busy ? L.loading : L.choose}
              </button>
              <div style={{ marginTop: 8, fontSize: 11, color: c.muted }}>{L.dropHint}</div>
              {notice ? <div style={{ marginTop: 6, fontSize: 11, color: '#ef4444' }}>{notice}</div> : null}
            </div>
          </div>
        ) : null}
      </div>

      {showsImage ? (
        <>
          {/* Resize: top and right edges plus both right corners. */}
          <div {...resizeHandlers({ top: true })} style={{ ...edgeHandleBase, top: -3, left: 12, right: 12, height: 6, cursor: 'ns-resize' }} />
          <div {...resizeHandlers({ right: true })} style={{ ...edgeHandleBase, top: 12, bottom: 12, right: -3, width: 6, cursor: 'ew-resize' }} />
          <div {...resizeHandlers({ top: true, right: true })} style={{ ...edgeHandleBase, top: -4, right: -4, width: 14, height: 14, cursor: 'nesw-resize' }} />
          <div
            {...resizeHandlers({ bottom: true, right: true })}
            style={{
              ...edgeHandleBase, right: 0, bottom: 0, width: 16, height: 16, cursor: 'nwse-resize', borderBottomRightRadius: 9,
              background: `linear-gradient(135deg, transparent 50%, ${c.border} 50%, ${c.border} 62%, transparent 62%, transparent 74%, ${c.border} 74%, ${c.border} 86%, transparent 86%)`,
            }}
          />
        </>
      ) : null}
    </div>
  );
}
