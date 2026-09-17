// Иконки вариантов фасада как на мебельном чертеже: петли, ручка и пунктир открывания с вершиной у петель.
import type { CabinetFrontHinge, CabinetFrontKind } from '../domain/cabinet-layout';

type LeafProps = { x: number; y: number; w: number; h: number; hinge: CabinetFrontHinge };

function Leaf({ x, y, w, h, hinge }: LeafProps) {
  const right = x + w;
  const bottom = y + h;
  const midX = x + w / 2;
  const midY = y + h / 2;
  // Opening lines: from the corners of the free edge to the middle of the hinge edge.
  const swing = hinge === 'left'
    ? `M${right} ${y} L${x} ${midY} L${right} ${bottom}`
    : hinge === 'right'
      ? `M${x} ${y} L${right} ${midY} L${x} ${bottom}`
      : hinge === 'top'
        ? `M${x} ${bottom} L${midX} ${y} L${right} ${bottom}`
        : `M${x} ${y} L${midX} ${bottom} L${right} ${y}`;
  const vertical = hinge === 'left' || hinge === 'right';
  const hingeLen = 3.2;
  const hinges = vertical
    ? [y + h * 0.22, bottom - h * 0.22].map((cy) => ({ x1: hinge === 'left' ? x + 1.4 : right - 1.4, y1: cy - hingeLen / 2, x2: hinge === 'left' ? x + 1.4 : right - 1.4, y2: cy + hingeLen / 2 }))
    : [x + w * 0.24, right - w * 0.24].map((cx) => ({ x1: cx - hingeLen / 2, y1: hinge === 'top' ? y + 1.4 : bottom - 1.4, x2: cx + hingeLen / 2, y2: hinge === 'top' ? y + 1.4 : bottom - 1.4 }));
  const handle = hinge === 'left'
    ? { x1: right - 2.6, y1: midY - 2.5, x2: right - 2.6, y2: midY + 2.5 }
    : hinge === 'right'
      ? { x1: x + 2.6, y1: midY - 2.5, x2: x + 2.6, y2: midY + 2.5 }
      : hinge === 'top'
        ? { x1: midX - 2.5, y1: bottom - 2.6, x2: midX + 2.5, y2: bottom - 2.6 }
        : { x1: midX - 2.5, y1: y + 2.6, x2: midX + 2.5, y2: y + 2.6 };
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={1} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <path d={swing} fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray="2 1.6" opacity={0.75} />
      {hinges.map((line, index) => <line key={index} {...line} stroke="#f59e0b" strokeWidth={2.2} strokeLinecap="round" />)}
      <line {...handle} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </>
  );
}

export function FrontIcon({ kind, hinge, size = 30 }: { kind: CabinetFrontKind; hinge: CabinetFrontHinge; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" style={{ display: 'block', flex: '0 0 auto' }}>
      {kind === 'double' ? (
        <>
          <Leaf x={3} y={3} w={10.6} h={22} hinge="left" />
          <Leaf x={14.4} y={3} w={10.6} h={22} hinge="right" />
        </>
      ) : kind === 'door' ? (
        <Leaf x={6} y={3} w={16} h={22} hinge={hinge} />
      ) : (
        <Leaf x={3} y={7} w={22} h={14} hinge={hinge} />
      )}
    </svg>
  );
}
