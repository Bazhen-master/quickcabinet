import { createDrillOperation, getFaceAxis, type DrillOperation } from './drill';
import { faceSize } from './geometry';
import type { Part, PartFace } from './part';

export type HoleTemplateId = 'shelf-pins-4' | 'confirmat-2' | 'dowel-2';

export type HoleTemplate = {
  id: HoleTemplateId;
  name: string;
  create: (part: Part, face: PartFace) => DrillOperation[];
};

function clampMargin(size: number, desired: number) {
  return Math.max(8, Math.min(desired, Math.max(8, size / 3)));
}

export const HOLE_TEMPLATES: HoleTemplate[] = [
  {
    id: 'shelf-pins-4',
    name: 'Shelf pins x4',
    create: (_part, face) => {
      const size = faceSize(_part, face);
      const mx = clampMargin(size.width, 37);
      const my = clampMargin(size.height, 37);
      const pts = [
        [mx, my],
        [size.width - mx, my],
        [mx, size.height - my],
        [size.width - mx, size.height - my],
      ];
      return pts.map(([x, y]) =>
        createDrillOperation({ face, axis: getFaceAxis(face), x, y, diameter: 5, depth: 12, through: false, templateName: 'Shelf pins x4' })
      );
    },
  },
  {
    id: 'confirmat-2',
    name: 'Confirmat x2',
    create: (_part, face) => {
      const size = faceSize(_part, face);
      const offsetX = clampMargin(size.width, 50);
      const centerY = size.height / 2;
      return [offsetX, size.width - offsetX].map((x) =>
        createDrillOperation({ face, axis: getFaceAxis(face), x, y: centerY, diameter: 8, depth: 16, through: false, templateName: 'Confirmat x2' })
      );
    },
  },
  {
    id: 'dowel-2',
    name: 'Dowel x2',
    create: (_part, face) => {
      const size = faceSize(_part, face);
      const offsetX = clampMargin(size.width, 35);
      const centerY = size.height / 2;
      return [offsetX, size.width - offsetX].map((x) =>
        createDrillOperation({ face, axis: getFaceAxis(face), x, y: centerY, diameter: 8, depth: 12, through: false, templateName: 'Dowel x2' })
      );
    },
  },
];
