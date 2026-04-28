import type { DrillOperation } from './drill';
import type { Part } from './part';

function asMm(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000';
}

function safeName(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function getCuttingDimensions(part: Part) {
  const [first, second] = [part.width, part.height, part.thickness]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a);
  return {
    height: first ?? 0,
    width: second ?? 0,
  };
}

function drillToNcLine(op: DrillOperation) {
  return [
    'DRILL',
    `FACE=${op.face.toUpperCase()}`,
    `X=${asMm(op.x)}`,
    `Y=${asMm(op.y)}`,
    `DIA=${asMm(op.diameter)}`,
    `DEPTH=${asMm(op.depth)}`,
    `THROUGH=${op.through ? '1' : '0'}`,
  ].join(' ');
}

export function buildNcProgram(parts: Part[]) {
  const visibleParts = parts.filter((part) => !part.meta?.hidden);
  const lines: string[] = [];
  lines.push('; Furniture CAD NC export');
  lines.push('; Units: mm');
  lines.push(`; Parts: ${visibleParts.length}`);
  lines.push('');

  visibleParts.forEach((part, index) => {
    const dims = getCuttingDimensions(part);
    lines.push(`BEGIN PART ${index + 1}`);
    lines.push(`ID=${part.id}`);
    lines.push(`NAME="${safeName(part.name)}"`);
    lines.push(`ROLE=${part.meta?.role ?? 'panel'}`);
    lines.push(`SIZE HEIGHT=${asMm(dims.height)} WIDTH=${asMm(dims.width)} THICKNESS=${asMm(part.thickness)}`);
    lines.push(`POS X=${asMm(part.position.x)} Y=${asMm(part.position.y)} Z=${asMm(part.position.z)}`);

    const drills = part.operations.filter((op): op is DrillOperation => op.type === 'drill');
    lines.push(`DRILLS=${drills.length}`);
    drills.forEach((op) => lines.push(drillToNcLine(op)));
    lines.push('END PART');
    lines.push('');
  });

  return lines.join('\n');
}
